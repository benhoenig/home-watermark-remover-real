/**
 * Utility functions for image processing
 */

/**
 * Converts a File object to an HTMLImageElement
 * @param file The image file to convert
 * @returns A promise that resolves to an HTMLImageElement
 */
export const fileToImage = (file: File): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
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
  
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Could not get 2D context from canvas');
  }
  
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
  type: string = 'image/png',
  quality: number = 0.8
): string => {
  const canvas = document.createElement('canvas');
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Could not get 2D context from canvas');
  }
  
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
    throw new Error('Invalid data URL');
  }
  
  const mime = arr[0].match(/:(.*?);/)?.[1];
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  
  return new Blob([u8arr], { type: mime });
};

/**
 * Get the original file type (mime type) from a File object
 * @param file The file to check
 * @returns The MIME type string
 */
export const getFileType = (file: File): string => {
  return file.type || 'image/png';
}; 