# MNN React Native Library - Implementation Plan

## Overview

This document outlines the complete implementation plan for the MNN React Native library focusing on **LLM text generation only** with callback-based streaming API.

## Configuration Decisions

Based on requirements:
- ✅ **ABI Support**: arm64-v8a only (faster builds)
- ✅ **API Pattern**: Callbacks + Async/Await methods
- ✅ **Model Path**: `/sdcard/models/llama` (user-configurable in example)
- ✅ **Feature Scope**: LLM text generation ONLY (exclude audio/benchmark/vision)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│          TypeScript Layer (React Native App)                │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  MnnLlmSession Class                                  │  │
│  │  - init(config)                                       │  │
│  │  - submitPrompt(prompt, keepHistory, callbacks)       │  │
│  │  - submitPromptAsync(prompt, keepHistory, onChunk)    │  │
│  │  - submitWithHistory(messages, callbacks)             │  │
│  │  - updateConfig(), clearHistory(), release()          │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                          ↕ TurboModule Bridge
┌─────────────────────────────────────────────────────────────┐
│          Kotlin Layer (Native Module)                        │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  MnnRnModule (TurboModule)                           │  │
│  │  - Session map management                            │  │
│  │  - Callback invocation on background threads         │  │
│  │  - Promise-based method wrappers                     │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                          ↕ JNI Layer
┌─────────────────────────────────────────────────────────────┐
│          C++ Layer (JNI Bindings)                            │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  mnn_llm_jni.cpp                                     │  │
│  │  - Java callback → C++ lambda conversion             │  │
│  │  - Thread-safe JVM attachment                        │  │
│  │  - LlmSession wrapper calls                          │  │
│  └──────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  LlmSession (llm_session.cpp/h)                      │  │
│  │  - MNN LLM inference management                      │  │
│  │  - History management                                │  │
│  │  - UTF-8 streaming processor                         │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                          ↕ Static Linking
┌─────────────────────────────────────────────────────────────┐
│          MNN Library (Prebuilt)                              │
│         android/prebuilt/libs/libMNN.so (arm64-v8a)          │
└─────────────────────────────────────────────────────────────┘
```

---

## API Design

### TypeScript API

#### Core Types

```typescript
// Session configuration
export interface LlmSessionConfig {
  modelDir: string;                    // Required
  maxNewTokens?: number;               // Default: 2048
  systemPrompt?: string;               // Default: "You are a helpful assistant."
  keepHistory?: boolean;               // Default: true
  mergedConfig?: string;               // JSON string
  extraConfig?: string;                // JSON string
  chatHistory?: string[];              // Initial history
}

// Message structure for conversation
export interface LlmMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

// Performance metrics returned after generation
export interface LlmMetrics {
  promptLen: number;        // Input tokens processed
  decodeLen: number;        // Output tokens generated
  prefillTime: number;      // Prefill time (microseconds)
  decodeTime: number;       // Decode time (microseconds)
}

// Callback types
export type ChunkCallback = (chunk: string) => void;
export type MetricsCallback = (metrics: LlmMetrics) => void;
export type ErrorCallback = (error: string) => void;
```

#### MnnLlmSession Class

```typescript
export class MnnLlmSession {
  private sessionId: number | null = null;
  
  // ===== Lifecycle Methods =====
  
  /**
   * Initialize the LLM session with model configuration
   * @throws Error if initialization fails
   */
  async init(config: LlmSessionConfig): Promise<void>
  
  /**
   * Release native resources - MUST be called when done
   */
  async release(): Promise<void>
  
  /**
   * Reset session state (clear generation state)
   */
  async reset(): Promise<void>
  
  // ===== Text Generation Methods =====
  
  /**
   * Submit prompt with callback-based streaming
   * @param prompt - Input text
   * @param keepHistory - Add to conversation history
   * @param onChunk - Called for each generated chunk
   * @param onComplete - Called when generation completes
   * @param onError - Called if error occurs
   */
  submitPrompt(
    prompt: string,
    keepHistory: boolean,
    onChunk: ChunkCallback,
    onComplete: MetricsCallback,
    onError?: ErrorCallback
  ): void
  
