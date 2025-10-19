import { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  TouchableOpacity,
  Text,
  Alert,
  SafeAreaView,
  StatusBar,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { createMnnLlmSession } from 'mnn.rn';
import RNFS from 'react-native-fs';
import type { Screen, ChatMessage, ModelConfig } from './types';
import { DEFAULT_CONFIG, buildMnnConfig } from './utils/configUtils';
import DownloadScreen from './screens/DownloadScreen';
import ChatScreen from './screens/ChatScreen';
import ConfigScreen from './screens/ConfigScreen';

export default function App() {
  // Session and initialization state
  const [session] = useState(() => createMnnLlmSession());
  const [isInitialized, setIsInitialized] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [modelPath, setModelPath] = useState<string>('');

  // Navigation state
  const [currentScreen, setCurrentScreen] = useState<Screen>('download');

  // Chat state
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  // Configuration state
  const [config, setConfig] = useState<ModelConfig>(DEFAULT_CONFIG);

  // Check if model is already downloaded on mount and auto-initialize
  useEffect(() => {
    const checkExistingModel = async () => {
      const defaultPath = `${RNFS.DocumentDirectoryPath}/models/Qwen3-1.7B-MNN/`;
      const exists = await RNFS.exists(defaultPath);

      if (exists) {
        // Check if config.json exists in the model directory
        const configExists = await RNFS.exists(`${defaultPath}config.json`);
        if (configExists) {
          setModelPath(defaultPath);
          // Automatically initialize the model if it exists
          handleInitializeModel(defaultPath);
        }
      }
    };
    checkExistingModel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Clean up session on unmount
  useEffect(() => {
    return () => {
      if (isInitialized) {
        session.release().catch(console.error);
      }
    };
  }, [isInitialized, session]);

  const handleDownloadComplete = (path: string) => {
    setModelPath(path);
    // Automatically initialize after download
    handleInitializeModel(path);
  };

  const handleInitializeModel = async (path?: string) => {
    const targetPath = path || modelPath;

    if (!targetPath) {
      Alert.alert('Error', 'No model path specified');
      return;
    }

    setIsInitializing(true);

    try {
      // Build the merged config JSON
      const mergedConfigJson = buildMnnConfig(config);

      await session.init({
        modelDir: targetPath,
        maxNewTokens: config.maxNewTokens || 2048,
        systemPrompt: config.systemPrompt || 'You are a helpful AI assistant.',
        keepHistory: true,
        mergedConfig: mergedConfigJson,
      });

      setIsInitialized(true);
      setCurrentScreen('chat');
      Alert.alert('Success', 'Model initialized successfully!');
    } catch (error: any) {
      Alert.alert('Initialization Error', error.message || String(error));
      setCurrentScreen('download');
    } finally {
      setIsInitializing(false);
    }
  };

  const handleResetSession = async () => {
    if (!isInitialized) return;

    setIsInitializing(true);

    try {
      // Clear messages
      setMessages([]);

      // Release current session
      await session.release();
      setIsInitialized(false);

      // Wait a bit for cleanup
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Reinitialize with current config
      await handleInitializeModel();
    } catch (error: any) {
      Alert.alert('Reset Error', error.message || String(error));
      setIsInitializing(false);
    }
  };

  const handleApplyConfig = async () => {
    if (!isInitialized) {
      Alert.alert(
        'Info',
        'Configuration will be applied when you initialize the model'
      );
      return;
    }

    Alert.alert(
      'Apply Configuration',
      'This will reinitialize the model with the new configuration and clear chat history. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Apply',
          onPress: handleResetSession,
        },
      ]
    );
  };

  const renderTabBar = () => {
    if (!isInitialized) return null;

    const tabs: Array<{ screen: Screen; label: string; icon: string }> = [
      { screen: 'chat', label: 'Chat', icon: '💬' },
      { screen: 'config', label: 'Config', icon: '⚙️' },
    ];

    return (
      <View style={styles.tabBar}>
        {tabs.map((tab) => (
          <TouchableOpacity
            key={tab.screen}
            style={[
              styles.tab,
              currentScreen === tab.screen && styles.tabActive,
            ]}
            onPress={() => setCurrentScreen(tab.screen)}
          >
            <Text style={styles.tabIcon}>{tab.icon}</Text>
            <Text
              style={[
                styles.tabLabel,
                currentScreen === tab.screen && styles.tabLabelActive,
              ]}
            >
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    );
  };

  const renderScreen = () => {
    if (isInitializing) {
      return (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>Initializing model...</Text>
          <Text style={styles.loadingSubtext}>This may take a moment</Text>
        </View>
      );
    }

    switch (currentScreen) {
      case 'download':
        return <DownloadScreen onDownloadComplete={handleDownloadComplete} />;

      case 'chat':
        return (
          <ChatScreen
            session={session}
            messages={messages}
            onMessagesChange={setMessages}
            onResetSession={handleResetSession}
          />
        );

      case 'config':
        return (
          <ConfigScreen
            config={config}
            onConfigChange={setConfig}
            onApplyConfig={handleApplyConfig}
          />
        );

      default:
        return null;
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>MNN LLM</Text>
        {isInitialized && (
          <View style={styles.headerStatus}>
            <View style={styles.statusIndicator} />
            <Text style={styles.statusText}>Model Ready</Text>
          </View>
        )}
      </View>

      {/* Main Content */}
      <View style={styles.content}>{renderScreen()}</View>

      {/* Tab Bar */}
      {renderTabBar()}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    paddingTop:
      Platform.OS === 'android' ? (StatusBar.currentHeight || 0) + 12 : 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  headerStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#4CAF50',
  },
  statusText: {
    fontSize: 12,
    color: '#666',
    fontWeight: '500',
  },
  content: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  loadingSubtext: {
    marginTop: 8,
    fontSize: 14,
    color: '#666',
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    paddingBottom: 8,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabActive: {
    borderTopWidth: 2,
    borderTopColor: '#007AFF',
  },
  tabIcon: {
    fontSize: 24,
    marginBottom: 4,
  },
  tabLabel: {
    fontSize: 12,
    color: '#666',
    fontWeight: '500',
  },
  tabLabelActive: {
    color: '#007AFF',
    fontWeight: '600',
  },
});
