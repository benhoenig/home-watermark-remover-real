import { useState, useEffect, useCallback } from 'react';

interface WatermarkRemoverOptions {
  onModelLoaded?: () => void;
  onError?: (error: string) => void;
}

interface ProcessImageOptions {
  id: string;
  imageData: ImageData;
  onComplete?: (result: { id: string; success: boolean; imageData?: ImageData; error?: string }) => void;
}

export function useWatermarkRemover(options?: WatermarkRemoverOptions) {
  const [worker, setWorker] = useState<Worker | null>(null);
  const [modelLoaded, setModelLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Initialize worker
  useEffect(() => {
    if (typeof Worker === 'undefined') {
      setError('Web Workers are not supported in this browser.');
      return;
    }

    try {
      // Create a new worker
      const newWorker = new Worker(
        new URL('../watermarkRemover.worker.ts', import.meta.url),
        { type: 'module' }
      );

      // Set up message handler
      newWorker.onmessage = (e) => {
        const { type, success, error: workerError } = e.data;

        if (type === 'MODEL_LOADED') {
          setLoading(false);
          setModelLoaded(success);

          if (success) {
            options?.onModelLoaded?.();
          } else if (workerError) {
            setError(workerError);
            options?.onError?.(workerError);
          }
        }
      };

      // Save worker to state
      setWorker(newWorker);

      // Load model immediately
      setLoading(true);
      newWorker.postMessage({ type: 'LOAD_MODEL' });

      // Clean up the worker on unmount
      return () => {
        newWorker.terminate();
      };
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to initialize web worker');
      options?.onError?.(err instanceof Error ? err.message : 'Failed to initialize web worker');
      setLoading(false);
    }
  }, []);

  // Process image function
  const processImage = useCallback(
    ({ id, imageData, onComplete }: ProcessImageOptions) => {
      if (!worker || !modelLoaded) {
        const errorMessage = !worker 
          ? 'Worker not initialized' 
          : 'Model not loaded yet';
        
        onComplete?.({ id, success: false, error: errorMessage });
        return;
      }

      // Set up one-time message handler for this specific process
      const messageHandler = (e: MessageEvent) => {
        const { type, id: resultId, success, processedImageData, error: processingError } = e.data;

        if (type === 'PROCESSING_COMPLETE' && id === resultId) {
          onComplete?.({
            id,
            success,
            imageData: success ? processedImageData : undefined,
            error: success ? undefined : processingError
          });
          
          // Remove this handler after processing is complete
          worker.removeEventListener('message', messageHandler);
        }
      };

      worker.addEventListener('message', messageHandler);

      // Send image data to worker for processing
      worker.postMessage({
        type: 'PROCESS_IMAGE',
        id,
        imageData
      });
    },
    [worker, modelLoaded]
  );

  return {
    processImage,
    modelLoaded,
    loading,
    error
  };
}

export default useWatermarkRemover; 