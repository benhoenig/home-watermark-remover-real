/**
 * Utility functions for image processing
 */

import { IMAGE_CONFIG } from './constants';

type SupportedImageType = typeof IMAGE_CONFIG.SUPPORTED_TYPES[number];

interface ImageDimensions {
  width: number;
  height: number;
}

interface ProcessingOptions {
  quality?: number;
  preserveMetadata?: boolean;
  progressive?: boolean;
  maxDimension?: number;
}

/**
 * Validates image dimensions
 * @param width Image width
 * @param height Image height
 * @throws Error if dimensions are invalid
 */
export const validateImageDimensions = (width: number, height: number): void => {
  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    throw new Error('Invalid image dimensions: width and height must be finite numbers');
  }
  if (width < IMAGE_CONFIG.MIN_DIMENSION || height < IMAGE_CONFIG.MIN_DIMENSION) {
    throw new Error(`Image dimensions must be at least ${IMAGE_CONFIG.MIN_DIMENSION}x${IMAGE_CONFIG.MIN_DIMENSION} pixels`);
  }
  if (width > IMAGE_CONFIG.WEBGL_MAX_DIMENSION || height > IMAGE_CONFIG.WEBGL_MAX_DIMENSION) {
    throw new Error(`Image dimensions must not exceed ${IMAGE_CONFIG.WEBGL_MAX_DIMENSION}x${IMAGE_CONFIG.WEBGL_MAX_DIMENSION} pixels`);
  }
};

/**
 * Validates image type
 * @param type Image MIME type
 * @throws Error if type is not supported
 */
export const validateImageType = (type: string): void => {
  if (!type || typeof type !== 'string') {
    throw new Error('Invalid image type: type must be a non-empty string');
  }
  if (!IMAGE_CONFIG.SUPPORTED_TYPES.includes(type as SupportedImageType)) {
    throw new Error(`Unsupported image type: ${type}. Supported types are: ${IMAGE_CONFIG.SUPPORTED_TYPES.join(', ')}`);
  }
};

/**
 * Estimates memory usage for an image
 * @param width Image width
 * @param height Image height
 * @returns Estimated memory usage in bytes
 */
const estimateMemoryUsage = (width: number, height: number): number => {
  // 4 bytes per pixel (RGBA)
  return width * height * 4;
};

/**
 * Gets image dimensions from a File object with memory validation
 * @param file The image file
 * @returns Promise resolving to image dimensions
 */
export const getImageDimensions = (file: File): Promise<ImageDimensions> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const cleanup = () => {
      if (img.src) {
        URL.revokeObjectURL(img.src);
      }
    };

    const timeoutId = setTimeout(() => {
      cleanup();
      reject(new Error('Image loading timed out'));
    }, 30000); // 30 second timeout

    img.onload = () => {
      clearTimeout(timeoutId);
      const memoryUsage = estimateMemoryUsage(img.width, img.height);
      if (memoryUsage > IMAGE_CONFIG.MAX_MEMORY_USAGE) {
        cleanup();
        reject(new Error('Image requires too much memory to process'));
      } else {
        resolve({ width: img.width, height: img.height });
      }
      cleanup();
    };

    img.onerror = () => {
      clearTimeout(timeoutId);
      cleanup();
      reject(new Error('Failed to load image'));
    };

    try {
      img.src = URL.createObjectURL(file);
    } catch (error) {
      clearTimeout(timeoutId);
      cleanup();
      reject(new Error('Failed to create object URL for image'));
    }
  });
};

/**
 * Converts a File object to an HTMLImageElement with enhanced error handling
 * @param file The image file to convert
 * @returns A promise that resolves to an HTMLImageElement
 */
export const fileToImage = async (file: File): Promise<HTMLImageElement> => {
  if (!(file instanceof File)) {
    throw new Error('Invalid input: expected File object');
  }

  validateImageType(file.type);
  const dimensions = await getImageDimensions(file);

  return new Promise((resolve, reject) => {
    const img = new Image();
    const cleanup = () => {
      if (img.src) {
        URL.revokeObjectURL(img.src);
      }
    };

    const timeoutId = setTimeout(() => {
      cleanup();
      reject(new Error('Image loading timed out'));
    }, 30000);

    img.onload = () => {
      clearTimeout(timeoutId);
      resolve(img);
    };

    img.onerror = () => {
      clearTimeout(timeoutId);
      cleanup();
      reject(new Error('Failed to load image'));
    };

    try {
      img.src = URL.createObjectURL(file);
    } catch (error) {
      clearTimeout(timeoutId);
      cleanup();
      reject(new Error('Failed to create object URL for image'));
    }
  });
};

