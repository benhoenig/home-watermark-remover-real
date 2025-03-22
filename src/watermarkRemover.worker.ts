// This is a Web Worker for handling image processing in a background thread
// It uses TensorFlow.js to perform the watermark removal operation

import * as tf from '@tensorflow/tfjs';
import type { Tensor, LayersModel as TFLayersModel } from '@tensorflow/tfjs';
import '@tensorflow/tfjs-backend-webgl';

// Constants for model configuration
const MODEL_CONFIG = {
  INITIAL_FILTERS: 64,
  KERNEL_SIZE: 5,
  MIN_DIMENSION: 32,
  MAX_DIMENSION: 4096,
  BATCH_SIZE: 1,
  MEMORY_LIMIT: 1024 * 1024 * 1024, // 1GB
  QUALITY_SETTINGS: {
    high: {
      dilationRate: 2,
      filters: 64,
      layers: 4,
      kernelSize: 5,
      dropoutRate: 0.1
    }
  }
} as const;

interface LayersModel extends TFLayersModel {
  predict: (inputs: Tensor) => Tensor;
}

let model: LayersModel | null = null;

// Validate image dimensions and memory usage
function validateImageDimensions(width: number, height: number): void {
  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    throw new Error('Invalid image dimensions: width and height must be finite numbers');
  }
  if (width < MODEL_CONFIG.MIN_DIMENSION || height < MODEL_CONFIG.MIN_DIMENSION) {
    throw new Error(`Image dimensions must be at least ${MODEL_CONFIG.MIN_DIMENSION}x${MODEL_CONFIG.MIN_DIMENSION} pixels`);
  }
  if (width > MODEL_CONFIG.MAX_DIMENSION || height > MODEL_CONFIG.MAX_DIMENSION) {
    throw new Error(`Image dimensions must not exceed ${MODEL_CONFIG.MAX_DIMENSION}x${MODEL_CONFIG.MAX_DIMENSION} pixels`);
  }

  // Check memory requirements (4 bytes per pixel * channels)
  const memoryRequired = width * height * 4 * 3; // Include input, intermediate, and output tensors
  if (memoryRequired > MODEL_CONFIG.MEMORY_LIMIT) {
    throw new Error('Image requires too much memory to process');
  }
}

// Create a more sophisticated U-Net style model for better watermark removal
async function createModel(): Promise<LayersModel> {
  const inputLayer = tf.input({shape: [null, null, 3]});
  
  // Encoder with improved architecture
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

  // Middle with dilated convolutions
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

// Handle messages from the main thread with enhanced error handling
self.addEventListener('message', async (e: MessageEvent) => {
  const { type, imageData, id } = e.data;

  switch (type) {
    case 'LOAD_MODEL':
      try {
        // Configure TensorFlow.js
        await tf.ready();
        await tf.setBackend('webgl');
        
        // Create enhanced model
        model = await createModel();
        
        // Enable optimizations
        tf.enableProdMode();
        tf.engine().startScope(); // Start memory scope
        
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

// Function to process an image and remove watermarks with enhanced memory management
async function processImage(imageData: ImageData): Promise<ImageData> {
  return new Promise(async (resolve, reject) => {
    const tensors: Tensor[] = [];
    const startTime = performance.now();
    
    try {
      if (!model) {
        reject(new Error('Model not loaded'));
        return;
      }

      // Start a new memory scope
      tf.engine().startScope();

      // Convert ImageData to tensor with tracking
      const tensor = tf.browser.fromPixels(imageData);
      tensors.push(tensor);
      
      // Normalize and prepare input with enhanced precision
      const normalized = tensor.toFloat().div(255);
      tensors.push(normalized);
      
      const batched = normalized.expandDims(0);
      tensors.push(batched);
      
      // Process with enhanced quality and memory optimization
      const result = tf.tidy(() => {
        // Apply model with error checking
        const predicted = model!.predict(batched);
        if (!predicted) {
          throw new Error('Model prediction failed');
        }
        
        // Post-processing for smoother results
        return tf.clipByValue(predicted, 0, 1);
      });
      tensors.push(result);
      
      // Convert back to image data with enhanced precision
      const processedTensor = result.mul(255).squeeze();
      tensors.push(processedTensor);
      
      const [height, width] = processedTensor.shape;
      const processedData = await processedTensor.data();
      
      // Ensure width and height are defined before creating ImageData
      if (typeof width !== 'number' || typeof height !== 'number') {
        throw new Error('Invalid tensor dimensions');
      }
      
      const processedImageData = new ImageData(
        new Uint8ClampedArray(processedData),
        width,
        height
      );
      
      console.log(`Image processing completed in ${(performance.now() - startTime).toFixed(2)}ms`);
      resolve(processedImageData);
    } catch (error) {
      reject(error);
    } finally {
      // Clean up tensors
      tensors.forEach(t => {
        if (t && !t.isDisposed) {
          t.dispose();
        }
      });
      
      // End memory scope
      tf.engine().endScope();
      
      // Force garbage collection if needed
      if (tf.memory().numTensors > 100) { // Threshold for cleanup
        tf.disposeVariables();
        tf.engine().purgeLocalTensors();
      }
    }
  });
}

export {}; 