import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export interface LMConfig {
  provider: string;
  modelName: string;
}

export interface MCPServer {
  url: string;
  selectedTools: string[];
}

export interface GlobalConfig {
  lmConfig: LMConfig | null;
  mcpServers: MCPServer[];
}

interface LMConfigContextType {
  globalLMConfig: LMConfig | null;
  setGlobalLMConfig: (config: LMConfig | null) => void;
  mcpServers: MCPServer[];
  setMCPServers: (servers: MCPServer[]) => void;
  availableProviders: Record<string, boolean>;
  refreshProviderStatus: () => Promise<void>;
}

const LMConfigContext = createContext<LMConfigContextType | undefined>(undefined);

const GLOBAL_CONFIG_STORAGE_KEY = 'dspy-forge-global-config';

export const LMConfigProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [globalLMConfig, setGlobalLMConfigState] = useState<LMConfig | null>(null);
  const [mcpServers, setMCPServersState] = useState<MCPServer[]>([]);
  const [availableProviders, setAvailableProviders] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const stored = localStorage.getItem(GLOBAL_CONFIG_STORAGE_KEY);
    if (stored) {
      try {
        const config: GlobalConfig = JSON.parse(stored);
        setGlobalLMConfigState(config.lmConfig || null);
        setMCPServersState(config.mcpServers || []);
      } catch (e) {
        console.error('Failed to parse stored global config:', e);
      }
    }
    refreshProviderStatus();
  }, []);

  const refreshProviderStatus = async () => {
    try {
      const response = await fetch('/api/v1/config/lm-providers');
      if (response.ok) {
        const providers = await response.json();
        setAvailableProviders(providers);
      }
    } catch (error) {
      console.error('Failed to fetch provider status:', error);
    }
  };

  const saveGlobalConfig = (lmConfig: LMConfig | null, servers: MCPServer[]) => {
    const config: GlobalConfig = { lmConfig, mcpServers: servers };
    localStorage.setItem(GLOBAL_CONFIG_STORAGE_KEY, JSON.stringify(config));
  };

  const setGlobalLMConfig = (config: LMConfig | null) => {
    setGlobalLMConfigState(config);
    saveGlobalConfig(config, mcpServers);
  };

  const setMCPServers = (servers: MCPServer[]) => {
    setMCPServersState(servers);
    saveGlobalConfig(globalLMConfig, servers);
  };

  return (
    <LMConfigContext.Provider
      value={{
        globalLMConfig,
        setGlobalLMConfig,
        mcpServers,
        setMCPServers,
        availableProviders,
        refreshProviderStatus,
      }}
    >
      {children}
    </LMConfigContext.Provider>
  );
};

export const useLMConfig = () => {
  const context = useContext(LMConfigContext);
  if (context === undefined) {
    throw new Error('useLMConfig must be used within an LMConfigProvider');
  }
  return context;
};
