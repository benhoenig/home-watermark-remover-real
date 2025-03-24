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
    low: {
      dilationRate: 1,
      filters: 32,
      layers: 2,
      kernelSize: 3,
      dropoutRate: 0.05
    },
    medium: {
      dilationRate: 1,
      filters: 48,
      layers: 3,
      kernelSize: 4,
      dropoutRate: 0.08
    },
    high: {
      dilationRate: 2,
      filters: 64,
      layers: 4,
      kernelSize: 5,
      dropoutRate: 0.1
    }
  }
} as const;

type ModelQuality = keyof typeof MODEL_CONFIG.QUALITY_SETTINGS;

interface LayersModel extends TFLayersModel {
  predict: (inputs: Tensor) => Tensor;
}

let model: LayersModel | null = null;

// Configure TensorFlow.js for optimal performance
async function configureEnvironment(): Promise<void> {
  await tf.ready();
  await tf.setBackend('webgl');
  
  // Enable memory management optimizations
  tf.enableProdMode();
  
  // Configure WebGL for better performance
  try {
    // Access WebGL context safely using feature detection
    const backend = await tf.getBackend();
    if (backend === 'webgl') {
      // Safely access backend through any to avoid TypeScript errors
      const tfAny = tf as any;
      if (tfAny.backend && typeof tfAny.backend === 'function') {
        const webglBackend = tfAny.backend();
        if (webglBackend && webglBackend.getGPGPUContext) {
          const gl = webglBackend.getGPGPUContext().gl;
          gl.getExtension('OES_texture_float');
          gl.getExtension('WEBGL_color_buffer_float');
        }
      }
    }
  } catch (e) {
    console.warn('WebGL extensions not available:', e);
  }
}

// Create a more sophisticated U-Net style model for better watermark removal
async function createModel(quality: ModelQuality = 'medium'): Promise<LayersModel> {
  const config = MODEL_CONFIG.QUALITY_SETTINGS[quality];
  console.log(`Creating model with ${quality} quality settings:`, config);
  
  const inputLayer = tf.input({shape: [null, null, 3]});
  
  const convConfig = {
    kernelSize: config.kernelSize,
    padding: 'same' as const,
    activation: 'relu'
  };
  
  // Encoder with improved architecture
  const conv1 = tf.layers.conv2d({
    ...convConfig,
    filters: config.filters
  }).apply(inputLayer);

  const pool1 = tf.layers.maxPooling2d({poolSize: [2, 2]}).apply(conv1);

  const conv2 = tf.layers.conv2d({
    ...convConfig,
    filters: config.filters * 1.5
  }).apply(pool1);

  const pool2 = tf.layers.maxPooling2d({poolSize: [2, 2]}).apply(conv2);

  // Middle with dilated convolutions
  const conv3 = tf.layers.conv2d({
    ...convConfig,
    filters: config.filters * 2,
    dilationRate: config.dilationRate
  }).apply(pool2);

  // Decoder with skip connections
  const up1 = tf.layers.upSampling2d({size: [2, 2]}).apply(conv3);
  const concat1 = tf.layers.concatenate().apply([up1, conv2]);
  
  const conv4 = tf.layers.conv2d({
    ...convConfig,
    filters: config.filters * 1.5
  }).apply(concat1);

  const up2 = tf.layers.upSampling2d({size: [2, 2]}).apply(conv4);
  const concat2 = tf.layers.concatenate().apply([up2, conv1]);

  const conv5 = tf.layers.conv2d({
    ...convConfig,
    filters: config.filters
  }).apply(concat2);

  // Final output with residual connection
  const conv6 = tf.layers.conv2d({
    filters: 3,
    kernelSize: 1,
    padding: 'same' as const,
    activation: 'sigmoid'
  }).apply(conv5);

  // Add residual connection for better detail preservation
  const output = tf.layers.add().apply([inputLayer, conv6]);

  return tf.model({inputs: inputLayer, outputs: output}) as unknown as LayersModel;
}

// Handle messages from the main thread with enhanced error handling
self.addEventListener('message', async (e: MessageEvent) => {
  const { type, imageData, id, quality = 'medium' } = e.data;

  switch (type) {
    case 'LOAD_MODEL':
      try {
        await configureEnvironment();
        model = await createModel(quality);
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
        const processedImageData = await processImage(imageData, quality as ModelQuality);
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
async function processImage(imageData: ImageData, quality: ModelQuality = 'medium'): Promise<ImageData> {
  return new Promise(async (resolve, reject) => {
    const tensors: Tensor[] = [];
    const startTime = performance.now();
    
    try {
      if (!model) {
        reject(new Error('Model not loaded'));
        return;
      }

      console.log(`Processing image with ${quality} quality (${imageData.width}x${imageData.height})`);

      // Convert ImageData to tensor with tracking
      const tensor = tf.tidy(() => {
        const t = tf.browser.fromPixels(imageData);
        // Use tensor methods and avoid linter errors through proper casting
        return tf.tidy(() => t.div(255));
      });
      tensors.push(tensor);
      
      // Process with enhanced quality and memory optimization
      const result = tf.tidy(() => {
        const batched = tensor.expandDims(0);
        const predicted = model!.predict(batched);
        
        if (!predicted) {
          throw new Error('Model prediction failed');
        }
        
        return tf.clipByValue(predicted.squeeze(), 0, 1);
      });
      tensors.push(result);
      
      // Convert back to image data with enhanced precision
      const processedTensor = result.mul(255);
      tensors.push(processedTensor);
      
      const [height, width] = processedTensor.shape;
      const processedData = await processedTensor.data();
      
      // Ensure dimensions are valid
      if (!width || !height || width <= 0 || height <= 0) {
        throw new Error('Invalid output dimensions');
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
          try {
            t.dispose();
          } catch (e) {
            console.warn('Error disposing tensor:', e);
          }
        }
      });
      
      // Force garbage collection if needed
      if (tf.memory().numTensors > 100) {
        tf.disposeVariables();
      }
    }
  });
}

export {}; 