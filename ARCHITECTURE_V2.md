# MNN React Native Library - Architecture V2 (Callback-Based)

## Overview

This document outlines the complete architecture for the MNN React Native library using **React Native Callbacks** for streaming LLM responses. This approach is simpler and more native to React Native than Event Emitters.

## Key Change: Callback-Based Streaming

### Why Callbacks Are Better
- ✅ **Native React Native pattern** - Built-in support
- ✅ **Simpler implementation** - No event emitter setup needed
- ✅ **Type-safe** - Direct TypeScript callback types
- ✅ **Less overhead** - Direct invocation, no event routing
- ✅ **Better error handling** - Separate success/error callbacks

### Callback Pattern for Streaming

```kotlin
@ReactMethod
fun submitPromptStreaming(
  sessionId: Double,
  prompt: String,
  keepHistory: Boolean,
  onChunk: Callback,      // Called multiple times for each chunk
  onComplete: Callback    // Called once with final metrics
)
```

```typescript
session.submitPrompt(
  'Hello!',
  true,
  (chunk: string) => {
    // Called multiple times as text streams
    console.log('Chunk:', chunk);
  },
  (metrics: LlmMetrics) => {
    // Called once when complete
    console.log('Done:', metrics);
  }
);
```

---

## Architecture Layers

### 1. TypeScript API Layer

```typescript
export interface LlmSessionConfig {
  modelDir: string;
  maxNewTokens?: number;
  systemPrompt?: string;
  keepHistory?: boolean;
  enableAudioOutput?: boolean;
  mergedConfig?: string;
  extraConfig?: string;
  chatHistory?: string[];
}

export interface LlmMetrics {
  promptLen: number;
  decodeLen: number;
  visionTime: number;
  audioTime: number;
  prefillTime: number;
  decodeTime: number;
  tokensPerSecond?: number;
}

export interface LlmMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

// Callback types
export type ChunkCallback = (chunk: string) => void;
export type MetricsCallback = (metrics: LlmMetrics) => void;
export type ErrorCallback = (error: string) => void;
export type AudioCallback = (audioData: number[], isEnd: boolean) => void;

export class MnnLlmSession {
  // Initialize session
  async init(config: LlmSessionConfig): Promise<void>
  
  // Submit prompt with streaming
  submitPrompt(
    prompt: string,
    keepHistory: boolean,
    onChunk: ChunkCallback,
    onComplete: MetricsCallback,
    onError?: ErrorCallback
  ): void
  
  // Submit with full conversation history
  submitWithHistory(
    messages: LlmMessage[],
    onChunk: ChunkCallback,
    onComplete: MetricsCallback,
    onError?: ErrorCallback
  ): void
  
  // Promise-based version (waits for completion)
  async submitPromptAsync(
    prompt: string,
    keepHistory: boolean,
    onChunk?: ChunkCallback
  ): Promise<LlmMetrics>
  
  // Configuration updates
  async updateMaxNewTokens(maxTokens: number): Promise<void>
  async updateSystemPrompt(systemPrompt: string): Promise<void>
  async updateAssistantPrompt(assistantPrompt: string): Promise<void>
  async updateConfig(configJson: string): Promise<void>
  
  // History management
  async clearHistory(): Promise<void>
  
  // Information
  async getSystemPrompt(): Promise<string>
  async getDebugInfo(): Promise<string>
  
  // Audio support
  async enableAudioOutput(enable: boolean): Promise<void>
  setAudioCallback(callback: AudioCallback): void
  
  // Lifecycle
  async reset(): Promise<void>
  async release(): Promise<void>
}
```

### 2. Native Module Layer (Kotlin)

