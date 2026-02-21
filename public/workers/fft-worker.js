let emaBuffer = null;
const EMA_ALPHA = 0.2;
const PEAK_THRESHOLD_K = 1.4;
const MAX_PEAKS = 6;

function detectPeaks(smoothed, sampleRate, fftSize) {
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

  const nyquist = sampleRate / 2;
  const candidates = [];

  for (let i = 1; i < n - 1; i++) {
    if (
      smoothed[i] > smoothed[i - 1] &&
      smoothed[i] > smoothed[i + 1] &&
      smoothed[i] > threshold
    ) {
      const frequency = (i / n) * nyquist;
      candidates.push({ binIndex: i, frequency, magnitude: smoothed[i] });
    }
  }

  candidates.sort((a, b) => b.magnitude - a.magnitude);
  return candidates.slice(0, MAX_PEAKS);
}

self.onmessage = function (e) {
  const { spectrum, sampleRate, fftSize } = e.data;
  const n = spectrum.length;

  if (!emaBuffer || emaBuffer.length !== n) {
    emaBuffer = new Float32Array(n);
  }

  const minDb = -140;
  for (let i = 0; i < n; i++) {
    const raw = Math.max(minDb, spectrum[i]);
    const normalized = (raw - minDb) / (-minDb);
    emaBuffer[i] = EMA_ALPHA * normalized + (1 - EMA_ALPHA) * emaBuffer[i];
  }

  const peaks = detectPeaks(emaBuffer, sampleRate, fftSize);
  const result = new Float32Array(emaBuffer);

  self.postMessage({ smoothed: result, peaks }, [result.buffer]);
};
