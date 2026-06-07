import { pipeline } from '@xenova/transformers';

let extractorInstance = null;

async function getExtractor() {
  if (!extractorInstance) {
    // Disable local model check warnings and default cache configuration if needed
    extractorInstance = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  }
  return extractorInstance;
}

/**
 * Generates a 384-dimensional vector embedding for the given text.
 * @param {string} text 
 * @returns {Promise<number[]>}
 */
export async function generateEmbedding(text) {
  if (!text || typeof text !== 'string') {
    return new Array(384).fill(0);
  }
  
  try {
    const extractor = await getExtractor();
    const output = await extractor(text, { pooling: 'mean', normalize: true });
    return Array.from(output.data);
  } catch (error) {
    console.error("Failed to generate embedding for text:", text, error);
    // Return a zero vector as a fallback rather than failing entirely
    return new Array(384).fill(0);
  }
}