```kotlin
@ReactModule(name = "MnnRn")
class MnnRnModule(reactContext: ReactApplicationContext) :
  NativeMnnRnSpec(reactContext) {
  
  // Streaming generation with callbacks
  @ReactMethod
  override fun submitPromptStreaming(
    sessionId: Double,
    prompt: String,
    keepHistory: Boolean,
    onChunk: Callback,
    onComplete: Callback
  ) {
    val nativePtr = sessionMap[sessionId.toLong()]
      ?: return onComplete.invoke("Error: Invalid session")
    
    // Create progress listener that calls onChunk
    val progressListener = object {
      fun onProgress(text: String): Boolean {
        // Invoke callback for each chunk
        onChunk.invoke(text)
        return false // Continue generation
      }
    }
    
    // Run on background thread
    Thread {
      try {
        val metrics = submitNative(nativePtr, prompt, keepHistory, progressListener)
        
        // Call completion callback with metrics
        val result = Arguments.createMap().apply {
          putInt("promptLen", metrics["promptLen"] as Int)
          putInt("decodeLen", metrics["decodeLen"] as Int)
          // ... other metrics
        }
        onComplete.invoke(result)
      } catch (e: Exception) {
        onComplete.invoke("Error: ${e.message}")
      }
    }.start()
  }
  
  // Promise-based version with optional callback
  @ReactMethod
  override fun submitPromptAsync(
    sessionId: Double,
    prompt: String,
    keepHistory: Boolean,
    onChunk: Callback?,
    promise: Promise
  ) {
    val nativePtr = sessionMap[sessionId.toLong()]
      ?: return promise.reject("INVALID_SESSION", "Invalid session ID")
    
    val progressListener = if (onChunk != null) {
      object {
        fun onProgress(text: String): Boolean {
          onChunk.invoke(text)
          return false
        }
      }
    } else null
    
    Thread {
      try {
        val metrics = submitNative(nativePtr, prompt, keepHistory, progressListener)
        promise.resolve(convertHashMapToWritableMap(metrics))
      } catch (e: Exception) {
        promise.reject("GENERATION_ERROR", e.message, e)
      }
    }.start()
  }
  
  // Similar for submitWithHistory
  @ReactMethod
  override fun submitWithHistoryStreaming(
    sessionId: Double,
    messages: ReadableArray,
    onChunk: Callback,
    onComplete: Callback
  ) {
    // Similar implementation
  }
}
```

### 3. JNI Layer (C++)

```cpp
JNIEXPORT jobject JNICALL Java_com_mnnrn_MnnRnModule_submitNative(
  JNIEnv *env,
  jobject thiz,
  jlong llmPtr,
  jstring inputStr,
  jboolean keepHistory,
  jobject progressListener
) {
  auto *llm = reinterpret_cast<mls::LlmSession *>(llmPtr);
  const char *input_str = env->GetStringUTFChars(inputStr, nullptr);
  
  // Get the onProgress method from the listener
  jclass listenerClass = env->GetObjectClass(progressListener);
  jmethodID onProgressMethod = env->GetMethodID(
    listenerClass, "onProgress", "(Ljava/lang/String;)Z"
  );
  
  // Create global reference for thread safety
  jobject globalListener = env->NewGlobalRef(progressListener);
  JavaVM *jvm;
  env->GetJavaVM(&jvm);
  
  // Create C++ lambda that calls Java callback
  auto *context = llm->Response(
    input_str,
    [jvm, globalListener, onProgressMethod](
      const std::string &chunk,
      bool is_eop
    ) -> bool {
      if (is_eop) {
        return false; // End of generation
      }
      
      // Attach to JVM if needed
      JNIEnv *env;
      bool needDetach = false;
      if (jvm->GetEnv((void**)&env, JNI_VERSION_1_6) != JNI_OK) {
        jvm->AttachCurrentThread(&env, nullptr);
        needDetach = true;
      }
      
      // Call the Java callback with the chunk
      jstring jChunk = env->NewStringUTF(chunk.c_str());
      jboolean stopRequested = env->CallBooleanMethod(
        globalListener,
        onProgressMethod,
        jChunk
      );
      env->DeleteLocalRef(jChunk);
      
      if (needDetach) {
        jvm->DetachCurrentThread();
      }
      
      return (bool)stopRequested;
    }
  );
  
  env->ReleaseStringUTFChars(inputStr, input_str);
  env->DeleteGlobalRef(globalListener);
  
  // Return metrics as HashMap
  // ... (build and return metrics)
}
```

---

## API Usage Examples

### Example 1: Basic Streaming

