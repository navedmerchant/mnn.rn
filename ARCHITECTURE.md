# MNN React Native Library - Architecture & Implementation Plan

## Overview

This document outlines the complete architecture for the MNN (Mobile Neural Network) React Native library, which provides LLM inference capabilities for Android and iOS platforms.

## Current Status

### ✅ Completed Components
- Basic JNI bindings in `mnn_llm_jni.cpp`
- LLM session management in C++ (`llm_session.h/cpp`)
- Kotlin TurboModule wrapper (`MnnRnModule.kt`)
- TypeScript API interfaces (`NativeMnnRn.ts`, `index.tsx`)
- Basic example app structure

### ❌ Missing Components
1. **CMakeLists.txt** - Required for building and linking libMNN.so
2. **Event Emitter Implementation** - For streaming LLM responses
3. **Proper Callback Mechanism** - Native to JavaScript streaming bridge
4. **Enhanced Example App** - With streaming UI and real-time display
5. **iOS Implementation** - Currently only Android is partially complete

---

## Architecture Design

### Layer Architecture

```
┌─────────────────────────────────────────────────────────┐
│                  React Native App (JavaScript/TypeScript) │
│  ┌──────────────────────────────────────────────────┐  │
│  │  MnnLlmSession Class (High-level API)            │  │
│  │  - init(), submitPrompt(), submitWithHistory()   │  │
│  │  - Event listeners for streaming                 │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
                          ↕ (TurboModule + Events)
┌─────────────────────────────────────────────────────────┐
│              Native Bridge Layer (Kotlin/Swift)          │
│  ┌──────────────────────────────────────────────────┐  │
│  │  MnnRnModule (TurboModule)                       │  │
│  │  - Session management                            │  │
│  │  - Event emission for streaming                  │  │
│  │  - Thread management for async operations        │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
                          ↕ (JNI/Native Interop)
┌─────────────────────────────────────────────────────────┐
│                  JNI/Native Layer (C++)                  │
│  ┌──────────────────────────────────────────────────┐  │
│  │  mnn_llm_jni.cpp                                 │  │
│  │  - Java callback to C++ lambda bridge            │  │
│  │  - Thread-safe event emission                    │  │
│  └──────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────┐  │
│  │  LlmSession (C++)                                │  │
│  │  - MNN LLM wrapper                               │  │
│  │  - Streaming text generation                     │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
                          ↕ (Static Linking)
┌─────────────────────────────────────────────────────────┐
│              MNN Library (libMNN.so - Prebuilt)          │
│  - ARM64-v8a optimized LLM inference engine             │
│  - Model loading and execution                          │
└─────────────────────────────────────────────────────────┘
```

---

## API Design

### 1. TypeScript API (Enhanced)

#### Core Types

```typescript
// Session configuration
export interface LlmSessionConfig {
  modelDir: string;
  maxNewTokens?: number;
  systemPrompt?: string;
  assistantPrompt?: string;
  keepHistory?: boolean;
  enableAudioOutput?: boolean;
  mergedConfig?: string;
  extraConfig?: string;
  chatHistory?: string[];
}

// Message structure
export interface LlmMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

// Performance metrics
export interface LlmMetrics {
  promptLen: number;
  decodeLen: number;
  visionTime: number;
  audioTime: number;
  prefillTime: number;
  decodeTime: number;
  tokensPerSecond?: number;
}

// Streaming events
export interface StreamEvent {
  sessionId: number;
  text: string;
  isDone: boolean;
}

export interface ErrorEvent {
  sessionId: number;
  error: string;
  code: string;
}
```

#### MnnLlmSession Class API

```typescript
class MnnLlmSession {
  // Lifecycle
  async init(config: LlmSessionConfig): Promise<void>
  async release(): Promise<void>
  async reset(): Promise<void>
  
  // Text Generation with Streaming
  async submitPrompt(
    prompt: string,
    keepHistory?: boolean,
    onChunk?: (text: string) => void
  ): Promise<LlmMetrics>
  
  async submitWithHistory(
    messages: LlmMessage[],
    onChunk?: (text: string) => void
  ): Promise<LlmMetrics>
  
  // Event Listeners (Alternative to callbacks)
  on(event: 'chunk', listener: (text: string) => void): void
  on(event: 'complete', listener: (metrics: LlmMetrics) => void): void
  on(event: 'error', listener: (error: Error) => void): void
  off(event: string, listener: Function): void
  
  // Configuration
  async updateMaxNewTokens(maxTokens: number): Promise<void>
  async updateSystemPrompt(systemPrompt: string): Promise<void>
  async updateAssistantPrompt(assistantPrompt: string): Promise<void>
  async updateConfig(configJson: string): Promise<void>
  
  // History Management
  async clearHistory(): Promise<void>
  
  // Information
  async getSystemPrompt(): Promise<string>
  async getDebugInfo(): Promise<string>
  
  // Audio (if supported)
  async enableAudioOutput(enable: boolean): Promise<void>
  on(event: 'audio', listener: (audioData: Float32Array) => void): void
  
  // Benchmarking
  async runBenchmark(
    config: BenchmarkConfig,
    onProgress?: (progress: BenchmarkProgress) => void
  ): Promise<BenchmarkResult>
}
```

