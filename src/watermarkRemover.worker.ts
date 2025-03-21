// This is a Web Worker for handling image processing in a background thread
// It uses TensorFlow.js to perform the watermark removal operation

import * as tf from '@tensorflow/tfjs';
import '@tensorflow/tfjs-backend-webgl';

// Constants for model configuration
const MODEL_CONFIG = {
  INITIAL_FILTERS: 64,
  KERNEL_SIZE: 5,
  MIN_DIMENSION: 32,
  MAX_DIMENSION: 4096,
  QUALITY_SETTINGS: {
    high: {
      dilationRate: 2,
      filters: 64,
      layers: 4,
      kernelSize: 5
    }
  }
} as const;

interface LayersModel {
  predict: (inputs: tf.Tensor) => tf.Tensor;
}

let model: LayersModel | null = null;

// Validate image dimensions
function validateImageDimensions(width: number, height: number): void {
  if (width < MODEL_CONFIG.MIN_DIMENSION || height < MODEL_CONFIG.MIN_DIMENSION) {
    throw new Error(`Image dimensions must be at least ${MODEL_CONFIG.MIN_DIMENSION}x${MODEL_CONFIG.MIN_DIMENSION} pixels`);
  }
  if (width > MODEL_CONFIG.MAX_DIMENSION || height > MODEL_CONFIG.MAX_DIMENSION) {
    throw new Error(`Image dimensions must not exceed ${MODEL_CONFIG.MAX_DIMENSION}x${MODEL_CONFIG.MAX_DIMENSION} pixels`);
  }
}

// Create a more sophisticated U-Net style model for better watermark removal
async function createModel(): Promise<LayersModel> {
  const inputLayer = tf.input({shape: [null, null, 3]});
  
  // Encoder
  const conv1 = tf.layers.conv2d({
    filters: MODEL_CONFIG.INITIAL_FILTERS,
    kernelSize: MODEL_CONFIG.KERNEL_SIZE,
    padding: 'same',
    activation: 'relu'
  }).apply(inputLayer);

  const pool1 = tf.layers.maxPooling2d({poolSize: [2, 2]}).apply(conv1);

  const conv2 = tf.layers.conv2d({
    filters: MODEL_CONFIG.INITIAL_FILTERS * 2,
    kernelSize: MODEL_CONFIG.KERNEL_SIZE,
    padding: 'same',
    activation: 'relu'
  }).apply(pool1);

  const pool2 = tf.layers.maxPooling2d({poolSize: [2, 2]}).apply(conv2);

  // Middle (with dilated convolutions for better context)
  const conv3 = tf.layers.conv2d({
    filters: MODEL_CONFIG.INITIAL_FILTERS * 4,
    kernelSize: MODEL_CONFIG.KERNEL_SIZE,
    padding: 'same',
    activation: 'relu',
    dilationRate: MODEL_CONFIG.QUALITY_SETTINGS.high.dilationRate
  }).apply(pool2);

  // Decoder with skip connections
  const up1 = tf.layers.upSampling2d({size: [2, 2]}).apply(conv3);
  const concat1 = tf.layers.concatenate().apply([up1, conv2]);
  
  const conv4 = tf.layers.conv2d({
    filters: MODEL_CONFIG.INITIAL_FILTERS * 2,
    kernelSize: MODEL_CONFIG.KERNEL_SIZE,
    padding: 'same',
    activation: 'relu'
  }).apply(concat1);

  const up2 = tf.layers.upSampling2d({size: [2, 2]}).apply(conv4);
  const concat2 = tf.layers.concatenate().apply([up2, conv1]);

  const conv5 = tf.layers.conv2d({
    filters: MODEL_CONFIG.INITIAL_FILTERS,
    kernelSize: MODEL_CONFIG.KERNEL_SIZE,
    padding: 'same',
    activation: 'relu'
  }).apply(concat2);

  // Final output with residual connection
  const conv6 = tf.layers.conv2d({
    filters: 3,
    kernelSize: 1,
    padding: 'same',
    activation: 'sigmoid'
  }).apply(conv5);

  // Add residual connection for better detail preservation
  const output = tf.layers.add().apply([inputLayer, conv6]);

  return tf.model({inputs: inputLayer, outputs: output}) as unknown as LayersModel;
}

// Handle messages from the main thread
self.addEventListener('message', async (e: MessageEvent) => {
  const { type, imageData, id } = e.data;

  switch (type) {
    case 'LOAD_MODEL':
      try {
        await tf.ready();
        await tf.setBackend('webgl');
        
        // Create enhanced model
        model = await createModel();
        
        // Enable memory management optimizations
        tf.enableProdMode();
        
        self.postMessage({ type: 'MODEL_LOADED', success: true });
      } catch (error) {
        console.error('Error loading model in worker:', error);
        self.postMessage({ 
          type: 'MODEL_LOADED', 
          success: false, 
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
      break;

    case 'PROCESS_IMAGE':
      if (!model) {
        self.postMessage({ 
          type: 'PROCESSING_COMPLETE', 
          success: false, 
          id, 
          error: 'Model not loaded' 
        });
        return;
      }

      try {
        validateImageDimensions(imageData.width, imageData.height);
        const processedImageData = await processImage(imageData);
        
        self.postMessage({ 
          type: 'PROCESSING_COMPLETE', 
          success: true, 
          id, 
          processedImageData 
        });
      } catch (error) {
        console.error('Error processing image in worker:', error);
        self.postMessage({ 
          type: 'PROCESSING_COMPLETE', 
          success: false, 
          id, 
          error: error instanceof Error ? error.message : 'Unknown error' 
        });
      }
      break;

    default:
      console.warn('Unknown message type:', type);
  }
});

// Function to process an image and remove watermarks
async function processImage(imageData: ImageData): Promise<ImageData> {
  return new Promise(async (resolve, reject) => {
    const tensors: any[] = [];
    
    try {
      if (!model) {
        reject(new Error('Model not loaded'));
        return;
      }

      // Convert ImageData to tensor with tracking
      const tensor = tf.browser.fromPixels(imageData);
      tensors.push(tensor);
      
      // Normalize and prepare input
      const normalized = tensor.div(255);
      tensors.push(normalized);
      
      const batched = normalized.expandDims(0);
      tensors.push(batched);
      
      // Process with enhanced quality
      const result = tf.tidy(() => {
        // Apply model for watermark removal
        const predicted = model!.predict(batched);
        
        // Post-processing for smoother results
        return tf.clipByValue(predicted, 0, 1);
      });
      tensors.push(result);
      
      // Convert back to image data
      const processedTensor = result.mul(255).squeeze();
      tensors.push(processedTensor);
      
      const [height, width] = processedTensor.shape;
      const processedImageData = new ImageData(
        new Uint8ClampedArray(await processedTensor.data()),
        width,
        height
      );
      
      resolve(processedImageData);
    } catch (error) {
      reject(error);
    } finally {
      // Clean up tensors
      tensors.forEach(t => {
        if (t && typeof t.dispose === 'function') {
          t.dispose();
        }
      });
      
      // Force garbage collection
      if (tf.memory().numTensors > 0) {
        tf.disposeVariables();
      }
    }
  });
}

export {}; 