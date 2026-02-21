import {
  FREQUENCY_BANDS,
  FFT_SIZE,
  SMOOTHING_TIME_CONSTANT,
  EMA_ALPHA,
  PEAK_THRESHOLD_K,
  MAX_PEAKS,
  LOW_POWER_FFT_SIZE,
  DEFAULT_MASTER_GAIN,
  GAIN_RAMP_TIME,
} from "./constants";

export interface Peak {
  frequency: number;
  magnitude: number;
  binIndex: number;
}

export interface BandState {
  id: string;
  name: string;
  frequency: number;
  gainDb: number;
  color: string;
}

export interface AudioStudioState {
  isRunning: boolean;
  isLowPower: boolean;
  masterGain: number;
  bands: BandState[];
  sampleRate: number;
  permissionState: "prompt" | "granted" | "denied" | "unknown";
}

interface BandNodes {
  filter: BiquadFilterNode;
  gain: GainNode;
}

export class AudioStudio {
  private audioCtx: AudioContext | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private analyserNode: AnalyserNode | null = null;
  private masterGainNode: GainNode | null = null;
  private bandNodes: Map<string, BandNodes> = new Map();
  private stream: MediaStream | null = null;
  private animationFrameId: number | null = null;
  private spectrumBuffer: Float32Array<ArrayBuffer> | null = null;
  private emaBuffer: Float32Array<ArrayBuffer> | null = null;
  private fftWorker: Worker | null = null;
  private workerSupported = false;
  private stateListeners: Array<(state: AudioStudioState) => void> = [];
  private spectrumListeners: Array<(data: Float32Array, peaks: Peak[]) => void> = [];

  private state: AudioStudioState = {
    isRunning: false,
    isLowPower: false,
    masterGain: DEFAULT_MASTER_GAIN,
    bands: FREQUENCY_BANDS.map((b) => ({
      id: b.id,
      name: b.name,
      frequency: b.frequency,
      gainDb: 0,
      color: b.color,
    })),
    sampleRate: 44100,
    permissionState: "unknown",
  };

  onStateChange(cb: (state: AudioStudioState) => void): () => void {
    this.stateListeners.push(cb);
    return () => {
      this.stateListeners = this.stateListeners.filter((l) => l !== cb);
    };
  }

  onSpectrumData(cb: (data: Float32Array, peaks: Peak[]) => void): () => void {
    this.spectrumListeners.push(cb);
    return () => {
      this.spectrumListeners = this.spectrumListeners.filter((l) => l !== cb);
    };
  }

  getState(): AudioStudioState {
    return { ...this.state, bands: this.state.bands.map((b) => ({ ...b })) };
  }

  private emitState() {
    const s = this.getState();
    this.stateListeners.forEach((cb) => cb(s));
  }

  private checkFeatures(): { audioContext: boolean; getUserMedia: boolean; audioWorklet: boolean } {
    return {
      audioContext: typeof AudioContext !== "undefined" || typeof (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext !== "undefined",
      getUserMedia: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia),
      audioWorklet: typeof AudioWorkletNode !== "undefined",
    };
  }

  async checkPermission(): Promise<"granted" | "denied" | "prompt" | "unknown"> {
    if (!navigator.permissions) return "unknown";
    try {
      const result = await navigator.permissions.query({ name: "microphone" as PermissionName });
      this.state.permissionState = result.state as "granted" | "denied" | "prompt";
      this.emitState();
      return this.state.permissionState;
    } catch {
      return "unknown";
    }
  }

