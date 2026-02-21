"use client";

import { useState, useEffect } from "react";
import type { AudioStudio } from "@/lib/audioStudio";
import { PRESET_STORAGE_KEY } from "@/lib/constants";

interface Preset {
  id: string;
  name: string;
  data: Record<string, unknown>;
  createdAt: string;
}

interface PresetManagerProps {
  studio: AudioStudio | null;
}

export default function PresetManager({ studio }: PresetManagerProps) {
  const [presets, setPresets] = useState<Preset[]>([]);
  const [presetName, setPresetName] = useState("");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(PRESET_STORAGE_KEY);
      if (raw) setPresets(JSON.parse(raw));
    } catch {
      setPresets([]);
    }
  }, [isOpen]);

  function persistPresets(next: Preset[]) {
    try {
      localStorage.setItem(PRESET_STORAGE_KEY, JSON.stringify(next));
    } catch {
    }
    setPresets(next);
  }

  async function handleSave() {
    if (!studio || !presetName.trim()) return;
    setSaveStatus("saving");

    const preset: Preset = {
      id: crypto.randomUUID(),
      name: presetName.trim(),
      data: studio.exportPreset(),
      createdAt: new Date().toISOString(),
    };

    const next = [...presets, preset];
    persistPresets(next);

    try {
      const res = await fetch("/api/presets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(preset),
      });
      if (!res.ok) throw new Error("Server save failed");
      setSaveStatus("saved");
    } catch {
      setSaveStatus("saved");
    }

    setPresetName("");
    setTimeout(() => setSaveStatus("idle"), 2000);
  }

  function handleLoad(preset: Preset) {
    if (!studio) return;
    studio.importPreset(preset.data);
    setIsOpen(false);
  }

  function handleDelete(id: string) {
    persistPresets(presets.filter((p) => p.id !== id));
  }

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="text-xs px-3 py-1.5 rounded border border-[#1e1e2e] text-[#64748b] hover:border-[#6366f1] hover:text-[#a5b4fc] transition-colors"
      >
        Presets
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-[#12121a] border border-[#1e1e2e] rounded-2xl p-6 w-full max-w-md mx-4 shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-semibold text-[#e2e8f0]">Preset Manager</h3>
              <button
                onClick={() => setIsOpen(false)}
                className="text-[#64748b] hover:text-[#e2e8f0] transition-colors text-lg leading-none"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <div className="flex gap-2 mb-5">
              <input
                type="text"
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSave()}
                placeholder="Preset name..."
                className="flex-1 bg-[#0a0a0f] border border-[#1e1e2e] rounded-lg px-3 py-2 text-sm text-[#e2e8f0] placeholder-[#334155] outline-none focus:border-[#6366f1] transition-colors"
              />
              <button
                onClick={handleSave}
                disabled={!presetName.trim() || saveStatus === "saving"}
                className="px-4 py-2 rounded-lg bg-[#6366f1] hover:bg-[#818cf8] disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
              >
                {saveStatus === "saving"
                  ? "Saving..."
                  : saveStatus === "saved"
                  ? "Saved ✓"
                  : "Save"}
              </button>
            </div>

            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {presets.length === 0 && (
                <p className="text-sm text-[#475569] text-center py-6">
                  No presets saved yet.
                </p>
              )}
              {presets.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center gap-2 bg-[#0a0a0f] border border-[#1e1e2e] rounded-lg px-3 py-2"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-[#e2e8f0] truncate">{p.name}</p>
                    <p className="text-[10px] text-[#475569]">
                      {new Date(p.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <button
                    onClick={() => handleLoad(p)}
                    className="text-xs px-2 py-1 rounded border border-[#6366f1]/50 text-[#818cf8] hover:border-[#6366f1] hover:bg-[#6366f1]/10 transition-colors"
                  >
                    Load
                  </button>
                  <button
                    onClick={() => handleDelete(p.id)}
                    className="text-xs px-2 py-1 rounded border border-[#374151] text-[#6b7280] hover:border-red-800 hover:text-red-400 transition-colors"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
