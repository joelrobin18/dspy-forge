from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Dict, Any, Optional
from dspy_forge.services.mcp_service import mcp_service
from dspy_forge.core.logging import get_logger

logger = get_logger(__name__)

router = APIRouter(tags=["mcp"])


class MCPToolResponse(BaseModel):
    """MCP tool information"""
    model_config = ConfigDict(populate_by_name=True)
    
    name: str
    description: str
    input_schema: Dict[str, Any] = Field(alias="inputSchema")
    server_url: str = Field(alias="serverUrl")


class MCPToolListResponse(BaseModel):
    """List of MCP tools"""
    tools: List[MCPToolResponse]
    total: int


@router.get("/tools", response_model=MCPToolListResponse)
async def list_mcp_tools(server_urls: Optional[str] = None):
    """
    List all available tools from MCP servers.
    
    Args:
        server_urls: Optional comma-separated list of specific server URLs
        
    Returns:
        List of available tools
    """
    try:
        urls = None
        if server_urls:
            urls = [url.strip() for url in server_urls.split(',')]
        
        mcp_tools = await mcp_service.get_all_tools(urls)
        
        tools_response = [
            MCPToolResponse(
                name=tool.name,
                description=tool.description,
                input_schema=tool.input_schema,
                server_url=tool.server_url
            )
            for tool in mcp_tools
        ]
        
        return MCPToolListResponse(
            tools=tools_response,
            total=len(tools_response)
        )
    except Exception as e:
        logger.error(f"Error listing MCP tools: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/health")
async def mcp_health_check():
    """
    Health check endpoint for MCP service.
    
    Returns:
        Health status
    """
    try:
        return {
            "status": "healthy",
            "registered_servers": len(mcp_service.server_urls),
            "servers": mcp_service.server_urls
        }
    except Exception as e:
        logger.error(f"MCP health check failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))
