import type { ModelConfig } from '../types';

// Default configuration based on MNN documentation
export const DEFAULT_CONFIG: ModelConfig = {
  backendType: 'cpu',
  threadNum: 4,
  precision: 'low',
  memory: 'low',
  useMmap: true,
  kvcacheMmap: false,
  maxNewTokens: 2048,
  reuseKv: false,
  quantQkv: 0,
  samplerType: 'mixed',
  mixedSamplers: ['topK', 'tfs', 'typical', 'topP', 'minP', 'temperature'],
  temperature: 1.0,
  topK: 40,
  topP: 0.9,
  minP: 0.1,
  tfsZ: 1.0,
  typical: 1.0,
  penalty: 0.0,
  nGram: 8,
  ngramFactor: 1.0,
  penaltySampler: 'greedy',
  systemPrompt: 'You are a helpful AI assistant.',
  enableThinking: false,
};

/**
 * Build MNN config JSON from ModelConfig
 */
export function buildMnnConfig(config: ModelConfig): string {
  const mnnConfig: any = {};

  // Hardware config
  if (config.backendType) mnnConfig.backend_type = config.backendType;
  if (config.threadNum !== undefined) mnnConfig.thread_num = config.threadNum;
  if (config.precision) mnnConfig.precision = config.precision;
  if (config.memory) mnnConfig.memory = config.memory;
  if (config.useMmap !== undefined) mnnConfig.use_mmap = config.useMmap;
  if (config.kvcacheMmap !== undefined)
    mnnConfig.kvcache_mmap = config.kvcacheMmap;
  if (config.tmpPath) mnnConfig.tmp_path = config.tmpPath;

  // Inference config
  if (config.maxNewTokens !== undefined)
    mnnConfig.max_new_tokens = config.maxNewTokens;
  if (config.reuseKv !== undefined) mnnConfig.reuse_kv = config.reuseKv;
  if (config.quantQkv !== undefined) mnnConfig.quant_qkv = config.quantQkv;

  // Sampler config
  if (config.samplerType) mnnConfig.sampler_type = config.samplerType;
  if (config.mixedSamplers) mnnConfig.mixed_samplers = config.mixedSamplers;
  if (config.temperature !== undefined)
    mnnConfig.temperature = config.temperature;
  if (config.topK !== undefined) mnnConfig.topK = config.topK;
  if (config.topP !== undefined) mnnConfig.topP = config.topP;
  if (config.minP !== undefined) mnnConfig.minP = config.minP;
  if (config.tfsZ !== undefined) mnnConfig.tfsZ = config.tfsZ;
  if (config.typical !== undefined) mnnConfig.typical = config.typical;
  if (config.penalty !== undefined) mnnConfig.penalty = config.penalty;
  if (config.nGram !== undefined) mnnConfig.n_gram = config.nGram;
  if (config.ngramFactor !== undefined)
    mnnConfig.ngram_factor = config.ngramFactor;
  if (config.penaltySampler) mnnConfig.penalty_sampler = config.penaltySampler;

  // System prompt
  if (config.systemPrompt) mnnConfig.system_prompt = config.systemPrompt;
  if (config.assistantPromptTemplate)
    mnnConfig.assistant_prompt_template = config.assistantPromptTemplate;

  // Thinking mode (Jinja config)
  if (config.enableThinking !== undefined) {
    mnnConfig.jinja = {
      context: {
        enable_thinking: config.enableThinking,
      },
    };
  }

  return JSON.stringify(mnnConfig);
}

/**
 * Merge partial config with defaults
 */
export function mergeConfig(partial: Partial<ModelConfig>): ModelConfig {
  return { ...DEFAULT_CONFIG, ...partial };
}

/**
 * Get human-readable description for sampler types
 */
export function getSamplerDescription(type: string): string {
  const descriptions: Record<string, string> = {
    greedy: 'Always pick most likely token (deterministic)',
    temperature: 'Add randomness to outputs',
    topK: 'Sample from top K most likely tokens',
    topP: 'Sample from smallest set with cumulative probability P',
    minP: 'Filter tokens below minimum probability',
    tfs: 'Tail-free sampling',
    typical: 'Typical sampling',
    penalty: 'Penalize repeated tokens',
    mixed: 'Apply multiple samplers in sequence',
  };
  return descriptions[type] || type;
}

/**
 * Get human-readable description for quant_qkv values
 */
export function getQuantQkvDescription(value: number): string {
  const descriptions: Record<number, string> = {
    0: 'No quantization',
    1: 'Asymmetric 8-bit for key',
    2: 'FP8 for value',
    3: 'Asymmetric 8-bit for key + FP8 for value',
    4: 'Full quantization (Q, K, V all quantized)',
  };
  return descriptions[value] || 'Unknown';
}