### 2. Event Emitter Implementation

#### Events

| Event Name | Payload | Description |
|------------|---------|-------------|
| `mnn:chunk` | `{sessionId: number, text: string}` | Streaming text chunk |
| `mnn:complete` | `{sessionId: number, metrics: LlmMetrics}` | Generation complete |
| `mnn:error` | `{sessionId: number, error: string}` | Error occurred |
| `mnn:audio` | `{sessionId: number, data: number[], isEnd: boolean}` | Audio data chunk |
| `mnn:benchmark:progress` | `{sessionId: number, progress: BenchmarkProgress}` | Benchmark progress |

#### Native Module Interface (Kotlin)

```kotlin
@ReactModule(name = "MnnRn")
class MnnRnModule(reactContext: ReactApplicationContext) :
  NativeMnnRnSpec(reactContext) {
  
  // Emit events to JavaScript
  private fun sendEvent(eventName: String, params: WritableMap?) {
    reactApplicationContext
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit(eventName, params)
  }
  
  // Native methods with streaming support
  override fun submitPromptStreaming(
    sessionId: Double,
    prompt: String,
    keepHistory: Boolean,
    promise: Promise
  )
  
  // Called from JNI to emit chunks
  @ReactMethod
  fun emitTextChunk(sessionId: Double, text: String)
}
```

---

## Implementation Plan

### Phase 1: Build System Setup

#### 1.1 Create CMakeLists.txt

**File:** `android/src/main/cpp/CMakeLists.txt`

**Purpose:**
- Configure CMake build
- Link prebuilt libMNN.so statically
- Build mnn-rn shared library
- Include all source files and headers

**Key Requirements:**
```cmake
# Minimum CMake version
cmake_minimum_required(VERSION 3.22.1)

# Project name
project(mnn-rn)

# C++ standard
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Find prebuilt MNN library
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

#### 1.2 Update build.gradle

**Changes needed:**
- Ensure CMake configuration is correct
- Verify ABI filters match prebuilt library (arm64-v8a)
- Add proper packaging options for native libraries

### Phase 2: Event Emitter Implementation

#### 2.1 Update Kotlin Module

**File:** `android/src/main/java/com/mnnrn/MnnRnModule.kt`

**Changes:**
1. Add `RCTDeviceEventEmitter` support
2. Create streaming-aware native methods
3. Implement thread-safe event emission
4. Handle callback from JNI layer

**Key additions:**
```kotlin
// Event emission method
private fun sendEvent(eventName: String, params: WritableMap?) {
  reactApplicationContext
    .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
    .emit(eventName, params)
}

