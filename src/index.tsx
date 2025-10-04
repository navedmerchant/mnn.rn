import { DeviceEventEmitter } from 'react-native';
import type { EmitterSubscription } from 'react-native';
import MnnRnNative from './NativeMnnRn';

// ===== Types =====

export interface LlmSessionConfig {
  modelDir: string;
  maxNewTokens?: number;
  systemPrompt?: string;
  assistantPrompt?: string;
  keepHistory?: boolean;
  mergedConfig?: string;
  extraConfig?: string;
  chatHistory?: string[];
}

export interface LlmMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface LlmMetrics {
  promptLen: number;
  decodeLen: number;
  prefillTime: number;
  decodeTime: number;
}

export type ChunkCallback = (chunk: string) => void;
export type MetricsCallback = (metrics: LlmMetrics) => void;
export type ErrorCallback = (error: string) => void;

// ===== Event Types =====
export interface LlmChunkEvent {
  sessionId: number;
  chunk: string;
}

export interface LlmCompleteEvent {
  sessionId: number;
  metrics: LlmMetrics;
}

export interface LlmErrorEvent {
  sessionId: number;
  error: string;
}

// ===== MnnLlmSession Class =====

export class MnnLlmSession {
  private sessionId: number | null = null;
  private isInitialized: boolean = false;
  private chunkListener: EmitterSubscription | null = null;
  private completeListener: EmitterSubscription | null = null;
  private errorListener: EmitterSubscription | null = null;

  /**
   * Initialize the LLM session with model configuration
   * @throws Error if initialization fails
   */
  async init(config: LlmSessionConfig): Promise<void> {
    if (this.isInitialized) {
      throw new Error('Session is already initialized');
    }

    const {
      modelDir,
      maxNewTokens = 2048,
      systemPrompt = 'You are a helpful assistant.',
      keepHistory = true,
      mergedConfig,
      extraConfig,
      chatHistory = [],
    } = config;

    // Build merged config
    const defaultMergedConfig = {
      max_new_tokens: maxNewTokens,
      system_prompt: systemPrompt,
    };

    const mergedConfigStr = mergedConfig || JSON.stringify(defaultMergedConfig);

    // Build extra config
    const defaultExtraConfig = {
      keep_history: keepHistory,
      mmap_dir: '',
    };

    const extraConfigStr = extraConfig || JSON.stringify(defaultExtraConfig);

    try {
      this.sessionId = await MnnRnNative.init(
        modelDir,
        chatHistory.length > 0 ? chatHistory : null,
        mergedConfigStr,
        extraConfigStr
      );
      this.isInitialized = true;
    } catch (error) {
      throw new Error(`Failed to initialize session: ${error}`);
    }
  }

  /**
   * Release native resources - MUST be called when done
   */
  async release(): Promise<void> {
    this.ensureInitialized();
    this.removeAllListeners();
    await MnnRnNative.release(this.sessionId!);
    this.sessionId = null;
    this.isInitialized = false;
  }

  /**
   * Set up event listeners for streaming responses
   */
  private setupListeners(
    onChunk?: ChunkCallback,
    onComplete?: MetricsCallback,
    onError?: ErrorCallback
  ): void {
    this.removeAllListeners();

    if (onChunk) {
      this.chunkListener = DeviceEventEmitter.addListener(
        'onLlmChunk',
        (event: LlmChunkEvent) => {
          if (event.sessionId === this.sessionId) {
            onChunk(event.chunk);
          }
        }
      );
    }

    if (onComplete) {
      this.completeListener = DeviceEventEmitter.addListener(
        'onLlmComplete',
        (event: LlmCompleteEvent) => {
          if (event.sessionId === this.sessionId) {
            onComplete(event.metrics);
            this.removeAllListeners();
          }
        }
      );
    }

    if (onError) {
      this.errorListener = DeviceEventEmitter.addListener(
        'onLlmError',
        (event: LlmErrorEvent) => {
          if (event.sessionId === this.sessionId) {
            onError(event.error);
            this.removeAllListeners();
          }
        }
      );
    }
  }

  /**
   * Remove all event listeners
   */
  private removeAllListeners(): void {
    if (this.chunkListener) {
      this.chunkListener.remove();
      this.chunkListener = null;
    }
    if (this.completeListener) {
      this.completeListener.remove();
      this.completeListener = null;
    }
    if (this.errorListener) {
      this.errorListener.remove();
      this.errorListener = null;
    }
  }

