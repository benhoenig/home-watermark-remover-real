import { useState, useCallback, useEffect, useMemo } from 'react'
import { useDropzone, FileRejection } from 'react-dropzone'
import JSZip from 'jszip'
import { saveAs } from 'file-saver'
import './App.css'
import useWatermarkRemover from './hooks/useWatermarkRemover'
import { fileToImageData, imageDataToDataURL, getFileType, validateImageType } from './utils/imageUtils'

// Constants
const MAX_FILES = 50
const SUPPORTED_FORMATS = {
  'image/jpeg': [],
  'image/png': [],
  'image/webp': []
} as const

// Types
type ImageStatus = 'idle' | 'processing' | 'done' | 'error'

interface ImageFile {
  id: string;
  file: File;
  preview: string;
  processed?: string;
  status: ImageStatus;
  error?: string;
}

interface ProcessingError {
  message: string;
  details?: string;
}

function App() {
  const [images, setImages] = useState<ImageFile[]>([])
  const [processing, setProcessing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<ProcessingError | null>(null)

  // Use our custom hook for watermark removal
  const { processImage, modelLoaded, loading: modelLoading, error: modelError } = useWatermarkRemover({
    onModelLoaded: () => {
      console.log('Model loaded successfully')
      setError(null)
    },
    onError: (error) => {
      console.error('Model loading error:', error)
      setError({ message: 'Failed to load AI model', details: error })
    }
  })

  // Memoized values
  const processedCount = useMemo(() => 
    images.filter(img => img.status === 'done').length,
    [images]
  )

  const hasErrors = useMemo(() => 
    images.some(img => img.status === 'error'),
    [images]
  )

  // Handle file drop
  const onDrop = useCallback((acceptedFiles: File[], rejectedFiles: FileRejection[]) => {
    // Handle rejected files
    if (rejectedFiles.length > 0) {
      const errors = rejectedFiles.map(rejection => 
        `${rejection.file.name}: ${rejection.errors[0].message}`
      )
      setError({ 
        message: 'Some files were rejected', 
        details: errors.join('\n') 
      })
      return
    }

    // Validate total file count
    if (images.length + acceptedFiles.length > MAX_FILES) {
      setError({ 
        message: `Maximum ${MAX_FILES} images allowed`,
        details: `You tried to add ${acceptedFiles.length} files but only ${MAX_FILES - images.length} slots remaining`
      })
      return
    }

    try {
      // Create new image entries
      const newImages = acceptedFiles.map(file => {
        validateImageType(file.type)
        return {
          id: crypto.randomUUID(),
          file,
          preview: URL.createObjectURL(file),
          status: 'idle' as const
        }
      })
      
      setImages(prev => [...prev, ...newImages])
      setError(null)
    } catch (err) {
      setError({ 
        message: 'Error adding images',
        details: err instanceof Error ? err.message : 'Unknown error'
      })
    }
  }, [images.length])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: SUPPORTED_FORMATS,
    multiple: true,
    maxFiles: MAX_FILES,
    validator: (file) => {
      if (images.length >= MAX_FILES) {
        return {
          code: 'too-many-files',
          message: `Maximum ${MAX_FILES} images allowed`
        }
      }
      return null
    }
  })

  // Process images to remove watermarks
  const processImages = async () => {
    if (!modelLoaded || images.length === 0) return
    
    setProcessing(true)
    setProgress(0)
    setError(null)
    
    const imagesToProcess = images.filter(img => img.status === 'idle')
    let processed = 0
    
    try {
      for (const image of imagesToProcess) {
        try {
          // Update status to processing
          setImages(prev => 
            prev.map(img => 
              img.id === image.id 
                ? { ...img, status: 'processing' } 
                : img
            )
          )

          // Process image
          const imageData = await fileToImageData(image.file)
          await new Promise<void>((resolve, reject) => {
            processImage({
              id: image.id,
              imageData,
              quality: 'high',
              onComplete: (result) => {
                if (result.success && result.imageData) {
                  const dataURL = imageDataToDataURL(
                    result.imageData,
                    getFileType(image.file),
                    1.0 // Maximum quality
                  )
                  
                  setImages(prev => 
                    prev.map(img => 
                      img.id === image.id 
                        ? { ...img, processed: dataURL, status: 'done' } 
                        : img
                    )
                  )
                  resolve()
                } else {
                  const errorMsg = result.error || 'Unknown error'
                  setImages(prev => 
                    prev.map(img => 
                      img.id === image.id 
                        ? { ...img, status: 'error', error: errorMsg } 
                        : img
                    )
                  )
                  reject(new Error(errorMsg))
                }
              }
            })
          })

          processed++
          setProgress(Math.round((processed / imagesToProcess.length) * 100))
        } catch (err) {
          console.error(`Error processing image ${image.id}:`, err)
          setImages(prev => 
            prev.map(img => 
              img.id === image.id 
                ? { ...img, status: 'error', error: err instanceof Error ? err.message : 'Unknown error' } 
                : img
            )
          )
        }
      }
    } catch (err) {
      setError({
        message: 'Error processing images',
        details: err instanceof Error ? err.message : 'Unknown error'
      })
    } finally {
      setProcessing(false)
    }
  }

  // Download all processed images with original quality
  const downloadImages = async () => {
    const processedImages = images.filter(img => img.status === 'done')
    if (processedImages.length === 0) return
    
    try {
      const zip = new JSZip()
      
      for (const img of processedImages) {
        try {
          const response = await fetch(img.processed!)
          if (!response.ok) throw new Error(`Failed to fetch ${img.file.name}`)
          
          const blob = await response.blob()
          zip.file(img.file.name, blob)
        } catch (err) {
          console.error('Error adding file to zip:', err)
          setError({
            message: 'Error preparing download',
            details: `Failed to process ${img.file.name}`
          })
        }
      }
      
      const content = await zip.generateAsync({ 
        type: 'blob',
        compression: 'STORE' // No compression to maintain quality
      })
      
      saveAs(content, 'processed-images.zip')
      setError(null)
    } catch (err) {
      setError({
        message: 'Error creating download',
        details: err instanceof Error ? err.message : 'Unknown error'
      })
    }
  }

  // Remove an image from the list
  const removeImage = useCallback((id: string) => {
    setImages(prev => {
      const imageToRemove = prev.find(img => img.id === id)
      if (imageToRemove) {
        URL.revokeObjectURL(imageToRemove.preview)
        if (imageToRemove.processed) {
          URL.revokeObjectURL(imageToRemove.processed)
        }
      }
      return prev.filter(img => img.id !== id)
    })
  }, [])

  // Cleanup function to revoke object URLs on unmount
  useEffect(() => {
    return () => {
      images.forEach(image => {
        URL.revokeObjectURL(image.preview)
        if (image.processed) {
          URL.revokeObjectURL(image.processed)
        }
      })
    }
  }, [images])

  return (
    <div className="app-container">
      <header>
        <h1>AI Watermark Remover</h1>
        <p>Upload real estate images to remove watermarks</p>
      </header>

      <div className="demo-notification">
        <p><strong>⚠️ Demo Mode:</strong> This app is currently running with a simplified demonstration model. In a production environment, it would use a full AI inpainting model for better watermark removal.</p>
      </div>

      {error && (
        <div className="error-message">
          <p>{error.message}</p>
          {error.details && <p className="error-details">{error.details}</p>}
        </div>
      )}

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
                <p className="upload-info">
                  Supports JPEG, PNG, WEBP formats (max {MAX_FILES} files)
                </p>
              </div>
            )}
          </div>
        </section>

        {images.length > 0 && (
          <>
            <section className="actions">
              <button 
                onClick={processImages} 
                disabled={processing || modelLoading || !modelLoaded || images.length === 0}
                className="process-button"
              >
                {modelLoading ? 'Loading model...' : processing ? `Processing (${progress}%)` : 'Remove Watermarks'}
              </button>
              <button 
                onClick={downloadImages} 
                disabled={processedCount === 0}
                className="download-button"
              >
                Download Processed Images ({processedCount})
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
                        <span>Error: {image.error || 'Processing failed'}</span>
                      </div>
                    )}
                  </div>
                  <div className="image-info">
                    <span className="image-name">{image.file.name}</span>
                    <button 
                      className="remove-image"
                      onClick={() => removeImage(image.id)}
                      title="Remove image"
                    >
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
