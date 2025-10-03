import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  // Session lifecycle
  init(
    modelDir: string,
    chatHistory: string[] | null,
    mergedConfig: string,
    extraConfig: string
  ): Promise<number>;
  
  release(sessionId: number): Promise<void>;
  reset(sessionId: number): Promise<void>;
  
  // Text generation (callback-based)
  submitPromptStreaming(
    sessionId: number,
    prompt: string,
    keepHistory: boolean,
    onChunk: (chunk: string) => void,
    onComplete: (result: Object) => void
  ): void;
  
  submitWithHistoryStreaming(
    sessionId: number,
    messages: Array<{role: string; content: string}>,
    onChunk: (chunk: string) => void,
    onComplete: (result: Object) => void
  ): void;
  
  // Text generation (promise-based)
  submitPromptAsync(
    sessionId: number,
    prompt: string,
    keepHistory: boolean,
    onChunk: ((chunk: string) => void) | null
  ): Promise<Object>;
  
  submitWithHistoryAsync(
    sessionId: number,
    messages: Array<{role: string; content: string}>,
    onChunk: ((chunk: string) => void) | null
  ): Promise<Object>;
  
  // Configuration
  updateMaxNewTokens(sessionId: number, maxTokens: number): Promise<void>;
  updateSystemPrompt(sessionId: number, systemPrompt: string): Promise<void>;
  updateAssistantPrompt(sessionId: number, assistantPrompt: string): Promise<void>;
  updateConfig(sessionId: number, configJson: string): Promise<void>;
  
  // History
  clearHistory(sessionId: number): Promise<void>;
  
  // Information
  getSystemPrompt(sessionId: number): Promise<string>;
  getDebugInfo(sessionId: number): Promise<string>;
}

export default TurboModuleRegistry.getEnforcing<Spec>('MnnRn');
