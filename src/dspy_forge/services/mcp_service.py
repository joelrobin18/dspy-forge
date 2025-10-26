from typing import Dict, List, Any, Optional
from dspy_forge.core.mcp_client import MCPClient, MCPClientPool
from dspy_forge.models.mcp import MCPTool
from dspy_forge.core.logging import get_logger


class MCPService:
    """
    Service for managing MCP servers and tools.
    
    Handles:
    - Server registration and connection
    - Tool discovery across servers
    - Tool invocation routing
    """
    
    def __init__(self):
        self.client_pool = MCPClientPool()
        self.server_urls: List[str] = []
        self.logger = get_logger(__name__)
    
    async def register_server(self, server_url: str) -> bool:
        """
        Register and connect to an MCP server.
        
        Args:
            server_url: URL of the MCP server
            
        Returns:
            True if successful, False otherwise
        """
        try:
            # Try to connect and initialize
            client = await self.client_pool.get_or_create_client(server_url)
            
            tools = await client.list_tools()
            
            if server_url not in self.server_urls:
                self.server_urls.append(server_url)
            
            self.logger.info(f"Registered MCP server: {server_url} with {len(tools)} tools")
            return True
            
        except Exception as e:
            self.logger.error(f"Failed to register MCP server {server_url}: {e}")
            return False
    
    async def unregister_server(self, server_url: str) -> bool:
        """
        Unregister an MCP server.
        
        Args:
            server_url: URL of the MCP server
            
        Returns:
            True if successful
        """
        if server_url in self.server_urls:
            self.server_urls.remove(server_url)
        
        # Client will be closed when pool is cleared
        self.logger.info(f"Unregistered MCP server: {server_url}")
        return True
    
    async def get_all_tools(self, server_urls: Optional[List[str]] = None) -> List[MCPTool]:
        """
        Get all available tools from registered servers.
        
        Args:
            server_urls: Optional list of specific server URLs to query.
                        If None, queries all registered servers.
                        If [] (empty list), returns no tools.
            
        Returns:
            List of all available MCPTool objects
        """
        all_tools = []
        urls_to_query = server_urls if server_urls is not None else self.server_urls
        
        for server_url in urls_to_query:
            try:
                client = await self.client_pool.get_or_create_client(server_url)
                tools = await client.list_tools()
                all_tools.extend(tools)
            except Exception as e:
                self.logger.error(f"Failed to fetch tools from {server_url}: {e}")
        
        return all_tools
    
    async def call_tool(self, tool_name: str, arguments: Dict[str, Any], 
                       server_url: Optional[str] = None) -> Any:
        """
        Call a tool by name.
        
        Args:
            tool_name: Name of the tool to call
            arguments: Tool arguments
            server_url: Optional specific server URL. If not provided, searches all servers.
            
        Returns:
            Tool execution result
        """
        # Find the tool and its server
        target_server = None
        
        if server_url:
            target_server = server_url
        else:
            # Search for tool across all servers by fetching tools dynamically
            for url in self.server_urls:
                try:
                    client = await self.client_pool.get_or_create_client(url)
                    tools = await client.list_tools()
                    if any(t.name == tool_name for t in tools):
                        target_server = url
                        break
                except Exception as e:
                    self.logger.error(f"Failed to check tools on {url}: {e}")
                    continue
        
        if not target_server:
            raise ValueError(f"Tool '{tool_name}' not found in any registered MCP server")
        
        # Get client and call tool
        client = await self.client_pool.get_or_create_client(target_server)
        result, is_error = await client.call_tool(tool_name, arguments)
        
        if is_error:
            raise RuntimeError(f"Tool execution failed: {result}")
        
        return result
    
    async def get_tool_by_name(self, tool_name: str) -> Optional[MCPTool]:
        """
        Find a tool by name across all registered servers.
        
        Args:
            tool_name: Name of the tool
            
        Returns:
            MCPTool if found, None otherwise
        """
        for url in self.server_urls:
            try:
                client = await self.client_pool.get_or_create_client(url)
                tools = await client.list_tools()
                for tool in tools:
                    if tool.name == tool_name:
                        return tool
            except Exception as e:
                self.logger.error(f"Failed to fetch tools from {url}: {e}")
                continue
        return None
    
    async def close(self):
        """Close all connections"""
        await self.client_pool.close_all()
        self.server_urls.clear()


# Global MCP service instance
mcp_service = MCPService()