  /**
   * Submit prompt with async/await (Promise-based)
   * @param prompt - Input text
   * @param keepHistory - Add to conversation history
   * @param onChunk - Optional streaming callback
   * @returns Promise resolving to final metrics
   */
  async submitPromptAsync(
    prompt: string,
    keepHistory: boolean,
    onChunk?: ChunkCallback
  ): Promise<LlmMetrics>
  
  /**
   * Submit with full conversation history (callback-based)
   * @param messages - Conversation messages
   * @param onChunk - Called for each chunk
   * @param onComplete - Called when complete
   * @param onError - Called on error
   */
  submitWithHistory(
    messages: LlmMessage[],
    onChunk: ChunkCallback,
    onComplete: MetricsCallback,
    onError?: ErrorCallback
  ): void
  
  /**
   * Submit with history (Promise-based)
   * @param messages - Conversation messages
   * @param onChunk - Optional streaming callback
   * @returns Promise resolving to metrics
   */
  async submitWithHistoryAsync(
    messages: LlmMessage[],
    onChunk?: ChunkCallback
  ): Promise<LlmMetrics>
  
  // ===== Configuration Methods =====
  
  /**
   * Update maximum tokens to generate
   */
  async updateMaxNewTokens(maxTokens: number): Promise<void>
  
  /**
   * Update system prompt
   */
  async updateSystemPrompt(systemPrompt: string): Promise<void>
  
  /**
   * Update assistant prompt template
   */
  async updateAssistantPrompt(assistantPrompt: string): Promise<void>
  
  /**
   * Update MNN configuration (JSON)
   */
  async updateConfig(configJson: string): Promise<void>
  
  // ===== History Management =====
  
  /**
   * Clear conversation history
   */
  async clearHistory(): Promise<void>
  
  // ===== Information Methods =====
  
  /**
   * Get current system prompt
   */
  async getSystemPrompt(): Promise<string>
  
  /**
   * Get debug information (last prompt/response)
   */
  async getDebugInfo(): Promise<string>
}

/**
 * Factory function to create a new session
 */
export function createMnnLlmSession(): MnnLlmSession
```

### Usage Examples

#### Example 1: Basic Streaming

```typescript
import { createMnnLlmSession } from 'mnn-rn';

const session = createMnnLlmSession();

// Initialize
await session.init({
  modelDir: '/sdcard/models/llama-3-8b',
  maxNewTokens: 2048,
  systemPrompt: 'You are a helpful assistant.'
});

// Stream text generation
let fullResponse = '';
session.submitPrompt(
  'Write a haiku about React Native',
  true,
  (chunk) => {
    // Called for each token/chunk
    fullResponse += chunk;
    console.log('Chunk:', chunk);
  },
  (metrics) => {
    // Called when complete
    console.log('Done! Response:', fullResponse);
    console.log('Generated', metrics.decodeLen, 'tokens');
    console.log('Speed:', metrics.decodeLen / (metrics.decodeTime / 1_000_000), 'tok/s');
  },
  (error) => {
    // Called on error
    console.error('Error:', error);
  }
);

