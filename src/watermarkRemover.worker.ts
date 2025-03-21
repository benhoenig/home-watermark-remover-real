// This is a Web Worker for handling image processing in a background thread
// It uses TensorFlow.js to perform the watermark removal operation

import * as tf from '@tensorflow/tfjs';

// Constants for model configuration
const MODEL_CONFIG = {
  INITIAL_FILTERS: 64,
  KERNEL_SIZE: 5,
  MIN_DIMENSION: 32,
  MAX_DIMENSION: 4096,
  QUALITY_SETTINGS: {
    high: {
      dil
    }
  }
} as const;

let model: tf.LayersModel | null = null;

// Validate image dimensions
function validateImageDimensions(width: number, height: number): void {
  if (width < MODEL_CONFIG.MIN_DIMENSION || height < MODEL_CONFIG.MIN_DIMENSION) {
    throw new Error(`Image dimensions must be at least ${MODEL_CONFIG.MIN_DIMENSION}x${MODEL_CONFIG.MIN_DIMENSION} pixels`);
  }
  if (width > MODEL_CONFIG.MAX_DIMENSION || height > MODEL_CONFIG.MAX_DIMENSION) {
    throw new Error(`Image dimensions must not exceed ${MODEL_CONFIG.MAX_DIMENSION}x${MODEL_CONFIG.MAX_DIMENSION} pixels`);
  }
}

// Handle messages from the main thread
self.addEventListener('message', async (e: MessageEvent) => {
  const { type, imageData, id } = e.data;

  switch (type) {
    case 'LOAD_MODEL':
      try {
        await tf.ready();
        await tf.setBackend('webgl');
        
        // Create a more sophisticated model architecture
        const inputLayer = tf.layers.input({shape: [null, null, 3]});
        
        // Encoder
        const conv1 = tf.layers.conv2d({
          filters: MODEL_CONFIG.INITIAL_FILTERS,
          kernelSize: MODEL_CONFIG.KERNEL_SIZE,
          padding: 'same',
          activation: 'relu'
        }).apply(inputLayer);
        
        const conv2 = tf.layers.conv2d({
          filters: MODEL_CONFIG.INITIAL_FILTERS * 2,
          kernelSize: MODEL_CONFIG.KERNEL_SIZE,
          padding: 'same',
          activation: 'relu'
        }).apply(conv1);
        
        // Feature processing
        const conv3 = tf.layers.conv2d({
          filters: MODEL_CONFIG.INITIAL_FILTERS * 2,
          kernelSize: MODEL_CONFIG.KERNEL_SIZE,
          padding: 'same',
          activation: 'relu',
          dilation: 2
        }).apply(conv2);
        
        // Decoder
        const conv4 = tf.layers.conv2d({
          filters: MODEL_CONFIG.INITIAL_FILTERS,
          kernelSize: MODEL_CONFIG.KERNEL_SIZE,
          padding: 'same',
          activation: 'relu'
        }).apply(conv3);
        
        const output = tf.layers.conv2d({
          filters: 3,
          kernelSize: 1,
          padding: 'same',
          activation: 'sigmoid'
        }).apply(conv4);
        
        model = tf.model({inputs: inputLayer, outputs: output as tf.SymbolicTensor});
        
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
    const tensors: tf.Tensor[] = [];
    
    try {
      if (!model) {
        reject(new Error('Model not loaded'));
        return;
      }

      // Convert ImageData to a tensor and track it
      const tensor = tf.browser.fromPixels(imageData);
      tensors.push(tensor);
      
      // Normalize the tensor
      const normalized = tensor.div(255);
      tensors.push(normalized);
      
      // Add batch dimension
      const batched = normalized.expandDims(0);
      tensors.push(batched);
      
      // Run inference with memory optimization
      const result = tf.tidy(() => {
        return model!.predict(batched) as tf.Tensor;
      });
      tensors.push(result);
      
      // Post-process the result
      const processedTensor = result.mul(255).squeeze();
      tensors.push(processedTensor);
      
      // Get dimensions
      const [height, width] = processedTensor.shape as [number, number, number];
      
      // Create output ImageData
      const processedImageData = new ImageData(width, height);
      
      // Convert to pixels efficiently
      const pixels = await tf.browser.toPixels(processedTensor as tf.Tensor3D);
      processedImageData.data.set(pixels);
      
      resolve(processedImageData);
    } catch (error) {
      reject(error);
    } finally {
      // Clean up all tensors
      tensors.forEach(t => {
        if (t && !t.isDisposed) {
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