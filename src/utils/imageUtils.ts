/**
 * Utility functions for image processing
 */

// Constants for image processing
const IMAGE_CONFIG = {
  MAX_DIMENSION: 4096,
  MIN_DIMENSION: 32,
  DEFAULT_QUALITY: 0.8,
  SUPPORTED_TYPES: ['image/jpeg', 'image/png', 'image/webp'] as const
} as const;

type SupportedImageType = typeof IMAGE_CONFIG.SUPPORTED_TYPES[number];

interface ImageDimensions {
  width: number;
  height: number;
}

/**
 * Validates image dimensions
 * @param width Image width
 * @param height Image height
 * @throws Error if dimensions are invalid
 */
export const validateImageDimensions = (width: number, height: number): void => {
  if (width < IMAGE_CONFIG.MIN_DIMENSION || height < IMAGE_CONFIG.MIN_DIMENSION) {
    throw new Error(`Image dimensions must be at least ${IMAGE_CONFIG.MIN_DIMENSION}x${IMAGE_CONFIG.MIN_DIMENSION} pixels`);
  }
  if (width > IMAGE_CONFIG.MAX_DIMENSION || height > IMAGE_CONFIG.MAX_DIMENSION) {
    throw new Error(`Image dimensions must not exceed ${IMAGE_CONFIG.MAX_DIMENSION}x${IMAGE_CONFIG.MAX_DIMENSION} pixels`);
  }
};

/**
 * Validates image type
 * @param type Image MIME type
 * @throws Error if type is not supported
 */
export const validateImageType = (type: string): void => {
  if (!IMAGE_CONFIG.SUPPORTED_TYPES.includes(type as SupportedImageType)) {
    throw new Error(`Unsupported image type: ${type}. Supported types are: ${IMAGE_CONFIG.SUPPORTED_TYPES.join(', ')}`);
  }
};

/**
 * Gets image dimensions from a File object
 * @param file The image file
 * @returns Promise resolving to image dimensions
 */
export const getImageDimensions = (file: File): Promise<ImageDimensions> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.width, height: img.height });
      URL.revokeObjectURL(img.src); // Clean up
    };
    img.onerror = () => {
      URL.revokeObjectURL(img.src); // Clean up
      reject(new Error('Failed to load image'));
    };
    img.src = URL.createObjectURL(file);
  });
};

/**
 * Converts a File object to an HTMLImageElement
 * @param file The image file to convert
 * @returns A promise that resolves to an HTMLImageElement
 */
export const fileToImage = async (file: File): Promise<HTMLImageElement> => {
  validateImageType(file.type);
  const dimensions = await getImageDimensions(file);
  validateImageDimensions(dimensions.width, dimensions.height);

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => {
      URL.revokeObjectURL(img.src);
      reject(new Error('Failed to load image'));
    };
    img.src = URL.createObjectURL(file);
  });
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
 * Processes a file directly to get its ImageData
 * @param file The image file to process
 * @returns A promise that resolves to ImageData
 */
export const fileToImageData = async (file: File): Promise<ImageData> => {
  const img = await fileToImage(file);
  return imageToImageData(img);
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
  const type = file.type || 'image/png';
  validateImageType(type);
  return type as SupportedImageType;
}; 