// Streaming submit method
override fun submitPromptStreaming(
  sessionId: Double,
  prompt: String,
  keepHistory: Boolean,
  promise: Promise
) {
  val nativePtr = sessionMap[sessionId.toLong()]
    ?: return promise.reject("INVALID_SESSION", "Invalid session ID")
  
  // Create progress callback that emits events
  val callback = object : LlmProgressCallback {
    override fun onProgress(text: String): Boolean {
      val params = Arguments.createMap()
      params.putDouble("sessionId", sessionId)
      params.putString("text", text)
      sendEvent("mnn:chunk", params)
      return false // Continue generation
    }
  }
  
  // Run on background thread
  Thread {
    try {
      val metrics = submitNative(nativePtr, prompt, keepHistory, callback)
      promise.resolve(convertHashMapToWritableMap(metrics))
    } catch (e: Exception) {
      promise.reject("GENERATION_ERROR", e.message, e)
    }
  }.start()
}
```

#### 2.2 Update JNI Layer

**File:** `android/src/main/cpp/mnn_llm_jni.cpp`

**Changes:**
1. Accept Java callback object
2. Convert callback to C++ lambda
3. Ensure thread-safe callback execution
4. Handle UTF-8 streaming properly

**Key implementation:**
```cpp
JNIEXPORT jobject JNICALL Java_com_mnnrn_MnnRnModule_submitNative(
  JNIEnv *env,
  jobject thiz,
  jlong llmPtr,
  jstring inputStr,
  jboolean keepHistory,
  jobject progressCallback  // New parameter
) {
  auto *llm = reinterpret_cast<mls::LlmSession *>(llmPtr);
  const char *input_str = env->GetStringUTFChars(inputStr, nullptr);
  
  // Get callback method
  jclass callbackClass = env->GetObjectClass(progressCallback);
  jmethodID onProgressMethod = env->GetMethodID(
    callbackClass, "onProgress", "(Ljava/lang/String;)Z"
  );
  
  // Create global ref for callback (thread safety)
  jobject globalCallback = env->NewGlobalRef(progressCallback);
  JavaVM *jvm;
  env->GetJavaVM(&jvm);
  
  // Create C++ callback lambda
  auto *context = llm->Response(input_str, 
    [jvm, globalCallback, onProgressMethod](
      const std::string &response, bool is_eop
    ) {
      // Attach to JVM thread if needed
      JNIEnv *env;
      bool needDetach = false;
      if (jvm->GetEnv((void**)&env, JNI_VERSION_1_6) != JNI_OK) {
        jvm->AttachCurrentThread(&env, nullptr);
        needDetach = true;
      }
      
      // Call Java callback
      jstring javaString = env->NewStringUTF(response.c_str());
      jboolean stopRequested = env->CallBooleanMethod(
        globalCallback, onProgressMethod, javaString
      );
      env->DeleteLocalRef(javaString);
      
      if (needDetach) {
        jvm->DetachCurrentThread();
      }
      
      return (bool)stopRequested;
    }
  );
  
  env->ReleaseStringUTFChars(inputStr, input_str);
  env->DeleteGlobalRef(globalCallback);
  
  // Return metrics as HashMap
  // ... (existing metrics code)
}
```

### Phase 3: TypeScript API Enhancement

#### 3.1 Update NativeMnnRn.ts

**File:** `src/NativeMnnRn.ts`

**Changes:**
- Add streaming method signatures
- Update interfaces

#### 3.2 Update index.tsx

**File:** `src/index.tsx`

**Changes:**
1. Implement EventEmitter pattern
2. Add event subscription methods
3. Wrap native streaming calls

**Implementation:**
```typescript
import { NativeEventEmitter, NativeModules } from 'react-native';

const { MnnRn } = NativeModules;
const eventEmitter = new NativeEventEmitter(MnnRn);

export class MnnLlmSession {
  private sessionId: number | null = null;
  private listeners: Map<string, Function[]> = new Map();
  
  async submitPrompt(
    prompt: string,
    keepHistory: boolean = true,
    onChunk?: (text: string) => void
  ): Promise<LlmMetrics> {
    this.ensureInitialized();
    
    // Subscribe to chunk events if callback provided
    const subscription = onChunk ? eventEmitter.addListener(
      'mnn:chunk',
      (event) => {
        if (event.sessionId === this.sessionId) {
          onChunk(event.text);
        }
      }
    ) : null;
    
    try {
      const metrics = await MnnRnNative.submitPromptStreaming(
        this.sessionId!,
        prompt,
        keepHistory
      );
      return metrics as LlmMetrics;
    } finally {
      subscription?.remove();
    }
  }
  
  // Event listener methods
  on(event: 'chunk' | 'complete' | 'error', listener: Function): void {
    const eventName = `mnn:${event}`;
    const subscription = eventEmitter.addListener(eventName, (data) => {
      if (data.sessionId === this.sessionId) {
        listener(data);
      }
    });
    
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(subscription);
  }
  
  off(event: string, listener?: Function): void {
    const subs = this.listeners.get(event);
    if (subs) {
      subs.forEach(sub => sub.remove());
      this.listeners.delete(event);
    }
  }
}
```

### Phase 4: Example App Enhancement

#### 4.1 Streaming Response UI

**File:** `example/src/App.tsx`

**Features:**
1. Real-time text streaming display
2. Token/second counter
3. Progress indicator
4. Cancel generation button
5. Chat history view

**Implementation highlights:**
```typescript
const [streamingText, setStreamingText] = useState('');
const [isGenerating, setIsGenerating] = useState(false);
const [tokensPerSecond, setTokensPerSecond] = useState(0);

