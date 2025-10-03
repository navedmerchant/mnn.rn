# MNN React Native - Final Implementation Plan (Callback-Based)

## 🎯 Revised Approach: React Native Callbacks

Based on your feedback, we're using **React Native's native Callback mechanism** instead of Event Emitters. This is simpler, more performant, and better aligned with React Native patterns.

## 📋 Complete Task Breakdown

### Task 1: Design API ✅ COMPLETE
- [x] Analyzed existing codebase
- [x] Designed callback-based streaming API
- [x] Created TypeScript interfaces
- [x] Documented architecture

### Task 2: Build System Setup ⏱️ 1-2 hours
**Goal:** Enable native library compilation and static linking

**Files to Create:**
- `android/src/main/cpp/CMakeLists.txt`

**CMakeLists.txt Content:**
```cmake
cmake_minimum_required(VERSION 3.22.1)
project(mnn-rn)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -O2 -frtti -fexceptions -Wall")

# Prebuilt MNN library
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

# Build shared library
add_library(mnn-rn SHARED
  mnn_llm_jni.cpp
  llm_session.cpp
  llm_stream_buffer.cpp
  utf8_stream_processor.cpp
  mls_log.cpp
)

# Link libraries
target_link_libraries(mnn-rn
  MNN
  android
  log
)
```

**Validation:**
```bash
cd android
./gradlew assembleDebug
# Should build successfully and create libmnn-rn.so
```

### Task 3: Implement Callback Mechanism ⏱️ 2-3 hours

#### 3.1 Update MnnRnModule.kt

**Add streaming methods:**
```kotlin
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
  
  Thread {
    try {
      // Create callback wrapper
      val progressCallback = object : LlmProgressCallback {
        override fun onProgress(text: String): Boolean {
          onChunk.invoke(text)
          return false // Continue
        }
      }
      
      // Call native method
      val metrics = submitNative(nativePtr, prompt, keepHistory, progressCallback)
      
      // Call completion callback
      onComplete.invoke(convertHashMapToWritableMap(metrics))
    } catch (e: Exception) {
      onComplete.invoke("Error: ${e.message}")
    }
  }.start()
}

@ReactMethod
override fun submitPromptAsync(
  sessionId: Double,
  prompt: String,
  keepHistory: Boolean,
  onChunk: Callback?,
  promise: Promise
) {
  val nativePtr = sessionMap[sessionId.toLong()]
    ?: return promise.reject("INVALID_SESSION", "Invalid session")
  
  Thread {
    try {
      val progressCallback = if (onChunk != null) {
        object : LlmProgressCallback {
          override fun onProgress(text: String): Boolean {
            onChunk.invoke(text)
            return false
          }
        }
      } else null
      
      val metrics = submitNative(nativePtr, prompt, keepHistory, progressCallback)
      promise.resolve(convertHashMapToWritableMap(metrics))
    } catch (e: Exception) {
      promise.reject("ERROR", e.message, e)
    }
  }.start()
}
```

#### 3.2 Update LlmProgressCallback.java

```java
package com.mnnrn;

public interface LlmProgressCallback {
    /**
     * Called when new text is generated
     * @param text The generated text chunk
     * @return true to stop generation, false to continue
     */
    boolean onProgress(String text);
}
```

#### 3.3 Update mnn_llm_jni.cpp