  /**
   * Reset session state
   */
  async reset(): Promise<void> {
    this.ensureInitialized();
    await MnnRnNative.reset(this.sessionId!);
  }

  /**
   * Submit prompt with event-based streaming
   */
  async submitPrompt(
    prompt: string,
    keepHistory: boolean,
    onChunk?: ChunkCallback,
    onComplete?: MetricsCallback,
    onError?: ErrorCallback
  ): Promise<LlmMetrics> {
    this.ensureInitialized();

    // Set up event listeners
    this.setupListeners(onChunk, onComplete, onError);

    // Call native method (now returns a promise)
    return (await MnnRnNative.submitPromptStreaming(
      this.sessionId!,
      prompt,
      keepHistory
    )) as LlmMetrics;
  }

  /**
   * Submit prompt with async/await (same as submitPrompt but for API consistency)
   */
  async submitPromptAsync(
    prompt: string,
    keepHistory: boolean,
    onChunk?: ChunkCallback
  ): Promise<LlmMetrics> {
    this.ensureInitialized();

    // Set up event listeners
    this.setupListeners(onChunk);

    return (await MnnRnNative.submitPromptAsync(
      this.sessionId!,
      prompt,
      keepHistory
    )) as LlmMetrics;
  }

  /**
   * Submit with full conversation history (event-based)
   */
  async submitWithHistory(
    messages: LlmMessage[],
    onChunk?: ChunkCallback,
    onComplete?: MetricsCallback,
    onError?: ErrorCallback
  ): Promise<LlmMetrics> {
    this.ensureInitialized();

    // Set up event listeners
    this.setupListeners(onChunk, onComplete, onError);

    return (await MnnRnNative.submitWithHistoryStreaming(
      this.sessionId!,
      messages
    )) as LlmMetrics;
  }

  /**
   * Submit with history (same as submitWithHistory but for API consistency)
   */
  async submitWithHistoryAsync(
    messages: LlmMessage[],
    onChunk?: ChunkCallback
  ): Promise<LlmMetrics> {
    this.ensureInitialized();

    // Set up event listeners
    this.setupListeners(onChunk);

    return (await MnnRnNative.submitWithHistoryAsync(
      this.sessionId!,
      messages
    )) as LlmMetrics;
  }

  /**
   * Update maximum tokens to generate
   */
  async updateMaxNewTokens(maxTokens: number): Promise<void> {
    this.ensureInitialized();
    await MnnRnNative.updateMaxNewTokens(this.sessionId!, maxTokens);
  }

  /**
   * Update system prompt
   */
  async updateSystemPrompt(systemPrompt: string): Promise<void> {
    this.ensureInitialized();
    await MnnRnNative.updateSystemPrompt(this.sessionId!, systemPrompt);
  }

  /**
   * Update assistant prompt template
   */
  async updateAssistantPrompt(assistantPrompt: string): Promise<void> {
    this.ensureInitialized();
    await MnnRnNative.updateAssistantPrompt(this.sessionId!, assistantPrompt);
  }

  /**
   * Update MNN configuration (JSON)
   */
  async updateConfig(configJson: string): Promise<void> {
    this.ensureInitialized();
    await MnnRnNative.updateConfig(this.sessionId!, configJson);
  }

  /**
   * Clear conversation history
   */
  async clearHistory(): Promise<void> {
    this.ensureInitialized();
    await MnnRnNative.clearHistory(this.sessionId!);
  }

  /**
   * Get current system prompt
   */
  async getSystemPrompt(): Promise<string> {
    this.ensureInitialized();
    return await MnnRnNative.getSystemPrompt(this.sessionId!);
  }

  /**
   * Get debug information (last prompt/response)
   */
  async getDebugInfo(): Promise<string> {
    this.ensureInitialized();
    return await MnnRnNative.getDebugInfo(this.sessionId!);
  }

  /**
   * Ensure session is initialized
   * @private
   */
  private ensureInitialized(): void {
    if (!this.isInitialized || this.sessionId === null) {
      throw new Error('Session is not initialized. Call init() first.');
    }
  }
}

/**
 * Factory function to create a new LLM session
 */
export function createMnnLlmSession(): MnnLlmSession {
  return new MnnLlmSession();
}

// Export everything
export default {
  MnnLlmSession,
  createMnnLlmSession,
};
