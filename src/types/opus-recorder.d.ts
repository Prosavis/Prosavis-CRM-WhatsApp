declare module 'opus-recorder' {
  export default class Recorder {
    static isRecordingSupported(): boolean;
    constructor(options?: Record<string, unknown>);
    start(): Promise<void>;
    stop(): void;
    close(): void;
    state?: string;
    ondataavailable?: (typedArray: Uint8Array) => void;
    onstop?: (blob: Blob) => void;
    onerror?: (err: Error) => void;
    onstreamerror?: (err: Error) => void;
  }
}