  async start(lowPower = false): Promise<void> {
    if (this.state.isRunning) return;

    const features = this.checkFeatures();
    if (!features.audioContext) throw new Error("Web Audio API is not supported in this browser.");
    if (!features.getUserMedia) throw new Error("Microphone access is not supported in this browser.");

    const AnyAudioContext =
      (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext ||
      AudioContext;

    this.audioCtx = new AnyAudioContext();

    if (this.audioCtx.state === "suspended") {
      await this.audioCtx.resume();
    }

    let userStream: MediaStream;
    try {
      userStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          sampleRate: { ideal: 48000 },
          channelCount: { ideal: 1 },
        },
      });
    } catch (err: unknown) {
      const error = err as Error;
      if (error.name === "NotAllowedError" || error.name === "PermissionDeniedError") {
        this.state.permissionState = "denied";
        this.emitState();
        throw new Error("Microphone permission denied. Please allow microphone access and try again.");
      }
      throw new Error(`Microphone error: ${error.message}`);
    }

    this.stream = userStream;
    this.state.permissionState = "granted";
    this.state.sampleRate = this.audioCtx.sampleRate;
    this.state.isLowPower = lowPower;

    this.sourceNode = this.audioCtx.createMediaStreamSource(this.stream);

    this.masterGainNode = this.audioCtx.createGain();
    this.masterGainNode.gain.value = this.state.masterGain;

    this.analyserNode = this.audioCtx.createAnalyser();
    this.analyserNode.fftSize = lowPower ? LOW_POWER_FFT_SIZE : FFT_SIZE;
    this.analyserNode.smoothingTimeConstant = SMOOTHING_TIME_CONSTANT;

    const fftSize = this.analyserNode.fftSize;
    this.spectrumBuffer = new Float32Array(fftSize / 2);
    this.emaBuffer = new Float32Array(fftSize / 2);

    let lastNode: AudioNode = this.sourceNode;

    for (const bandDef of FREQUENCY_BANDS) {
      const filter = this.audioCtx.createBiquadFilter();
      filter.type = "peaking";
      filter.frequency.value = bandDef.frequency;
      filter.Q.value = bandDef.Q;
      filter.gain.value = 0;

      const gainNode = this.audioCtx.createGain();
      gainNode.gain.value = 1.0;

      lastNode.connect(filter);
      filter.connect(gainNode);
      lastNode = gainNode;

      this.bandNodes.set(bandDef.id, { filter, gain: gainNode });
    }

    lastNode.connect(this.masterGainNode);
    this.masterGainNode.connect(this.analyserNode);
    this.analyserNode.connect(this.audioCtx.destination);

    this.state.isRunning = true;
    this.emitState();
    this.startRenderLoop();
  }

  stop(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    if (this.audioCtx) {
      this.audioCtx.close();
      this.audioCtx = null;
    }
    this.sourceNode = null;
    this.analyserNode = null;
    this.masterGainNode = null;
    this.bandNodes.clear();
    this.emaBuffer = null;
    this.spectrumBuffer = null;
    this.state.isRunning = false;
    this.emitState();
  }

  setBandGain(bandId: string, gainDb: number): void {
    const nodes = this.bandNodes.get(bandId);
    if (!nodes || !this.audioCtx) return;

    const clampedGain = Math.max(-40, Math.min(40, gainDb));
    nodes.filter.gain.setTargetAtTime(clampedGain, this.audioCtx.currentTime, GAIN_RAMP_TIME);

    this.state.bands = this.state.bands.map((b) =>
      b.id === bandId ? { ...b, gainDb: clampedGain } : b
    );
    this.emitState();
  }

  setMasterGain(value: number): void {
    const clamped = Math.max(0, Math.min(2, value));
    if (this.masterGainNode && this.audioCtx) {
      this.masterGainNode.gain.setTargetAtTime(clamped, this.audioCtx.currentTime, GAIN_RAMP_TIME);
    }
    this.state.masterGain = clamped;
    this.emitState();
  }

  toggleLowPower(): void {
    if (!this.analyserNode || !this.spectrumBuffer) return;
    const next = !this.state.isLowPower;
    this.analyserNode.fftSize = next ? LOW_POWER_FFT_SIZE : FFT_SIZE;
    const newSize = this.analyserNode.fftSize / 2;
    this.spectrumBuffer = new Float32Array(newSize);
    this.emaBuffer = new Float32Array(newSize);
    this.state.isLowPower = next;
    this.emitState();
  }

  getFrequencyForBin(bin: number): number {
    if (!this.analyserNode || !this.audioCtx) return 0;
    const nyquist = this.audioCtx.sampleRate / 2;
    return (bin / this.analyserNode.frequencyBinCount) * nyquist;
  }

  private detectPeaks(smoothed: Float32Array): Peak[] {
    const n = smoothed.length;
    if (n < 3) return [];

    let sum = 0;
    let sumSq = 0;
    for (let i = 0; i < n; i++) {
      sum += smoothed[i];
      sumSq += smoothed[i] * smoothed[i];
    }
    const mean = sum / n;
    const variance = sumSq / n - mean * mean;
    const std = Math.sqrt(Math.max(0, variance));
    const threshold = mean + PEAK_THRESHOLD_K * std;

    const candidates: Peak[] = [];

    for (let i = 1; i < n - 1; i++) {
      if (
        smoothed[i] > smoothed[i - 1] &&
        smoothed[i] > smoothed[i + 1] &&
        smoothed[i] > threshold
      ) {
        candidates.push({
          binIndex: i,
          frequency: this.getFrequencyForBin(i),
          magnitude: smoothed[i],
        });
      }
    }

    candidates.sort((a, b) => b.magnitude - a.magnitude);
    return candidates.slice(0, MAX_PEAKS);
  }

  private startRenderLoop(): void {
    const tick = () => {
      if (!this.state.isRunning || !this.analyserNode || !this.emaBuffer) return;

      if (!this.spectrumBuffer || this.spectrumBuffer.length !== this.analyserNode.frequencyBinCount) {
        this.spectrumBuffer = new Float32Array(this.analyserNode.frequencyBinCount);
      }

      this.analyserNode.getFloatFrequencyData(this.spectrumBuffer);

      const n = this.spectrumBuffer.length;
      const alpha = EMA_ALPHA;
      const minDb = -140;

      for (let i = 0; i < n; i++) {
        const raw = Math.max(minDb, this.spectrumBuffer[i]);
        const normalized = (raw - minDb) / (-minDb);
        this.emaBuffer[i] = alpha * normalized + (1 - alpha) * this.emaBuffer[i];
      }

      const peaks = this.detectPeaks(this.emaBuffer);
      this.spectrumListeners.forEach((cb) => cb(this.emaBuffer!, peaks));

      this.animationFrameId = requestAnimationFrame(tick);
    };

    this.animationFrameId = requestAnimationFrame(tick);
  }

  exportPreset(): Record<string, unknown> {
    return {
      version: 1,
      masterGain: this.state.masterGain,
      bands: this.state.bands.map((b) => ({ id: b.id, gainDb: b.gainDb })),
      createdAt: new Date().toISOString(),
    };
  }

  importPreset(preset: Record<string, unknown>): void {
    if (!preset || typeof preset !== "object") return;
    const bands = preset.bands as Array<{ id: string; gainDb: number }> | undefined;
    if (Array.isArray(bands)) {
      bands.forEach((b) => {
        if (typeof b.id === "string" && typeof b.gainDb === "number") {
          this.setBandGain(b.id, b.gainDb);
        }
      });
    }
    if (typeof preset.masterGain === "number") {
      this.setMasterGain(preset.masterGain);
    }
  }
}

let studioInstance: AudioStudio | null = null;

export function getAudioStudio(): AudioStudio {
  if (!studioInstance) {
    studioInstance = new AudioStudio();
  }
  return studioInstance;
}
