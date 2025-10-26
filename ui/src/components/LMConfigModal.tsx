import React, { useState, useEffect } from 'react';
import { X, Check, AlertCircle, Server, Wrench, ChevronDown } from 'lucide-react';
import { useLMConfig, MCPServer } from '../contexts/LMConfigContext';

interface LMConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const PROVIDER_OPTIONS = [
  { value: 'databricks', label: 'Databricks', requiresKey: false },
  { value: 'openai', label: 'OpenAI', requiresKey: true },
  { value: 'anthropic', label: 'Anthropic', requiresKey: true },
  { value: 'gemini', label: 'Gemini (Google)', requiresKey: true },
  { value: 'custom', label: 'Custom Provider', requiresKey: true },
];

const LMConfigModal: React.FC<LMConfigModalProps> = ({ isOpen, onClose }) => {
  const { globalLMConfig, setGlobalLMConfig, mcpServers, setMCPServers, availableProviders } = useLMConfig();
  const [selectedProvider, setSelectedProvider] = useState<string>('databricks');
  const [modelName, setModelName] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'lm' | 'mcp'>('lm');
  
  // MCP State
  const [newServerUrl, setNewServerUrl] = useState('');
  const [availableTools, setAvailableTools] = useState<Record<string, Array<{name: string, description: string}>>>({});
  const [loadingTools, setLoadingTools] = useState<Record<string, boolean>>({});
  const [localMCPServers, setLocalMCPServers] = useState<MCPServer[]>([]);
  const [collapsedServers, setCollapsedServers] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (globalLMConfig) {
      setSelectedProvider(globalLMConfig.provider);
      setModelName(globalLMConfig.modelName);
    } else {
      // Default to databricks if available, otherwise first available provider
      const defaultProvider = availableProviders['databricks']
        ? 'databricks'
        : Object.keys(availableProviders).find(p => availableProviders[p]) || 'databricks';
      setSelectedProvider(defaultProvider);
      setModelName('');
    }
    
    // Load MCP servers
    setLocalMCPServers(mcpServers);
    // Fetch tools for existing servers
    mcpServers.forEach(server => {
      if (server.url) {
        fetchToolsForServer(server.url);
      }
    });
  }, [globalLMConfig, availableProviders, mcpServers]);
  
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
      }
    } catch (error) {
      console.error('Failed to fetch tools:', error);
    } finally {
      setLoadingTools(prev => ({ ...prev, [serverUrl]: false }));
    }
  };
  
  const addMCPServer = () => {
    if (newServerUrl.trim() && !localMCPServers.some(s => s.url === newServerUrl.trim())) {
      const serverUrl = newServerUrl.trim();
      const newServer: MCPServer = {
        url: serverUrl,
        selectedTools: []
      };
      setLocalMCPServers([...localMCPServers, newServer]);
      setNewServerUrl('');
      fetchToolsForServer(serverUrl);
    }
  };
  
  const removeMCPServer = (serverUrl: string) => {
    setLocalMCPServers(localMCPServers.filter(s => s.url !== serverUrl));
    setAvailableTools(prev => {
      const { [serverUrl]: _, ...rest } = prev;
      return rest;
    });
  };
  
  const toggleToolSelection = (serverUrl: string, toolName: string) => {
    setLocalMCPServers(prev => prev.map(server => {
      if (server.url === serverUrl) {
        const isSelected = server.selectedTools.includes(toolName);
        return {
          ...server,
          selectedTools: isSelected
            ? server.selectedTools.filter(t => t !== toolName)
            : [...server.selectedTools, toolName]
        };
      }
      return server;
    }));
  };
  
  const selectAllTools = (serverUrl: string) => {
    const tools = availableTools[serverUrl] || [];
    setLocalMCPServers(prev => prev.map(server => {
      if (server.url === serverUrl) {
        return {
          ...server,
          selectedTools: tools.map(t => t.name)
        };
      }
      return server;
    }));
  };
  
  const deselectAllTools = (serverUrl: string) => {
    setLocalMCPServers(prev => prev.map(server => {
      if (server.url === serverUrl) {
        return {
          ...server,
          selectedTools: []
        };
      }
      return server;
    }));
  };

  const toggleServerCollapse = (serverUrl: string) => {
    setCollapsedServers(prev => ({
      ...prev,
      [serverUrl]: !prev[serverUrl]
    }));
  };

  if (!isOpen) return null;

  const handleSave = () => {
    if (activeTab === 'lm') {
      if (!modelName.trim()) {
        alert('Please enter a model name');
        return;
      }

      const fullModelName = `${selectedProvider}/${modelName.trim()}`;
      setGlobalLMConfig({
        provider: selectedProvider,
        modelName: fullModelName,
      });
    } else {
      // Save MCP servers
      setMCPServers(localMCPServers);
    }

    onClose();
  };

  const handleClear = () => {
    if (activeTab === 'lm') {
      setGlobalLMConfig(null);
      setSelectedProvider('databricks');
      setModelName('');
    } else {
      setLocalMCPServers([]);
      setMCPServers([]);
    }
    onClose();
  };

  const isProviderConfigured = (provider: string) => {
    return availableProviders[provider] === true;
  };

  const getProviderInfo = (provider: string) => {
    const providerConfig = PROVIDER_OPTIONS.find(p => p.value === provider);
    if (!providerConfig) return null;

    const isConfigured = isProviderConfigured(provider);

    if (providerConfig.value === 'databricks') {
      return {
        statusText: isConfigured ? 'Configured' : 'Not configured',
        statusColor: isConfigured ? 'text-green-600' : 'text-yellow-600',
        helperText: isConfigured
          ? 'Databricks credentials are configured'
          : 'Databricks credentials not found. Configure DATABRICKS_CONFIG_PROFILE or DATABRICKS_HOST/TOKEN in .env',
      };
    }

    if (!providerConfig.requiresKey) {
      return {
        statusText: 'Available',
        statusColor: 'text-green-600',
        helperText: '',
      };
    }

    return {
      statusText: isConfigured ? 'API Key Configured' : 'API Key Required',
      statusColor: isConfigured ? 'text-green-600' : 'text-red-600',
      helperText: isConfigured
        ? `${providerConfig.label} API key is configured on the server`
        : `${providerConfig.label} API key not found. Configure ${provider.toUpperCase()}_API_KEY in .env on the server`,
    };
  };

  const selectedProviderInfo = getProviderInfo(selectedProvider);
  const isSelectedProviderConfigured = isProviderConfigured(selectedProvider);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">Global Configuration</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded transition-colors"
          >
            <X size={20} className="text-gray-500" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200">
          <button
            onClick={() => setActiveTab('lm')}
            className={`flex-1 px-6 py-3 text-sm font-medium transition-colors ${
              activeTab === 'lm'
                ? 'border-b-2 border-emerald-500 text-emerald-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <div className="flex items-center justify-center space-x-2">
              <Server size={18} />
              <span>Language Model</span>
            </div>
          </button>
          <button
            onClick={() => setActiveTab('mcp')}
            className={`flex-1 px-6 py-3 text-sm font-medium transition-colors ${
              activeTab === 'mcp'
                ? 'border-b-2 border-purple-500 text-purple-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <div className="flex items-center justify-center space-x-2">
              <Wrench size={18} />
              <span>MCP Tools ({localMCPServers.length})</span>
            </div>
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6">
          {activeTab === 'lm' && (
            <>
              {/* Info Box */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-start space-x-2">
                  <AlertCircle size={18} className="text-blue-600 mt-0.5" />
                  <div className="text-sm text-blue-800">
                    <p className="font-medium mb-1">About Global LM Configuration</p>
                    <p>
                      Set a default model that will be auto-filled when creating new DSPy module nodes.
                      You can still override the model at the node level if needed.
                    </p>
                    <p className="mt-2">
                      <strong>Format:</strong> provider/model-name (e.g., openai/gpt-4, databricks/claude-sonnet-4-5)
                    </p>
                  </div>
                </div>
              </div>
            </>
          )}
          
          {activeTab === 'mcp' && (
            <>
              {/* MCP Info Box */}
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                <div className="flex items-start space-x-2">
                  <AlertCircle size={18} className="text-purple-600 mt-0.5" />
                  <div className="text-sm text-purple-800">
                    <p className="font-medium mb-1">About MCP Tool Configuration</p>
                    <p>
                      Configure MCP servers and select which tools to make available globally.
                      These tools can then be used in ReAct nodes across all workflows.
                    </p>
                    <p className="mt-2">
                      <strong>Note:</strong> Tools are loaded when you add a server. Select only the tools you want to expose.
                    </p>
                  </div>
                </div>
              </div>

              {/* Add MCP Server */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Add MCP Server
                </label>
                <div className="flex space-x-2">
                  <input
                    type="text"
                    value={newServerUrl}
                    onChange={(e) => setNewServerUrl(e.target.value)}
                    placeholder="http://localhost:8001"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addMCPServer();
                      }
                    }}
                  />
                  <button
                    onClick={addMCPServer}
                    className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 transition-colors"
                  >
                    Add Server
                  </button>
                </div>
              </div>

              {/* MCP Servers List */}
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {localMCPServers.map((server) => {
                  const isCollapsed = collapsedServers[server.url] || false;
                  const hasTools = availableTools[server.url] && availableTools[server.url].length > 0;
                  
                  return (
                    <div key={server.url} className="border border-purple-200 rounded-lg bg-purple-50">
                      <div className="flex items-center justify-between p-3 border-b border-purple-200">
                        <button
                          onClick={() => toggleServerCollapse(server.url)}
                          className="flex-1 flex items-center space-x-2 hover:bg-purple-100 -m-3 p-3 rounded-t-lg transition-colors"
                        >
                          <ChevronDown 
                            size={18} 
                            className={`text-purple-600 transition-transform ${isCollapsed ? '-rotate-90' : ''}`}
                          />
                          <div className="flex-1 text-left">
                            <div className="font-mono text-sm text-purple-900">{server.url}</div>
                            {hasTools && (
                              <div className="text-xs text-purple-600 mt-0.5">
                                {server.selectedTools.length}/{availableTools[server.url].length} tools selected
                              </div>
                            )}
                          </div>
                        </button>
                        <button
                          onClick={() => removeMCPServer(server.url)}
                          className="ml-2 p-1 text-red-500 hover:bg-red-100 rounded"
                          title="Remove server"
                        >
                          ×
                        </button>
                      </div>

                      {/* Tools */}
                      {!isCollapsed && (
                        <>
                          {loadingTools[server.url] ? (
                            <div className="p-3 text-sm text-purple-600">Loading tools...</div>
                          ) : hasTools ? (
                            <div className="p-3">
                              <div className="flex items-center justify-between mb-2">
                                <div className="text-xs font-medium text-purple-700">
                                  Tools ({server.selectedTools.length}/{availableTools[server.url].length} selected)
                                </div>
                                <div className="flex space-x-2">
                                  <button
                                    onClick={() => selectAllTools(server.url)}
                                    className="text-xs text-purple-600 hover:text-purple-800"
                                  >
                                    Select All
                                  </button>
                                  <span className="text-xs text-gray-400">|</span>
                                  <button
                                    onClick={() => deselectAllTools(server.url)}
                                    className="text-xs text-purple-600 hover:text-purple-800"
                                  >
                                    Deselect All
                                  </button>
                                </div>
                              </div>
                              <div className="space-y-1 max-h-48 overflow-y-auto">
                                {availableTools[server.url].map((tool) => (
                                  <label key={tool.name} className="flex items-start space-x-2 cursor-pointer hover:bg-purple-100 p-2 rounded">
                                    <input
                                      type="checkbox"
                                      checked={server.selectedTools.includes(tool.name)}
                                      onChange={() => toggleToolSelection(server.url, tool.name)}
                                      className="mt-1 w-4 h-4 text-purple-600 rounded focus:ring-2 focus:ring-purple-500"
                                    />
                                    <div className="flex-1 min-w-0">
                                      <div className="text-sm font-medium text-purple-900">{tool.name}</div>
                                      <div className="text-xs text-purple-600 truncate">{tool.description}</div>
                                    </div>
                                  </label>
                                ))}
                              </div>
                            </div>
                          ) : (
                            <div className="p-3 text-sm text-gray-500">No tools found</div>
                          )}
                        </>
                      )}
                    </div>
                  );
                })}
                {localMCPServers.length === 0 && (
                  <div className="text-center py-8 text-gray-500">
                    <Wrench size={48} className="mx-auto mb-2 text-gray-400" />
                    <p className="text-sm">No MCP servers configured</p>
                    <p className="text-xs mt-1">Add a server above to get started</p>
                  </div>
                )}
              </div>
            </>
          )}
          
          {activeTab === 'lm' && (
            <>

          {/* Provider Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Provider
            </label>
            <select
              value={selectedProvider}
              onChange={(e) => setSelectedProvider(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
            >
              {PROVIDER_OPTIONS.map((provider) => {
                const configured = isProviderConfigured(provider.value);
                return (
                  <option key={provider.value} value={provider.value}>
                    {provider.label}
                    {provider.requiresKey && !configured ? ' (API Key Required)' : ''}
                    {configured ? ' ✓' : ''}
                  </option>
                );
              })}
            </select>

            {/* Provider Status */}
            {selectedProviderInfo && (
              <div className="mt-2 space-y-1">
                <div className="flex items-center space-x-2">
                  {isSelectedProviderConfigured ? (
                    <Check size={16} className={selectedProviderInfo.statusColor} />
                  ) : (
                    <AlertCircle size={16} className={selectedProviderInfo.statusColor} />
                  )}
                  <span className={`text-sm font-medium ${selectedProviderInfo.statusColor}`}>
                    {selectedProviderInfo.statusText}
                  </span>
                </div>
                {selectedProviderInfo.helperText && (
                  <p className="text-xs text-gray-600 ml-6">
                    {selectedProviderInfo.helperText}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Model Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Model Name
            </label>
            <input
              type="text"
              value={modelName}
              onChange={(e) => setModelName(e.target.value)}
              placeholder={
                selectedProvider === 'databricks'
                  ? 'e.g., databricks-claude-sonnet-4-5'
                  : selectedProvider === 'openai'
                  ? 'e.g., gpt-4'
                  : selectedProvider === 'anthropic'
                  ? 'e.g., claude-3-sonnet'
                  : selectedProvider === 'gemini'
                  ? 'e.g., gemini-pro'
                  : 'e.g., my-model'
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
            />
            <p className="mt-1 text-xs text-gray-500">
              Enter just the model name. The full format will be: <strong>{selectedProvider}/{modelName || 'model-name'}</strong>
            </p>
          </div>

          {/* Current Config Display */}
          {globalLMConfig && (
            <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
              <p className="text-sm font-medium text-gray-700 mb-1">Current Global Configuration:</p>
              <p className="text-sm text-gray-900 font-mono">{globalLMConfig.modelName}</p>
            </div>
          )}

          {/* Warning for unconfigured providers */}
          {!isSelectedProviderConfigured && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <div className="flex items-start space-x-2">
                <AlertCircle size={18} className="text-yellow-600 mt-0.5" />
                <div className="text-sm text-yellow-800">
                  <p className="font-medium">Provider Not Configured</p>
                  <p className="mt-1">
                    This provider requires API keys to be configured on the backend server.
                    Models using this provider will fail at runtime unless the keys are configured.
                  </p>
                </div>
              </div>
            </div>
          )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-between p-6 border-t border-gray-200">
          <button
            onClick={handleClear}
            className="px-4 py-2 text-red-700 bg-red-50 rounded-md hover:bg-red-100 transition-colors"
          >
            {activeTab === 'lm' ? 'Clear LM Config' : 'Clear MCP Servers'}
          </button>
          <div className="flex space-x-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={activeTab === 'lm' && !modelName.trim()}
              className={`px-4 py-2 text-white rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                activeTab === 'lm' 
                  ? 'bg-emerald-600 hover:bg-emerald-700' 
                  : 'bg-purple-600 hover:bg-purple-700'
              }`}
            >
              Save {activeTab === 'lm' ? 'LM Config' : 'MCP Servers'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LMConfigModal;