/**
 * Calculate optimal dimensions while maintaining aspect ratio
 */
function calculateOptimalDimensions(width: number, height: number, maxDimension: number): { width: number; height: number } {
  const aspectRatio = width / height;
  let newWidth = width;
  let newHeight = height;

  if (width > height) {
    if (width > maxDimension) {
      newWidth = maxDimension;
      newHeight = Math.round(maxDimension / aspectRatio);
    }
  } else {
    if (height > maxDimension) {
      newHeight = maxDimension;
      newWidth = Math.round(maxDimension * aspectRatio);
    }
  }

  // Ensure dimensions are even numbers for better GPU processing
  newWidth = Math.floor(newWidth / 2) * 2;
  newHeight = Math.floor(newHeight / 2) * 2;

  return { width: newWidth, height: newHeight };
}

/**
 * Creates an optimized canvas context
 */
function createOptimizedContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d', {
    willReadFrequently: true,
    alpha: true,
    desynchronized: true
  });

  if (!ctx) {
    throw new Error('Failed to create canvas context');
  }

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = IMAGE_CONFIG.RESIZE_QUALITY;

  return ctx;
}

/**
 * Resizes an image using a multi-step approach for better quality
 */
function resizeImageWithSteps(img: HTMLImageElement, targetWidth: number, targetHeight: number): ImageData {
  // Calculate intermediate size for two-step resizing
  const intermediateWidth = Math.min(img.width, targetWidth * 2);
  const intermediateHeight = Math.min(img.height, targetHeight * 2);

  // Step 1: Create intermediate canvas
  const intermediateCanvas = document.createElement('canvas');
  intermediateCanvas.width = intermediateWidth;
  intermediateCanvas.height = intermediateHeight;
  const intermediateCtx = createOptimizedContext(intermediateCanvas);
  intermediateCtx.drawImage(img, 0, 0, intermediateWidth, intermediateHeight);

  // Step 2: Create final canvas
  const finalCanvas = document.createElement('canvas');
  finalCanvas.width = targetWidth;
  finalCanvas.height = targetHeight;
  const finalCtx = createOptimizedContext(finalCanvas);
  finalCtx.drawImage(intermediateCanvas, 0, 0, targetWidth, targetHeight);

  // Get final image data
  const imageData = finalCtx.getImageData(0, 0, targetWidth, targetHeight);

  // Clean up
  intermediateCanvas.width = 0;
  intermediateCanvas.height = 0;

  return imageData;
}

/**
 * Processes a file directly to get its ImageData with enhanced error handling and quality
 */
