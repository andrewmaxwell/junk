export const modelConfig = {
  vocabSize: 4096,
  dModel: 128, // Embedding dim
  nHeads: 4, // Attention heads
  nLayers: 4, // Transformer blocks
  maxLen: 256, // Context window
  batchSize: 32,
  dropout: 0.02,
  learningRate: 3e-4,
  maxGradNorm: 1.0,
};

export const generationConfig = {
  generateLength: 200, // tokens
  temperature: 0.7,
  penaltyLookback: 32,
  repetitionPenalty: 1,
  topP: 0.9,
  topK: 40,
};