```typescript
import { createMnnLlmSession } from 'mnn-rn';

const session = createMnnLlmSession();

await session.init({
  modelDir: '/sdcard/models/llama',
  maxNewTokens: 2048,
});

// Streaming with callbacks
let fullResponse = '';
session.submitPrompt(
  'Write a haiku about React Native',
  true,
  (chunk) => {
    // Called for each chunk
    fullResponse += chunk;
    console.log('Chunk:', chunk);
  },
  (metrics) => {
    // Called when complete
    console.log('Done! Full response:', fullResponse);
    console.log('Metrics:', metrics);
  },
  (error) => {
    // Called on error
    console.error('Error:', error);
  }
);
```

### Example 2: Promise-Based (Async/Await)

```typescript
// Wait for completion, optionally stream chunks
const metrics = await session.submitPromptAsync(
  'What is 2+2?',
  true,
  (chunk) => {
    console.log('Streaming:', chunk);
  }
);

console.log('Completed with metrics:', metrics);
```

### Example 3: Conversation History

```typescript
const messages = [
  { role: 'user', content: 'Hello!' },
  { role: 'assistant', content: 'Hi! How can I help?' },
  { role: 'user', content: 'Tell me a joke' },
];

session.submitWithHistory(
  messages,
  (chunk) => console.log(chunk),
  (metrics) => console.log('Done:', metrics),
  (error) => console.error(error)
);
```

### Example 4: React Component

```typescript
function LlmChat() {
  const [session] = useState(() => createMnnLlmSession());
  const [response, setResponse] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  
  useEffect(() => {
    session.init({
      modelDir: '/sdcard/models/llama',
      maxNewTokens: 2048,
    });
    
    return () => session.release();
  }, []);
  
  const handleSubmit = (prompt: string) => {
    setIsGenerating(true);
    setResponse('');
    
    session.submitPrompt(
      prompt,
      true,
      (chunk) => {
        // Update UI with each chunk
        setResponse(prev => prev + chunk);
      },
      (metrics) => {
        // Generation complete
        setIsGenerating(false);
        console.log('Metrics:', metrics);
      },
      (error) => {
        // Handle error
        setIsGenerating(false);
        Alert.alert('Error', error);
      }
    );
  };
  
  return (
    <View>
      <TextInput onSubmitEditing={(e) => handleSubmit(e.nativeEvent.text)} />
      <Text>{response}</Text>
      {isGenerating && <ActivityIndicator />}
    </View>
  );
}
```

---

## Implementation Plan

### Phase 1: Build System (1-2 hours)

**Create CMakeLists.txt**

```cmake
cmake_minimum_required(VERSION 3.22.1)
project(mnn-rn)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Add prebuilt MNN library
add_library(MNN STATIC IMPORTED)
set_target_properties(MNN PROPERTIES
  IMPORTED_LOCATION ${CMAKE_CURRENT_SOURCE_DIR}/../../../prebuilt/libs/libMNN.so
)

# Include directories
include_directories(
  ${CMAKE_CURRENT_SOURCE_DIR}/include
  ${CMAKE_CURRENT_SOURCE_DIR}/include/MNN
  ${CMAKE_CURRENT_SOURCE_DIR}/include/llm
  ${CMAKE_CURRENT_SOURCE_DIR}/include/nlohmann
)

# Source files
add_library(
  mnn-rn
  SHARED
  mnn_llm_jni.cpp
  llm_session.cpp
  llm_stream_buffer.cpp
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
```

### Phase 2: Callback Implementation (2-3 hours)

**Update MnnRnModule.kt**
- Add streaming methods with callbacks
- Implement thread-safe callback invocation
- Handle errors properly

**Update mnn_llm_jni.cpp**
- Accept Java callback objects
- Create C++ lambdas that invoke callbacks
- Ensure thread safety with JVM attach/detach

**Update LlmProgressCallback.java**
```java
public interface LlmProgressCallback {
  boolean onProgress(String text);
}
```

### Phase 3: TypeScript API (1-2 hours)

**Update NativeMnnRn.ts**
```typescript
export interface Spec extends TurboModule {
  // Callback-based streaming
  submitPromptStreaming(
    sessionId: number,
    prompt: string,
    keepHistory: boolean,
    onChunk: (chunk: string) => void,
    onComplete: (metrics: Object) => void
  ): void;
  
  // Promise-based with optional callback
  submitPromptAsync(
    sessionId: number,
    prompt: string,
    keepHistory: boolean,
    onChunk?: (chunk: string) => void
  ): Promise<Object>;
  
  // Similar for submitWithHistory
  submitWithHistoryStreaming(
    sessionId: number,
    messages: Object[],
    onChunk: (chunk: string) => void,
    onComplete: (metrics: Object) => void
  ): void;
}
```