const submitWithStreaming = async () => {
  setIsGenerating(true);
  setStreamingText('');
  
  const startTime = Date.now();
  let tokenCount = 0;
  
  try {
    const metrics = await session.submitPrompt(
      prompt,
      true,
      (chunk: string) => {
        setStreamingText(prev => prev + chunk);
        tokenCount++;
        const elapsed = (Date.now() - startTime) / 1000;
        setTokensPerSecond(tokenCount / elapsed);
      }
    );
    
    console.log('Final metrics:', metrics);
  } catch (error) {
    Alert.alert('Error', error.message);
  } finally {
    setIsGenerating(false);
  }
};
```

#### 4.2 Benchmark Visualization

**Features:**
1. Real-time benchmark progress
2. Performance graphs
3. Token throughput visualization
4. Comparison charts

### Phase 5: Documentation

#### 5.1 API Documentation

**File:** `API.md`

**Sections:**
- Installation
- Quick Start
- API Reference
- Event Reference
- Examples
- Troubleshooting

#### 5.2 Build Documentation

**File:** `BUILD.md`

**Sections:**
- Prerequisites
- Build steps
- CMake configuration
- Linking prebuilt libraries
- Common issues

---

## File Structure After Implementation

```
mnn-rn/
├── android/
│   ├── build.gradle                    ✅ Updated
│   ├── prebuilt/
│   │   └── libs/
│   │       └── libMNN.so              ✅ Existing
│   └── src/main/
│       ├── cpp/
│       │   ├── CMakeLists.txt         ⭐ NEW
│       │   ├── mnn_llm_jni.cpp        ✅ Enhanced
│       │   ├── llm_session.cpp        ✅ Existing
│       │   └── include/               ✅ Existing
│       └── java/com/mnnrn/
│           ├── MnnRnModule.kt         ✅ Enhanced
│           ├── MnnRnPackage.kt        ✅ Existing
│           └── LlmProgressCallback.java ✅ Enhanced
├── ios/
│   ├── MnnRn.h                        ⚠️  To be implemented
│   └── MnnRn.mm                       ⚠️  To be implemented
├── src/
│   ├── index.tsx                      ✅ Enhanced
│   └── NativeMnnRn.ts                 ✅ Enhanced
├── example/
│   └── src/
│       └── App.tsx                    ✅ Enhanced
├── docs/
│   ├── API.md                         ⭐ NEW
│   ├── BUILD.md                       ⭐ NEW
│   └── EXAMPLES.md                    ⭐ NEW
├── ARCHITECTURE.md                    ⭐ THIS FILE
└── package.json                       ✅ Existing
```

---

## Implementation Sequence

### Step 1: Build System (1-2 hours)
1. Create CMakeLists.txt
2. Test native library compilation
3. Verify libMNN.so linking
4. Ensure library loads correctly

### Step 2: Event Emitter (2-3 hours)
1. Update MnnRnModule.kt with event emission
2. Modify JNI layer for callback support
3. Test event flow from native to JS
4. Verify thread safety

### Step 3: TypeScript API (1-2 hours)
1. Enhance NativeMnnRn.ts interfaces
2. Implement event subscription in MnnLlmSession
3. Add type safety and error handling
4. Write unit tests

### Step 4: Example App (2-3 hours)
1. Create streaming UI components
2. Add real-time text display
3. Implement benchmark visualization
4. Add error handling and loading states

### Step 5: Documentation (1-2 hours)
1. Write API documentation
2. Create build guide
3. Add usage examples
4. Document troubleshooting

**Total Estimated Time: 7-12 hours**

---

## Testing Strategy

### Unit Tests
- [ ] Session lifecycle (init, release, reset)
- [ ] Event emission and reception
- [ ] Error handling
- [ ] Thread safety

### Integration Tests
- [ ] End-to-end text generation
- [ ] Streaming callbacks
- [ ] Multiple concurrent sessions
- [ ] Memory leak detection

### Performance Tests
- [ ] Token throughput measurement
- [ ] Memory usage monitoring
- [ ] Latency benchmarks
- [ ] Stress testing

---

## Potential Issues & Solutions

### Issue 1: Event Ordering
**Problem:** Events may arrive out of order in JS
**Solution:** Add sequence numbers to events

### Issue 2: Memory Leaks
**Problem:** Global refs not cleaned up properly
**Solution:** Implement proper cleanup in session release

### Issue 3: Thread Safety
**Problem:** Multiple threads accessing JNI env
**Solution:** Use AttachCurrentThread/DetachCurrentThread pattern

### Issue 4: Large Text Buffers
**Problem:** Streaming very long responses may cause memory issues
**Solution:** Implement chunked emission with buffer limits

---

## Success Criteria

- ✅ CMakeLists.txt successfully builds mnn-rn library
- ✅ libMNN.so statically linked without errors
- ✅ Streaming text generation works in real-time
- ✅ Events flow correctly from native to JavaScript
- ✅ Example app displays streaming responses
- ✅ No memory leaks during prolonged usage
- ✅ Thread-safe operation verified
- ✅ Documentation complete and accurate

---

## Next Steps

1. Review this architecture with the team
2. Get approval on Event Emitter approach
3. Begin implementation with Phase 1 (Build System)
4. Iterate through phases sequentially
5. Test thoroughly at each phase
6. Document as we go

---

## Notes

- This architecture assumes React Native New Architecture (TurboModules)
- iOS implementation will follow similar pattern but with Swift/Objective-C
- Consider adding TypeScript strict mode for better type safety
- May need to optimize event emission frequency for very fast generation
- Audio support can be added as optional feature using same event pattern