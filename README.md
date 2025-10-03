# MNN React Native

On-device LLM inference for React Native using MNN (Mobile Neural Network).

[![npm version](https://badge.fury.io/js/mnn-rn.svg)](https://badge.fury.io/js/mnn-rn)
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
npm install mnn-rn
# or
yarn add mnn-rn
```

## Quick Start

```typescript
import { createMnnLlmSession } from 'mnn-rn';

const session = createMnnLlmSession();

// Initialize
await session.init({
  modelDir: '/sdcard/models/llama-3-8b',
  maxNewTokens: 2048,
});

// Generate with streaming
session.submitPrompt(
  'Write a haiku about React Native',
  true,
  (chunk) => console.log(chunk),      // Each token
  (metrics) => console.log(metrics),  // Completion
  (error) => console.error(error)     // Errors
);

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
// Callback-based streaming
session.submitPrompt(
  prompt: string,
  keepHistory: boolean,
  onChunk: (chunk: string) => void,
  onComplete: (metrics: LlmMetrics) => void,
  onError?: (error: string) => void
): void

// Promise-based with streaming
await session.submitPromptAsync(
  prompt: string,
  keepHistory: boolean,
  onChunk?: (chunk: string) => void
): Promise<LlmMetrics>

// Conversation with history
session.submitWithHistory(
  messages: LlmMessage[],
  onChunk: (chunk: string) => void,
  onComplete: (metrics: LlmMetrics) => void,
  onError?: (error: string) => void
): void
```

### Configuration

```typescript
await session.updateMaxNewTokens(512);
await session.updateSystemPrompt('You are a helpful assistant.');
await session.updateConfig(JSON.stringify({ temperature: 0.7 }));
await session.clearHistory();
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

See [ARCHITECTURE_FINAL.md](./ARCHITECTURE_FINAL.md) for detailed architecture.

## Performance

| Device | Model Size | Tokens/Second |
|--------|-----------|---------------|
| Snapdragon 888+ | 3B (4-bit) | 20-30 |
| Snapdragon 888+ | 7B (4-bit) | 10-15 |
| Snapdragon 8 Gen 2 | 3B (4-bit) | 30-40 |
| Snapdragon 8 Gen 2 | 7B (4-bit) | 15-25 |

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

## Build Configuration

The library uses CMake to build and statically link the prebuilt MNN library:

```cmake
# android/src/main/cpp/CMakeLists.txt
add_library(MNN SHARED IMPORTED)
set_target_properties(MNN PROPERTIES
  IMPORTED_LOCATION ${CMAKE_CURRENT_SOURCE_DIR}/../../../prebuilt/libs/libMNN.so
)
```

## Troubleshooting

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

**Built with ❤️ for on-device AI**
