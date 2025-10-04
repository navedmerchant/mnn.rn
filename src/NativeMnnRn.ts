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

  // Text generation (event-based streaming)
  submitPromptStreaming(
    sessionId: number,
    prompt: string,
    keepHistory: boolean
  ): Promise<Object>;

  submitWithHistoryStreaming(
    sessionId: number,
    messages: Array<{ role: string; content: string }>
  ): Promise<Object>;

  // Configuration
  updateMaxNewTokens(sessionId: number, maxTokens: number): Promise<void>;
  updateSystemPrompt(sessionId: number, systemPrompt: string): Promise<void>;
  updateAssistantPrompt(
    sessionId: number,
    assistantPrompt: string
  ): Promise<void>;
  updateConfig(sessionId: number, configJson: string): Promise<void>;

  // History
  clearHistory(sessionId: number): Promise<void>;

  // Information
  getSystemPrompt(sessionId: number): Promise<string>;
  getDebugInfo(sessionId: number): Promise<string>;

  // Generation control
  stopGeneration(sessionId: number): Promise<void>;
}

export default TurboModuleRegistry.getEnforcing<Spec>('MnnRn');