export const fileToImageData = async (
  file: File,
  options: ProcessingOptions = {}
): Promise<ImageData> => {
  try {
    const img = await fileToImage(file);
    
    // Use provided maxDimension or default
    const maxDim = options.maxDimension || IMAGE_CONFIG.WEBGL_MAX_DIMENSION / 2;
    
    // Calculate optimal dimensions
    const { width: targetWidth, height: targetHeight } = calculateOptimalDimensions(
      img.width,
      img.height,
      maxDim
    );

    // If image needs resizing
    if (targetWidth !== img.width || targetHeight !== img.height) {
      console.log(`Resizing image from ${img.width}x${img.height} to ${targetWidth}x${targetHeight}`);
      const resizedImageData = resizeImageWithSteps(img, targetWidth, targetHeight);
      
      // Clean up
      URL.revokeObjectURL(img.src);
      
      return resizedImageData;
    }

    // If no resizing needed, convert directly
    const result = imageToImageData(img);
    URL.revokeObjectURL(img.src);
    return result;
  } catch (error) {
    throw new Error(`Failed to process image: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

/**
 * Converts an HTMLImageElement to ImageData using canvas
 * @param img The image element to convert
 * @returns The ImageData object containing pixel data
 */
export const imageToImageData = (img: HTMLImageElement): ImageData => {
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    throw new Error('Could not get 2D context from canvas');
  }
  
  // Use high-quality image rendering
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  
  ctx.drawImage(img, 0, 0);
  return ctx.getImageData(0, 0, img.width, img.height);
};

/**
 * Converts ImageData back to a data URL
 * @param imageData The ImageData to convert
 * @param type The image MIME type (default: 'image/png')
 * @param quality The image quality for JPEGs (0-1, default: 0.8)
 * @returns A data URL string representing the image
 */
export const imageDataToDataURL = (
  imageData: ImageData,
  type: SupportedImageType | string = 'image/png',
  quality: number = 1.0 // Default to maximum quality
): string => {
  const canvas = document.createElement('canvas');
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  
  const ctx = canvas.getContext('2d', { 
    willReadFrequently: true,
    alpha: true // Preserve alpha channel
  });
  
  if (!ctx) {
    throw new Error('Could not get 2D context from canvas');
  }
  
  // Enable high-quality image rendering
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  
  ctx.putImageData(imageData, 0, 0);
  
  // Default to PNG if type is undefined
  const safeType = type || 'image/png';
  
  // Ensure it's a supported type
  try {
    validateImageType(safeType);
  } catch (e) {
    console.warn(`Invalid image type: ${safeType}, defaulting to PNG`);
    return canvas.toDataURL('image/png', quality);
  }
  
  return canvas.toDataURL(safeType, quality);
};

/**
 * Converts a data URL to a Blob
 * @param dataURL The data URL to convert
 * @returns A Blob representing the image
 */
export const dataURLToBlob = (dataURL: string): Blob => {
  const arr = dataURL.split(',');
  if (arr.length < 2) {
    throw new Error('Invalid data URL format');
  }
  
  const mimeMatch = arr[0].match(/:(.*?);/);
  if (!mimeMatch || !mimeMatch[1]) {
    console.warn('Missing MIME type in data URL, using image/png');
    const bstr = atob(arr[1]);
    const n = bstr.length;
    const u8arr = new Uint8Array(n);
    
    for (let i = 0; i < n; i++) {
      u8arr[i] = bstr.charCodeAt(i);
    }
    
    return new Blob([u8arr], { type: 'image/png' });
  }
  
  let mime = mimeMatch[1];
  
  // If mime type is undefined or not supported, default to PNG
  try {
    validateImageType(mime);
  } catch (e) {
    console.warn(`Invalid MIME type (${mime}), defaulting to PNG`);
    mime = 'image/png';
  }
  
  const bstr = atob(arr[1]);
  const n = bstr.length;
  const u8arr = new Uint8Array(n);
  
  for (let i = 0; i < n; i++) {
    u8arr[i] = bstr.charCodeAt(i);
  }
  
  return new Blob([u8arr], { type: mime });
};

/**
 * Get the original file type (mime type) from a File object
 * @param file The file to check
 * @returns The MIME type string
 */
export const getFileType = (file: File): SupportedImageType => {
  if (!(file instanceof File)) {
    throw new Error('Invalid input: expected File object');
  }
  
  // Default to PNG if no type is specified
  const type = file.type || 'image/png';
  validateImageType(type);
  return type as SupportedImageType;
};

/**
 * Check if an image will exceed WebGL limits and needs special handling
 * @param width Image width
 * @param height Image height
 * @returns True if image needs special handling
 */
export const requiresSpecialHandling = (width: number, height: number): boolean => {
  // Check for very large dimensions
  if (width > IMAGE_CONFIG.WEBGL_MAX_DIMENSION / 2 || height > IMAGE_CONFIG.WEBGL_MAX_DIMENSION / 2) {
    return true;
  }
  
  // Check for excessive memory usage
  const memoryEstimate = width * height * 4; // RGBA bytes
  if (memoryEstimate > IMAGE_CONFIG.MAX_MEMORY_USAGE / 2) {
    return true;
  }
  
  // Check if texture would exceed limits (width/height must be even)
  if (width * height > (IMAGE_CONFIG.WEBGL_MAX_DIMENSION / 2) ** 2) {
    return true;
  }
  
  return false;
};

/**
 * Get safe dimensions for WebGL processing
 * @param width Original width
 * @param height Original height
 * @returns Safe dimensions for processing
 */
export const getSafeDimensions = (width: number, height: number): ImageDimensions => {
  return calculateOptimalDimensions(width, height, IMAGE_CONFIG.WEBGL_MAX_DIMENSION / 4);
}; 