import React, { useState, useEffect } from 'react';
import { Handle, Position, NodeProps, useReactFlow } from 'reactflow';
import { Edit3, Brain, Settings, Trash2, Sparkles, ChevronDown } from 'lucide-react';
import { ModuleNodeData, ModuleType } from '../../types/workflow';
import TraceIndicator from './TraceIndicator';
import OptimizationFooter from './OptimizationFooter';
import { useLMConfig } from '../../contexts/LMConfigContext';

const moduleTypes: ModuleType[] = [
  'Predict',
  'ChainOfThought',
  'ReAct',
  'BestOfN',
  'Refine'
];

const moduleIcons: Record<ModuleType, React.ReactNode> = {
  'Predict': <Brain size={16} className="text-green-600" />,
  'ChainOfThought': <Brain size={16} className="text-blue-600" />,
  'ReAct': <Brain size={16} className="text-purple-600" />,
  'BestOfN': <Brain size={16} className="text-red-600" />,
  'Refine': <Brain size={16} className="text-indigo-600" />
};

const ModuleNode: React.FC<NodeProps<ModuleNodeData & { traceData?: any; onTraceClick?: (nodeId: string, traceData: any) => void }>> = ({ data, selected, id }) => {
  const { traceData, onTraceClick, ...nodeData } = data;
  const [isEditing, setIsEditing] = useState(false);
  const [nodeLabel, setNodeLabel] = useState(nodeData.label || nodeData.moduleType || 'Module');
  const [moduleType, setModuleType] = useState<ModuleType>(nodeData.moduleType || 'Predict');
  const [model, setModel] = useState(nodeData.model || '');
  const [instruction, setInstruction] = useState(nodeData.instruction || '');
  const [parameters, setParameters] = useState(nodeData.parameters || {});
  const [mcpServers, setMcpServers] = useState<string[]>(nodeData.mcpServers || []);
  const [maxIters, setMaxIters] = useState<number>(nodeData.maxIters || 5);
  const [useGlobalMcpServers, setUseGlobalMcpServers] = useState<boolean>(nodeData.useGlobalMcpServers || false);
  const [selectedTools, setSelectedTools] = useState<Record<string, string[]>>(nodeData.selectedTools || {});
  const [availableTools, setAvailableTools] = useState<Record<string, Array<{name: string, description: string}>>>({});
  const [loadingTools, setLoadingTools] = useState<Record<string, boolean>>({});
  const [newMcpServer, setNewMcpServer] = useState('');
  const [collapsedServers, setCollapsedServers] = useState<Record<string, boolean>>({});
  const { deleteElements, setNodes } = useReactFlow();
  const { globalLMConfig, mcpServers: globalMCPServers } = useLMConfig();

  const handleSave = () => {
    const nodeDataToSave = {
      label: nodeLabel,
      moduleType: moduleType,
      model: model,
      instruction: instruction,
      parameters: parameters,
      mcpServers: mcpServers,
      maxIters: maxIters,
      useGlobalMcpServers: useGlobalMcpServers,
      selectedTools: selectedTools,
      globalMcpServersSnapshot: useGlobalMcpServers ? globalMCPServers.map(s => ({
        url: s.url,
        selectedTools: s.selectedTools
      })) : [],
    };
    
    setNodes((nds) =>
      nds.map((node) =>
        node.id === id
          ? {
              ...node,
              data: {
                ...node.data,
                ...nodeDataToSave
              }
            }
          : node
      )
    );
    setIsEditing(false);
  };

  const handleDelete = () => {
    deleteElements({ nodes: [{ id }] });
  };

  const updateParameter = (key: string, value: any) => {
    setParameters(prev => ({ ...prev, [key]: value }));
  };

  const removeParameter = (key: string) => {
    const newParams = { ...parameters };
    delete newParams[key];
    setParameters(newParams);
  };

  const addParameter = () => {
    const key = `param_${Object.keys(parameters).length + 1}`;
    updateParameter(key, '');
  };

  const useGlobalConfig = () => {
    if (globalLMConfig) {
      setModel(globalLMConfig.modelName);
    }
  };

  const fetchToolsForServer = async (serverUrl: string) => {
    setLoadingTools(prev => ({ ...prev, [serverUrl]: true }));
    try {
      const response = await fetch(`/api/v1/mcp/tools?server_urls=${encodeURIComponent(serverUrl)}`);
      if (response.ok) {
        const data = await response.json();
        const tools = data.tools.map((t: any) => ({
          name: t.name,
          description: t.description
        }));
        setAvailableTools(prev => ({ ...prev, [serverUrl]: tools }));
        // Auto-select all tools by default
        setSelectedTools(prev => ({ ...prev, [serverUrl]: tools.map((t: any) => t.name) }));
      }
    } catch (error) {
      console.error('Failed to fetch tools:', error);
    } finally {
      setLoadingTools(prev => ({ ...prev, [serverUrl]: false }));
    }
  };

  const addMcpServer = () => {
    if (newMcpServer.trim() && !mcpServers.includes(newMcpServer.trim())) {
      const serverUrl = newMcpServer.trim();
      setMcpServers([...mcpServers, serverUrl]);
      setNewMcpServer('');
      fetchToolsForServer(serverUrl);
    }
  };

  const removeMcpServer = (serverUrl: string) => {
    setMcpServers(mcpServers.filter(s => s !== serverUrl));
    setAvailableTools(prev => {
      const { [serverUrl]: _, ...rest } = prev;
      return rest;
    });
    setSelectedTools(prev => {
      const { [serverUrl]: _, ...rest } = prev;
      return rest;
    });
  };

  const toggleToolSelection = (serverUrl: string, toolName: string) => {
    setSelectedTools(prev => {
      const serverTools = prev[serverUrl] || [];
      const isSelected = serverTools.includes(toolName);
      return {
        ...prev,
        [serverUrl]: isSelected
          ? serverTools.filter(t => t !== toolName)
          : [...serverTools, toolName]
      };
    });
  };

  const toggleServerCollapse = (serverUrl: string) => {
    setCollapsedServers(prev => ({
      ...prev,
      [serverUrl]: !prev[serverUrl]
    }));
  };

  return (
    <div className={`min-w-[280px] relative bg-white rounded-xl border-2 transition-all duration-200 shadow-soft-lg ${
      selected ? 'border-emerald-400 shadow-xl ring-2 ring-emerald-200' : 'border-emerald-200 hover:border-emerald-300'
    }`}>
      {/* Handles */}
      <Handle
        type="target"
        position={Position.Top}
        className="w-3 h-3 bg-emerald-500 border-2 border-white shadow-soft"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        className="w-3 h-3 bg-emerald-500 border-2 border-white shadow-soft"
      />

      {/* Header */}
      <div className="flex items-center justify-between p-3.5 bg-gradient-to-r from-emerald-50 to-emerald-100/50 border-b border-emerald-200 rounded-t-xl">
        <div className="flex flex-col flex-1 min-w-0">
          <div className="flex items-center space-x-2">
            <div className="p-1.5 bg-white rounded-lg shadow-sm">
              {moduleIcons[moduleType] || <Brain size={16} className="text-emerald-600" />}
            </div>
            <span className="font-semibold text-emerald-900 truncate">{nodeLabel}</span>
          </div>
          <div className="text-xs text-emerald-600 font-medium mt-1.5">{moduleType}</div>
          <div className="text-xs text-slate-500 font-mono">{id}</div>
        </div>
        <div className="flex items-center space-x-1 ml-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsEditing(!isEditing);
            }}
            className="p-1.5 hover:bg-emerald-200/50 rounded-lg transition-colors"
            title="Edit node"
          >
            <Edit3 size={14} className="text-emerald-700" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleDelete();
            }}
            className="p-1.5 hover:bg-coral-100 rounded-lg transition-colors"
            title="Delete node"
          >
            <Trash2 size={14} className="text-coral-600" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="p-3">
        {isEditing ? (
          <div className="space-y-3">
            {/* Node Name */}
            <div>
              <label className="block text-sm font-medium mb-1">Node Name</label>
              <input
                type="text"
                value={nodeLabel}
                onChange={(e) => setNodeLabel(e.target.value)}
                placeholder="Enter node name"
                className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
              />
            </div>
            
            {/* Module Type Selection */}
            <div>
              <label className="block text-sm font-medium mb-1">Module Type</label>
              <select
                value={moduleType}
                onChange={(e) => setModuleType(e.target.value as ModuleType)}
                className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
              >
                {moduleTypes.map(type => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </div>

            {/* Model Selection */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-sm font-medium">Model</label>
                {globalLMConfig && (
                  <button
                    onClick={useGlobalConfig}
                    className="flex items-center space-x-1 px-2 py-0.5 text-xs bg-emerald-50 text-emerald-700 rounded hover:bg-emerald-100 transition-colors"
                    type="button"
                  >
                    <Sparkles size={12} />
                    <span>Use Global</span>
                  </button>
                )}
              </div>
              <input
                type="text"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="e.g., databricks/databricks-claude-sonnet-4-5"
                className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
              />
              <div className="text-xs text-gray-500 mt-1">
                Format: provider/model-name (openai/gpt-4, databricks/claude-sonnet)
              </div>
              {globalLMConfig && (
                <div className="text-xs text-emerald-600 mt-1">
                  Global: {globalLMConfig.modelName}
                </div>
              )}
            </div>

            {/* Instruction */}
            <div>
              <label className="block text-sm font-medium mb-1">
                Instruction
              </label>
              <textarea
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                placeholder="Describe the task this module should perform..."
                className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                rows={3}
              />
              <div className="text-xs text-gray-500 mt-1">
                This will be used as the instruction for the DSPy signature
              </div>
            </div>

            {/* Parameters */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium">Parameters</label>
                <button
                  onClick={addParameter}
                  className="px-2 py-1 bg-green-500 text-white rounded text-xs hover:bg-green-600"
                >
                  Add
                </button>
              </div>
              
              <div className="space-y-2 max-h-32 overflow-y-auto">
                {Object.entries(parameters).map(([key, value]) => (
                  <div key={key} className="flex items-center space-x-2">
                    <input
                      type="text"
                      value={key}
                      onChange={(e) => {
                        const newKey = e.target.value;
                        const newParams = { ...parameters };
                        delete newParams[key];
                        newParams[newKey] = value;
                        setParameters(newParams);
                      }}
                      placeholder="Parameter name"
                      className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm"
                    />
                    <input
                      type="text"
                      value={value as string}
                      onChange={(e) => updateParameter(key, e.target.value)}
                      placeholder="Value"
                      className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm"
                    />
                    <button
                      onClick={() => removeParameter(key)}
                      className="p-1 text-red-500 hover:bg-red-50 rounded"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* ReAct-specific configuration */}
            {moduleType === 'ReAct' && (
              <>
                {/* MCP Servers */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium">MCP Tool Servers</label>
                    <div className="text-xs text-gray-500">
                      Auto-registers on execution
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <div className="flex items-center space-x-2">
                      <input
                        type="text"
                        value={newMcpServer}
                        onChange={(e) => setNewMcpServer(e.target.value)}
                        placeholder="http://localhost:8001"
                        className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm"
                        onKeyPress={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            addMcpServer();
                          }
                        }}
                      />
                      <button
                        onClick={addMcpServer}
                        className="px-3 py-1 bg-purple-500 text-white rounded text-xs hover:bg-purple-600 flex items-center space-x-1"
                      >
                        <span>+</span>
                        <span>Add</span>
                      </button>
                    </div>
                    
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {mcpServers.map((server, idx) => {
                        const isCollapsed = collapsedServers[server] || false;
                        const hasTools = availableTools[server] && availableTools[server].length > 0;
                        
                        return (
                          <div key={idx} className="bg-purple-50 border border-purple-200 rounded">
                            <div className="flex items-center justify-between p-2">
                              <button
                                onClick={() => toggleServerCollapse(server)}
                                className="flex-1 flex items-center space-x-1 hover:bg-purple-100 -m-2 p-2 rounded transition-colors"
                              >
                                <ChevronDown 
                                  size={14} 
                                  className={`text-purple-600 transition-transform ${isCollapsed ? '-rotate-90' : ''}`}
                                />
                                <div className="flex-1 truncate text-left">
                                  <div className="font-mono text-purple-900 text-xs">{server}</div>
                                  {hasTools && (
                                    <div className="text-[9px] text-purple-600">
                                      {selectedTools[server]?.length || 0}/{availableTools[server].length} tools
                                    </div>
                                  )}
                                </div>
                              </button>
                              <button
                                onClick={() => removeMcpServer(server)}
                                className="ml-2 p-1 text-red-500 hover:bg-red-100 rounded font-bold text-sm"
                                title="Remove server"
                              >
                                ×
                              </button>
                            </div>
                            
                            {/* Tool Selection - Collapsible */}
                            {!isCollapsed && (
                              <>
                                {loadingTools[server] ? (
                                  <div className="px-2 pb-2 text-xs text-purple-600">
                                    Loading tools...
                                  </div>
                                ) : hasTools ? (
                                  <div className="px-2 pb-2 border-t border-purple-200">
                                    <div className="text-[10px] text-purple-600 font-medium mt-1 mb-1">
                                      Select Tools ({selectedTools[server]?.length || 0}/{availableTools[server].length}):
                                    </div>
                                    <div className="space-y-1 max-h-32 overflow-y-auto">
                                      {availableTools[server].map((tool) => (
                                        <label key={tool.name} className="flex items-start space-x-2 cursor-pointer hover:bg-purple-100 p-1 rounded">
                                          <input
                                            type="checkbox"
                                            checked={selectedTools[server]?.includes(tool.name) || false}
                                            onChange={() => toggleToolSelection(server, tool.name)}
                                            className="mt-0.5 w-3 h-3 text-purple-600 rounded focus:ring-1 focus:ring-purple-500"
                                          />
                                          <div className="flex-1 min-w-0">
                                            <div className="text-[10px] font-medium text-purple-900">{tool.name}</div>
                                            <div className="text-[9px] text-purple-600 truncate">{tool.description}</div>
                                          </div>
                                        </label>
                                      ))}
                                    </div>
                                  </div>
                                ) : null}
                              </>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    
                    {mcpServers.length === 0 && (
                      <div className="p-3 bg-yellow-50 border border-yellow-200 rounded text-xs">
                        <div className="font-medium text-yellow-900 mb-1">⚠️ No tool servers configured</div>
                        <div className="text-yellow-700">
                          Add MCP server URLs above to enable tool usage. Example: http://localhost:8001
                        </div>
                      </div>
                    )}
                    
                    <div className="text-[10px] text-gray-500 mt-2 p-2 bg-gray-50 rounded">
                      💡 <strong>Tip:</strong> Servers auto-register when you run the workflow. 
                      Tools refresh automatically on each execution.
                    </div>
                  </div>
                  
                  {/* Use Global MCP Servers Toggle */}
                  <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded">
                    <label className="flex items-center space-x-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={useGlobalMcpServers}
                        onChange={(e) => setUseGlobalMcpServers(e.target.checked)}
                        className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                      />
                      <div className="flex-1">
                        <div className="text-sm font-medium text-blue-900">Use Global MCP Servers</div>
                        <div className="text-xs text-blue-700 mt-0.5">
                          {useGlobalMcpServers 
                            ? `✓ Will use ${globalMCPServers.length} server(s) from Global Config during execution` 
                            : "✗ Only uses servers configured above"}
                        </div>
                        {useGlobalMcpServers && globalMCPServers.length === 0 && (
                          <div className="text-xs text-orange-600 mt-1">
                            ⚠️ No servers in Global Config. Configure in Settings → MCP Tools tab
                          </div>
                        )}
                      </div>
                    </label>
                    
                    {/* Show global servers */}
                    {useGlobalMcpServers && globalMCPServers.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-blue-300">
                        <div className="text-xs font-medium text-blue-800 mb-1">Global Servers:</div>
                        {globalMCPServers.map((server) => (
                          <div key={server.url} className="text-xs text-blue-700 bg-blue-100 rounded px-2 py-1 mb-1">
                            <div className="font-mono">{server.url}</div>
                            {server.selectedTools.length > 0 && (
                              <div className="text-[10px] mt-0.5">
                                Tools: {server.selectedTools.join(', ')}
                              </div>
                            )}
                          </div>
                        ))}
                        <div className="text-[10px] text-blue-600 mt-1">
                          💡 These servers are from Global Config and won't be saved to this node
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Max Iterations */}
                <div>
                  <label className="block text-sm font-medium mb-1">Max Iterations</label>
                  <input
                    type="number"
                    value={maxIters}
                    onChange={(e) => setMaxIters(parseInt(e.target.value) || 5)}
                    min={1}
                    max={20}
                    className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                  />
                  <div className="text-xs text-gray-500 mt-1">
                    Maximum reasoning-action cycles (1-20)
                  </div>
                </div>
              </>
            )}

            <button
              onClick={(e) => {
                e.stopPropagation();
                handleSave();
              }}
              className="w-full px-3 py-2 bg-green-600 text-white rounded hover:bg-green-700"
            >
              Save
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {/* Model Display */}
            {model && (
              <div className="text-sm">
                <span className="font-medium">Model:</span>
                <span className="ml-2 text-gray-600">{model}</span>
              </div>
            )}

            {/* Instruction Display */}
            {instruction && (
              <div className="text-sm">
                <span className="font-medium">Instruction:</span>
                <div className="mt-1 p-2 bg-gray-50 rounded text-xs">
                  {instruction}
                </div>
              </div>
            )}

            {/* Parameters Display */}
            {Object.keys(parameters).length > 0 && (
              <div className="text-sm">
                <div className="font-medium mb-1 flex items-center">
                  <Settings size={12} className="mr-1" />
                  Parameters
                </div>
                <div className="space-y-1 max-h-20 overflow-y-auto">
                  {Object.entries(parameters).map(([key, value]) => (
                    <div key={key} className="flex justify-between">
                      <span className="text-gray-600">{key}:</span>
                      <span className="font-mono text-xs">{String(value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ReAct MCP Servers Display */}
            {moduleType === 'ReAct' && mcpServers.length > 0 && (
              <div className="text-sm">
                <div className="font-medium mb-1">MCP Servers ({mcpServers.length})</div>
                <div className="space-y-1 max-h-16 overflow-y-auto">
                  {mcpServers.map((server, idx) => (
                    <div key={idx} className="p-1 bg-purple-50 rounded text-xs font-mono truncate">
                      {server}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ReAct Max Iterations Display */}
            {moduleType === 'ReAct' && (
              <div className="text-sm">
                <span className="font-medium">Max Iterations:</span>
                <span className="ml-2 text-gray-600">{maxIters}</span>
              </div>
            )}

            {!model && !instruction && Object.keys(parameters).length === 0 && mcpServers.length === 0 && (
              <div className="text-sm text-gray-500 text-center py-2">
                No configuration
              </div>
            )}
          </div>
        )}
      </div>

      {/* Optimization Footer */}
      {nodeData.optimization_data && (
        <OptimizationFooter optimizationData={nodeData.optimization_data} />
      )}

      {/* Trace Indicator */}
      {traceData && (
        <TraceIndicator
          hasTrace={true}
          executionTime={traceData.execution_time}
          onClick={(e) => {
            e.stopPropagation();
            onTraceClick?.(id, traceData);
          }}
        />
      )}
    </div>
  );
};

export default ModuleNode;