declare module '@tensorflow/tfjs' {
  export * from '@tensorflow/tfjs';
}

declare module '*.worker.ts' {
  const WorkerConstructor: {
    new (): Worker;
  };
  export default WorkerConstructor;
}

declare module 'file-saver' {
  export function saveAs(data: Blob, filename?: string): void;
}

declare module 'jszip' {
  export default class JSZip {
    file(name: string, data: Blob | string): this;
    generateAsync(options: { type: string }): Promise<Blob>;
  }
}

interface ImageData {
  readonly data: Uint8ClampedArray;
  readonly height: number;
  readonly width: number;
  readonly colorSpace: PredefinedColorSpace;
} 