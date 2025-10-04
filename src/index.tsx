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
  private stopRequested: boolean = false;

  /**
   * Initialize the LLM session with model configuration.
   *
   * @param config - Session configuration
   * @param config.modelDir - Path to the model directory (required)
   * @param config.maxNewTokens - Maximum tokens to generate (default: 2048)
   * @param config.systemPrompt - System prompt for chat models (default: 'You are a helpful assistant.')
   * @param config.keepHistory - Enable conversation history (default: true)
   * @param config.mergedConfig - JSON config for MNN (optional)
   * @param config.extraConfig - Additional JSON config (optional)
   * @param config.chatHistory - Initial chat history (optional)
   *
   * @throws Error if initialization fails or session is already initialized
   *
   * @example
   * ```typescript
   * await session.init({
   *   modelDir: '/sdcard/models/llama-3-8b',
   *   maxNewTokens: 2048,
   *   systemPrompt: 'You are a helpful AI assistant.',
   *   keepHistory: true
   * });
   * ```
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
   * Release native resources and cleanup the session.
   *
   * **IMPORTANT:** Always call this when done to prevent memory leaks!
   *
   * @example
   * ```typescript
   * useEffect(() => {
   *   return () => {
   *     session.release().catch(console.error);
   *   };
   * }, []);
   * ```
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
          if (event.sessionId === this.sessionId && !this.stopRequested) {
            onChunk(event.chunk);
          } else if (this.stopRequested) {
            this.removeAllListeners();
          }
        }
      );
    }

    if (onComplete) {
      this.completeListener = DeviceEventEmitter.addListener(
        'onLlmComplete',
        (event: LlmCompleteEvent) => {
          if (event.sessionId === this.sessionId && !this.stopRequested) {
            onComplete(event.metrics);
            this.removeAllListeners();
          } else if (this.stopRequested) {
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
   * Submit a prompt with streaming callbacks and await final metrics.
   *
   * This method provides both real-time streaming via callbacks AND returns a Promise
   * that resolves with the final metrics when generation completes.
   *
   * @param prompt - The input text to generate from
   * @param keepHistory - Whether to add this exchange to conversation history
   * @param onChunk - Optional callback for each generated text chunk (streaming)
   * @param onComplete - Optional callback when generation completes with metrics
   * @param onError - Optional callback for error handling
   * @returns Promise<LlmMetrics> - Resolves with final generation metrics
   *
   * @example
   * ```typescript
   * // Use both callbacks and await the result
   * const metrics = await session.submitPrompt(
   *   'Write a haiku',
   *   true,
   *   (chunk) => console.log(chunk),      // Stream each token
   *   (metrics) => console.log('Done!'),  // Called on completion
   *   (error) => console.error(error)     // Handle errors
   * );
   *
   * // Access final metrics from Promise
   * console.log('Total tokens:', metrics.decodeLen);
   * ```
   */
  async submitPrompt(
    prompt: string,
    keepHistory: boolean,
    onChunk?: ChunkCallback,
    onComplete?: MetricsCallback,
    onError?: ErrorCallback
  ): Promise<LlmMetrics> {
    this.ensureInitialized();

    // Reset stop flag when starting new generation
    this.stopRequested = false;

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
   * Clear the conversation history.
   *
   * This removes all previous messages from the session but keeps
   * the model loaded and ready for new conversations.
   *
   * @example
   * ```typescript
   * await session.clearHistory();
   * console.log('Chat history cleared');
   * ```
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
   * Stop the current text generation immediately.
   *
   * This method will interrupt ongoing generation and cleanup listeners.
   * Safe to call even if no generation is in progress.
   *
   * @example
   * ```typescript
   * const handleStop = async () => {
   *   await session.stop();
   *   setIsGenerating(false);
   * };
   * ```
   */
  async stop(): Promise<void> {
    this.ensureInitialized();
    this.stopRequested = true;
    this.removeAllListeners();

    try {
      await MnnRnNative.stopGeneration(this.sessionId!);
    } catch (error) {
      // Ignore errors if session is already stopped or doesn't exist
      console.warn('Stop generation error:', error);
    }
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
 * Factory function to create a new LLM session instance.
 *
 * This is the recommended way to create sessions as shown in the example app.
 *
 * @returns A new MnnLlmSession instance
 *
 * @example
 * ```typescript
 * import { createMnnLlmSession } from 'mnn-rn';
 *
 * function MyComponent() {
 *   const [session] = useState(() => createMnnLlmSession());
 *
 *   useEffect(() => {
 *     session.init({
 *       modelDir: '/sdcard/models/llama',
 *       maxNewTokens: 2048,
 *       systemPrompt: 'You are a helpful AI assistant.',
 *       keepHistory: true
 *     });
 *
 *     return () => {
 *       session.release().catch(console.error);
 *     };
 *   }, []);
 *
 *   // ... rest of component
 * }
 * ```
 */
export function createMnnLlmSession(): MnnLlmSession {
  return new MnnLlmSession();
}

// Export everything
export default {
  MnnLlmSession,
  createMnnLlmSession,
};
