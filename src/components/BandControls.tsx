"use client";

import { useCallback } from "react";
import type { BandState } from "@/lib/audioStudio";

interface BandControlsProps {
  bands: BandState[];
  masterGain: number;
  isLowPower: boolean;
  onBandGainChange: (bandId: string, gainDb: number) => void;
  onMasterGainChange: (value: number) => void;
  onToggleLowPower: () => void;
}

function dbToLinearPosition(gainDb: number): number {
  return (gainDb + 40) / 80;
}

export default function BandControls({
  bands,
  masterGain,
  isLowPower,
  onBandGainChange,
  onMasterGainChange,
  onToggleLowPower,
}: BandControlsProps) {
  const handleBandChange = useCallback(
    (bandId: string, value: string) => {
      onBandGainChange(bandId, parseFloat(value));
    },
    [onBandGainChange]
  );

  const handleMasterChange = useCallback(
    (value: string) => {
      onMasterGainChange(parseFloat(value));
    },
    [onMasterGainChange]
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-semibold tracking-widest uppercase text-[#64748b]">
          Frequency Bands
        </h2>
        <button
          onClick={onToggleLowPower}
          className={`text-xs px-3 py-1 rounded-full border transition-colors ${
            isLowPower
              ? "border-amber-500 text-amber-400 bg-amber-950/40"
              : "border-[#1e1e2e] text-[#64748b] hover:border-[#6366f1] hover:text-[#a5b4fc]"
          }`}
          title="Toggle Low Power Mode (reduces FFT size)"
        >
          {isLowPower ? "⚡ Low Power ON" : "⚡ Low Power"}
        </button>
      </div>

      <div className="grid grid-cols-7 gap-2 md:gap-3">
        {bands.map((band) => (
          <BandSlider
            key={band.id}
            band={band}
            onChange={handleBandChange}
          />
        ))}
      </div>

      <div className="pt-4 border-t border-[#1e1e2e]">
        <div className="flex items-center gap-4">
          <label className="text-xs text-[#64748b] whitespace-nowrap min-w-[80px]">
            Master Vol
          </label>
          <input
            type="range"
            min="0"
            max="2"
            step="0.01"
            value={masterGain}
            onChange={(e) => handleMasterChange(e.target.value)}
            className="flex-1 accent-[#6366f1]"
            style={{
              background: `linear-gradient(to right, #6366f1 ${(masterGain / 2) * 100}%, #1e1e2e ${(masterGain / 2) * 100}%)`,
            }}
          />
          <span className="text-xs font-mono text-[#a5b4fc] w-12 text-right">
            {(masterGain * 100).toFixed(0)}%
          </span>
        </div>
      </div>
    </div>
  );
}

interface BandSliderProps {
  band: BandState;
  onChange: (bandId: string, value: string) => void;
}

function BandSlider({ band, onChange }: BandSliderProps) {
  const freqLabel =
    band.frequency >= 1000
      ? `${(band.frequency / 1000).toFixed(0)}k`
      : `${band.frequency}`;

  return (
    <div className="flex flex-col items-center gap-2">
      <span
        className="text-xs font-mono font-semibold"
        style={{ color: band.color }}
      >
        {band.gainDb >= 0 ? "+" : ""}
        {band.gainDb.toFixed(0)}dB
      </span>

      <div className="relative flex flex-col items-center" style={{ height: 120 }}>
        <input
          type="range"
          orient="vertical"
          min="-40"
          max="40"
          step="1"
          value={band.gainDb}
          onChange={(e) => onChange(band.id, e.target.value)}
          className="appearance-none cursor-pointer"
          style={{
            writingMode: "vertical-lr",
            direction: "rtl",
            width: 24,
            height: 120,
            background: `linear-gradient(to top, ${band.color}44, ${band.color}cc)`,
            borderRadius: 4,
            outline: "none",
            border: `1px solid ${band.color}44`,
            accentColor: band.color,
          }}
          title={`${band.name}: ${band.gainDb >= 0 ? "+" : ""}${band.gainDb}dB`}
        />
        <div
          className="absolute pointer-events-none"
          style={{
            bottom: `${dbToLinearPosition(0) * 120}px`,
            left: 0,
            right: 0,
            height: 1,
            background: "#334155",
          }}
        />
      </div>

      <div className="text-center">
        <div className="text-xs font-mono" style={{ color: band.color }}>
          {freqLabel}
        </div>
        <div className="text-[9px] text-[#475569] leading-tight">{band.name}</div>
      </div>
    </div>
  );
}
