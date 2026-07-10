import { pipeline, env } from '@xenova/transformers';
import { getReadCacheRedis } from '../cache/redis-read-cache.js';

// Configure cache directory to use writable /tmp in containerized environment
env.cacheDir = '/tmp/transformers-cache';

let extractorInstance = null;
const embeddingCache = new Map();
const MAX_CACHE_SIZE = 1000;

async function getExtractor() {
  if (!extractorInstance) {
    // Disable local model check warnings and default cache configuration
    extractorInstance = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  }
  return extractorInstance;
}

/**
 * Generates a 384-dimensional vector embedding for the given text.
 * Uses local in-memory cache and Redis cache to prevent CPU-intensive recalculation.
 * @param {string} text 
 * @returns {Promise<number[]>}
 */
export async function generateEmbedding(text) {
  if (!text || typeof text !== 'string') {
    return new Array(384).fill(0);
  }

  const cleanText = text.trim().toLowerCase();

  // 1. Try local in-memory cache first (O(1) lookups)
  if (embeddingCache.has(cleanText)) {
    return embeddingCache.get(cleanText);
  }

  // 2. Try Redis cache (keeps cache across server restarts)
  const redisKey = `embedding:v1:${cleanText}`;
  try {
    const redis = await getReadCacheRedis();
    if (redis) {
      const cached = await redis.get(redisKey);
      if (cached) {
        const vector = JSON.parse(cached);
        if (Array.isArray(vector) && vector.length === 384) {
          // Sync to local memory cache for even faster subsequent reads
          if (embeddingCache.size >= MAX_CACHE_SIZE) {
            const firstKey = embeddingCache.keys().next().value;
            embeddingCache.delete(firstKey);
          }
          embeddingCache.set(cleanText, vector);
          return vector;
        }
      }
    }
  } catch (err) {
    console.warn("[redis-cache] failed to fetch from redis:", err);
  }

  // 3. Generate using deep learning model on CPU
  try {
    const extractor = await getExtractor();
    const output = await extractor(text, { pooling: 'mean', normalize: true });
    const vector = Array.from(output.data);

    // Save to local Map cache
    if (embeddingCache.size >= MAX_CACHE_SIZE) {
      const firstKey = embeddingCache.keys().next().value;
      embeddingCache.delete(firstKey);
    }
    embeddingCache.set(cleanText, vector);

    // Persist in Redis with a 7-day TTL (604800 seconds)
    try {
      const redis = await getReadCacheRedis();
      if (redis) {
        await redis.setex(redisKey, 604800, JSON.stringify(vector));
      }
    } catch (err) {
      console.warn("[redis-cache] failed to write to redis:", err);
    }

    return vector;
  } catch (error) {
    console.error("Failed to generate embedding for text:", text, error);
    return new Array(384).fill(0);
  }
}


