import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  SafeAreaView,
} from 'react-native';
import { createMnnLlmSession, type LlmMetrics } from 'mnn-rn';

export default function App() {
  const [session] = useState(() => createMnnLlmSession());
  const [modelPath, setModelPath] = useState('/sdcard/models/llama');
  const [isInitialized, setIsInitialized] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  
  const [prompt, setPrompt] = useState('');
  const [response, setResponse] = useState('');
  const [metrics, setMetrics] = useState<LlmMetrics | null>(null);
  const [tokenCount, setTokenCount] = useState(0);
  const [tokensPerSecond, setTokensPerSecond] = useState(0);
  const [startTime, setStartTime] = useState(0);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (isInitialized) {
        session.release().catch(console.error);
      }
    };
  }, [isInitialized, session]);

  const handleInitialize = async () => {
    if (!modelPath.trim()) {
      Alert.alert('Error', 'Please enter a valid model path');
      return;
    }

    setIsInitializing(true);
    try {
      await session.init({
        modelDir: modelPath.trim(),
        maxNewTokens: 2048,
        systemPrompt: 'You are a helpful AI assistant.',
        keepHistory: true,
      });
      setIsInitialized(true);
      Alert.alert('Success', 'Model loaded successfully!');
    } catch (error: any) {
      Alert.alert('Initialization Error', error.message || String(error));
    } finally {
      setIsInitializing(false);
    }
  };

  const handleGenerate = () => {
    if (!prompt.trim()) {
      Alert.alert('Error', 'Please enter a prompt');
      return;
    }

    setIsGenerating(true);
    setResponse('');
    setMetrics(null);
    setTokenCount(0);
    setTokensPerSecond(0);
    setStartTime(Date.now());

    let chunkCount = 0;

    session.submitPrompt(
      prompt.trim(),
      true,
      (chunk: string) => {
        // Update response with each chunk
        setResponse((prev) => prev + chunk);
        chunkCount++;
        setTokenCount(chunkCount);
        
        // Calculate tokens per second
        const elapsed = (Date.now() - Date.now()) / 1000;
        if (elapsed > 0) {
          setTokensPerSecond(chunkCount / elapsed);
        }
      },
      (finalMetrics: LlmMetrics) => {
        // Generation complete
        setMetrics(finalMetrics);
        setIsGenerating(false);
        
        // Calculate final tokens/sec
        const totalTime = finalMetrics.decodeTime / 1_000_000; // Convert microseconds to seconds
        if (totalTime > 0) {
          setTokensPerSecond(finalMetrics.decodeLen / totalTime);
        }
      },
      (error: string) => {
        // Error handling
        setIsGenerating(false);
        Alert.alert('Generation Error', error);
      }
    );
  };

  const handleClearHistory = async () => {
    try {
      await session.clearHistory();
      Alert.alert('Success', 'Chat history cleared');
    } catch (error: any) {
      Alert.alert('Error', error.message || String(error));
    }
  };

  const handleReset = async () => {
    try {
      await session.reset();
      setResponse('');
      setMetrics(null);
      setTokenCount(0);
      Alert.alert('Success', 'Session reset');
    } catch (error: any) {
      Alert.alert('Error', error.message || String(error));
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.title}>MNN LLM React Native</Text>

        {/* Model Configuration */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Model Configuration</Text>
          <TextInput
            style={styles.input}
            value={modelPath}
            onChangeText={setModelPath}
            placeholder="Model directory path"
            editable={!isInitialized}
          />
          <TouchableOpacity
            style={[
              styles.button,
              (isInitialized || isInitializing) && styles.buttonDisabled,
            ]}
            onPress={handleInitialize}
            disabled={isInitialized || isInitializing}
          >
            {isInitializing ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>
                {isInitialized ? '✓ Initialized' : 'Initialize Model'}
              </Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Prompt Input */}
        {isInitialized && (
          <>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Prompt</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={prompt}
                onChangeText={setPrompt}
                placeholder="Enter your prompt here..."
                multiline
                numberOfLines={4}
                editable={!isGenerating}
              />
              <View style={styles.buttonRow}>
                <TouchableOpacity
                  style={[styles.button, styles.buttonPrimary]}
                  onPress={handleGenerate}
                  disabled={isGenerating}
                >
                  {isGenerating ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.buttonText}>Generate</Text>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.button, styles.buttonSecondary]}
                  onPress={handleClearHistory}
                  disabled={isGenerating}
                >
                  <Text style={styles.buttonText}>Clear History</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Response Display */}
            <View style={styles.section}>
              <View style={styles.responseHeader}>
                <Text style={styles.sectionTitle}>Response</Text>
                {isGenerating && (
                  <View style={styles.streamingIndicator}>
                    <ActivityIndicator size="small" color="#007AFF" />
                    <Text style={styles.streamingText}>Streaming...</Text>
                  </View>
                )}
              </View>
              
              <View style={styles.responseBox}>
                <ScrollView style={styles.responseScroll}>
                  <Text style={styles.responseText}>
                    {response || 'Response will appear here...'}
                  </Text>
                </ScrollView>
              </View>

              {/* Token Counter */}
              {(tokenCount > 0 || metrics) && (
                <View style={styles.metricsBox}>
                  <Text style={styles.metricsText}>
                    Tokens: {metrics?.decodeLen || tokenCount}
                  </Text>
                  <Text style={styles.metricsText}>
                    Speed: {tokensPerSecond.toFixed(1)} tok/s
                  </Text>
                </View>
              )}

              {/* Detailed Metrics */}
              {metrics && (
                <View style={styles.detailedMetrics}>
                  <Text style={styles.metricsTitle}>Performance Metrics</Text>
                  <Text style={styles.metricsDetail}>
                    Prompt tokens: {metrics.promptLen}
                  </Text>
                  <Text style={styles.metricsDetail}>
                    Generated tokens: {metrics.decodeLen}
                  </Text>
                  <Text style={styles.metricsDetail}>
                    Prefill time: {(metrics.prefillTime / 1000).toFixed(2)} ms
                  </Text>
                  <Text style={styles.metricsDetail}>
                    Decode time: {(metrics.decodeTime / 1000).toFixed(2)} ms
                  </Text>
                  <Text style={styles.metricsDetail}>
                    Total time:{' '}
                    {((metrics.prefillTime + metrics.decodeTime) / 1_000_000).toFixed(2)} s
                  </Text>
                </View>
              )}
            </View>

            {/* Example Prompts */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Example Prompts</Text>
              <TouchableOpacity
                style={styles.exampleButton}
                onPress={() =>
                  setPrompt('Write a haiku about React Native development')
                }
              >
                <Text style={styles.exampleText}>Haiku about React Native</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.exampleButton}
                onPress={() =>
                  setPrompt('Explain quantum computing in simple terms')
                }
              >
                <Text style={styles.exampleText}>Explain quantum computing</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.exampleButton}
                onPress={() =>
                  setPrompt('Write a function to sort an array in JavaScript')
                }
              >
                <Text style={styles.exampleText}>JavaScript code example</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scrollContent: {
    padding: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
    color: '#333',
  },
  section: {
    marginBottom: 20,
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
    color: '#333',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    fontSize: 16,
    backgroundColor: '#fafafa',
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  button: {
    backgroundColor: '#007AFF',
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 8,
  },
  buttonDisabled: {
    backgroundColor: '#ccc',
  },
  buttonPrimary: {
    flex: 1,
    marginRight: 8,
  },
  buttonSecondary: {
    flex: 1,
    backgroundColor: '#666',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonRow: {
    flexDirection: 'row',
  },
  responseHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  streamingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  streamingText: {
    marginLeft: 8,
    color: '#007AFF',
    fontSize: 14,
  },
  responseBox: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    backgroundColor: '#fafafa',
    minHeight: 150,
    maxHeight: 300,
  },
  responseScroll: {
    padding: 12,
  },
  responseText: {
    fontSize: 16,
    lineHeight: 24,
    color: '#333',
  },
  metricsBox: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 12,
    padding: 12,
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
  },
  metricsText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#007AFF',
  },
  detailedMetrics: {
    marginTop: 12,
    padding: 12,
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
  },
  metricsTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
    color: '#333',
  },
  metricsDetail: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  exampleButton: {
    padding: 12,
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    marginBottom: 8,
  },
  exampleText: {
    fontSize: 14,
    color: '#007AFF',
  },
});
