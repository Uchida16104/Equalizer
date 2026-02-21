"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import type { AudioStudio, AudioStudioState, Peak } from "@/lib/audioStudio";
import { FREQUENCY_BANDS } from "@/lib/constants";
import BandControls from "@/components/BandControls";
import PresetManager from "@/components/PresetManager";

const P5Visualizer = dynamic(() => import("@/components/P5Visualizer"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-64 md:h-80 bg-[#0a0a0f] rounded-xl border border-[#1e1e2e] flex items-center justify-center">
      <span className="text-sm text-[#475569]">Loading visualizer…</span>
    </div>
  ),
});

const BAND_COLORS = FREQUENCY_BANDS.map((b) => ({
  frequency: b.frequency,
  color: b.color,
}));

type AudioError = { message: string };

export default function AudioStudioPage() {
  const studioRef = useRef<AudioStudio | null>(null);
  const [studioState, setStudioState] = useState<AudioStudioState | null>(null);
  const [spectrumData, setSpectrumData] = useState<Float32Array | null>(null);
  const [peaks, setPeaks] = useState<Peak[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [fileMode, setFileMode] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileAudioRef = useRef<AudioContext | null>(null);
  const fileSourceRef = useRef<AudioBufferSourceNode | null>(null);

  useEffect(() => {
    let cleanupState: (() => void) | null = null;
    let cleanupSpectrum: (() => void) | null = null;

    async function initStudio() {
      const { getAudioStudio } = await import("@/lib/audioStudio");
      const studio = getAudioStudio();
      studioRef.current = studio;

      setStudioState(studio.getState());

      cleanupState = studio.onStateChange((s) => setStudioState({ ...s }));
      cleanupSpectrum = studio.onSpectrumData((data, p) => {
        setSpectrumData(new Float32Array(data));
        setPeaks([...p]);
      });

      await studio.checkPermission();
    }

    initStudio();

    return () => {
      cleanupState?.();
      cleanupSpectrum?.();
    };
  }, []);

  const handleStart = useCallback(async () => {
    if (!studioRef.current) return;
    setError(null);
    setIsStarting(true);
    try {
      await studioRef.current.start(studioState?.isLowPower ?? false);
    } catch (e) {
      const err = e as AudioError;
      setError(err.message);
    } finally {
      setIsStarting(false);
    }
  }, [studioState?.isLowPower]);

  const handleStop = useCallback(() => {
    studioRef.current?.stop();
    setSpectrumData(null);
    setPeaks([]);
  }, []);

  const handleBandGainChange = useCallback((bandId: string, gainDb: number) => {
    studioRef.current?.setBandGain(bandId, gainDb);
  }, []);

  const handleMasterGainChange = useCallback((value: number) => {
    studioRef.current?.setMasterGain(value);
  }, []);

  const handleToggleLowPower = useCallback(() => {
    studioRef.current?.toggleLowPower();
  }, []);

  async function handleFileDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    await processAudioFile(file);
  }

  async function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    await processAudioFile(file);
  }

  async function processAudioFile(file: File) {
    setError(null);
    try {
      if (fileAudioRef.current) {
        fileSourceRef.current?.stop();
        fileAudioRef.current.close();
      }

      const AnyCtx =
        (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext ||
        AudioContext;
      const ctx = new AnyCtx();
      fileAudioRef.current = ctx;

      const arrayBuffer = await file.arrayBuffer();
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer);

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.85;

      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.loop = true;
      fileSourceRef.current = source;

      source.connect(analyser);
      analyser.connect(ctx.destination);
      source.start();

      const spectrum = new Float32Array(analyser.frequencyBinCount);
      const ema = new Float32Array(analyser.frequencyBinCount);

      const tick = () => {
        analyser.getFloatFrequencyData(spectrum);
        const minDb = -140;
        for (let i = 0; i < spectrum.length; i++) {
          const n = (Math.max(minDb, spectrum[i]) - minDb) / -minDb;
          ema[i] = 0.2 * n + 0.8 * ema[i];
        }
        setSpectrumData(new Float32Array(ema));
        requestAnimationFrame(tick);
      };
      tick();
      setFileMode(true);
    } catch (e) {
      const err = e as AudioError;
      setError("File decoding error: " + err.message);
    }
  }

  const isRunning = studioState?.isRunning ?? false;
  const sampleRate = studioState?.sampleRate ?? 44100;

  return (
    <main className="min-h-screen bg-[#0a0a0f] p-4 md:p-8">
      <div className="max-w-5xl mx-auto space-y-6">

        <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-[#e2e8f0] tracking-tight">
              Equalizer Studio
            </h1>
            <p className="text-sm text-[#64748b] mt-1">
              Live FFT visualizer · Per-band gain control · p5.js
            </p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <StatusBadge
              isRunning={isRunning}
              fileMode={fileMode}
              permissionState={studioState?.permissionState ?? "unknown"}
            />
            <PresetManager studio={studioRef.current} />
          </div>
        </header>

        {error && (
          <div className="bg-red-950/50 border border-red-800 rounded-xl p-4 flex items-start gap-3">
            <span className="text-red-400 text-lg">⚠</span>
            <div>
              <p className="text-sm text-red-300 font-medium">Audio Error</p>
              <p className="text-xs text-red-400/80 mt-0.5">{error}</p>
              {studioState?.permissionState === "denied" && (
                <p className="text-xs text-red-400/60 mt-1">
                  Your browser blocked microphone access. Check browser settings and allow
                  this site to use the microphone, then refresh.
                </p>
              )}
            </div>
          </div>
        )}

        <div
          className={`rounded-2xl border ${
            dragOver ? "border-[#6366f1] bg-[#6366f1]/5" : "border-[#1e1e2e]"
          } overflow-hidden transition-colors`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleFileDrop}
        >
          <P5Visualizer
            spectrumData={spectrumData}
            peaks={peaks}
            isRunning={isRunning || fileMode}
            sampleRate={sampleRate}
            bandColors={BAND_COLORS}
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {!isRunning && !fileMode && (
            <button
              onClick={handleStart}
              disabled={isStarting}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#6366f1] hover:bg-[#818cf8] disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium text-sm transition-colors"
            >
              {isStarting ? (
                <>
                  <span className="inline-block w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  Requesting mic…
                </>
              ) : (
                <>🎤 Start Microphone</>
              )}
            </button>
          )}

          {isRunning && (
            <button
              onClick={handleStop}
              className="px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-medium text-sm transition-colors"
            >
              ⏹ Stop
            </button>
          )}

          {!isRunning && (
            <>
              <label className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[#1e1e2e] hover:border-[#6366f1] text-[#64748b] hover:text-[#a5b4fc] cursor-pointer text-sm transition-colors">
                📂 Open Audio File
                <input
                  type="file"
                  accept="audio/*"
                  className="hidden"
                  onChange={handleFileInput}
                />
              </label>
              {fileMode && (
                <button
                  onClick={() => {
                    fileSourceRef.current?.stop();
                    fileAudioRef.current?.close();
                    fileAudioRef.current = null;
                    fileSourceRef.current = null;
                    setFileMode(false);
                    setSpectrumData(null);
                    setPeaks([]);
                  }}
                  className="px-4 py-2.5 rounded-xl border border-[#1e1e2e] text-[#64748b] hover:text-[#e2e8f0] text-sm transition-colors"
                >
                  ✕ Stop File
                </button>
              )}
            </>
          )}

          {!isRunning && !fileMode && (
            <p className="text-xs text-[#475569]">
              Or drag-and-drop an audio file onto the visualizer
            </p>
          )}
        </div>

        <section className="bg-[#12121a] border border-[#1e1e2e] rounded-2xl p-5">
          <BandControls
            bands={studioState?.bands ?? []}
            masterGain={studioState?.masterGain ?? 1}
            isLowPower={studioState?.isLowPower ?? false}
            onBandGainChange={handleBandGainChange}
            onMasterGainChange={handleMasterGainChange}
            onToggleLowPower={handleToggleLowPower}
          />
        </section>

        <PeakDisplay peaks={peaks} sampleRate={sampleRate} />

        <AlpineSettingsPanel />

        <footer className="text-center text-xs text-[#334155] pt-4 pb-2">
          Equalizer Studio — MIT License — by Hirotoshi Uchida
        </footer>
      </div>
    </main>
  );
}

function StatusBadge({
  isRunning,
  fileMode,
  permissionState,
}: {
  isRunning: boolean;
  fileMode: boolean;
  permissionState: string;
}) {
  if (isRunning) {
    return (
      <span className="flex items-center gap-1.5 text-xs px-3 py-1 rounded-full bg-emerald-950/60 border border-emerald-800 text-emerald-400">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
        </span>
        Live
      </span>
    );
  }
  if (fileMode) {
    return (
      <span className="text-xs px-3 py-1 rounded-full bg-blue-950/60 border border-blue-800 text-blue-400">
        📂 File Mode
      </span>
    );
  }
  if (permissionState === "denied") {
    return (
      <span className="text-xs px-3 py-1 rounded-full bg-red-950/60 border border-red-800 text-red-400">
        🚫 Mic Denied
      </span>
    );
  }
  return (
    <span className="text-xs px-3 py-1 rounded-full bg-[#12121a] border border-[#1e1e2e] text-[#64748b]">
      Idle
    </span>
  );
}

function PeakDisplay({ peaks, sampleRate }: { peaks: Peak[]; sampleRate: number }) {
  if (peaks.length === 0) return null;

  return (
    <section className="bg-[#12121a] border border-[#1e1e2e] rounded-2xl p-5">
      <h2 className="text-xs font-semibold tracking-widest uppercase text-[#64748b] mb-3">
        Detected Peaks
      </h2>
      <div className="flex flex-wrap gap-3">
        {peaks.map((peak, i) => {
          const freq = peak.frequency;
          const label = freq >= 1000 ? `${(freq / 1000).toFixed(2)}kHz` : `${Math.round(freq)}Hz`;
          const magnitude = (peak.magnitude * 100).toFixed(1);
          return (
            <div
              key={i}
              className="bg-[#0a0a0f] border border-[#f472b6]/30 rounded-lg px-3 py-2 text-center min-w-[72px]"
            >
              <p className="text-sm font-mono font-bold text-[#f472b6]">{label}</p>
              <p className="text-[10px] text-[#64748b]">{magnitude}%</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function AlpineSettingsPanel() {
  return (
    <section
      className="bg-[#12121a] border border-[#1e1e2e] rounded-2xl p-5"
      suppressHydrationWarning
    >
      <div
        suppressHydrationWarning
        dangerouslySetInnerHTML={{
          __html: `
<div x-data="{ open: false, calibrated: false, sampleRateNote: '' }" x-cloak>
  <div class="flex items-center justify-between">
    <h2 class="text-xs font-semibold tracking-widest uppercase" style="color:#64748b">
      Advanced Settings
    </h2>
    <button
      @click="open = !open"
      class="text-xs px-3 py-1 rounded border transition-colors"
      style="border-color:#1e1e2e; color:#64748b"
      x-text="open ? 'Hide' : 'Show'"
      _="on click toggle .border-indigo-700 on me"
    >Show</button>
  </div>

  <div x-show="open" x-transition style="margin-top:1rem; space-y:0.75rem">
    <div style="display:flex; flex-direction:column; gap:0.75rem">

      <label style="display:flex; align-items:center; gap:0.75rem; font-size:0.8rem; color:#94a3b8; cursor:pointer">
        <input
          type="checkbox"
          hx-post="/api/presets/settings"
          hx-vals='{"key":"showPeakLines"}'
          hx-trigger="change"
          style="width:14px; height:14px; accent-color:#6366f1"
        />
        Show peak frequency lines
      </label>

      <label style="display:flex; align-items:center; gap:0.75rem; font-size:0.8rem; color:#94a3b8; cursor:pointer">
        <input
          type="checkbox"
          hx-post="/api/presets/settings"
          hx-vals='{"key":"logScale"}'
          hx-trigger="change"
          style="width:14px; height:14px; accent-color:#6366f1"
        />
        Logarithmic frequency axis
      </label>

      <button
        @click="
          sampleRateNote = 'Detecting...';
          calibrated = false;
          setTimeout(() => {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            sampleRateNote = 'Sample rate: ' + ctx.sampleRate + ' Hz';
            ctx.close();
            calibrated = true;
          }, 400)
        "
        style="
          align-self:flex-start;
          padding:0.375rem 0.875rem;
          border-radius:0.5rem;
          border:1px solid #1e1e2e;
          font-size:0.75rem;
          color:#94a3b8;
          background:transparent;
          cursor:pointer;
          transition:all 0.15s
        "
      >
        Calibrate Sample Rate
      </button>

      <p x-show="sampleRateNote" x-text="sampleRateNote"
         style="font-size:0.75rem; color:#6366f1; font-family:monospace"></p>

    </div>
  </div>
</div>
          `,
        }}
      />
    </section>
  );
}
