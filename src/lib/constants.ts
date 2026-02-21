export const FREQUENCY_BANDS = [
  { id: "sub-bass",   name: "Sub Bass",   frequency: 40,   Q: 0.7,  color: "#7c3aed" },
  { id: "bass",       name: "Bass",       frequency: 120,  Q: 0.7,  color: "#2563eb" },
  { id: "low-mid",    name: "Low Mid",    frequency: 400,  Q: 0.7,  color: "#0891b2" },
  { id: "mid",        name: "Mid",        frequency: 1000, Q: 0.7,  color: "#059669" },
  { id: "high-mid",   name: "High Mid",   frequency: 3000, Q: 0.7,  color: "#d97706" },
  { id: "presence",   name: "Presence",   frequency: 6000, Q: 0.7,  color: "#dc2626" },
  { id: "brilliance", name: "Brilliance", frequency: 12000,Q: 0.7,  color: "#db2777" },
] as const;

export type BandId = typeof FREQUENCY_BANDS[number]["id"];

export const FFT_SIZE = 2048;
export const SMOOTHING_TIME_CONSTANT = 0.85;
export const EMA_ALPHA = 0.2;
export const PEAK_THRESHOLD_K = 1.4;
export const MAX_PEAKS = 6;
export const LOW_POWER_FFT_SIZE = 512;
export const DEFAULT_MASTER_GAIN = 1.0;
export const GAIN_RAMP_TIME = 0.05;

export const PRESET_STORAGE_KEY = "eq_presets";
