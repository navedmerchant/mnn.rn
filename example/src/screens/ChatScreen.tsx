import { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import type { MnnLlmSession, LlmMetrics } from 'mnn.rn';
import type { ChatMessage } from '../types';

interface ChatScreenProps {
  session: MnnLlmSession;
  messages: ChatMessage[];
  onMessagesChange: (messages: ChatMessage[]) => void;
  onResetSession: () => void;
}

export default function ChatScreen({
  session,
  messages,
  onMessagesChange,
  onResetSession,
}: ChatScreenProps) {
  const [inputText, setInputText] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentResponse, setCurrentResponse] = useState('');
  const [metrics, setMetrics] = useState<LlmMetrics | null>(null);
  const [tokensPerSecond, setTokensPerSecond] = useState(0);
  const scrollViewRef = useRef<any>(null);
  const startTimeRef = useRef(0);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    scrollViewRef.current?.scrollToEnd({ animated: true });
  }, [messages, currentResponse]);

  const generateId = () => `${Date.now()}-${Math.random()}`;

  const handleSend = async () => {
    if (!inputText.trim() || isGenerating) return;

    const userMessage: ChatMessage = {
      id: generateId(),
      role: 'user',
      content: inputText.trim(),
      timestamp: Date.now(),
    };

    // Add user message to history
    const newMessages = [...messages, userMessage];
    onMessagesChange(newMessages);
    setInputText('');
    setIsGenerating(true);
    setCurrentResponse('');
    setMetrics(null);
    setTokensPerSecond(0);
    startTimeRef.current = Date.now();

    let tokenCount = 0;
    let fullResponse = ''; // Track the complete response

    try {
      const finalMetrics = await session.submitPrompt(
        userMessage.content,
        true,
        (chunk: string) => {
          // Update current response with streaming chunks
          fullResponse += chunk;
          setCurrentResponse(fullResponse);
          tokenCount++;

          // Calculate tokens per second
          const elapsed = (Date.now() - startTimeRef.current) / 1000;
          if (elapsed > 0) {
            setTokensPerSecond(tokenCount / elapsed);
          }
        },
        (metricsData: LlmMetrics) => {
          // Generation complete
          setMetrics(metricsData);
          const totalTime = metricsData.decodeTime / 1_000_000;
          if (totalTime > 0) {
            setTokensPerSecond(metricsData.decodeLen / totalTime);
          }
        },
        (error: string) => {
          Alert.alert('Generation Error', error);
        }
      );

      // Add assistant response to history using the captured full response
      const assistantMessage: ChatMessage = {
        id: generateId(),
        role: 'assistant',
        content: fullResponse,
        timestamp: Date.now(),
      };

      onMessagesChange([...newMessages, assistantMessage]);
      setCurrentResponse('');
      setMetrics(finalMetrics);

      const totalTime = finalMetrics.decodeTime / 1_000_000;
      if (totalTime > 0) {
        setTokensPerSecond(finalMetrics.decodeLen / totalTime);
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || String(error));
    } finally {
      setIsGenerating(false);
    }
  };

  const handleStop = async () => {
    try {
      await session.stop();

      // Save partial response if any
      if (currentResponse) {
        const assistantMessage: ChatMessage = {
          id: generateId(),
          role: 'assistant',
          content: currentResponse + ' [stopped]',
          timestamp: Date.now(),
        };
        onMessagesChange([...messages, assistantMessage]);
        setCurrentResponse('');
      }

      setIsGenerating(false);
    } catch (error: any) {
      console.error('Stop error:', error);
      setIsGenerating(false);
    }
  };

  const handleClearChat = () => {
    Alert.alert(
      'Clear Chat',
      'Are you sure you want to clear the chat history?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            try {
              await session.clearHistory();
              onMessagesChange([]);
              setCurrentResponse('');
              setMetrics(null);
              Alert.alert('Success', 'Chat history cleared');
            } catch (error: any) {
              Alert.alert('Error', error.message || String(error));
            }
          },
        },
      ]
    );
  };

  const handleResetSession = () => {
    Alert.alert(
      'Reset Session',
      'This will clear chat history and reinitialize the model with current configuration.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: onResetSession,
        },
      ]
    );
  };

  const renderMessage = (message: ChatMessage) => {
    const isUser = message.role === 'user';
    return (
      <View
        key={message.id}
        style={[
          styles.messageBubble,
          isUser ? styles.userBubble : styles.assistantBubble,
        ]}
      >
        <Text style={styles.messageRole}>{isUser ? 'You' : 'Assistant'}</Text>
        <Text style={styles.messageText}>{message.content}</Text>
        <Text style={styles.messageTime}>
          {new Date(message.timestamp).toLocaleTimeString()}
        </Text>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={90}
    >
      {/* Header with actions */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Chat</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.headerButton}
            onPress={handleClearChat}
          >
            <Text style={styles.headerButtonText}>Clear</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.headerButton}
            onPress={handleResetSession}
          >
            <Text style={styles.headerButtonText}>Reset</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Messages */}
      <ScrollView
        ref={scrollViewRef}
        style={styles.messagesContainer}
        contentContainerStyle={styles.messagesContent}
      >
        {messages.length === 0 && !currentResponse && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>No messages yet</Text>
            <Text style={styles.emptyStateSubtext}>
              Start a conversation below
            </Text>
          </View>
        )}

        {messages.map(renderMessage)}

        {/* Current streaming response */}
        {currentResponse && (
          <View style={[styles.messageBubble, styles.assistantBubble]}>
            <View style={styles.streamingHeader}>
              <Text style={styles.messageRole}>Assistant</Text>
              <View style={styles.streamingIndicator}>
                <ActivityIndicator size="small" color="#007AFF" />
                <Text style={styles.streamingText}>Typing...</Text>
              </View>
            </View>
            <Text style={styles.messageText}>{currentResponse}</Text>
          </View>
        )}

        {/* Metrics display */}
        {metrics && !isGenerating && (
          <View style={styles.metricsContainer}>
            <Text style={styles.metricsTitle}>Last Response Metrics</Text>
            <View style={styles.metricsRow}>
              <Text style={styles.metricsText}>
                Tokens: {metrics.decodeLen}
              </Text>
              <Text style={styles.metricsText}>
                Speed: {tokensPerSecond.toFixed(1)} tok/s
              </Text>
            </View>
            <Text style={styles.metricsDetail}>
              Prefill: {(metrics.prefillTime / 1000).toFixed(2)} ms | Decode:{' '}
              {(metrics.decodeTime / 1000).toFixed(2)} ms
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Input area */}
      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          value={inputText}
          onChangeText={setInputText}
          placeholder="Type your message..."
          multiline
          maxLength={2000}
          editable={!isGenerating}
        />
        {isGenerating ? (
          <TouchableOpacity
            style={[styles.sendButton, styles.stopButton]}
            onPress={handleStop}
          >
            <Text style={styles.sendButtonText}>⏹</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[
              styles.sendButton,
              !inputText.trim() && styles.sendButtonDisabled,
            ]}
            onPress={handleSend}
            disabled={!inputText.trim()}
          >
            <Text style={styles.sendButtonText}>➤</Text>
          </TouchableOpacity>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  headerButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#f0f0f0',
    borderRadius: 6,
  },
  headerButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#007AFF',
  },
  messagesContainer: {
    flex: 1,
  },
  messagesContent: {
    padding: 16,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyStateText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#999',
    marginBottom: 8,
  },
  emptyStateSubtext: {
    fontSize: 14,
    color: '#bbb',
  },
  messageBubble: {
    maxWidth: '80%',
    padding: 12,
    borderRadius: 12,
    marginBottom: 12,
  },
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: '#007AFF',
  },
  assistantBubble: {
    alignSelf: 'flex-start',
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1,
  },
  messageRole: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
    color: '#666',
  },
  messageText: {
    fontSize: 15,
    lineHeight: 20,
    color: '#333',
  },
  messageTime: {
    fontSize: 10,
    color: '#999',
    marginTop: 4,
  },
  streamingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  streamingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  streamingText: {
    fontSize: 12,
    color: '#007AFF',
    fontStyle: 'italic',
  },
  metricsContainer: {
    backgroundColor: '#f9f9f9',
    padding: 12,
    borderRadius: 8,
    marginTop: 8,
  },
  metricsTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
    marginBottom: 6,
  },
  metricsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  metricsText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#007AFF',
  },
  metricsDetail: {
    fontSize: 11,
    color: '#999',
  },
  inputContainer: {
    flexDirection: 'row',
    padding: 12,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    alignItems: 'flex-end',
  },
  input: {
    flex: 1,
    maxHeight: 100,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    backgroundColor: '#f9f9f9',
    marginRight: 8,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: '#ccc',
  },
  stopButton: {
    backgroundColor: '#dc3545',
  },
  sendButtonText: {
    fontSize: 20,
    color: '#fff',
    fontWeight: 'bold',
  },
});
