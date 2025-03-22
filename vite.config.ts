import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 4000,
    host: true, // Listen on all addresses
    strictPort: true, // Exit if port is already in use
    open: true, // Open browser automatically
  },
  worker: {
    format: 'es',
  },
  build: {
    target: 'esnext',
    outDir: 'dist',
    minify: 'terser',
    rollupOptions: {
      output: {
        manualChunks: {
          tensorflow: ['@tensorflow/tfjs'],
          vendor: ['react', 'react-dom', 'react-dropzone', 'jszip', 'file-saver'],
        },
      },
    },
  },
  resolve: {
    dedupe: ['react', 'react-dom'],
  },
})
