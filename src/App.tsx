import { useState, useCallback, useEffect } from 'react'
import { useDropzone } from 'react-dropzone'
import JSZip from 'jszip'
import { saveAs } from 'file-saver'
import './App.css'
import useWatermarkRemover from './hooks/useWatermarkRemover'
import { fileToImageData, imageDataToDataURL, getFileType } from './utils/imageUtils'

interface ImageFile {
  id: string;
  file: File;
  preview: string;
  processed?: string;
  status: 'idle' | 'processing' | 'done' | 'error';
}

function App() {
  const [images, setImages] = useState<ImageFile[]>([])
  const [processing, setProcessing] = useState(false)
  const [progress, setProgress] = useState(0)

  // Use our custom hook for watermark removal
  const { processImage, modelLoaded, loading: modelLoading, error: modelError } = useWatermarkRemover({
    onModelLoaded: () => console.log('Model loaded successfully'),
    onError: (error) => console.error('Model loading error:', error)
  });

  // Handle file drop
  const onDrop = useCallback((acceptedFiles: File[]) => {
    const newImages = acceptedFiles.map(file => ({
      id: Math.random().toString(36).substring(2, 11),
      file,
      preview: URL.createObjectURL(file),
      status: 'idle' as const
    }))
    
    setImages((prev: ImageFile[]) => [...prev, ...newImages])
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/jpeg': [],
      'image/png': [],
      'image/webp': []
    },
    multiple: true
  })

  // Process images to remove watermarks
  const processImages = async () => {
    if (!modelLoaded || images.length === 0) return
    
    setProcessing(true)
    setProgress(0)
    
    // Process images sequentially
    const imagesToProcess = images.filter((img: ImageFile) => img.status === 'idle');
    
    for (let i = 0; i < imagesToProcess.length; i++) {
      const image = imagesToProcess[i];
      
      try {
        // Update status to processing
        setImages((prev: ImageFile[]) => 
          prev.map((img: ImageFile) => 
            img.id === image.id 
              ? { ...img, status: 'processing' } 
              : img
          )
        )

        // Convert file to ImageData for processing
        const imageData = await fileToImageData(image.file);
        
        // Process the image using our web worker
        await new Promise<void>((resolve) => {
          processImage({
            id: image.id,
            imageData,
            onComplete: (result: { success: boolean; imageData?: ImageData; error?: string }) => {
              if (result.success && result.imageData) {
                // Convert processed ImageData back to data URL
                const dataURL = imageDataToDataURL(
                  result.imageData,
                  getFileType(image.file)
                );
                
                // Update image with processed result
                setImages((prev: ImageFile[]) => 
                  prev.map((img: ImageFile) => 
                    img.id === image.id 
                      ? { ...img, processed: dataURL, status: 'done' } 
                      : img
                  )
                );
              } else {
                // Handle error
                console.error(`Error processing image ${image.id}:`, result.error);
                setImages((prev: ImageFile[]) => 
                  prev.map((img: ImageFile) => 
                    img.id === image.id 
                      ? { ...img, status: 'error' } 
                      : img
                  )
                );
              }
              resolve();
            }
          });
        });
      } catch (error) {
        console.error('Error processing image:', error);
        setImages((prev: ImageFile[]) => 
          prev.map((img: ImageFile) => 
            img.id === image.id 
              ? { ...img, status: 'error' } 
              : img
          )
        );
      }

      // Update progress
      setProgress(Math.round(((i + 1) / imagesToProcess.length) * 100));
    }
    
    setProcessing(false);
  }

  // Download all processed images
  const downloadImages = async () => {
    const zip = new JSZip()
    const processedImages = images.filter((img: ImageFile) => img.status === 'done')
    
    if (processedImages.length === 0) return
    
    // Add each processed image to the zip file
    for (const img of processedImages) {
      try {
        const response = await fetch(img.processed!)
        const blob = await response.blob()
        zip.file(img.file.name, blob)
      } catch (error) {
        console.error('Error adding file to zip:', error)
      }
    }
    
    // Generate and download the zip file
    const content = await zip.generateAsync({ type: 'blob' })
    saveAs(content, 'processed-images.zip')
  }

  // Remove an image from the list
  const removeImage = (id: string) => {
    setImages((prev: ImageFile[]) => {
      const filtered = prev.filter((img: ImageFile) => img.id !== id)
      return filtered
    })
  }

  // Cleanup function to revoke object URLs on unmount
  useEffect(() => {
    return () => {
      images.forEach((image: ImageFile) => {
        URL.revokeObjectURL(image.preview);
        if (image.processed && image.processed.startsWith('blob:')) {
          URL.revokeObjectURL(image.processed);
        }
      });
    };
  }, [images]);

  return (
    <div className="app-container">
      <header>
        <h1>AI Watermark Remover</h1>
        <p>Upload real estate images to remove watermarks</p>
      </header>

      <div className="demo-notification">
        <p><strong>⚠️ Demo Mode:</strong> This app is currently running with a simplified demonstration model. In a production environment, it would use a full AI inpainting model for better watermark removal.</p>
      </div>

      <main>
        <section className="upload-section">
          <div
            {...getRootProps({ className: `dropzone ${isDragActive ? 'active' : ''}` })}
          >
            <input {...getInputProps()} />
            {isDragActive ? (
              <p>Drop the images here...</p>
            ) : (
              <div className="upload-prompt">
                <p>Drag & drop images here, or click to select files</p>
                <p className="upload-info">Supports JPEG, PNG, WEBP formats</p>
              </div>
            )}
          </div>
        </section>

        {modelError && (
          <div className="error-message">
            <p>Error loading AI model: {modelError}</p>
            <p>Please refresh the page to try again.</p>
          </div>
        )}

        {images.length > 0 && (
          <>
            <section className="actions">
              <button 
                onClick={processImages} 
                disabled={processing || modelLoading || !modelLoaded || images.length === 0}
                className="process-button"
              >
                {modelLoading ? 'Loading model...' : processing ? 'Processing...' : 'Remove Watermarks'}
              </button>
              <button 
                onClick={downloadImages} 
                disabled={!images.some((img: ImageFile) => img.status === 'done')}
                className="download-button"
              >
                Download All
              </button>
            </section>

            {processing && (
              <div className="progress">
                <progress value={progress} max="100"></progress>
                <span>{progress}%</span>
              </div>
            )}

            <section className="image-gallery">
              {images.map((image: ImageFile) => (
                <div key={image.id} className="image-card">
                  <div className="image-preview">
                    <img src={image.preview} alt={image.file.name} />
                    {image.processed && (
                      <div className="processed-overlay">
                        <img src={image.processed} alt={`Processed ${image.file.name}`} />
                      </div>
                    )}
                    {image.status === 'processing' && (
                      <div className="processing-overlay">
                        <span>Processing...</span>
                      </div>
                    )}
                    {image.status === 'error' && (
                      <div className="error-overlay">
                        <span>Error processing</span>
                      </div>
                    )}
                  </div>
                  <div className="image-info">
                    <span className="image-name">{image.file.name}</span>
                    <button className="remove-image" onClick={() => removeImage(image.id)}>
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </section>
          </>
        )}
      </main>

      <footer>
        <p>Powered by TensorFlow.js - All processing happens locally in your browser.</p>
      </footer>
    </div>
  )
}

export default App
