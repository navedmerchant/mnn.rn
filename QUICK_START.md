# MNN React Native - Quick Start Guide

Get started with on-device LLM inference in your React Native app using MNN.

## 📋 Prerequisites

- React Native 0.71+
- Android NDK r21+
- Gradle 8.0+
- Android device with ARM64 processor
- MNN model files (`.mnn` format)

## 🚀 Installation

```bash
npm install mnn-rn
# or
yarn add mnn-rn
```

## 📱 Setup

### 1. Prepare Your Model

Place your MNN model files on the device:

```
/sdcard/models/your-model/
├── model.mnn
├── tokenizer.txt
└── config.json
```

You can use `adb push` to transfer files:

```bash
adb push /path/to/model /sdcard/models/your-model/
```

### 2. Basic Usage

```typescript
import { createMnnLlmSession, type LlmMetrics } from 'mnn-rn';

const session = createMnnLlmSession();

// Initialize with your model
await session.init({
  modelDir: '/sdcard/models/llama-3-8b',
  maxNewTokens: 2048,
  systemPrompt: 'You are a helpful AI assistant.',
  keepHistory: true
});

// Generate text with streaming - now returns Promise!
const metrics = await session.submitPrompt(
  'Write a haiku about React Native',
  true,
  (chunk: string) => {
    // Called for each token
    console.log('Chunk:', chunk);
  },
  (metricsData: LlmMetrics) => {
    // Called when complete
    console.log('Done!', metricsData);
  },
  (error: string) => {
    // Called on error
    console.error('Error:', error);
  }
);

// Access final metrics from Promise
console.log('Generated', metrics.decodeLen, 'tokens');
console.log('Speed:', (metrics.decodeLen / (metrics.decodeTime / 1_000_000)).toFixed(1), 'tok/s');

// Clean up when done
await session.release();
```

## 🎯 Usage Patterns

### Pattern 1: Streaming with Callbacks & Promise

Real-time streaming with callbacks AND await for final metrics (recommended):

```typescript
import { createMnnLlmSession } from 'mnn-rn';

const session = createMnnLlmSession();
await session.init({
  modelDir: '/sdcard/models/llama',
  maxNewTokens: 2048,
  systemPrompt: 'You are a helpful AI assistant.',
  keepHistory: true
});

let fullResponse = '';

const metrics = await session.submitPrompt(
  'Explain quantum computing',
  true,
  (chunk) => {
    fullResponse += chunk;
    console.log('Streaming:', chunk);
  },
  (metricsData) => {
    console.log('Generation complete!');
  }
);

console.log('Final response:', fullResponse);
console.log('Tokens:', metrics.decodeLen);
console.log('Speed:', (metrics.decodeLen / (metrics.decodeTime / 1_000_000)).toFixed(1), 'tok/s');
```

### Pattern 2: Async/Await

Promise-based generation (simpler for non-UI logic):

```typescript
async function generateText(prompt: string) {
  const session = createMnnLlmSession();
  
  try {
    await session.init({ modelDir: '/sdcard/models/llama' });
    
    let response = '';
    const metrics = await session.submitPromptAsync(
      prompt,
      true,
      (chunk) => {
        response += chunk;
      }
    );
    
    console.log('Response:', response);
    console.log('Metrics:', metrics);
    
    return response;
  } finally {
    await session.release();
  }
}

const answer = await generateText('What is React Native?');
```

### Pattern 3: React Component

Complete example with React hooks:

```typescript
import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, Button, ActivityIndicator } from 'react-native';
import { createMnnLlmSession, type LlmMetrics } from 'mnn-rn';

function ChatBot() {
  const [session] = useState(() => createMnnLlmSession());
  const [prompt, setPrompt] = useState('');
  const [response, setResponse] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [metrics, setMetrics] = useState<LlmMetrics | null>(null);
  
  // Initialize on mount
  useEffect(() => {
    session.init({
      modelDir: '/sdcard/models/llama',
      maxNewTokens: 2048,
      systemPrompt: 'You are a helpful AI assistant.',
      keepHistory: true
    });
    
    // Clean up on unmount
    return () => {
      session.release().catch(console.error);
    };
  }, []);
  
  const handleSubmit = async () => {
    if (!prompt.trim()) return;
    
    setIsGenerating(true);
    setResponse('');
    setMetrics(null);
    
    try {
      const finalMetrics = await session.submitPrompt(
        prompt,
        true,
        (chunk) => {
          setResponse(prev => prev + chunk);
        },
        (metricsData) => {
          setMetrics(metricsData);
        },
        (error) => {
          console.error('Generation error:', error);
        }
      );
      
      // Can also use metrics from Promise result
      setMetrics(finalMetrics);
    } catch (error: any) {
      console.error('Error:', error);
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
      <TextInput
        value={prompt}
        onChangeText={setPrompt}
        placeholder="Enter your prompt"
        editable={!isGenerating}
      />
      <Button
        title={isGenerating ? 'Generating...' : 'Generate'}
        onPress={handleSubmit}
        disabled={isGenerating}
      />
      {isGenerating && (
        <Button
          title="Stop Generation"
          onPress={handleStop}
        />
      )}
      <Text>{response}</Text>
      {isGenerating && <ActivityIndicator />}
      {metrics && (
        <Text>
          Generated {metrics.decodeLen} tokens in{' '}
          {(metrics.decodeTime / 1_000_000).toFixed(2)}s
          ({(metrics.decodeLen / (metrics.decodeTime / 1_000_000)).toFixed(1)} tok/s)
        </Text>
      )}
    </View>
  );
}
```

### Pattern 4: Conversation History

Multi-turn conversations:

```typescript
import { type LlmMessage } from 'mnn-rn';

const conversation: LlmMessage[] = [
  { role: 'user', content: 'Hello!' },
  { role: 'assistant', content: 'Hi! How can I help you?' },
  { role: 'user', content: 'Tell me about React Native' }
];

// Using callbacks
session.submitWithHistory(
  conversation,
  (chunk) => console.log(chunk),
  (metrics) => console.log('Done:', metrics)
);

// Using async/await
const metrics = await session.submitWithHistoryAsync(
  conversation,
  (chunk) => console.log(chunk)
);
```

## 🔧 Configuration

### Session Configuration

```typescript
await session.init({
  modelDir: '/sdcard/models/llama',        // Required: Model directory
  maxNewTokens: 2048,                       // Optional: Max tokens to generate
  systemPrompt: 'You are a helpful AI.',   // Optional: System prompt
  keepHistory: true,                        // Optional: Enable conversation history
  mergedConfig: JSON.stringify({           // Optional: MNN config
    max_new_tokens: 2048,
    temperature: 0.7,
    top_p: 0.9
  }),
  extraConfig: JSON.stringify({            // Optional: Extra config
    keep_history: true,
    mmap_dir: ''
  })
});
```

### Runtime Configuration Updates

```typescript
// Update max tokens
await session.updateMaxNewTokens(512);

// Update system prompt
await session.updateSystemPrompt('You are a coding assistant.');

// Update assistant prompt template
await session.updateAssistantPrompt('Assistant: ');

// Update MNN configuration
await session.updateConfig(JSON.stringify({
  temperature: 0.9,
  top_p: 0.95
}));
```

### History Management

```typescript
// Clear conversation history
await session.clearHistory();

// Reset session state
await session.reset();
```

## 📊 Performance Metrics

Every generation returns performance metrics via Promise:

```typescript
interface LlmMetrics {
  promptLen: number;      // Input tokens
  decodeLen: number;      // Output tokens generated
  prefillTime: number;    // Prefill time (microseconds)
  decodeTime: number;     // Decode time (microseconds)
}

// Get metrics from Promise
const metrics = await session.submitPrompt(
  prompt,
  true,
  (chunk) => console.log(chunk)
);

// Calculate tokens per second
const tokensPerSecond = metrics.decodeLen / (metrics.decodeTime / 1_000_000);
console.log(`Speed: ${tokensPerSecond.toFixed(1)} tok/s`);

// Real-time calculation during streaming (from App.tsx)
const startTime = Date.now();
let chunkCount = 0;

await session.submitPrompt(
  prompt,
  true,
  (chunk) => {
    chunkCount++;
    const elapsed = (Date.now() - startTime) / 1000;
    const currentSpeed = chunkCount / elapsed;
    console.log(`Current speed: ${currentSpeed.toFixed(1)} tok/s`);
  }
);
```