**Update index.tsx**
```typescript
export class MnnLlmSession {
  submitPrompt(
    prompt: string,
    keepHistory: boolean,
    onChunk: ChunkCallback,
    onComplete: MetricsCallback,
    onError?: ErrorCallback
  ): void {
    this.ensureInitialized();
    
    MnnRnNative.submitPromptStreaming(
      this.sessionId!,
      prompt,
      keepHistory,
      onChunk,
      (result: any) => {
        if (typeof result === 'string' && result.startsWith('Error:')) {
          onError?.(result);
        } else {
          onComplete(result as LlmMetrics);
        }
      }
    );
  }
  
  async submitPromptAsync(
    prompt: string,
    keepHistory: boolean,
    onChunk?: ChunkCallback
  ): Promise<LlmMetrics> {
    this.ensureInitialized();
    
    return MnnRnNative.submitPromptAsync(
      this.sessionId!,
      prompt,
      keepHistory,
      onChunk || null
    ) as Promise<LlmMetrics>;
  }
}
```

### Phase 4: Example App (2-3 hours)

**Enhanced App.tsx with streaming UI**
- Real-time text display
- Token counter
- Progress indicators
- Cancel button
- Chat history

### Phase 5: Documentation (1-2 hours)

Complete API docs, examples, and troubleshooting guide

---

## Advantages of Callback Approach

| Feature | Callback Approach | Event Emitter Approach |
|---------|------------------|------------------------|
| **Simplicity** | ✅ Simpler, built-in | ❌ Requires setup |
| **Type Safety** | ✅ Direct types | ⚠️ Event payloads |
| **Performance** | ✅ Direct invocation | ⚠️ Event routing overhead |
| **Error Handling** | ✅ Separate error callback | ⚠️ Error events |
| **Memory** | ✅ Auto-cleanup | ⚠️ Manual cleanup needed |
| **Multiple Sessions** | ✅ Callback per session | ⚠️ Filter by session ID |

---

## File Structure

```
mnn-rn/
├── android/
│   ├── build.gradle
│   ├── prebuilt/libs/libMNN.so          ✅
│   └── src/main/
│       ├── cpp/
│       │   ├── CMakeLists.txt           ⭐ NEW
│       │   ├── mnn_llm_jni.cpp         ✅ ENHANCED
│       │   └── llm_session.cpp         ✅
│       └── java/com/mnnrn/
│           ├── MnnRnModule.kt          ✅ ENHANCED
│           └── LlmProgressCallback.java ✅ ENHANCED
├── src/
│   ├── index.tsx                        ✅ ENHANCED
│   └── NativeMnnRn.ts                   ✅ ENHANCED
├── example/src/
│   └── App.tsx                          ✅ ENHANCED
├── ARCHITECTURE_V2.md                   ⭐ THIS FILE
└── package.json                         ✅
```

---

## Testing Strategy

### Unit Tests
```typescript
test('streaming callback invoked multiple times', async () => {
  const chunks: string[] = [];
  const session = createMnnLlmSession();
  
  await session.init({modelDir: '/test/model'});
  
  await new Promise((resolve) => {
    session.submitPrompt(
      'test',
      true,
      (chunk) => chunks.push(chunk),
      (metrics) => {
        expect(chunks.length).toBeGreaterThan(0);
        resolve(metrics);
      }
    );
  });
});
```

### Performance Benchmarks
- Callback latency: < 10ms
- Throughput: 20+ tokens/sec
- Memory: Stable over 1000 generations

---

## Success Criteria

- ✅ Callbacks invoked in correct order
- ✅ No callback after completion
- ✅ Thread-safe execution
- ✅ Error handling works
- ✅ No memory leaks
- ✅ Type-safe API

---

## Next Steps

1. Review this callback-based architecture
2. Confirm approach is correct
3. Switch to Code mode
4. Implement Phase 1 (CMakeLists.txt)
5. Test and iterate

This callback approach is cleaner, simpler, and more aligned with React Native best practices!