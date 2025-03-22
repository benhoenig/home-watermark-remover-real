/**
 * Shared application constants
 */

// Constants for image processing
export const IMAGE_CONFIG = {
  MAX_DIMENSION: 4096,
  MIN_DIMENSION: 32,
  DEFAULT_QUALITY: 0.8,
  SUPPORTED_TYPES: ['image/jpeg', 'image/png', 'image/webp'] as const,
  WEBGL_MAX_DIMENSION: 8192, // Reduced from 16384 to ensure compatibility
  CHUNK_SIZE: 4096,
  MAX_MEMORY_USAGE: 1024 * 1024 * 1024, // 1GB
  RESIZE_QUALITY: 'high' as const
} as const;

// Model quality presets
export const MODEL_QUALITY = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high'
} as const;

// Processing options by image size
export const PROCESSING_PRESETS = {
  SMALL: {
    maxDimension: IMAGE_CONFIG.WEBGL_MAX_DIMENSION / 2,
    quality: 1.0,
    modelQuality: MODEL_QUALITY.HIGH
  },
  MEDIUM: {
    maxDimension: IMAGE_CONFIG.WEBGL_MAX_DIMENSION / 4,
    quality: 0.9,
    modelQuality: MODEL_QUALITY.MEDIUM
  },
  LARGE: {
    maxDimension: IMAGE_CONFIG.WEBGL_MAX_DIMENSION / 8,
    quality: 0.8,
    modelQuality: MODEL_QUALITY.LOW
  }
} as const; 