// Clean up
await session.release();
```

#### Example 2: Async/Await Pattern

```typescript
async function generateText(prompt: string) {
  const session = createMnnLlmSession();
  
  try {
    await session.init({
      modelDir: '/sdcard/models/llama'
    });
    
    let response = '';
    const metrics = await session.submitPromptAsync(
      prompt,
      true,
      (chunk) => {
        response += chunk;
        console.log('Streaming:', chunk);
      }
    );
    
    console.log('Complete:', response);
    console.log('Metrics:', metrics);
    
    return response;
  } finally {
    await session.release();
  }
}
```

#### Example 3: React Component

```typescript
function ChatComponent() {
  const [session] = useState(() => createMnnLlmSession());
  const [response, setResponse] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  
  useEffect(() => {
    session.init({
      modelDir: '/sdcard/models/llama',
      maxNewTokens: 2048
    });
    
    return () => {
      session.release();
    };
  }, []);
  
  const handleSubmit = (prompt: string) => {
    setIsGenerating(true);
    setResponse('');
    
    session.submitPrompt(
      prompt,
      true,
      (chunk) => {
        setResponse(prev => prev + chunk);
      },
      (metrics) => {
        setIsGenerating(false);
        console.log('Done:', metrics);
      },
      (error) => {
        setIsGenerating(false);
        Alert.alert('Error', error);
      }
    );
  };
  
  return (
    <View>
      <Text>{response}</Text>
      {isGenerating && <ActivityIndicator />}
    </View>
  );
}
```

#### Example 4: Conversation History

```typescript
const conversation: LlmMessage[] = [
  { role: 'user', content: 'Hello!' },
  { role: 'assistant', content: 'Hi! How can I help?' },
  { role: 'user', content: 'Explain React Native' }
];

session.submitWithHistory(
  conversation,
  (chunk) => console.log(chunk),
  (metrics) => console.log('Done:', metrics),
  (error) => console.error(error)
);
```

---

## Implementation Tasks

### Task 1: Build System Configuration

#### File: `android/src/main/cpp/CMakeLists.txt` (NEW)

```cmake
cmake_minimum_required(VERSION 3.22.1)
project(mnn-rn)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_VERBOSE_MAKEFILE ON)

# Include directories
include_directories(
  ${CMAKE_CURRENT_SOURCE_DIR}/include
  ${CMAKE_CURRENT_SOURCE_DIR}/include/MNN
  ${CMAKE_CURRENT_SOURCE_DIR}/include/llm
  ${CMAKE_CURRENT_SOURCE_DIR}/include/nlohmann
)

# Add prebuilt MNN library (static linking)
add_library(MNN SHARED IMPORTED)
set_target_properties(MNN PROPERTIES
  IMPORTED_LOCATION ${CMAKE_CURRENT_SOURCE_DIR}/../../../prebuilt/libs/libMNN.so
)

# Source files
add_library(
  mnn-rn
  SHARED
  mnn_llm_jni.cpp
  llm_session.cpp
  utf8_stream_processor.cpp
  mls_log.cpp
)

# Link libraries
target_link_libraries(
  mnn-rn
  MNN
  android
  log
)

# Ensure arm64-v8a ABI
target_compile_options(mnn-rn PRIVATE -march=armv8-a)
```

#### File: `android/build.gradle` (UPDATE)

Add after line 64 (after sourceSets):

```gradle
externalNativeBuild {
  cmake {
    path "src/main/cpp/CMakeLists.txt"
    version "3.22.1"
  }
}

defaultConfig {
  // ... existing config
  
  ndk {
    abiFilters "arm64-v8a"
  }
  
  externalNativeBuild {
    cmake {
      cppFlags "-std=c++17 -frtti -fexceptions"
      arguments "-DANDROID_STL=c++_shared"
    }
  }
}

packagingOptions {
  pickFirst 'lib/arm64-v8a/libc++_shared.so'
}
```

---

### Task 2: Kotlin TurboModule Implementation

#### File: `android/src/main/java/com/mnnrn/MnnRnModule.kt` (COMPLETE REWRITE)

Key features:
- Session map for managing multiple sessions
- Background thread execution for LLM operations
- Callback invocation from native to JS
- Promise-based async methods
- Proper error handling

```kotlin
package com.mnnrn

import android.util.Pair
import com.facebook.react.bridge.*
import com.facebook.react.module.annotations.ReactModule
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicLong

