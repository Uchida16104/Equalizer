"use client";

import { useEffect, useRef, useCallback } from "react";
import type P5Constructor from "p5";
import type { Peak } from "@/lib/audioStudio";

interface P5VisualizerProps {
  spectrumData: Float32Array | null;
  peaks: Peak[];
  isRunning: boolean;
  sampleRate: number;
  bandColors: Array<{ frequency: number; color: string }>;
}

export default function P5Visualizer({
  spectrumData,
  peaks,
  isRunning,
  sampleRate,
  bandColors,
}: P5VisualizerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const p5InstanceRef = useRef<P5Constructor | null>(null);
  const dataRef = useRef<{ spectrum: Float32Array | null; peaks: Peak[]; isRunning: boolean }>({
    spectrum: null,
    peaks: [],
    isRunning: false,
  });

  dataRef.current = { spectrum: spectrumData, peaks, isRunning };

  const initP5 = useCallback(async () => {
    if (!containerRef.current) return;

    const p5Module = await import("p5");
    const P5 = p5Module.default as unknown as new (sketch: (p: P5Constructor) => void) => P5Constructor;

    if (p5InstanceRef.current) {
      p5InstanceRef.current.remove();
    }

    const sketch = (p: P5Constructor) => {
      let gradientCache: CanvasGradient | null = null;
      let lastWidth = 0;

      function getGradient(ctx: CanvasRenderingContext2D, w: number): CanvasGradient {
        if (gradientCache && w === lastWidth) return gradientCache;
        lastWidth = w;
        const g = ctx.createLinearGradient(0, 0, w, 0);
        const bands = [...bandColors].sort((a, b) => a.frequency - b.frequency);
        const nyquist = sampleRate / 2;
        bands.forEach((band) => {
          const pos = Math.min(1, Math.max(0, band.frequency / nyquist));
          g.addColorStop(pos, band.color + "cc");
        });
        gradientCache = g;
        return g;
      }

      p.setup = function () {
        const cnv = p.createCanvas(
          containerRef.current!.clientWidth,
          containerRef.current!.clientHeight
        );
        cnv.parent(containerRef.current!);
        p.frameRate(60);
        p.colorMode(p.RGB);
        p.textFont("JetBrains Mono, monospace");
      };

      p.windowResized = function () {
        if (!containerRef.current) return;
        p.resizeCanvas(containerRef.current.clientWidth, containerRef.current.clientHeight);
        gradientCache = null;
      };

      p.draw = function () {
        const { spectrum, peaks: currentPeaks, isRunning: running } = dataRef.current;

        p.background(10, 10, 15);

        if (!running || !spectrum) {
          drawIdleScreen(p);
          return;
        }

        const w = p.width;
        const h = p.height;
        const specH = Math.floor(h * 0.72);
        const waveH = Math.floor(h * 0.22);
        const padding = 8;

        drawGrid(p, w, specH, sampleRate);
        drawSpectrum(p, spectrum, w, specH, padding);
        drawPeaks(p, currentPeaks, spectrum, w, specH);
        drawWaveform(p, spectrum, w, specH + 8, waveH);
        drawFrequencyLabels(p, w, specH);
      };

      function drawIdleScreen(p: P5Constructor) {
        p.fill(30, 30, 50);
        p.noStroke();
        p.textSize(14);
        p.textAlign(p.CENTER, p.CENTER);
        p.text("Click 'Start Microphone' to begin", p.width / 2, p.height / 2);
      }

      function drawGrid(p: P5Constructor, w: number, h: number, sr: number) {
        p.stroke(255, 255, 255, 18);
        p.strokeWeight(1);
        const dBLines = [-60, -40, -20, -10];
        dBLines.forEach((db) => {
          const norm = (db + 140) / 140;
          const y = h - norm * h;
          p.line(0, y, w, y);
          p.noStroke();
          p.fill(255, 255, 255, 40);
          p.textSize(9);
          p.textAlign(p.LEFT, p.CENTER);
          p.text(`${db}dB`, 4, y - 6);
          p.stroke(255, 255, 255, 18);
        });

        const freqMarkers = [100, 500, 1000, 2000, 5000, 10000, 20000];
        const nyquist = sr / 2;
        freqMarkers.forEach((freq) => {
          const x = (Math.log10(freq / 20) / Math.log10(nyquist / 20)) * w;
          if (x < 0 || x > w) return;
          p.line(x, 0, x, h);
        });
        p.noStroke();
      }

      function drawSpectrum(
        p: P5Constructor,
        spectrum: Float32Array,
        w: number,
        h: number,
        padding: number
      ) {
        const canvas = (p as unknown as { drawingContext: CanvasRenderingContext2D }).drawingContext;
        const gradient = getGradient(canvas, w);

        canvas.save();
        canvas.beginPath();
        const n = spectrum.length;
        for (let i = 0; i < n; i++) {
          const x = (i / n) * w;
          const y = h - spectrum[i] * (h - padding);
          if (i === 0) canvas.moveTo(x, y);
          else canvas.lineTo(x, y);
        }
        canvas.lineTo(w, h);
        canvas.lineTo(0, h);
        canvas.closePath();
        canvas.fillStyle = gradient;
        canvas.globalAlpha = 0.85;
        canvas.fill();
        canvas.restore();

        canvas.save();
        canvas.beginPath();
        for (let i = 0; i < n; i++) {
          const x = (i / n) * w;
          const y = h - spectrum[i] * (h - padding);
          if (i === 0) canvas.moveTo(x, y);
          else canvas.lineTo(x, y);
        }
        canvas.strokeStyle = "#a5b4fc";
        canvas.lineWidth = 1.5;
        canvas.globalAlpha = 1;
        canvas.stroke();
        canvas.restore();
      }

      function drawPeaks(
        p: P5Constructor,
        peaks: Peak[],
        spectrum: Float32Array,
        w: number,
        h: number
      ) {
        const n = spectrum.length;

        peaks.forEach((peak) => {
          const x = (peak.binIndex / n) * w;
          const y = h - spectrum[peak.binIndex] * h;

          p.stroke(244, 114, 182);
          p.strokeWeight(1);
          p.line(x, y, x, h);

          p.noStroke();
          p.fill(244, 114, 182);
          p.ellipse(x, y, 8, 8);

          const label =
            peak.frequency >= 1000
              ? `${(peak.frequency / 1000).toFixed(1)}k`
              : `${Math.round(peak.frequency)}`;

          p.fill(255);
          p.textSize(10);
          p.textAlign(p.CENTER, p.BOTTOM);
          const labelY = Math.max(12, y - 6);
          p.text(label + "Hz", x, labelY);
        });
      }

      function drawWaveform(
        p: P5Constructor,
        spectrum: Float32Array,
        w: number,
        yOffset: number,
        h: number
      ) {
        p.noFill();
        p.stroke(52, 211, 153, 200);
        p.strokeWeight(1.5);
        p.beginShape();
        const n = spectrum.length;
        const sliceW = w / n;
        for (let i = 0; i < n; i++) {
          const x = i * sliceW;
          const y = yOffset + h / 2 + (spectrum[i] - 0.5) * h * 0.8;
          p.vertex(x, y);
        }
        p.endShape();
      }

      function drawFrequencyLabels(p: P5Constructor, w: number, yOffset: number) {
        const labels = [
          { freq: 100, label: "100Hz" },
          { freq: 500, label: "500Hz" },
          { freq: 1000, label: "1kHz" },
          { freq: 2000, label: "2kHz" },
          { freq: 5000, label: "5kHz" },
          { freq: 10000, label: "10kHz" },
        ];
        const nyquist = sampleRate / 2;

        p.noStroke();
        p.fill(100, 116, 139);
        p.textSize(9);
        p.textAlign(p.CENTER, p.TOP);

        labels.forEach(({ freq, label }) => {
          const x = (Math.log10(freq / 20) / Math.log10(nyquist / 20)) * w;
          if (x >= 0 && x <= w) {
            p.text(label, x, yOffset + 4);
          }
        });
      }
    };

    p5InstanceRef.current = new P5(sketch);
  }, [bandColors, sampleRate]);

  useEffect(() => {
    initP5();
    return () => {
      if (p5InstanceRef.current) {
        p5InstanceRef.current.remove();
        p5InstanceRef.current = null;
      }
    };
  }, [initP5]);

  return (
    <div
      ref={containerRef}
      className="w-full h-64 md:h-80 lg:h-96 bg-[#0a0a0f] rounded-xl border border-[#1e1e2e] overflow-hidden"
      style={{ minHeight: 220 }}
    />
  );
}
