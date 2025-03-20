declare module '*?worker' {
  const workerConstructor: {
    new (): Worker;
  };
  export default workerConstructor;
}

declare module '*.worker.ts' {
  class WebWorker extends Worker {
    constructor();
  }
  export default WebWorker;
} 