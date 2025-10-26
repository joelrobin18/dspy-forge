"""
ReAct template with MCP tool integration.
"""

import dspy
import json
from typing import Dict, Any, List, Optional
from dspy_forge.core.templates import NodeTemplate, CodeGenerationContext
from dspy_forge.services.mcp_service import mcp_service
from dspy_forge.core.logging import get_logger

logger = get_logger(__name__)


class ReActTemplate(NodeTemplate):
    """
    Template for ReAct (Reasoning and Acting) module with MCP tool support.
    
    ReAct alternates between reasoning about what to do next and taking actions
    using available tools from MCP servers.
    """
    
    def __init__(self, node, workflow):
        super().__init__(node, workflow)
        self.mcp_service = mcp_service
    
    def _create_dynamic_signature(self, instruction: str):
        """Create dynamic signature class for ReAct"""
        input_fields = self._get_connected_fields(is_input=True)
        output_fields = self._get_connected_fields(is_input=False)
        
        class_attrs = {
            '__annotations__': {},
            '__doc__': instruction if instruction else "Reason and act to solve the task"
        }
        
        # Add input fields
        for field_name in input_fields:
            field_type, field_desc, enum_values = self._get_field_info(field_name, is_input=True)
            python_type = self._convert_ui_type_to_python_actual(field_type, enum_values)
            class_attrs['__annotations__'][field_name] = python_type
            if field_desc:
                class_attrs[field_name] = dspy.InputField(desc=field_desc)
            else:
                class_attrs[field_name] = dspy.InputField()
        
        # Add output fields
        for field_name in output_fields:
            field_type, field_desc, enum_values = self._get_field_info(field_name, is_input=False)
            python_type = self._convert_ui_type_to_python_actual(field_type, enum_values)
            class_attrs['__annotations__'][field_name] = python_type
            if field_desc:
                class_attrs[field_name] = dspy.OutputField(desc=field_desc)
            else:
                class_attrs[field_name] = dspy.OutputField()
        
        DynamicSignature = type('ReActSignature', (dspy.Signature,), class_attrs)
        return DynamicSignature
    
    def initialize(self, context: Any):
        """
        Initialize ReAct module with MCP tools.        
        """
        instruction = self.node_data.get('instruction', '')
        signature_class = self._create_dynamic_signature(instruction)
        
        use_global_mcp_servers = self.node_data.get('use_global_mcp_servers', 
                                                     self.node_data.get('useGlobalMcpServers', False))
        
        if use_global_mcp_servers:
            # Use global MCP servers from context 
            global_config = getattr(context, 'global_mcp_servers', [])
            mcp_servers = [server['url'] for server in global_config]
            selected_tools = {server['url']: server.get('selectedTools', server.get('selected_tools', [])) 
                            for server in global_config}
        else:
            # Use node-specific MCP servers
            mcp_servers = self.node_data.get('mcp_servers', self.node_data.get('mcpServers', []))
            selected_tools = self.node_data.get('selected_tools', self.node_data.get('selectedTools', {}))
        
        max_iters = self.node_data.get('max_iters', self.node_data.get('maxIters', 5))
        model_name = self.node_data.get('model', '')
        
        wrapper = ReActWrapper(
            signature_class=signature_class,
            mcp_servers=mcp_servers,
            max_iters=max_iters,
            node_id=self.node_id,
            model_name=model_name,
            use_global_mcp_servers=use_global_mcp_servers,
            selected_tools=selected_tools
        )
        
        return wrapper
    
    def _generate_signature_code(self, signature_name: str, instruction: str,
                                input_fields: List[str], output_fields: List[str]) -> str:
        """Generate signature class code for ReAct"""
        lines = [f"class {signature_name}(dspy.Signature):"]
        
        if instruction:
            lines.append(f'    """{instruction}"""')
        else:
            lines.append('    """Reason and act to solve the task"""')
        
        # Add input fields
        for field_name in input_fields:
            field_type, field_desc, enum_values = self._get_field_info(field_name, is_input=True)
            python_type = self._convert_ui_type_to_python(field_type, enum_values)
            if field_desc:
                lines.append(f"    {field_name}: {python_type} = dspy.InputField(desc='{field_desc}')")
            else:
                lines.append(f"    {field_name}: {python_type} = dspy.InputField()")
        
        # Add output fields
        for field_name in output_fields:
            field_type, field_desc, enum_values = self._get_field_info(field_name, is_input=False)
            python_type = self._convert_ui_type_to_python(field_type, enum_values)
            if field_desc:
                lines.append(f"    {field_name}: {python_type} = dspy.OutputField(desc='{field_desc}')")
            else:
                lines.append(f"    {field_name}: {python_type} = dspy.OutputField()")
        
        return '\n'.join(lines)
    
    def generate_code(self, context: CodeGenerationContext) -> Dict[str, Any]:
        """Generate code for ReAct module with MCP tools"""
        module_type_str = "ReAct"
        model_name = self.node_data.get('model', '')
        instruction = self.node_data.get('instruction', '')
        mcp_servers = self.node_data.get('mcp_servers', self.node_data.get('mcpServers', []))
        max_iters = self.node_data.get('max_iters', self.node_data.get('maxIters', 5))
        
        # Get input and output fields
        input_fields = self._get_connected_fields(is_input=True)
        output_fields = self._get_connected_fields(is_input=False)
        
        # Generate unique signature name
        signature_key = (module_type_str, tuple(input_fields), tuple(output_fields), instruction)
        signature_name = context.get_signature_name(signature_key)
        
        # Generate signature class code
        signature_code = self._generate_signature_code(signature_name, instruction, input_fields, output_fields)
        
        # Generate instance code
        node_count = context.get_node_count(module_type_str)
        instance_var = f"react_{node_count}"
        
        # Store mapping for optimization loading
        context.node_to_var_mapping[self.node_id] = instance_var
        
        instance_lines = [
            f"        self.mcp_servers_{node_count} = {mcp_servers!r}",
            f"        self.{instance_var}_tools_loaded = False",
            f"        self.{instance_var} = None  # Will be initialized on first use",
            f"        self.{instance_var}_signature = {signature_name}",
            f"        self.{instance_var}_max_iters = {max_iters}"
        ]
        instance_code = '\n'.join(instance_lines)
        
        # Generate forward method code
        input_args = ", ".join([f"{field}={field}" for field in input_fields])
        result_var = f"result_{context.get_result_count()}"
        
        forward_lines = []
        forward_lines.append(f"        if not self.{instance_var}_tools_loaded:")
        forward_lines.append(f"            tools_{node_count} = self._load_mcp_tools_sync(self.mcp_servers_{node_count})")
        forward_lines.append(f"            self.{instance_var} = dspy.ReAct(")
        forward_lines.append(f"                self.{instance_var}_signature,")
        forward_lines.append(f"                tools=tools_{node_count},")
        forward_lines.append(f"                max_iters=self.{instance_var}_max_iters")
        forward_lines.append(f"            )")
        forward_lines.append(f"            self.{instance_var}_tools_loaded = True")
        forward_lines.append(f"        ")
        
        if model_name and model_name != 'default':
            from dspy_forge.core.lm_config import parse_model_name
            provider, actual_model = parse_model_name(model_name)
            forward_lines.append(f"        with dspy.context(lm='{provider}/{actual_model}'):")
            forward_lines.append(f"            {result_var} = self.{instance_var}({input_args})")
        else:
            forward_lines.append(f"        {result_var} = self.{instance_var}({input_args})")
        
        # Extract output fields
        for field in output_fields:
            forward_lines.append(f"        {field} = {result_var}.{field}")
        forward_lines[-1] += "\n"
        
        forward_code = '\n'.join(forward_lines)
        
        # Add helper method for loading MCP tools
        helper_methods = '''
    def _load_mcp_tools_sync(self, mcp_servers: List[str]) -> List[Any]:
        import asyncio
        import json
        import concurrent.futures
        from dspy_forge.services.mcp_service import mcp_service
        
        tools = []
        
        if not mcp_servers:
            return tools
        
        # Load MCP tools
        async def load_tools_async():
            
            # Register servers and get tools
            for server_url in mcp_servers:
                try:
                    await mcp_service.register_server(server_url)
                except Exception as e:
                    print(f"Warning: Failed to register MCP server {server_url}: {e}")
            
            return await mcp_service.get_all_tools(mcp_servers)
        
        try:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            try:
                mcp_tools = loop.run_until_complete(load_tools_async())
            finally:
                loop.close()
        except Exception as e:
            print(f"Error loading MCP tools: {e}")
            return tools
        
        # Convert MCP tools to DSPy tools
        mcp_service = get_mcp_service()
        
        for mcp_tool in mcp_tools:
            def make_tool_func(tool_name: str):
                def tool_func(**kwargs):
                    def run_async():
                        loop = asyncio.new_event_loop()
                        asyncio.set_event_loop(loop)
                        try:
                            return loop.run_until_complete(mcp_service.call_tool(tool_name, kwargs))
                        finally:
                            try:
                                loop.close()
                            except Exception:
                                pass
                    
                    try:
                        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
                            future = executor.submit(run_async)
                            result = future.result(timeout=30)
                        
                        # Return result as string for DSPy
                        if isinstance(result, (dict, list)):
                            return json.dumps(result)
                        return str(result)
                    except concurrent.futures.TimeoutError:
                        return json.dumps({"error": "Tool execution timeout"})
                    except Exception as e:
                        return json.dumps({"error": f"Tool execution failed: {str(e)}"})
                
                return tool_func
            
            tool_func = make_tool_func(mcp_tool.name)
            tool_func.__name__ = mcp_tool.name
            tool_func.__doc__ = mcp_tool.description
            
            # Create DSPy tool
            dspy_tool = dspy.Tool(
                func=tool_func,
                name=mcp_tool.name,
                desc=mcp_tool.description
            )
            tools.append(dspy_tool)
        
        return tools
'''
        
        return {
            'signature': signature_code,
            'instance': instance_code,
            'forward': forward_code,
            'dependencies': ['from typing import List'],
            'instance_var': instance_var,
            'signature_name': signature_name,
            'helper_methods': helper_methods
        }