**Enhance submitNative to support callbacks:**
```cpp
JNIEXPORT jobject JNICALL Java_com_mnnrn_MnnRnModule_submitNative(
  JNIEnv *env,
  jobject thiz,
  jlong llmPtr,
  jstring inputStr,
  jboolean keepHistory,
  jobject progressCallback
) {
  auto *llm = reinterpret_cast<mls::LlmSession *>(llmPtr);
  const char *input_str = env->GetStringUTFChars(inputStr, nullptr);
  
  // Get callback method if provided
  jmethodID onProgressMethod = nullptr;
  jobject globalCallback = nullptr;
  JavaVM *jvm = nullptr;
  
  if (progressCallback != nullptr) {
    jclass callbackClass = env->GetObjectClass(progressCallback);
    onProgressMethod = env->GetMethodID(callbackClass, "onProgress", "(Ljava/lang/String;)Z");
    globalCallback = env->NewGlobalRef(progressCallback);
    env->GetJavaVM(&jvm);
  }
  
  // Create C++ callback lambda
  auto callback = [jvm, globalCallback, onProgressMethod](
    const std::string &chunk, bool is_eop
  ) -> bool {
    if (!globalCallback || is_eop) return false;
    
    // Attach to JVM thread
    JNIEnv *env;
    bool needDetach = false;
    if (jvm->GetEnv((void**)&env, JNI_VERSION_1_6) != JNI_OK) {
      jvm->AttachCurrentThread(&env, nullptr);
      needDetach = true;
    }
    
    // Call Java callback
    jstring jChunk = env->NewStringUTF(chunk.c_str());
    jboolean stopRequested = env->CallBooleanMethod(
      globalCallback, onProgressMethod, jChunk
    );
    env->DeleteLocalRef(jChunk);
    
    if (needDetach) {
      jvm->DetachCurrentThread();
    }
    
    return (bool)stopRequested;
  };
  
  // Call LLM with callback
  auto *context = llm->Response(input_str, callback);
  
  env->ReleaseStringUTFChars(inputStr, input_str);
  if (globalCallback) {
    env->DeleteGlobalRef(globalCallback);
  }
  
  // Build and return metrics
  jclass hashMapClass = env->FindClass("java/util/HashMap");
  jmethodID hashMapInit = env->GetMethodID(hashMapClass, "<init>", "()V");
  jmethodID putMethod = env->GetMethodID(hashMapClass, "put",
    "(Ljava/lang/Object;Ljava/lang/Object;)Ljava/lang/Object;");
  jobject hashMap = env->NewObject(hashMapClass, hashMapInit);
  
  jclass longClass = env->FindClass("java/lang/Long");
  jmethodID longInit = env->GetMethodID(longClass, "<init>", "(J)V");
  
  if (context) {
    env->CallObjectMethod(hashMap, putMethod, env->NewStringUTF("promptLen"),
      env->NewObject(longClass, longInit, context->prompt_len));
    env->CallObjectMethod(hashMap, putMethod, env->NewStringUTF("decodeLen"),
      env->NewObject(longClass, longInit, context->gen_seq_len));
    env->CallObjectMethod(hashMap, putMethod, env->NewStringUTF("prefillTime"),
      env->NewObject(longClass, longInit, context->prefill_us));
    env->CallObjectMethod(hashMap, putMethod, env->NewStringUTF("decodeTime"),
      env->NewObject(longClass, longInit, context->decode_us));
  }
  
  return hashMap;
}
```

### Task 4: Update TypeScript API ⏱️ 1-2 hours

#### 4.1 Update NativeMnnRn.ts

```typescript
export interface Spec extends TurboModule {
  // Session management
  initSession(config: Object): Promise<number>;
  releaseSession(sessionId: number): Promise<void>;
  resetSession(sessionId: number): Promise<void>;
  
  // Streaming generation (callback-based)
  submitPromptStreaming(
    sessionId: number,
    prompt: string,
    keepHistory: boolean,
    onChunk: (chunk: string) => void,
    onComplete: (result: Object | string) => void
  ): void;
  
  // Promise-based with optional streaming
  submitPromptAsync(
    sessionId: number,
    prompt: string,
    keepHistory: boolean,
    onChunk: ((chunk: string) => void) | null
  ): Promise<Object>;
  
  // With history
  submitWithHistoryStreaming(
    sessionId: number,
    messages: Object[],
    onChunk: (chunk: string) => void,
    onComplete: (result: Object | string) => void
  ): void;
  
  submitWithHistoryAsync(
    sessionId: number,
    messages: Object[],
    onChunk: ((chunk: string) => void) | null
  ): Promise<Object>;
  
  // Configuration
  updateMaxNewTokens(sessionId: number, maxTokens: number): Promise<void>;
  updateSystemPrompt(sessionId: number, systemPrompt: string): Promise<void>;
  updateAssistantPrompt(sessionId: number, assistantPrompt: string): Promise<void>;
  updateConfig(sessionId: number, configJson: string): Promise<void>;
  updateEnableAudioOutput(sessionId: number, enable: boolean): Promise<void>;
  
  // Getters
  getSystemPrompt(sessionId: number): Promise<string>;
  getDebugInfo(sessionId: number): Promise<string>;
  
  // History
  clearHistory(sessionId: number): Promise<void>;
  
  // Utility
  multiply(a: number, b: number): number;
}
```

#### 4.2 Update index.tsx

