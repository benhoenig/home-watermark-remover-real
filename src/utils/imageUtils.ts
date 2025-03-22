/**
 * Utility functions for image processing
 */

// Constants for image processing
const IMAGE_CONFIG = {
  MAX_DIMENSION: 4096,
  MIN_DIMENSION: 32,
  DEFAULT_QUALITY: 0.8,
  SUPPORTED_TYPES: ['image/jpeg', 'image/png', 'image/webp'] as const,
  WEBGL_MAX_DIMENSION: 16384,
  CHUNK_SIZE: 4096, // Size for progressive loading
  MAX_MEMORY_USAGE: 1024 * 1024 * 1024 // 1GB max memory usage
} as const;

type SupportedImageType = typeof IMAGE_CONFIG.SUPPORTED_TYPES[number];

interface ImageDimensions {
  width: number;
  height: number;
}

interface ProcessingOptions {
  quality?: number;
  preserveMetadata?: boolean;
  progressive?: boolean;
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
 * Creates a canvas context with optimal settings
 * @param canvas The canvas element
 * @returns The 2D rendering context
 */
const createOptimalContext = (canvas: HTMLCanvasElement): CanvasRenderingContext2D => {
  const ctx = canvas.getContext('2d', {
    willReadFrequently: true,
    alpha: true,
    desynchronized: true, // Improve performance when available
  });

  if (!ctx) {
    throw new Error('Could not get 2D context from canvas');
  }

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  return ctx;
};

/**
 * Resizes an image while maintaining aspect ratio with enhanced quality
 * @param img The image element to resize
 * @param maxDimension The maximum allowed dimension
 * @returns A new canvas with the resized image
 */
const resizeImage = (img: HTMLImageElement, maxDimension: number): HTMLCanvasElement => {
  let width = img.width;
  let height = img.height;

  // Calculate new dimensions while maintaining aspect ratio
  if (width > height) {
    if (width > maxDimension) {
      height = Math.round((height * maxDimension) / width);
      width = maxDimension;
    }
  } else {
    if (height > maxDimension) {
      width = Math.round((width * maxDimension) / height);
      height = maxDimension;
    }
  }

  // Create temporary canvases for multi-step resizing
  const tempCanvas1 = document.createElement('canvas');
  const tempCanvas2 = document.createElement('canvas');
  
  // Step 1: Resize to intermediate size if needed (reduces artifacts)
  const useStepResize = width < img.width / 2 || height < img.height / 2;
  if (useStepResize) {
    const stepWidth = Math.round(img.width / 2);
    const stepHeight = Math.round(img.height / 2);
    
    tempCanvas1.width = stepWidth;
    tempCanvas1.height = stepHeight;
    const ctx1 = createOptimalContext(tempCanvas1);
    ctx1.drawImage(img, 0, 0, stepWidth, stepHeight);
    
    // Step 2: Resize to final size
    tempCanvas2.width = width;
    tempCanvas2.height = height;
    const ctx2 = createOptimalContext(tempCanvas2);
    ctx2.drawImage(tempCanvas1, 0, 0, width, height);
  } else {
    // Single step resize for smaller adjustments
    tempCanvas2.width = width;
    tempCanvas2.height = height;
    const ctx2 = createOptimalContext(tempCanvas2);
    ctx2.drawImage(img, 0, 0, width, height);
  }

  // Clean up
  const finalCanvas = document.createElement('canvas');
  finalCanvas.width = width;
  finalCanvas.height = height;
  const finalCtx = createOptimalContext(finalCanvas);
  finalCtx.drawImage(tempCanvas2, 0, 0);

  // Clean up temporary canvases
  tempCanvas1.width = 0;
  tempCanvas1.height = 0;
  tempCanvas2.width = 0;
  tempCanvas2.height = 0;

  return finalCanvas;
};

/**
 * Processes a file directly to get its ImageData with enhanced error handling and quality
 * @param file The image file to process
 * @param options Processing options
 * @returns A promise that resolves to ImageData
 */
export const fileToImageData = async (
  file: File,
  options: ProcessingOptions = {}
): Promise<ImageData> => {
  try {
    const img = await fileToImage(file);
    
    // Check if image needs resizing
    const needsWebGLResize = img.width > IMAGE_CONFIG.WEBGL_MAX_DIMENSION || 
                            img.height > IMAGE_CONFIG.WEBGL_MAX_DIMENSION;
    const needsModelResize = img.width > IMAGE_CONFIG.MAX_DIMENSION || 
                            img.height > IMAGE_CONFIG.MAX_DIMENSION;
    
    if (needsWebGLResize || needsModelResize) {
      const maxDimension = needsWebGLResize ? 
        IMAGE_CONFIG.WEBGL_MAX_DIMENSION : 
        IMAGE_CONFIG.MAX_DIMENSION;
      
      console.log(`Resizing image from ${img.width}x${img.height} to fit within ${maxDimension}x${maxDimension}`);
      
      const resizedCanvas = resizeImage(img, maxDimension);
      const ctx = createOptimalContext(resizedCanvas);
      
      // Clean up original image
      URL.revokeObjectURL(img.src);
      
      return ctx.getImageData(0, 0, resizedCanvas.width, resizedCanvas.height);
    }

    const result = imageToImageData(img);
    
    // Clean up
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
  type: SupportedImageType = 'image/png',
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
  return canvas.toDataURL(type, quality);
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
  if (!mimeMatch) {
    throw new Error('Invalid data URL format: missing MIME type');
  }
  
  const mime = mimeMatch[1];
  validateImageType(mime);
  
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
  
  const type = file.type || 'image/png';
  validateImageType(type);
  return type as SupportedImageType;
}; 