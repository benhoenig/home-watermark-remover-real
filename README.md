# AI Watermark Remover

A browser-based app for removing watermarks from real estate images using AI. This application runs entirely in your browser with no server required.

## Features

- **Upload multiple images** at once (supports bulk uploads of 40-50 images)
- **Remove watermarks** using AI directly in your browser
- **Preview** original and processed images side by side
- **Bulk download** all processed images as a ZIP file
- **Completely client-side** - no data is sent to any server

## Technology Stack

- **Frontend:** React with TypeScript
- **AI Processing:** TensorFlow.js for in-browser AI image processing
- **File Management:** react-dropzone (for uploads) and JSZip (for downloads)
- **Performance:** Web Workers for background processing

## Quick Start

1. Clone this repository
2. Install dependencies with `npm install`
3. Run the development server with `npm run dev`
4. Open your browser to the URL shown in the terminal

## How to Use

1. **Upload Images:**
   - Drag and drop images onto the upload area
   - Or click to select files from your device
   - Supports JPEG, PNG, and WEBP formats

2. **Process Images:**
   - Click "Remove Watermarks" to start the AI processing
   - A progress bar will show the current status
   - Each image will display a side-by-side comparison when completed

3. **Download Results:**
   - Click "Download All" to get a ZIP file with all processed images
   - Individual images can be removed from the queue if needed

## Development

### Prerequisites

- Node.js 16+
- npm or yarn

### Installation

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

## How It Works

This app uses TensorFlow.js to run an inpainting model directly in your web browser. The AI model identifies watermarked areas and fills them in with content that matches the surrounding image. All processing happens locally on your device - no images are uploaded to any external servers.

For performance reasons, image processing is offloaded to Web Workers to prevent the UI from freezing during intensive operations.

## License

MIT