@ReactModule(name = MnnRnModule.NAME)
class MnnRnModule(reactContext: ReactApplicationContext) :
  NativeMnnRnSpec(reactContext) {

  private val sessionMap = ConcurrentHashMap<Long, Long>()
  private val sessionIdCounter = AtomicLong(1)

  override fun getName(): String = NAME

  // ===== Session Lifecycle =====

  @ReactMethod
  override fun init(
    modelDir: String,
    chatHistory: ReadableArray?,
    mergedConfig: String,
    extraConfig: String,
    promise: Promise
  ) {
    Thread {
      try {
        val historyList = chatHistory?.toArrayList() as? ArrayList<String>
        val nativePtr = initNative(modelDir, historyList, mergedConfig, extraConfig)
        
        if (nativePtr == 0L) {
          promise.reject("INIT_ERROR", "Failed to initialize session")
          return@Thread
        }
        
        val sessionId = sessionIdCounter.getAndIncrement()
        sessionMap[sessionId] = nativePtr
        promise.resolve(sessionId.toDouble())
      } catch (e: Exception) {
        promise.reject("INIT_ERROR", e.message, e)
      }
    }.start()
  }

  @ReactMethod
  override fun release(sessionId: Double, promise: Promise) {
    val nativePtr = sessionMap.remove(sessionId.toLong())
    if (nativePtr != null) {
      releaseNative(nativePtr)
      promise.resolve(null)
    } else {
      promise.reject("INVALID_SESSION", "Invalid session ID")
    }
  }

  @ReactMethod
  override fun reset(sessionId: Double, promise: Promise) {
    val nativePtr = sessionMap[sessionId.toLong()]
    if (nativePtr != null) {
      resetNative(nativePtr)
      promise.resolve(null)
    } else {
      promise.reject("INVALID_SESSION", "Invalid session ID")
    }
  }

  // ===== Text Generation (Callback-based) =====

  @ReactMethod
  override fun submitPromptStreaming(
    sessionId: Double,
    prompt: String,
    keepHistory: Boolean,
    onChunk: Callback,
    onComplete: Callback
  ) {
    val nativePtr = sessionMap[sessionId.toLong()]
    if (nativePtr == null) {
      onComplete.invoke("Error: Invalid session ID")
      return
    }

    Thread {
      try {
        // Create progress listener
        val progressListener = ProgressListener { text ->
          onChunk.invoke(text)
          false // Continue generation
        }

        val metricsMap = submitNative(nativePtr, prompt, keepHistory, progressListener)
        onComplete.invoke(convertHashMapToWritableMap(metricsMap))
      } catch (e: Exception) {
        onComplete.invoke("Error: ${e.message}")
      }
    }.start()
  }

  // ===== Text Generation (Promise-based) =====

  @ReactMethod
  override fun submitPromptAsync(
    sessionId: Double,
    prompt: String,
    keepHistory: Boolean,
    onChunk: Callback?,
    promise: Promise
  ) {
    val nativePtr = sessionMap[sessionId.toLong()]
    if (nativePtr == null) {
      promise.reject("INVALID_SESSION", "Invalid session ID")
      return
    }

    Thread {
      try {
        val progressListener = if (onChunk != null) {
          ProgressListener { text ->
            onChunk.invoke(text)
            false
          }
        } else {
          null
        }

        val metricsMap = submitNative(nativePtr, prompt, keepHistory, progressListener)
        promise.resolve(convertHashMapToWritableMap(metricsMap))
      } catch (e: Exception) {
        promise.reject("GENERATION_ERROR", e.message, e)
      }
    }.start()
  }

  // ===== Submit with History (Callback-based) =====

  @ReactMethod
  override fun submitWithHistoryStreaming(
    sessionId: Double,
    messages: ReadableArray,
    onChunk: Callback,
    onComplete: Callback
  ) {
    val nativePtr = sessionMap[sessionId.toLong()]
    if (nativePtr == null) {
      onComplete.invoke("Error: Invalid session ID")
      return
    }

    Thread {
      try {
        val historyList = convertMessagesToPairs(messages)
        val progressListener = ProgressListener { text ->
          onChunk.invoke(text)
          false
        }

        val metricsMap = submitFullHistoryNative(nativePtr, historyList, progressListener)
        onComplete.invoke(convertHashMapToWritableMap(metricsMap))
      } catch (e: Exception) {
        onComplete.invoke("Error: ${e.message}")
      }
    }.start()
  }

  // ===== Submit with History (Promise-based) =====

  @ReactMethod
  override fun submitWithHistoryAsync(
    sessionId: Double,
    messages: ReadableArray,
    onChunk: Callback?,
    promise: Promise
  ) {
    val nativePtr = sessionMap[sessionId.toLong()]
    if (nativePtr == null) {
      promise.reject("INVALID_SESSION", "Invalid session ID")
      return
    }

    Thread {
      try {
        val historyList = convertMessagesToPairs(messages)
        val progressListener = if (onChunk != null) {
          ProgressListener { text ->
            onChunk.invoke(text)
            false
          }
        } else {
          null
        }

        val metricsMap = submitFullHistoryNative(nativePtr, historyList, progressListener)
        promise.resolve(convertHashMapToWritableMap(metricsMap))
      } catch (e: Exception) {
        promise.reject("GENERATION_ERROR", e.message, e)
      }
    }.start()
  }

  // ===== Configuration Methods =====

  @ReactMethod
  override fun updateMaxNewTokens(sessionId: Double, maxTokens: Double, promise: Promise) {
    val nativePtr = sessionMap[sessionId.toLong()]
    if (nativePtr != null) {
      updateMaxNewTokensNative(nativePtr, maxTokens.toInt())
      promise.resolve(null)
    } else {
      promise.reject("INVALID_SESSION", "Invalid session ID")
    }
  }

  @ReactMethod
  override fun updateSystemPrompt(sessionId: Double, systemPrompt: String, promise: Promise) {
    val nativePtr = sessionMap[sessionId.toLong()]
    if (nativePtr != null) {
      updateSystemPromptNative(nativePtr, systemPrompt)
      promise.resolve(null)
    } else {
      promise.reject("INVALID_SESSION", "Invalid session ID")
    }
  }

  @ReactMethod
  override fun updateAssistantPrompt(sessionId: Double, assistantPrompt: String, promise: Promise) {
    val nativePtr = sessionMap[sessionId.toLong()]
    if (nativePtr != null) {
      updateAssistantPromptNative(nativePtr, assistantPrompt)
      promise.resolve(null)
    } else {
      promise.reject("INVALID_SESSION", "Invalid session ID")
    }
  }

  @ReactMethod
  override fun updateConfig(sessionId: Double, configJson: String, promise: Promise) {
    val nativePtr = sessionMap[sessionId.toLong()]
    if (nativePtr != null) {
      updateConfigNative(nativePtr, configJson)
      promise.resolve(null)
    } else {
      promise.reject("INVALID_SESSION", "Invalid session ID")
    }
  }

  // ===== History Management =====

  @ReactMethod
  override fun clearHistory(sessionId: Double, promise: Promise) {
    val nativePtr = sessionMap[sessionId.toLong()]
    if (nativePtr != null) {
      clearHistoryNative(nativePtr)
      promise.resolve(null)
    } else {
      promise.reject("INVALID_SESSION", "Invalid session ID")
    }
  }

  // ===== Information Methods =====

  @ReactMethod
  override fun getSystemPrompt(sessionId: Double, promise: Promise) {
    val nativePtr = sessionMap[sessionId.toLong()]
    if (nativePtr != null) {
      val systemPrompt = getSystemPromptNative(nativePtr)
      promise.resolve(systemPrompt)
    } else {
      promise.reject("INVALID_SESSION", "Invalid session ID")
    }
  }

  @ReactMethod
  override fun getDebugInfo(sessionId: Double, promise: Promise) {
    val nativePtr = sessionMap[sessionId.toLong()]
    if (nativePtr != null) {
      val debugInfo = getDebugInfoNative(nativePtr)
      promise.resolve(debugInfo)
    } else {
      promise.reject("INVALID_SESSION", "Invalid session ID")
    }
  }

  // ===== Helper Methods =====

  private fun convertMessagesToPairs(messages: ReadableArray): ArrayList<Pair<String, String>> {
    val pairs = ArrayList<Pair<String, String>>()
    for (i in 0 until messages.size()) {
      val message = messages.getMap(i)
      if (message != null) {
        val role = message.getString("role") ?: "user"
        val content = message.getString("content") ?: ""
        pairs.add(Pair(role, content))
      }
    }
    return pairs
  }

  private fun convertHashMapToWritableMap(hashMap: HashMap<*, *>): WritableMap {
    val map = Arguments.createMap()
    for ((key, value) in hashMap) {
      when (value) {
        is Long -> map.putDouble(key.toString(), value.toDouble())
        is Int -> map.putInt(key.toString(), value)
        is String -> map.putString(key.toString(), value)
        is Boolean -> map.putBoolean(key.toString(), value)
      }
    }
    return map
  }

  // ===== Native Method Declarations =====

  private external fun initNative(
    modelDir: String,
    chatHistory: ArrayList<String>?,
    mergedConfig: String,
    extraConfig: String
  ): Long

  private external fun submitNative(
    llmPtr: Long,
    prompt: String,
    keepHistory: Boolean,
    progressListener: ProgressListener?
  ): HashMap<*, *>

  private external fun submitFullHistoryNative(
    llmPtr: Long,
    historyList: ArrayList<Pair<String, String>>,
    progressListener: ProgressListener?
  ): HashMap<*, *>

  private external fun resetNative(llmPtr: Long)
  private external fun releaseNative(llmPtr: Long)
  private external fun updateMaxNewTokensNative(llmPtr: Long, maxTokens: Int)
  private external fun updateSystemPromptNative(llmPtr: Long, systemPrompt: String)
  private external fun updateAssistantPromptNative(llmPtr: Long, assistantPrompt: String)
  private external fun updateConfigNative(llmPtr: Long, configJson: String)
  private external fun clearHistoryNative(llmPtr: Long)
  private external fun getSystemPromptNative(llmPtr: Long): String
  private external fun getDebugInfoNative(llmPtr: Long): String

  // ===== Progress Listener Interface =====

  fun interface ProgressListener {
    fun onProgress(text: String): Boolean
  }

  companion object {
    const val NAME = "MnnRn"

    init {
      System.loadLibrary("mnn-rn")
    }
  }
}
```

---

### Task 3: TypeScript Implementation

#### File: `src/NativeMnnRn.ts` (COMPLETE REWRITE)

```typescript
import { TurboModule, TurboModuleRegistry } from 'react-native';

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
    onComplete: (result: any) => void
  ): void;
  
  submitWithHistoryStreaming(
    sessionId: number,
    messages: Array<{role: string; content: string}>,
    onChunk: (chunk: string) => void,
    onComplete: (result: any) => void
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
```

#### File: `src/index.tsx` (COMPLETE REWRITE)

See detailed implementation in separate section below.

---

### Task 4: Example App

#### File: `example/src/App.tsx` (COMPLETE REWRITE)

Features:
- Model path configuration
- Real-time streaming display
- Token counter
- Performance metrics
- Error handling
- Chat history

---

## Next Steps

1. ✅ Review this architectural plan
2. ⏭️ Switch to Code mode to implement
3. ⏭️ Test build system
4. ⏭️ Test API functionality
5. ⏭️ Run example app

---

## Success Criteria

- ✅ CMakeLists.txt successfully builds mnn-rn.so
- ✅ libMNN.so statically linked correctly
- ✅ Callbacks invoked for streaming text
- ✅ Promise-based methods work correctly
- ✅ Example app displays streaming responses
- ✅ No memory leaks
- ✅ Type-safe TypeScript API

---

## Estimated Implementation Time

- Build system: 30 minutes
- Kotlin module: 1 hour
- TypeScript API: 45 minutes
- Example app: 1 hour
- Testing & debugging: 1 hour

**Total: ~4 hours**