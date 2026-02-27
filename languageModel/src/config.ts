export const modelConfig = {
  // these affect the shape of the model
  vocabSize: 4096,
  dModel: 128, // Embedding dim
  nHeads: 4, // Attention heads
  nLayers: 4, // Transformer blocks
  maxLen: 256, // Context window

  // these don't
  batchSize: 64,
  dropout: 0.02,
  learningRate: 3e-4,
  maxGradNorm: 1.0,
};

export const generationConfig = {
  generateLength: 200, // tokens
  temperature: 0.8, // lower = more predictable, higher = more nonsense
  topP: 0.9,
  topK: 40, // choose from the topK most probably tokens
};
