# MNN React Native - API Documentation

Complete API reference for the MNN React Native library with streaming LLM inference support.

## Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [API Reference](#api-reference)
  - [MnnLlmSession](#mnnllmsession)
  - [Types](#types)
  - [Callbacks](#callbacks)
- [Usage Examples](#usage-examples)
- [Error Handling](#error-handling)
- [Performance Tips](#performance-tips)

---

## Installation

```bash
npm install mnn-rn
# or
yarn add mnn-rn
```

### Android Setup

The native library will be automatically linked. Ensure you have:
- React Native 0.71+
- Android NDK r21+
- Gradle 8.0+

### Model Files

Place your MNN model files on the device:
```
/sdcard/models/your-model/
├── model.mnn
├── tokenizer.txt
└── config.json
```

---

## Quick Start

```typescript
import { createMnnLlmSession } from 'mnn-rn';

// Create and initialize session
const session = createMnnLlmSession();

await session.init({
  modelDir: '/sdcard/models/llama-3-8b',
  maxNewTokens: 2048,
  systemPrompt: 'You are a helpful assistant.',
  keepHistory: true
});

// Generate with streaming - now returns Promise!
const metrics = await session.submitPrompt(
  'Write a haiku about coding',
  true,
  (chunk) => console.log(chunk),              // Each token
  (metricsData) => console.log('Done!'),      // Completion callback
  (error) => console.error(error)             // Errors
);

// Access final metrics from Promise
console.log('Generated', metrics.decodeLen, 'tokens');
console.log('Speed:', (metrics.decodeLen / (metrics.decodeTime / 1_000_000)).toFixed(1), 'tok/s');

// Clean up
await session.release();
```

---

## API Reference

### MnnLlmSession

Main class for LLM inference operations.

#### Constructor

```typescript
const session = createMnnLlmSession();
```

#### Methods

##### `init(config: LlmSessionConfig): Promise<void>`

Initialize the LLM session with a model.

**Parameters:**
- `config.modelDir` (string, required): Path to model directory
- `config.maxNewTokens` (number, optional): Maximum tokens to generate (default: 2048)
- `config.systemPrompt` (string, optional): System prompt for chat models
- `config.keepHistory` (boolean, optional): Enable conversation history (default: true)
- `config.enableAudioOutput` (boolean, optional): Enable TTS output (default: false)
- `config.mergedConfig` (string, optional): JSON config for MNN
- `config.extraConfig` (string, optional): Additional JSON config
- `config.chatHistory` (string[], optional): Initial chat history

**Returns:** Promise that resolves when initialized

**Throws:** Error if initialization fails

**Example:**
```typescript
await session.init({
  modelDir: '/sdcard/models/llama-3-8b',
  maxNewTokens: 1024,
  systemPrompt: 'You are a coding assistant.',
  keepHistory: true
});
```

---

##### `submitPrompt(prompt, keepHistory, onChunk?, onComplete?, onError?): Promise<LlmMetrics>`

Submit a prompt with streaming callbacks AND await final metrics.

This method provides both real-time streaming via callbacks AND returns a Promise that resolves with the final metrics when generation completes.

**Parameters:**
- `prompt` (string): Input text
- `keepHistory` (boolean): Add to conversation history
- `onChunk` (function, optional): Called for each generated chunk
  - Signature: `(chunk: string) => void`
- `onComplete` (function, optional): Called when generation completes
  - Signature: `(metrics: LlmMetrics) => void`
- `onError` (function, optional): Called on error
  - Signature: `(error: string) => void`

**Returns:** Promise<LlmMetrics> - Final generation metrics

**Example:**
```typescript
// Use both callbacks and await the result
const metrics = await session.submitPrompt(
  'Explain React hooks',
  true,
  (chunk) => {
    // Update UI with each chunk in real-time
    setResponse(prev => prev + chunk);
  },
  (metrics) => {
    console.log('Generation complete!');
  },
  (error) => {
    Alert.alert('Error', error);
  }
);

// Access final metrics from Promise
console.log('Generated', metrics.decodeLen, 'tokens');
console.log('Speed:', metrics.decodeLen / (metrics.decodeTime / 1000000), 'tok/s');
```

---

##### `submitPromptAsync(prompt, keepHistory?, onChunk?): Promise<LlmMetrics>`

Submit a prompt and wait for completion (Promise-based).

**Parameters:**
- `prompt` (string): Input text
- `keepHistory` (boolean, optional): Add to history (default: true)
- `onChunk` (function, optional): Streaming callback
  - Signature: `(chunk: string) => void`

**Returns:** Promise<LlmMetrics> - Final generation metrics

**Example:**
```typescript
let response = '';
const metrics = await session.submitPromptAsync(
  'What is TypeScript?',
  true,
  (chunk) => {
    response += chunk;
    console.log('Chunk:', chunk);
  }
);

console.log('Full response:', response);
console.log('Metrics:', metrics);
```

---

##### `submitWithHistory(messages, onChunk, onComplete, onError?): void`

Submit with full conversation history using callbacks.

**Parameters:**
- `messages` (LlmMessage[]): Conversation history
- `onChunk` (function): Chunk callback
- `onComplete` (function): Completion callback
- `onError` (function, optional): Error callback

**Example:**
```typescript
const conversation = [
  { role: 'user', content: 'Hello!' },
  { role: 'assistant', content: 'Hi! How can I help?' },
  { role: 'user', content: 'Tell me about React Native' }
];

session.submitWithHistory(
  conversation,
  (chunk) => console.log(chunk),
  (metrics) => console.log('Done'),
  (error) => console.error(error)
);
```

---

##### `submitWithHistoryAsync(messages, onChunk?): Promise<LlmMetrics>`

Submit with history (Promise-based).

**Parameters:**
- `messages` (LlmMessage[]): Conversation history
- `onChunk` (function, optional): Streaming callback

**Returns:** Promise<LlmMetrics>

---

##### `updateMaxNewTokens(maxTokens: number): Promise<void>`

Update maximum tokens to generate.

**Parameters:**
- `maxTokens` (number): New maximum (1-4096)

**Example:**
```typescript
await session.updateMaxNewTokens(512);
```

---

##### `updateSystemPrompt(systemPrompt: string): Promise<void>`

Update the system prompt.

**Parameters:**
- `systemPrompt` (string): New system prompt

**Example:**
```typescript
await session.updateSystemPrompt('You are a helpful coding assistant.');
```

---

##### `updateAssistantPrompt(assistantPrompt: string): Promise<void>`

Update assistant prompt template.

---

##### `updateConfig(configJson: string): Promise<void>`

Update MNN configuration.

**Parameters:**
- `configJson` (string): JSON configuration string

---

##### `updateEnableAudioOutput(enable: boolean): Promise<void>`

Enable or disable audio output.

---

##### `getSystemPrompt(): Promise<string>`

Get current system prompt.

**Returns:** Promise<string>

---

##### `getDebugInfo(): Promise<string>`

Get debug information about the session.

**Returns:** Promise<string> - Debug info

---

##### `clearHistory(): Promise<void>`

Clear conversation history.

**Example:**
```typescript
await session.clearHistory();
console.log('History cleared');
```

---

##### `reset(): Promise<void>`

Reset the session state.

---

##### `stop(): Promise<void>`

Stop the current generation immediately.

**Example:**
```typescript
// Stop generation mid-stream
const handleStop = async () => {
  await session.stop();
  setIsGenerating(false);
};
```

---

##### `release(): Promise<void>`

Release the session and free native resources.

**Important:** Always call this when done!

**Example:**
```typescript
useEffect(() => {
  return () => {
    session.release().catch(console.error);
  };
}, []);
```

---

### Types

#### LlmSessionConfig

```typescript
interface LlmSessionConfig {
  modelDir: string;              // Required
  maxNewTokens?: number;         // Default: 2048
  systemPrompt?: string;         // Default: "You are a helpful assistant."
  assistantPrompt?: string;
  keepHistory?: boolean;         // Default: true
  enableAudioOutput?: boolean;   // Default: false
  mergedConfig?: string;         // JSON string
  extraConfig?: string;          // JSON string
  chatHistory?: string[];        // Initial history
}
```

#### LlmMessage

```typescript
interface LlmMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}
```

#### LlmMetrics

```typescript
interface LlmMetrics {
  promptLen: number;        // Input tokens
  decodeLen: number;        // Generated tokens
  prefillTime: number;      // Prefill time (μs)
  decodeTime: number;       // Decode time (μs)
}
```

**Calculate tokens/second:**
```typescript
const tokensPerSecond = metrics.decodeLen / (metrics.decodeTime / 1_000_000);
```

**Example from App.tsx:**
```typescript
// Real-time calculation during streaming
const elapsed = (Date.now() - startTimeMs) / 1000;
if (elapsed > 0) {
  setTokensPerSecond(chunkCount / elapsed);
}

// Final calculation from metrics
const totalTime = metrics.decodeTime / 1_000_000; // Convert μs to seconds
const finalSpeed = metrics.decodeLen / totalTime;
```

---

### Callbacks

#### ChunkCallback

```typescript
type ChunkCallback = (chunk: string) => void;
```

Called for each generated text chunk during streaming.

**Example:**
```typescript
const onChunk: ChunkCallback = (chunk) => {
  console.log('New chunk:', chunk);
  setResponse(prev => prev + chunk);
};
```

---

#### MetricsCallback

```typescript
type MetricsCallback = (metrics: LlmMetrics) => void;
```

Called when generation completes with performance metrics.

---

#### ErrorCallback

```typescript
type ErrorCallback = (error: string) => void;
```

Called when an error occurs.

---

## Usage Examples

### Basic Streaming with Await

```typescript
import { createMnnLlmSession } from 'mnn-rn';

const session = createMnnLlmSession();

// Initialize
await session.init({
  modelDir: '/sdcard/models/llama',
  maxNewTokens: 1024
});

// Generate with streaming - returns Promise
let fullResponse = '';
const metrics = await session.submitPrompt(
  'Explain quantum computing in simple terms',
  true,
  (chunk) => {
    fullResponse += chunk;
    console.log(chunk);
  },
  (metrics) => {
    console.log('Generation complete!');
  }
);

// Access final metrics from Promise
console.log('Final response:', fullResponse);
console.log('Tokens:', metrics.decodeLen);
console.log('Time:', metrics.decodeTime / 1000000, 'seconds');
```

### React Component

```typescript
function ChatBot() {
  const [session] = useState(() => createMnnLlmSession());
  const [response, setResponse] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [metrics, setMetrics] = useState<LlmMetrics | null>(null);

  useEffect(() => {
    session.init({
      modelDir: '/sdcard/models/llama',
      maxNewTokens: 2048,
      systemPrompt: 'You are a helpful AI assistant.',
      keepHistory: true
    });
    
    return () => {
      session.release().catch(console.error);
    };
  }, []);

  const handleSubmit = async (prompt: string) => {
    setIsGenerating(true);
    setResponse('');
    setMetrics(null);

    try {
      const finalMetrics = await session.submitPrompt(
        prompt,
        true,
        (chunk) => setResponse(prev => prev + chunk),
        (metricsData) => {
          setMetrics(metricsData);
        },
        (error) => {
          Alert.alert('Error', error);
        }
      );
      
      // Can also use metrics from Promise result
      setMetrics(finalMetrics);
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleStop = async () => {
    await session.stop();
    setIsGenerating(false);
  };

  return (
    <View>
      <Text>{response}</Text>
      {isGenerating && <ActivityIndicator />}
      {isGenerating && (
        <TouchableOpacity onPress={handleStop}>
          <Text>Stop Generation</Text>
        </TouchableOpacity>
      )}
      {metrics && (
        <Text>Speed: {(metrics.decodeLen / (metrics.decodeTime / 1000000)).toFixed(1)} tok/s</Text>
      )}
    </View>
  );
}
```

### Async/Await Pattern (With submitPromptAsync)

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
    console.log('Speed:', metrics.decodeLen / (metrics.decodeTime / 1000000), 'tok/s');
    
    return response;
  } finally {
    await session.release();
  }
}
```

Note: [`submitPrompt()`](src/index.tsx:198) now also returns a Promise, so you can use it with await as well. Both methods support callbacks + Promise return value.

### Conversation History

```typescript
const messages = [
  { role: 'system', content: 'You are a helpful assistant.' },
  { role: 'user', content: 'What is React?' },
  { role: 'assistant', content: 'React is a JavaScript library for building UIs.' },
  { role: 'user', content: 'How about React Native?' }
];

session.submitWithHistory(
  messages,
  (chunk) => console.log(chunk),
  (metrics) => console.log('Done', metrics)
);
```

---

## Error Handling

### Common Errors

| Error | Cause | Solution |
|-------|-------|----------|
| "Session is not initialized" | Called method before `init()` | Call `init()` first |
| "Invalid session ID" | Session was released | Create new session |
| "Model not found" | Wrong model path | Check file path |
| "Out of memory" | Model too large | Use smaller model or reduce tokens |

### Best Practices

```typescript
// 1. Always use try-catch with async methods
try {
  await session.init(config);
} catch (error) {
  console.error('Init failed:', error);
  Alert.alert('Error', error.message);
}

// 2. Always release sessions
useEffect(() => {
  const sess = createMnnLlmSession();
  sess.init(config);
  
  return () => {
    sess.release().catch(console.error);
  };
}, []);

// 3. Handle errors in callbacks
session.submitPrompt(
  prompt,
  true,
  (chunk) => console.log(chunk),
  (metrics) => console.log('Done'),
  (error) => {
    // Handle error
    console.error('Generation error:', error);
    Alert.alert('Error', error);
  }
);
```

---

## Performance Tips

### Optimization Guidelines

1. **Model Selection**
   - Use quantized models (4-bit, 8-bit) for better speed
   - Smaller models (3B-7B params) run faster on mobile

2. **Token Limits**
   - Set `maxNewTokens` appropriately (512-1024 for mobile)
   - Lower limits = faster response times

3. **Memory Management**
   - Release sessions when not needed
   - Use single session for multiple requests
   - Clear history periodically

4. **Streaming Optimization**
   ```typescript
   // Batch UI updates to reduce overhead
   let buffer = '';
   session.submitPrompt(
     prompt,
     true,
     (chunk) => {
       buffer += chunk;
       // Update UI every 50ms instead of every chunk
       if (buffer.length > 10) {
         setResponse(prev => prev + buffer);
         buffer = '';
       }
     },
     (metrics) => {
       // Flush remaining buffer
       if (buffer) setResponse(prev => prev + buffer);
     }
   );
   ```

5. **Device Considerations**
   - Test on target devices
   - Monitor memory usage
   - Adjust settings based on device capabilities

### Expected Performance

| Device | Model Size | Tokens/Second |
|--------|-----------|---------------|
| Snapdragon 888+ | 3B (4-bit) | 20-30 |
| Snapdragon 888+ | 7B (4-bit) | 10-15 |
| Snapdragon 8 Gen 2 | 3B (4-bit) | 30-40 |
| Snapdragon 8 Gen 2 | 7B (4-bit) | 15-25 |

---

## Advanced Usage

### Custom Configuration

```typescript
await session.init({
  modelDir: '/sdcard/models/custom',
  maxNewTokens: 512,
  mergedConfig: JSON.stringify({
    max_new_tokens: 512,
    temperature: 0.7,
    top_p: 0.9,
    top_k: 40
  }),
  extraConfig: JSON.stringify({
    keep_history: true,
    enable_streaming: true
  })
});
```

### Dynamic Configuration Updates

```typescript
// During runtime
await session.updateMaxNewTokens(1024);
await session.updateSystemPrompt('You are a creative writer.');
await session.updateConfig(JSON.stringify({
  temperature: 0.9,
  top_p: 0.95
}));
```

---

## Troubleshooting

### Build Issues

**Problem:** CMake errors during build

**Solution:**
```bash
cd android
./gradlew clean
./gradlew assembleDebug
```

**Problem:** Library not found

**Solution:** Check that `libMNN.so` is in `android/prebuilt/libs/`

### Runtime Issues

**Problem:** Slow generation

**Solutions:**
- Use quantized model
- Reduce `maxNewTokens`
- Close other apps
- Check device temperature

**Problem:** Out of memory

**Solutions:**
- Use smaller model
- Reduce batch size
- Clear history more frequently
- Release and reinit session

---

## API Version

**Current Version:** 0.1.0

**Compatibility:**
- React Native: 0.71+
- Android: API 24+ (Android 7.0+)
- iOS: Coming soon

---

## Support

For issues and questions:
- GitHub Issues: [navedmerchant/mnn-rn](https://github.com/navedmerchant/mnn-rn/issues)
- Documentation: See [ARCHITECTURE.md](./ARCHITECTURE_V2.md)

---

## License

MIT License - See LICENSE file for details