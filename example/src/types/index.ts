// Type definitions for the MNN LLM sample app

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
}

export interface ModelConfig {
  // Model file paths
  llmModel?: string;
  llmWeight?: string;

  // Hardware config
  backendType?: 'cpu' | 'opencl' | 'metal';
  threadNum?: number;
  precision?: 'low' | 'normal' | 'high';
  memory?: 'low' | 'normal' | 'high';
  useMmap?: boolean;
  kvcacheMmap?: boolean;
  tmpPath?: string;

  // Inference config
  maxNewTokens?: number;
  reuseKv?: boolean;
  quantQkv?: 0 | 1 | 2 | 3 | 4;

  // Sampler config
  samplerType?:
    | 'greedy'
    | 'temperature'
    | 'topK'
    | 'topP'
    | 'minP'
    | 'tfs'
    | 'typical'
    | 'penalty'
    | 'mixed';
  mixedSamplers?: string[];
  temperature?: number;
  topK?: number;
  topP?: number;
  minP?: number;
  tfsZ?: number;
  typical?: number;
  penalty?: number;
  nGram?: number;
  ngramFactor?: number;
  penaltySampler?: 'greedy' | 'temperature';

  // Prompts
  systemPrompt?: string;
  assistantPromptTemplate?: string;

  // Thinking mode (Jinja config)
  enableThinking?: boolean;
}

export interface DownloadProgress {
  totalFiles: number;
  downloadedFiles: number;
  currentFile: string;
  bytesDownloaded: number;
  totalBytes: number;
}

export interface HFFile {
  path: string;
  size: number;
  type: 'file' | 'directory';
}

export type Screen = 'download' | 'chat' | 'config';

export interface AppState {
  currentScreen: Screen;
  isModelDownloaded: boolean;
  isModelInitialized: boolean;
  modelPath: string;
  config: ModelConfig;
  chatMessages: ChatMessage[];
}
