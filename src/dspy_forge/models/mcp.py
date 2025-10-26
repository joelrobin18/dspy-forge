from pydantic import BaseModel, Field, ConfigDict
from typing import Dict, Any, List


class MCPTool(BaseModel):
    """Tool available from an MCP server"""
    model_config = ConfigDict(populate_by_name=True)
    
    name: str
    description: str
    input_schema: Dict[str, Any] = Field(alias="inputSchema")
    server_url: str = Field(alias="serverUrl")
    
    def to_dspy_tool_dict(self) -> Dict[str, Any]:
        """Convert to DSPy tool format"""
        return {
            "name": self.name,
            "desc": self.description,
            "input_schema": self.input_schema
        }


class MCPServer(BaseModel):
    """MCP server configuration"""
    model_config = ConfigDict(populate_by_name=True)
    
    url: str
    selected_tools: List[str] = Field(default_factory=list, alias="selectedTools")