```typescript
export type ChunkCallback = (chunk: string) => void;
export type MetricsCallback = (metrics: LlmMetrics) => void;
export type ErrorCallback = (error: string) => void;

export class MnnLlmSession {
  private sessionId: number | null = null;
  private isInitialized = false;

  async init(config: LlmSessionConfig): Promise<void> {
    if (this.isInitialized) {
      throw new Error('Session already initialized');
    }
    this.sessionId = await MnnRnNative.initSession(config as any);
    this.isInitialized = true;
  }

  // Callback-based streaming
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

  // Promise-based with optional streaming
  async submitPromptAsync(
    prompt: string,
    keepHistory: boolean = true,
    onChunk?: ChunkCallback
  ): Promise<LlmMetrics> {
    this.ensureInitialized();
    
    const result = await MnnRnNative.submitPromptAsync(
      this.sessionId!,
      prompt,
      keepHistory,
      onChunk || null
    );
    
    return result as LlmMetrics;
  }

  // With history
  submitWithHistory(
    messages: LlmMessage[],
    onChunk: ChunkCallback,
    onComplete: MetricsCallback,
    onError?: ErrorCallback
  ): void {
    this.ensureInitialized();
    
    MnnRnNative.submitWithHistoryStreaming(
      this.sessionId!,
      messages as any[],
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

  async submitWithHistoryAsync(
    messages: LlmMessage[],
    onChunk?: ChunkCallback
  ): Promise<LlmMetrics> {
    this.ensureInitialized();
    
    const result = await MnnRnNative.submitWithHistoryAsync(
      this.sessionId!,
      messages as any[],
      onChunk || null
    );
    
    return result as LlmMetrics;
  }

  // ... other methods remain the same ...
}
```

### Task 5: Enhanced Example App ⏱️ 2-3 hours

```typescript
export default function App() {
  const [session] = useState(() => createMnnLlmSession());
  const [streamingText, setStreamingText] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [metrics, setMetrics] = useState<LlmMetrics | null>(null);
  const [prompt, setPrompt] = useState('');

  useEffect(() => {
    session.init({
      modelDir: '/sdcard/models/llama',
      maxNewTokens: 2048,
    });
    return () => session.release();
  }, []);

  const handleGenerate = () => {
    setIsGenerating(true);
    setStreamingText('');
    setMetrics(null);

    session.submitPrompt(
      prompt,
      true,
      (chunk) => {
        // Stream each chunk
        setStreamingText(prev => prev + chunk);
      },
      (finalMetrics) => {
        // Generation complete
        setMetrics(finalMetrics);
        setIsGenerating(false);
      },
      (error) => {
        // Handle error
        Alert.alert('Error', error);
        setIsGenerating(false);
      }
    );
  };

  return (
    <View style={styles.container}>
      <TextInput
        value={prompt}
        onChangeText={setPrompt}
        placeholder="Enter your prompt"
        editable={!isGenerating}
      />
      
      <Button
        title={isGenerating ? 'Generating...' : 'Generate'}
        onPress={handleGenerate}
        disabled={isGenerating}
      />
      
      <ScrollView style={styles.output}>
        <Text>{streamingText}</Text>
      </ScrollView>
      
      {metrics && (
        <View style={styles.metrics}>
          <Text>Tokens: {metrics.decodeLen}</Text>
          <Text>Time: {metrics.decodeTime / 1000000}s</Text>
          <Text>Speed: {(metrics.decodeLen / (metrics.decodeTime / 1000000)).toFixed(2)} tok/s</Text>
        </View>
      )}
    </View>
  );
}
```

## 📊 Implementation Checklist

### Phase 1: Build System
- [ ] Create `android/src/main/cpp/CMakeLists.txt`
- [ ] Configure static linking to libMNN.so
- [ ] Set up include directories
- [ ] Test compilation: `./gradlew assembleDebug`
- [ ] Verify libmnn-rn.so is created in build output

### Phase 2: Callback Implementation
- [ ] Update `LlmProgressCallback.java` interface
- [ ] Add streaming methods to `MnnRnModule.kt`
- [ ] Implement thread-safe callback invocation
- [ ] Update `mnn_llm_jni.cpp` with callback support
- [ ] Add JVM attach/detach for thread safety
- [ ] Test callback flow with simple example

### Phase 3: TypeScript API
- [ ] Update `NativeMnnRn.ts` with callback signatures
- [ ] Implement callback methods in `index.tsx`
- [ ] Add promise-based async methods
- [ ] Add proper error handling
- [ ] Add TypeScript types for all callbacks
- [ ] Write unit tests

### Phase 4: Example App
- [ ] Create streaming text display component
- [ ] Add real-time metrics display
- [ ] Implement cancel generation button
- [ ] Add chat history view
- [ ] Polish UI with loading states
- [ ] Test on real device with actual model

### Phase 5: Documentation
- [ ] Write API documentation
- [ ] Create usage examples
- [ ] Document build process
- [ ] Add troubleshooting guide
- [ ] Create README with quick start

## 🎯 Success Metrics

| Metric | Target | How to Measure |
|--------|--------|----------------|
| Build Success | 100% | Gradle build completes |
| Callback Latency | < 10ms | Time between native and JS |
| Token Throughput | 20+ tok/s | On Snapdragon 888+ |
| Memory Stability | No leaks | 1000 generations |
| API Type Safety | 100% | TypeScript compilation |

## 🚀 Ready to Implement

The architecture is complete with the callback-based approach. This is simpler, more efficient, and better aligned with React Native patterns than Event Emitters.

**Next step:** Switch to Code mode and begin Phase 1 implementation!