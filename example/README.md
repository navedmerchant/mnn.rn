# MNN LLM React Native Example App

A comprehensive example application demonstrating the MNN LLM React Native library with a full-featured chat interface, model configuration, and download capabilities.

## Features

### 🎯 Core Features

1. **Download Screen**
   - Download models directly from HuggingFace
   - Progress tracking with visual progress bar
   - Support for skipping download if model already exists
   - Default model: Qwen3-1.7B-MNN

2. **Chat Interface**
   - Real-time streaming responses
   - In-memory chat history
   - Message bubbles with timestamps
   - Token generation metrics (tokens/sec, latency)
   - Stop generation mid-stream
   - Clear chat history
   - Reset session functionality

3. **Configuration Screen**
   - Comprehensive model configuration options
   - Live configuration editing
   - Reset to defaults
   - Apply and reinitialize with new settings

### ⚙️ Configuration Options

#### Hardware Configuration
- **Backend Type**: CPU, OpenCL (Android GPU), Metal (iOS GPU)
- **Thread Number**: Number of threads for inference
- **Precision**: Low (FP16), Normal, High
- **Memory**: Memory strategy (Low/Normal/High)
- **Memory Mapping**: Use mmap for weights and KV cache

#### Inference Configuration
- **Max New Tokens**: Maximum tokens to generate
- **Reuse KV Cache**: Enable for multi-turn dialogues
- **Quantize QKV**: Various quantization options (0-4)

#### Sampler Configuration
- **Sampler Type**: Greedy, Temperature, Top-K, Top-P, Min-P, TFS, Typical, Penalty, Mixed
- **Temperature**: Control randomness (0.1-2.0)
- **Top-K**: Number of top tokens to sample
- **Top-P**: Nucleus sampling threshold
- **Min-P**: Minimum probability threshold
- **Penalty**: Repetition penalty factor
- **N-Gram**: Max n-gram for penalty
- **Mixed Samplers**: Apply multiple samplers in sequence

#### Advanced Features
- **Thinking Mode**: Enable chain-of-thought reasoning (for supported models)
- **System Prompt**: Customize system-level instructions
- **Assistant Prompt Template**: Customize response format

## Getting Started

### Prerequisites

- Node.js >= 20
- React Native development environment set up
- For Android: Android Studio with SDK
- For iOS: Xcode with CocoaPods

### Installation

```bash
# Install dependencies
yarn install

# iOS only - install pods
cd ios && pod install && cd ..
```

### Running the App

```bash
# Start Metro bundler
yarn start

# Run on Android
yarn android

# Run on iOS
yarn ios
```

## Usage Guide

### First Launch

1. **Download Model**
   - On first launch, you'll see the download screen
   - Enter a HuggingFace repository URL (or use the default)
   - Tap "Download Model" to download from HuggingFace
   - Or tap "Skip" if you already have a model downloaded

2. **Model Initialization**
   - After download, the model will automatically initialize
   - Wait for initialization to complete
   - You'll be redirected to the chat screen when ready

### Using the Chat Screen

1. **Send Messages**
   - Type your message in the input field
   - Tap the send button (➤) to send
   - Watch the response stream in real-time

2. **View Metrics**
   - See tokens/second during generation
   - View detailed metrics after completion (prefill time, decode time)

3. **Manage Chat**
   - Tap "Clear" to clear chat history
   - Tap "Reset" to reinitialize the session
   - Tap "⏹" to stop generation mid-stream

### Configuring the Model

1. **Navigate to Config**
   - Tap the "Config" tab in the bottom navigation

2. **Adjust Settings**
   - Modify any configuration option
   - See descriptions for each setting
   - Tap "Save" to save without applying

3. **Apply Configuration**
   - Tap "Apply & Reinitialize" to apply changes
   - This will reinitialize the model and clear chat history

4. **Reset to Defaults**
   - Tap "Reset" in the header to restore default values

### Enabling Thinking Mode

For models that support chain-of-thought reasoning:

1. Go to Config screen
2. Scroll to "Advanced Features"
3. Enable "Enable Thinking Mode"
4. Apply & Reinitialize

## Supported Models

This example works best with MNN-converted models from HuggingFace:

- **Qwen Series**: Qwen3-1.7B, Qwen2.5-0.5B, Qwen2.5-1.5B, Qwen2.5-3B (Instruct variants)
- **Other MNN Models**: Any model exported using the MNN LLM export tools

### Model Format

Models should be in MNN format with the following structure:
```
model_directory/
├── config.json
├── embeddings_bf16.bin
├── llm.mnn
├── llm.mnn.weight
├── llm_config.json
└── tokenizer.txt
```

## Tips & Best Practices

### Performance Optimization

1. **Use OpenCL/Metal**: For mobile GPUs, use OpenCL (Android) or Metal (iOS)
   - Set thread_num to 68 for OpenCL
   - Significantly faster than CPU on supported devices

2. **Enable Memory Mapping**: For devices with limited RAM
   - Enable "Use Memory Mapping" in config
   - Prevents out-of-memory errors on large models

3. **Adjust Max Tokens**: Set based on your needs
   - Lower values = faster responses
   - Higher values = longer conversations

### Sampler Configuration

- **For deterministic output**: Use "Greedy" sampler
- **For creative output**: Use "Temperature" or "Mixed" with higher temperature (1.5-2.0)
- **To avoid repetition**: Use "Penalty" sampler with penalty > 1.0
- **Balanced approach**: Use "Mixed" with default settings

### Thinking Mode

- Only works with models specifically trained for chain-of-thought
- Produces more detailed, step-by-step reasoning
- May be slower and use more tokens
- Best for complex problem-solving tasks

## Project Structure

```
example/
├── src/
│   ├── screens/
│   │   ├── DownloadScreen.tsx   # Model download UI
│   │   ├── ChatScreen.tsx        # Chat interface
│   │   └── ConfigScreen.tsx      # Configuration UI
│   ├── types/
│   │   └── index.ts              # TypeScript type definitions
│   ├── utils/
│   │   └── configUtils.ts        # Configuration helpers
│   └── App.tsx                   # Main app with navigation
├── android/                      # Android native code
├── ios/                         # iOS native code
└── package.json
```

## Troubleshooting

### Model Download Issues

- **Check internet connection**
- **Verify HuggingFace URL format**: `https://huggingface.co/owner/repo`
- **Ensure enough storage space**: Models can be 500MB - 2GB+

### Initialization Errors

- **Check model path**: Ensure all required files are present
- **Verify config.json**: Should be in the model directory
- **Try different backend**: Switch between CPU/OpenCL/Metal

### Generation Issues

- **Slow generation**: Try reducing max_new_tokens or using GPU backend
- **Out of memory**: Enable memory mapping options
- **Repetitive output**: Increase penalty factor in sampler config

## API Reference

See the main [API documentation](../../API.md) for detailed API usage.

## License

Same as parent project - see LICENSE file.
