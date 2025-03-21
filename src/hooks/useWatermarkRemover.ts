import { useState, useEffect, useCallback, useRef } from 'react';

// Types for hook options and results
interface WatermarkRemoverOptions {
  onModelLoaded?: () => void;
  onError?: (error: string) => void;
  onProgress?: (progress: number) => void;
}

interface ProcessImageOptions {
  id: string;
  imageData: ImageData;
  onComplete?: (result: ProcessImageResult) => void;
}

interface ProcessImageResult {
  id: string;
  success: boolean;
  imageData?: ImageData;
  error?: string;
}

interface WorkerMessage {
  type: 'MODEL_LOADED' | 'PROCESSING_COMPLETE';
  success: boolean;
  error?: string;
  id?: string;
  processedImageData?: ImageData;
}

export function useWatermarkRemover(options?: WatermarkRemoverOptions) {
  const [worker, setWorker] = useState<Worker | null>(null);
  const [modelLoaded, setModelLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  
  // Use ref for options to avoid unnecessary effect triggers
  const optionsRef = useRef(options);
  optionsRef.current = options;

  // Initialize worker
  useEffect(() => {
    if (typeof Worker === 'undefined') {
      const errorMsg = 'Web Workers are not supported in this browser.';
      setError(errorMsg);
      optionsRef.current?.onError?.(errorMsg);
      return;
    }

    let mounted = true;

    const initializeWorker = async () => {
      try {
        setLoading(true);
        setError(null);

        // Create a new worker
        const newWorker = new Worker(
          new URL('../watermarkRemover.worker.ts', import.meta.url),
          { type: 'module' }
        );

        // Set up message handler
        newWorker.onmessage = (e: MessageEvent<WorkerMessage>) => {
          if (!mounted) return;

          const { type, success, error: workerError } = e.data;

          if (type === 'MODEL_LOADED') {
            setLoading(false);
            setModelLoaded(success);

            if (success) {
              optionsRef.current?.onModelLoaded?.();
            } else if (workerError) {
              setError(workerError);
              optionsRef.current?.onError?.(workerError);
            }
          }
        };

        // Handle worker errors
        newWorker.onerror = (e: ErrorEvent) => {
          if (!mounted) return;
          
          const errorMsg = `Worker error: ${e.message}`;
          setError(errorMsg);
          optionsRef.current?.onError?.(errorMsg);
          setLoading(false);
        };

        if (mounted) {
          setWorker(newWorker);
          // Load model immediately
          newWorker.postMessage({ type: 'LOAD_MODEL' });
        }
      } catch (err) {
        if (!mounted) return;
        
        const errorMsg = err instanceof Error ? err.message : 'Failed to initialize web worker';
        setError(errorMsg);
        optionsRef.current?.onError?.(errorMsg);
        setLoading(false);
      }
    };

    initializeWorker();

    // Clean up function
    return () => {
      mounted = false;
      if (worker) {
        worker.terminate();
      }
    };
  }, []);

  // Process image function with improved error handling and type safety
  const processImage = useCallback(
    ({ id, imageData, onComplete }: ProcessImageOptions) => {
      if (!worker || !modelLoaded) {
        const errorMessage = !worker 
          ? 'Worker not initialized' 
          : 'Model not loaded yet';
        
        onComplete?.({
          id,
          success: false,
          error: errorMessage
        });
        return;
      }

      // Set up one-time message handler for this specific process
      const messageHandler = (e: MessageEvent<WorkerMessage>) => {
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
    error,
    reset: useCallback(() => {
      setError(null);
      setModelLoaded(false);
    }, [])
  };
}

export default useWatermarkRemover; 