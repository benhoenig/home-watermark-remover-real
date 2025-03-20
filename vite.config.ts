import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
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
