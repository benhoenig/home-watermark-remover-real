declare module '@tensorflow/tfjs' {
  export interface Tensor {
    div(x: number): Tensor;
    mul(x: number): Tensor;
    expandDims(axis: number): Tensor;
    squeeze(): Tensor;
    shape: number[];
    data(): Promise<Float32Array>;
    dispose(): void;
    isDisposed: boolean;
  }

  export interface LayersModel {
    predict(inputs: Tensor): Tensor;
  }

  export interface Layer {
    apply(inputs: Tensor | Tensor[]): Tensor;
  }

  export interface ModelArgs {
    inputs: Tensor;
    outputs: Tensor;
  }

  export const layers: {
    conv2d(config: {
      filters: number;
      kernelSize: number;
      padding: 'same' | 'valid';
      activation: string;
      dilationRate?: number;
    }): Layer;
    maxPooling2d(config: { poolSize: [number, number] }): Layer;
    upSampling2d(config: { size: [number, number] }): Layer;
    concatenate(): Layer;
    add(): Layer;
  };

  export function ready(): Promise<void>;
  export function setBackend(backend: string): Promise<boolean>;
  export function input(config: { shape: (number | null)[] }): Tensor;
  export function model(args: ModelArgs): LayersModel;
  export function enableProdMode(): void;
  export function memory(): { numTensors: number };
  export function disposeVariables(): void;
  export function tidy<T>(fn: () => T): T;
  export function clipByValue(x: Tensor, min: number, max: number): Tensor;

  export const browser: {
    fromPixels(pixels: ImageData | HTMLImageElement | HTMLCanvasElement): Tensor;
    toPixels(tensor: Tensor): Promise<Uint8ClampedArray>;
  };
}

declare module '@tensorflow/tfjs-backend-webgl' {
  export * from '@tensorflow/tfjs-backend-webgl';
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
    generateAsync(options: { type: string; compression?: string }): Promise<Blob>;
  }
}

interface ImageData {
  readonly data: Uint8ClampedArray;
  readonly height: number;
  readonly width: number;
  readonly colorSpace: PredefinedColorSpace;
} 