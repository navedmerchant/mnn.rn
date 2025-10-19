import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Switch,
  Alert,
} from 'react-native';
import type { ModelConfig } from '../types';
import {
  getSamplerDescription,
  getQuantQkvDescription,
} from '../utils/configUtils';

interface ConfigScreenProps {
  config: ModelConfig;
  onConfigChange: (config: ModelConfig) => void;
  onApplyConfig: () => void;
}

export default function ConfigScreen({
  config,
  onConfigChange,
  onApplyConfig,
}: ConfigScreenProps) {
  const [localConfig, setLocalConfig] = useState<ModelConfig>(config);

  const updateConfig = <K extends keyof ModelConfig>(
    key: K,
    value: ModelConfig[K]
  ) => {
    setLocalConfig((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = () => {
    onConfigChange(localConfig);
    Alert.alert('Success', 'Configuration saved');
  };

  const handleApply = () => {
    onConfigChange(localConfig);
    onApplyConfig();
  };

  const handleReset = () => {
    Alert.alert('Reset Configuration', 'Reset to default values?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Reset',
        onPress: () => {
          const { DEFAULT_CONFIG } = require('../utils/configUtils');
          setLocalConfig(DEFAULT_CONFIG);
          Alert.alert('Success', 'Configuration reset to defaults');
        },
      },
    ]);
  };

  const renderSection = (title: string, children: React.ReactNode) => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );

  const renderNumberInput = (
    label: string,
    value: number | undefined,
    key: keyof ModelConfig,
    description?: string
  ) => (
    <View style={styles.inputGroup}>
      <Text style={styles.label}>{label}</Text>
      {description && <Text style={styles.description}>{description}</Text>}
      <TextInput
        style={styles.input}
        value={value?.toString() || ''}
        onChangeText={(text) => {
          const num = parseInt(text, 10);
          if (!isNaN(num)) {
            updateConfig(key, num as any);
          }
        }}
        keyboardType="numeric"
        placeholder={`Enter ${label.toLowerCase()}`}
      />
    </View>
  );

  const renderFloatInput = (
    label: string,
    value: number | undefined,
    key: keyof ModelConfig,
    description?: string
  ) => (
    <View style={styles.inputGroup}>
      <Text style={styles.label}>{label}</Text>
      {description && <Text style={styles.description}>{description}</Text>}
      <TextInput
        style={styles.input}
        value={value?.toString() || ''}
        onChangeText={(text) => {
          const num = parseFloat(text);
          if (!isNaN(num)) {
            updateConfig(key, num as any);
          }
        }}
        keyboardType="decimal-pad"
        placeholder={`Enter ${label.toLowerCase()}`}
      />
    </View>
  );

  const renderTextInput = (
    label: string,
    value: string | undefined,
    key: keyof ModelConfig,
    description?: string,
    multiline = false
  ) => (
    <View style={styles.inputGroup}>
      <Text style={styles.label}>{label}</Text>
      {description && <Text style={styles.description}>{description}</Text>}
      <TextInput
        style={[styles.input, multiline && styles.textArea]}
        value={value || ''}
        onChangeText={(text) => updateConfig(key, text as any)}
        placeholder={`Enter ${label.toLowerCase()}`}
        multiline={multiline}
        numberOfLines={multiline ? 3 : 1}
      />
    </View>
  );

  const renderSwitch = (
    label: string,
    value: boolean | undefined,
    key: keyof ModelConfig,
    description?: string
  ) => (
    <View style={styles.switchGroup}>
      <View style={styles.switchLabelContainer}>
        <Text style={styles.label}>{label}</Text>
        {description && <Text style={styles.description}>{description}</Text>}
      </View>
      <Switch
        value={value || false}
        onValueChange={(val) => updateConfig(key, val as any)}
        trackColor={{ false: '#ccc', true: '#007AFF' }}
        thumbColor="#fff"
      />
    </View>
  );

  const renderPicker = (
    label: string,
    value: string | number | undefined,
    options: Array<{ label: string; value: string | number }>,
    key: keyof ModelConfig,
    description?: string
  ) => (
    <View style={styles.inputGroup}>
      <Text style={styles.label}>{label}</Text>
      {description && <Text style={styles.description}>{description}</Text>}
      <View style={styles.pickerContainer}>
        {options.map((option) => (
          <TouchableOpacity
            key={option.value}
            style={[
              styles.pickerOption,
              value === option.value && styles.pickerOptionSelected,
            ]}
            onPress={() => updateConfig(key, option.value as any)}
          >
            <Text
              style={[
                styles.pickerOptionText,
                value === option.value && styles.pickerOptionTextSelected,
              ]}
            >
              {option.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Configuration</Text>
        <TouchableOpacity style={styles.resetButton} onPress={handleReset}>
          <Text style={styles.resetButtonText}>Reset</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Hardware Configuration */}
        {renderSection(
          'Hardware Configuration',
          <>
            {renderPicker(
              'Backend Type',
              localConfig.backendType,
              [
                { label: 'CPU', value: 'cpu' },
                { label: 'OpenCL (Android GPU)', value: 'opencl' },
                { label: 'Metal (iOS GPU)', value: 'metal' },
              ],
              'backendType',
              'Hardware backend for inference'
            )}
            {renderNumberInput(
              'Thread Number',
              localConfig.threadNum,
              'threadNum',
              'Number of threads for CPU inference (use 68 for OpenCL)'
            )}
            {renderPicker(
              'Precision',
              localConfig.precision,
              [
                { label: 'Low (FP16)', value: 'low' },
                { label: 'Normal', value: 'normal' },
                { label: 'High', value: 'high' },
              ],
              'precision',
              'Inference precision strategy'
            )}
            {renderPicker(
              'Memory',
              localConfig.memory,
              [
                { label: 'Low', value: 'low' },
                { label: 'Normal', value: 'normal' },
                { label: 'High', value: 'high' },
              ],
              'memory',
              'Memory strategy (low enables runtime quantization)'
            )}
            {renderSwitch(
              'Use Memory Mapping',
              localConfig.useMmap,
              'useMmap',
              'Write weights to disk when memory is insufficient'
            )}
            {renderSwitch(
              'KV Cache Memory Mapping',
              localConfig.kvcacheMmap,
              'kvcacheMmap',
              'Use mmap for KV Cache'
            )}
          </>
        )}

        {/* Inference Configuration */}
        {renderSection(
          'Inference Configuration',
          <>
            {renderNumberInput(
              'Max New Tokens',
              localConfig.maxNewTokens,
              'maxNewTokens',
              'Maximum tokens to generate'
            )}
            {renderSwitch(
              'Reuse KV Cache',
              localConfig.reuseKv,
              'reuseKv',
              'Reuse KV cache in multi-turn dialogues'
            )}
            {renderPicker(
              'Quantize QKV',
              localConfig.quantQkv,
              [
                { label: '0: No quantization', value: 0 },
                { label: '1: 8-bit for key', value: 1 },
                { label: '2: FP8 for value', value: 2 },
                { label: '3: 8-bit key + FP8 value', value: 3 },
                { label: '4: Full quantization', value: 4 },
              ],
              'quantQkv',
              getQuantQkvDescription(localConfig.quantQkv || 0)
            )}
          </>
        )}

        {/* Sampler Configuration */}
        {renderSection(
          'Sampler Configuration',
          <>
            {renderPicker(
              'Sampler Type',
              localConfig.samplerType,
              [
                { label: 'Greedy', value: 'greedy' },
                { label: 'Temperature', value: 'temperature' },
                { label: 'Top-K', value: 'topK' },
                { label: 'Top-P', value: 'topP' },
                { label: 'Min-P', value: 'minP' },
                { label: 'TFS', value: 'tfs' },
                { label: 'Typical', value: 'typical' },
                { label: 'Penalty', value: 'penalty' },
                { label: 'Mixed', value: 'mixed' },
              ],
              'samplerType',
              getSamplerDescription(localConfig.samplerType || 'greedy')
            )}
            {renderFloatInput(
              'Temperature',
              localConfig.temperature,
              'temperature',
              'Higher = more random (0.1-2.0)'
            )}
            {renderNumberInput(
              'Top-K',
              localConfig.topK,
              'topK',
              'Number of top tokens to sample from'
            )}
            {renderFloatInput(
              'Top-P',
              localConfig.topP,
              'topP',
              'Nucleus sampling threshold (0.0-1.0)'
            )}
            {renderFloatInput(
              'Min-P',
              localConfig.minP,
              'minP',
              'Minimum probability threshold'
            )}
            {renderFloatInput(
              'TFS Z',
              localConfig.tfsZ,
              'tfsZ',
              'Tail-free sampling Z value'
            )}
            {renderFloatInput(
              'Typical',
              localConfig.typical,
              'typical',
              'Typical sampling probability'
            )}
            {renderFloatInput(
              'Penalty',
              localConfig.penalty,
              'penalty',
              'Repetition penalty factor'
            )}
            {renderNumberInput(
              'N-Gram',
              localConfig.nGram,
              'nGram',
              'Max n-gram for penalty'
            )}
            {renderFloatInput(
              'N-Gram Factor',
              localConfig.ngramFactor,
              'ngramFactor',
              'Extra penalty for n-gram repetition'
            )}
            {renderPicker(
              'Penalty Sampler',
              localConfig.penaltySampler,
              [
                { label: 'Greedy', value: 'greedy' },
                { label: 'Temperature', value: 'temperature' },
              ],
              'penaltySampler',
              'Sampling strategy after penalty'
            )}
          </>
        )}

        {/* Prompts */}
        {renderSection(
          'Prompts',
          <>
            {renderTextInput(
              'System Prompt',
              localConfig.systemPrompt,
              'systemPrompt',
              'System-level instructions for the model',
              true
            )}
            {renderTextInput(
              'Assistant Prompt Template',
              localConfig.assistantPromptTemplate,
              'assistantPromptTemplate',
              'Template for assistant responses',
              true
            )}
          </>
        )}

        {/* Advanced Features */}
        {renderSection(
          'Advanced Features',
          <>
            {renderSwitch(
              'Enable Thinking Mode',
              localConfig.enableThinking,
              'enableThinking',
              'Enable chain-of-thought reasoning (for supported models)'
            )}
          </>
        )}

        {/* Action Buttons */}
        <View style={styles.actionButtons}>
          <TouchableOpacity
            style={[styles.button, styles.buttonSecondary]}
            onPress={handleSave}
          >
            <Text style={styles.buttonText}>Save</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.button, styles.buttonPrimary]}
            onPress={handleApply}
          >
            <Text style={styles.buttonText}>Apply & Reinitialize</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
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
  resetButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#f0f0f0',
    borderRadius: 6,
  },
  resetButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#dc3545',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  section: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 16,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  description: {
    fontSize: 12,
    color: '#666',
    marginBottom: 8,
    fontStyle: 'italic',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
    backgroundColor: '#fafafa',
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  switchGroup: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  switchLabelContainer: {
    flex: 1,
    marginRight: 12,
  },
  pickerContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  pickerOption: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#ddd',
    backgroundColor: '#f9f9f9',
  },
  pickerOptionSelected: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  pickerOptionText: {
    fontSize: 13,
    color: '#333',
  },
  pickerOptionTextSelected: {
    color: '#fff',
    fontWeight: '600',
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  button: {
    flex: 1,
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonPrimary: {
    backgroundColor: '#007AFF',
  },
  buttonSecondary: {
    backgroundColor: '#666',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