class ReActWrapper:
    """
    Wrapper for DSPy ReAct that handles MCP tool loading.
    
    This wrapper implements the call/acall interface expected by the execution engine.
    """
    
    def __init__(self, signature_class, mcp_servers: List[str], max_iters: int, node_id: str, model_name: str = '', use_global_mcp_servers: bool = False, selected_tools: Dict[str, List[str]] = None):
        self.signature_class = signature_class
        self.mcp_servers = mcp_servers
        self.max_iters = max_iters
        self.node_id = node_id
        self.model_name = model_name
        self.use_global_mcp_servers = use_global_mcp_servers
        self.selected_tools = selected_tools or {}
        self.react_module: Optional[dspy.ReAct] = None
        self.tools_loaded = False
    
    async def _ensure_tools_loaded(self):
        """Ensure MCP tools are loaded before execution"""
        if self.tools_loaded:
            return
        
        tools = []
        mcp_tools = []
        
        servers_to_use = self.mcp_servers.copy() if self.mcp_servers else []
        
        if servers_to_use:
            for server_url in servers_to_use:
                try:
                    await mcp_service.register_server(server_url)
                except Exception as e:
                    logger.error(f"Failed to register MCP server {server_url}: {e}")
            
            mcp_tools = await mcp_service.get_all_tools(servers_to_use)
            
            if self.selected_tools:
                filtered_tools = []
                for mcp_tool in mcp_tools:
                    server_url = mcp_tool.server_url
                    if server_url in self.selected_tools:
                        # Only include tools that are explicitly selected for this server
                        if mcp_tool.name in self.selected_tools[server_url]:
                            filtered_tools.append(mcp_tool)
                    else:
                        # If server not in selected_tools dict, include all tools from that server
                        # This handles the case where a server was added but no specific tools were selected yet
                        filtered_tools.append(mcp_tool)
                        logger.info(f"No tool selection found for {server_url}, including all tools")
                mcp_tools = filtered_tools
            # If selected_tools is empty/None, include all tools from all servers
        
        # Convert MCP tools to DSPy tools
        for mcp_tool in mcp_tools:
            # Create a closure to capture the tool name
            def make_tool_func(tool_name: str):
                def tool_func(**kwargs):
                    import asyncio
                    import concurrent.futures
                    
                    def run_async():
                        loop = asyncio.new_event_loop()
                        asyncio.set_event_loop(loop)
                        try:
                            return loop.run_until_complete(mcp_service.call_tool(tool_name, kwargs))
                        finally:
                            # Clean up the loop
                            try:
                                loop.close()
                            except Exception:
                                pass
                    
                    try:
                        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
                            future = executor.submit(run_async)
                            result = future.result(timeout=30)
                        
                        if isinstance(result, (dict, list)):
                            return json.dumps(result)
                        return str(result)
                    except concurrent.futures.TimeoutError:
                        return json.dumps({"error": "Tool execution timeout"})
                    except Exception as e:
                        return json.dumps({"error": f"Tool execution failed: {str(e)}"})
                
                return tool_func
            
            tool_func = make_tool_func(mcp_tool.name)
            tool_func.__name__ = mcp_tool.name
            tool_func.__doc__ = mcp_tool.description
            
            # DSPy Tool expects a function with name and description
            dspy_tool = dspy.Tool(
                func=tool_func,
                name=mcp_tool.name,
                desc=mcp_tool.description
            )
            tools.append(dspy_tool)
        
        self.react_module = dspy.ReAct(
            self.signature_class,
            tools=tools,
            max_iters=self.max_iters
        )
        self.tools_loaded = True
    
    async def acall(self, **kwargs):
        from dspy_forge.core.lm_config import create_lm
        
        await self._ensure_tools_loaded()
        
        if self.model_name:
            lm = create_lm(self.model_name)
            with dspy.context(lm=lm):
                # Call module directly (DSPy best practice)
                return self.react_module(**kwargs)
        else:
            # Call module directly (DSPy best practice)
            return self.react_module(**kwargs)
    
    def call(self, **kwargs):
        import asyncio
        
        try:
            loop = asyncio.get_running_loop()
            raise RuntimeError("ReAct with MCP tools requires async execution. Optimization not yet supported.")
        except RuntimeError:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            try:
                result = loop.run_until_complete(self.acall(**kwargs))
                return result
            finally:
                loop.close()
    
    def __call__(self, **kwargs):
        return self.call(**kwargs)

