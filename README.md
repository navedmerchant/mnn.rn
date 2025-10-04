# MNN React Native

On-device LLM inference for React Native for Alibabas MNN.

As of now this library only supports Android.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Features

- 🚀 **Fast on-device LLM inference** - Powered by MNN engine
- 📱 **React Native native modules** - TurboModule architecture
- 🔄 **Streaming text generation** - Real-time token-by-token output
- 💬 **Conversation support** - Multi-turn chat with history
- ⚡ **Optimized for mobile** - ARM64 optimized with quantization support
- 🎯 **Type-safe API** - Full TypeScript support
- 🔧 **Flexible configuration** - Runtime config updates

## Installation

```bash
npm install mnn.rn
# or
yarn add mnn.rn
```

## Quick Start

```typescript
import { createMnnLlmSession } from 'mnn.rn';

const session = createMnnLlmSession();

// Initialize
await session.init({
  modelDir: '/sdcard/models/llama-3-8b',
  maxNewTokens: 2048,
  systemPrompt: 'You are a helpful AI assistant.',
  keepHistory: true
});

// Generate with streaming - now returns Promise!
const metrics = await session.submitPrompt(
  'Write a haiku about React Native',
  true,
  (chunk) => console.log(chunk),      // Each token
  (metrics) => console.log('Done!'),  // Completion callback
  (error) => console.error(error)     // Errors
);

console.log('Generated', metrics.decodeLen, 'tokens');

// Clean up
await session.release();
```

See [QUICK_START.md](./QUICK_START.md) for detailed usage examples.

## API Overview

### Session Lifecycle

```typescript
// Create session
const session = createMnnLlmSession();

// Initialize with model
await session.init({
  modelDir: string,
  maxNewTokens?: number,
  systemPrompt?: string,
  keepHistory?: boolean
});

// Release resources
await session.release();
```

### Text Generation

```typescript
// Streaming with callbacks AND Promise (recommended)
const metrics = await session.submitPrompt(
  prompt: string,
  keepHistory: boolean,
  onChunk?: (chunk: string) => void,
  onComplete?: (metrics: LlmMetrics) => void,
  onError?: (error: string) => void
): Promise<LlmMetrics>

// Conversation with history
const metrics = await session.submitWithHistory(
  messages: LlmMessage[],
  onChunk?: (chunk: string) => void,
  onComplete?: (metrics: LlmMetrics) => void,
  onError?: (error: string) => void
): Promise<LlmMetrics>

// Stop generation
await session.stop();
```

### Configuration

```typescript
// Update settings at runtime
await session.updateMaxNewTokens(512);
await session.updateSystemPrompt('You are a helpful assistant.');
await session.updateConfig(JSON.stringify({ temperature: 0.7 }));

// Manage conversation
await session.clearHistory();
await session.reset();

// Stop ongoing generation
await session.stop();
```

See [API.md](./API.md) for complete API reference.

## Example App

Run the included example:

```bash
cd example
npm install
npm run android
```

Features demonstrated:
- ✅ Model initialization
- ✅ Real-time streaming
- ✅ Token counter
- ✅ Performance metrics
- ✅ Conversation history
- ✅ Example prompts

## Architecture

```
┌─────────────────────────┐
│   React Native App      │  TypeScript API
├─────────────────────────┤
│   TurboModule Bridge    │  React Native Bridge
├─────────────────────────┤
│   Kotlin Module         │  Session Management
├─────────────────────────┤
│   JNI Layer             │  Callback Bridge
├─────────────────────────┤
│   C++ LlmSession        │  MNN Wrapper
├─────────────────────────┤
│   libMNN.so             │  Inference Engine
└─────────────────────────┘
```

## Model Preparation

1. **Convert your model to MNN format** using MNN tools
2. **Place on device**:
   ```bash
   adb push /path/to/model /sdcard/models/your-model/
   ```
3. **Model structure**:
   ```
   /sdcard/models/your-model/
   ├── model.mnn
   ├── tokenizer.txt
   └── config.json
   ```

## Requirements

- React Native 0.71+
- Android:
  - NDK r21+
  - Gradle 8.0+
  - ARM64 device (arm64-v8a)
- iOS: Coming soon

### Common Issues

**"Session is not initialized"**
- Solution: Call `init()` before using the session

**"Model not found"**
- Solution: Verify model path with `adb shell ls /sdcard/models/your-model`

**Slow performance**
- Solution: Use quantized models (4-bit or 8-bit)
- Solution: Reduce `maxNewTokens`
- Solution: Use smaller model size

**Out of memory**
- Solution: Use smaller model
- Solution: Clear history more frequently
- Solution: Close other apps

See [QUICK_START.md](./QUICK_START.md#troubleshooting) for more details.

## Documentation

- [Quick Start Guide](./QUICK_START.md) - Get started quickly
- [API Reference](./API.md) - Complete API documentation
- [Architecture](./ARCHITECTURE_FINAL.md) - System design
- [Implementation Plan](./IMPLEMENTATION_PLAN.md) - Development guide

## Contributing

Contributions are welcome! Please read our [Contributing Guide](./CONTRIBUTING.md).

## License

MIT License - see [LICENSE](./LICENSE) file for details.

## Acknowledgments

- [MNN](https://github.com/alibaba/MNN) - Mobile Neural Network inference framework
- React Native team for TurboModule architecture

## Support

- GitHub Issues: [Report bugs or request features]
- Documentation: See files above
- Example App: Run `cd example && npm run android`

---

**Built with ❤️ by Naved Merchant**
