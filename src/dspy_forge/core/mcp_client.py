import httpx
import json
from typing import Dict, Any, List, Optional, Tuple
from dspy_forge.models.mcp import MCPTool
from dspy_forge.core.logging import get_logger


class MCPClient:
    """
    HTTP client for Model Context Protocol servers.
    
    Supports:
    - Listing available tools from MCP servers
    - Invoking tools with parameters
    - Session management
    """
    
    def __init__(self, server_url: str, timeout: float = 30.0):
        """
        Initialize MCP HTTP client.
        
        Args:
            server_url: Base URL of the MCP server (e.g., "http://localhost:8000")
            timeout: Request timeout in seconds
        """
        self.server_url = server_url.rstrip('/')
        self.timeout = timeout
        self.session_id: Optional[str] = None
        self._client = httpx.AsyncClient(timeout=timeout)
        self.logger = get_logger(__name__)
        
    async def __aenter__(self):
        await self.initialize()
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        await self.close()
    
    async def initialize(self) -> None:
        """
        Initialize MCP session with the server.
        
        Raises:
            ValueError: If server is not MCP-compliant
            httpx.HTTPError: If connection fails
        """
        try:
            # Initialize session with the MCP server
            response = await self._client.post(
                f"{self.server_url}/mcp/v1/initialize",
                json={
                    "protocolVersion": "2024-11-05",
                    "capabilities": {
                        "tools": {}
                    },
                    "clientInfo": {
                        "name": "dspy-forge",
                        "version": "0.1.0"
                    }
                }
            )
            response.raise_for_status()
            
            data = response.json()
            self.session_id = data.get("sessionId")
            
            self.logger.info(f"Initialized MCP session with {self.server_url}")
            
        except httpx.ConnectError as e:
            error_msg = (
                f"Cannot connect to MCP server at {self.server_url}. "
                f"Please ensure the server is running and accessible."
            )
            self.logger.error(error_msg)
            raise ConnectionError(error_msg) from e
            
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 404:
                error_msg = (
                    f"MCP server at {self.server_url} does not have the required '/mcp/v1/initialize' endpoint. "
                    f"This server is not MCP-compliant. Please ensure your server implements the MCP HTTP protocol."
                )
            elif e.response.status_code == 405:
                error_msg = (
                    f"MCP server at {self.server_url} does not accept POST requests at '/mcp/v1/initialize'. "
                    f"This endpoint must support POST method for MCP compliance."
                )
            else:
                error_msg = (
                    f"MCP server at {self.server_url} returned HTTP {e.response.status_code} during initialization. "
                    f"Expected 200 OK. Response: {e.response.text[:200]}"
                )
            self.logger.error(error_msg)
            raise ValueError(error_msg) from e
            
        except json.JSONDecodeError as e:
            error_msg = (
                f"MCP server at {self.server_url} returned invalid JSON response for '/mcp/v1/initialize'. "
                f"MCP-compliant servers must return valid JSON."
            )
            self.logger.error(error_msg)
            raise ValueError(error_msg) from e
            
        except Exception as e:
            error_msg = f"Unexpected error initializing MCP connection to {self.server_url}: {type(e).__name__}: {e}"
            self.logger.error(error_msg)
            raise
    
    async def close(self) -> None:
        await self._client.aclose()
    
    async def list_tools(self) -> List[MCPTool]:
        """
        List all available tools from the MCP server.
        
        Returns:
            List of MCPTool objects
            
        Raises:
            ValueError: If server is not MCP-compliant or returns invalid data
            ConnectionError: If connection fails
        """
        try:
            headers = {}
            if self.session_id:
                headers["X-MCP-Session-ID"] = self.session_id
            
            response = await self._client.post(
                f"{self.server_url}/mcp/v1/tools/list",
                json={},
                headers=headers
            )
            response.raise_for_status()
            
            data = response.json()
            
            # Validate response structure
            if not isinstance(data, dict):
                raise ValueError(
                    f"MCP server at {self.server_url} returned invalid response format. "
                    f"Expected JSON object with 'tools' array."
                )
            
            tools_data = data.get("tools", [])
            if not isinstance(tools_data, list):
                raise ValueError(
                    f"MCP server at {self.server_url} returned invalid 'tools' field. "
                    f"Expected array of tool definitions."
                )
            
            tools = []
            for idx, tool_data in enumerate(tools_data):
                if not isinstance(tool_data, dict):
                    self.logger.warning(f"Skipping invalid tool at index {idx} from {self.server_url}")
                    continue
                    
                if not tool_data.get("name"):
                    self.logger.warning(f"Skipping tool without name at index {idx} from {self.server_url}")
                    continue
                
                tool = MCPTool(
                    name=tool_data.get("name"),
                    description=tool_data.get("description", ""),
                    input_schema=tool_data.get("inputSchema", {}),
                    server_url=self.server_url
                )
                tools.append(tool)
            
            self.logger.info(f"Listed {len(tools)} tools from {self.server_url}")
            return tools
            
        except httpx.ConnectError as e:
            error_msg = (
                f"Cannot connect to MCP server at {self.server_url} when listing tools. "
                f"Server may be offline or unreachable."
            )
            self.logger.error(error_msg)
            raise ConnectionError(error_msg) from e
            
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 404:
                error_msg = (
                    f"MCP server at {self.server_url} does not have the required '/mcp/v1/tools/list' endpoint. "
                    f"This server is not MCP-compliant."
                )
            elif e.response.status_code == 405:
                error_msg = (
                    f"MCP server at {self.server_url} does not accept POST requests at '/mcp/v1/tools/list'. "
                    f"This endpoint must support POST method for MCP compliance."
                )
            else:
                error_msg = (
                    f"MCP server at {self.server_url} returned HTTP {e.response.status_code} when listing tools. "
                    f"Expected 200 OK. Response: {e.response.text[:200]}"
                )
            self.logger.error(error_msg)
            raise ValueError(error_msg) from e
            
        except json.JSONDecodeError as e:
            error_msg = (
                f"MCP server at {self.server_url} returned invalid JSON for '/mcp/v1/tools/list'. "
                f"MCP-compliant servers must return valid JSON."
            )
            self.logger.error(error_msg)
            raise ValueError(error_msg) from e
            
        except ValueError:
            # Re-raise ValueError
            raise
            
        except Exception as e:
            error_msg = f"Unexpected error listing tools from {self.server_url}: {type(e).__name__}: {e}"
            self.logger.error(error_msg)
            raise
    
    async def call_tool(self, tool_name: str, arguments: Dict[str, Any]) -> Tuple[Any, bool]:
        """
        Invoke a tool on the MCP server.
        
        Args:
            tool_name: Name of the tool to invoke
            arguments: Tool arguments as a dictionary
            
        Returns:
            Tuple of (result, is_error)
            
        Raises:
            ValueError: If server is not MCP-compliant or returns invalid data
            ConnectionError: If connection fails
        """
        try:
            headers = {}
            if self.session_id:
                headers["X-MCP-Session-ID"] = self.session_id
            
            response = await self._client.post(
                f"{self.server_url}/mcp/v1/tools/call",
                json={
                    "name": tool_name,
                    "arguments": arguments
                },
                headers=headers
            )
            response.raise_for_status()
            
            data = response.json()
            
            # Validate response structure
            if not isinstance(data, dict):
                error_msg = (
                    f"MCP server at {self.server_url} returned invalid response format for tool '{tool_name}'. "
                    f"Expected JSON object with 'content' array."
                )
                self.logger.error(error_msg)
                return error_msg, True
            
            # Check if response contains an error
            if data.get("isError", False):
                error_msg = data.get("content", [{}])[0].get("text", "Unknown error")
                self.logger.error(f"Tool {tool_name} returned error: {error_msg}")
                return error_msg, True
            
            # Extract result from content
            content = data.get("content", [])
            if content and len(content) > 0:
                result = content[0].get("text", "")
                # Try to parse as JSON if possible
                try:
                    result = json.loads(result)
                except json.JSONDecodeError:
                    pass  # Keep as string
                
                self.logger.info(f"Successfully called tool {tool_name}")
                return result, False
            
            return None, False
            
        except httpx.ConnectError as e:
            error_msg = (
                f"Cannot connect to MCP server at {self.server_url} when calling tool '{tool_name}'. "
                f"Server may be offline or unreachable."
            )
            self.logger.error(error_msg)
            return error_msg, True
            
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 404:
                error_msg = (
                    f"MCP server at {self.server_url} does not have the required '/mcp/v1/tools/call' endpoint. "
                    f"This server is not MCP-compliant."
                )
            elif e.response.status_code == 405:
                error_msg = (
                    f"MCP server at {self.server_url} does not accept POST requests at '/mcp/v1/tools/call'. "
                    f"This endpoint must support POST method for MCP compliance."
                )
            else:
                error_msg = (
                    f"HTTP {e.response.status_code} error calling tool '{tool_name}' on {self.server_url}. "
                    f"Response: {e.response.text[:200]}"
                )
            self.logger.error(error_msg)
            return error_msg, True
            
        except json.JSONDecodeError as e:
            error_msg = (
                f"MCP server at {self.server_url} returned invalid JSON for '/mcp/v1/tools/call'. "
                f"MCP-compliant servers must return valid JSON."
            )
            self.logger.error(error_msg)
            return error_msg, True
            
        except Exception as e:
            error_msg = f"Unexpected error calling tool '{tool_name}' on {self.server_url}: {type(e).__name__}: {e}"
            self.logger.error(error_msg)
            return error_msg, True