## 🎨 Example App

Run the included example app:

```bash
cd example
npm install
npm run android
```

The example app demonstrates:
- ✅ Model initialization
- ✅ Streaming text generation
- ✅ Real-time token counter
- ✅ Performance metrics display
- ✅ Example prompts
- ✅ History management

## ⚡ Performance Tips

### 1. Use Quantized Models

```
4-bit quantized models are 3-4x faster than fp16 models
Recommended: 3B or 7B parameter models with 4-bit quantization
```

### 2. Optimize Token Limits

```typescript
await session.init({
  modelDir: '/sdcard/models/llama',
  maxNewTokens: 512  // Lower = faster responses
});
```

### 3. Batch UI Updates

Instead of updating on every chunk:

```typescript
let buffer = '';
let updateTimer: NodeJS.Timeout;

session.submitPrompt(
  prompt,
  true,
  (chunk) => {
    buffer += chunk;
    
    // Batch updates every 50ms
    clearTimeout(updateTimer);
    updateTimer = setTimeout(() => {
      setResponse(prev => prev + buffer);
      buffer = '';
    }, 50);
  },
  (metrics) => {
    // Flush remaining buffer
    if (buffer) {
      setResponse(prev => prev + buffer);
    }
    console.log('Done:', metrics);
  }
);
```

### 4. Memory Management

```typescript
// Always release sessions when done
useEffect(() => {
  const sess = createMnnLlmSession();
  sess.init(config);
  
  return () => {
    sess.release().catch(console.error);
  };
}, []);

// Clear history periodically
await session.clearHistory();
```

## 🐛 Troubleshooting

### Build Errors

**Problem**: CMake errors during build

**Solution**:
```bash
cd android
./gradlew clean
./gradlew assembleDebug
```

### Runtime Errors

**Problem**: "Session is not initialized"

**Solution**: Always call `init()` before using the session:
```typescript
await session.init({ modelDir: '/sdcard/models/llama' });
```

**Problem**: "Model not found"

**Solution**: Verify model path exists:
```bash
adb shell ls /sdcard/models/llama
```

**Problem**: Out of memory

**Solution**: 
- Use smaller model (3B instead of 7B)
- Reduce `maxNewTokens`
- Close other apps
- Clear history more frequently

### Performance Issues

**Problem**: Slow generation (< 5 tok/s)

**Solutions**:
- ✅ Use quantized model (4-bit or 8-bit)
- ✅ Reduce `maxNewTokens` 
- ✅ Ensure device is not thermal throttling
- ✅ Use smaller model size

## 📚 API Reference

See [API.md](./API.md) for complete API documentation.

## 🏗️ Architecture

See [ARCHITECTURE_FINAL.md](./ARCHITECTURE_FINAL.md) for implementation details.

## 📝 Example Prompts

Try these prompts to test your setup:

```typescript
// Code generation
"Write a function to reverse a string in JavaScript"

// Explanation
"Explain how React hooks work in simple terms"

// Creative writing
"Write a haiku about mobile development"

// Q&A
"What are the benefits of on-device AI?"

// Problem solving
"How can I optimize React Native performance?"
```

## 🎯 Next Steps

1. ✅ Run the example app
2. ✅ Test with your own model
3. ✅ Integrate into your app
4. ✅ Optimize for your use case
5. ✅ Share your feedback

## 💡 Tips for Production

- **Test on target devices** - Performance varies significantly
- **Provide loading indicators** - Model initialization takes time
- **Handle errors gracefully** - Network/storage issues can occur
- **Monitor memory usage** - Large models consume significant RAM
- **Optimize prompts** - Shorter prompts = faster responses
- **Use appropriate model size** - Balance quality vs. speed

## 🤝 Support

For issues and questions:
- GitHub Issues: [Your repo URL]
- Documentation: See API.md and ARCHITECTURE_FINAL.md

---

**Happy coding with on-device LLM inference!** 🚀