class MCPClientPool:
    """
    Manages a pool of MCP clients for multiple servers.
    """
    
    def __init__(self, max_idle_time: float = 300.0):
        """
        Initialize client pool.
        
        Args:
            max_idle_time: Maximum time in seconds a client can be idle before being closed (default: 5 minutes)
        """
        self.clients: Dict[str, MCPClient] = {}
        self.last_used: Dict[str, float] = {}  # Track last usage time
        self.max_idle_time = max_idle_time
        self.logger = get_logger(__name__)
    
    async def get_or_create_client(self, server_url: str) -> MCPClient:
        """
        Get existing client or create new one for the server.
        Automatically removes stale clients.
        
        Args:
            server_url: MCP server URL
            
        Returns:
            MCPClient instance
        """
        import time
        
        await self._cleanup_stale_clients()
        
        if server_url not in self.clients:
            client = MCPClient(server_url)
            await client.initialize()
            self.clients[server_url] = client
            self.last_used[server_url] = time.time()
        else:
            # Update last used time
            self.last_used[server_url] = time.time()
        
        return self.clients[server_url]
    
    async def _cleanup_stale_clients(self):
        """Remove and close clients that have been idle too long"""
        import time
        current_time = time.time()
        
        stale_urls = []
        for url, last_time in self.last_used.items():
            if current_time - last_time > self.max_idle_time:
                stale_urls.append(url)
        
        for url in stale_urls:
            self.logger.info(f"Closing stale MCP client connection to {url}")
            if url in self.clients:
                try:
                    await self.clients[url].close()
                except Exception as e:
                    self.logger.error(f"Error closing stale client {url}: {e}")
                del self.clients[url]
            if url in self.last_used:
                del self.last_used[url]
    
    async def remove_client(self, server_url: str):
        """
        Remove and close a specific client.
        
        Args:
            server_url: MCP server URL to remove
        """
        if server_url in self.clients:
            try:
                await self.clients[server_url].close()
            except Exception as e:
                self.logger.error(f"Error closing client {server_url}: {e}")
            del self.clients[server_url]
        if server_url in self.last_used:
            del self.last_used[server_url]
    
    async def close_all(self):
        """Close all client connections"""
        for client in self.clients.values():
            try:
                await client.close()
            except Exception as e:
                self.logger.error(f"Error closing client: {e}")
        self.clients.clear()
        self.last_used.clear()

