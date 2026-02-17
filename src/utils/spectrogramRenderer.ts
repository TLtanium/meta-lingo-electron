/**
 * Spectrogram Rendering Utilities
 * Shared rendering functions for spectrogram heatmap and formant track overlay.
 * Used by both WavesurferWaveform (annotation mode) and AudioVisualization (history view).
 */

/**
 * Convert a normalized energy value [0, 1] to a viridis-like color.
 * 0 = dark purple/black (low energy), 1 = yellow (high energy)
 */
export function energyToColor(normalized: number): [number, number, number] {
  // Clamp
  const t = Math.max(0, Math.min(1, normalized))

  // Simplified viridis-like colormap using RGB interpolation
  let r: number, g: number, b: number

  if (t < 0.25) {
    // Dark purple → blue
    const s = t / 0.25
    r = Math.round(68 * (1 - s) + 59 * s)
    g = Math.round(1 * (1 - s) + 82 * s)
    b = Math.round(84 * (1 - s) + 139 * s)
  } else if (t < 0.5) {
    // Blue → teal/green
    const s = (t - 0.25) / 0.25
    r = Math.round(59 * (1 - s) + 33 * s)
    g = Math.round(82 * (1 - s) + 145 * s)
    b = Math.round(139 * (1 - s) + 140 * s)
  } else if (t < 0.75) {
    // Teal → yellow-green
    const s = (t - 0.5) / 0.25
    r = Math.round(33 * (1 - s) + 143 * s)
    g = Math.round(145 * (1 - s) + 215 * s)
    b = Math.round(140 * (1 - s) + 68 * s)
  } else {
    // Yellow-green → yellow
    const s = (t - 0.75) / 0.25
    r = Math.round(143 * (1 - s) + 253 * s)
    g = Math.round(215 * (1 - s) + 231 * s)
    b = Math.round(68 * (1 - s) + 37 * s)
  }

  return [r, g, b]
}

/** Formant colors: F1=red, F2=green, F3=blue, F4=cyan, F5=magenta */
export const FORMANT_COLORS = ['#FF3333', '#33CC33', '#3388FF', '#00CCCC', '#CC33CC']

export interface SpectrogramRenderOptions {
  /** Canvas width in CSS pixels */
  width: number
  /** Canvas height in CSS pixels */
  height: number
  /** Duration in seconds */
  duration: number
  /** Pixels per second (optional, for reference; rendering uses width/duration) */
  pixelsPerSecond?: number
  /** Device pixel ratio (default min(devicePixelRatio, 2)) */
  dpr?: number
  /** Whether to render formant tracks */
  showFormants?: boolean
  /** Whether to render intensity curve */
  showIntensity?: boolean
  /** Whether to render HNR curve */
  showHNR?: boolean
}

export interface SpectrogramDataInput {
  times: number[]
  frequencies: number[]
  energy_matrix: number[][]
  dynamic_range: number
}

export interface FormantDataInput {
  times: number[]
  f1: number[]
  f2: number[]
  f3: number[]
  f4: number[]
  f5: number[]
}

/**
 * Render a spectrogram heatmap onto a canvas context.
 * Uses ImageData + putImageData for performance.
 */
export function renderSpectrogram(
  ctx: CanvasRenderingContext2D,
  data: SpectrogramDataInput,
  options: SpectrogramRenderOptions
): void {
  const { width, height, duration } = options
  const dpr = options.dpr ?? Math.min(window.devicePixelRatio || 1, 2)
  const physicalWidth = Math.floor(width * dpr)
  const physicalHeight = Math.floor(height * dpr)

  const { times, frequencies, energy_matrix, dynamic_range } = data
  if (!times.length || !frequencies.length || !energy_matrix.length) return

  // Find max dB for normalization
  let maxDb = -Infinity
  for (let t = 0; t < energy_matrix.length; t++) {
    for (let f = 0; f < energy_matrix[t].length; f++) {
      if (energy_matrix[t][f] > maxDb) maxDb = energy_matrix[t][f]
    }
  }
  const minDb = maxDb - dynamic_range

  // Create ImageData for pixel-level rendering
  const imageData = ctx.createImageData(physicalWidth, physicalHeight)
  const pixels = imageData.data

  const nFreqs = frequencies.length
  const nTimes = times.length
  const pixelsPerSecond = physicalWidth / duration

  // For each pixel, find the nearest time and frequency bin
  for (let py = 0; py < physicalHeight; py++) {
    // Map pixel y to frequency index (top = high freq, bottom = low freq)
    const freqRatio = 1 - py / physicalHeight
    const freqIdx = Math.min(nFreqs - 1, Math.max(0, Math.round(freqRatio * (nFreqs - 1))))

    for (let px = 0; px < physicalWidth; px++) {
      // Map pixel x to time
      const timeSec = px / pixelsPerSecond
      // Find nearest time index
      const timeIdx = findNearestIndex(times, timeSec, nTimes)

      if (timeIdx >= 0 && timeIdx < nTimes && energy_matrix[timeIdx]) {
        const dbVal = energy_matrix[timeIdx][freqIdx] ?? minDb
        const normalized = Math.max(0, Math.min(1, (dbVal - minDb) / dynamic_range))
        const [r, g, b] = energyToColor(normalized)

        const offset = (py * physicalWidth + px) * 4
        pixels[offset] = r
        pixels[offset + 1] = g
        pixels[offset + 2] = b
        pixels[offset + 3] = 255 // fully opaque
      }
    }
  }

  ctx.putImageData(imageData, 0, 0)
}

/**
 * Render formant tracks (F1-F5) as colored lines on top of the spectrogram.
 */
export function renderFormantTracks(
  ctx: CanvasRenderingContext2D,
  formants: FormantDataInput,
  options: SpectrogramRenderOptions,
  maxFreq: number
): void {
  const { width, height, duration } = options
  const dpr = options.dpr ?? Math.min(window.devicePixelRatio || 1, 2)

  const pixelsPerSecond = (width * dpr) / duration
  const physicalHeight = Math.floor(height * dpr)

  const formantArrays = [formants.f1, formants.f2, formants.f3, formants.f4, formants.f5]
  const fTimes = formants.times

  formantArrays.forEach((fArr, idx) => {
    if (!fArr || !fArr.length) return

    ctx.strokeStyle = FORMANT_COLORS[idx]
    ctx.lineWidth = 1.5 * dpr
    ctx.globalAlpha = 0.85
    ctx.beginPath()
    let started = false

    for (let i = 0; i < fArr.length; i++) {
      const freq = fArr[i]
      if (freq <= 0 || freq > maxFreq) {
        if (started) {
          ctx.stroke()
          ctx.beginPath()
          started = false
        }
        continue
      }

      const x = fTimes[i] * pixelsPerSecond
      const y = physicalHeight * (1 - freq / maxFreq)

      if (!started) {
        ctx.moveTo(x, y)
        started = true
      } else {
        ctx.lineTo(x, y)
      }
    }
    if (started) ctx.stroke()
  })

  ctx.globalAlpha = 1
}

/**
 * Render intensity or HNR curve on the spectrogram canvas.
 */
export function renderOverlayCurve(
  ctx: CanvasRenderingContext2D,
  times: number[],
  values: number[],
  options: SpectrogramRenderOptions,
  color: string,
  minVal: number,
  maxVal: number
): void {
  if (!times.length || !values.length) return

  const { width, height, duration } = options
  const dpr = options.dpr ?? Math.min(window.devicePixelRatio || 1, 2)
  const pixelsPerSecond = (width * dpr) / duration
  const physicalHeight = Math.floor(height * dpr)
  const range = maxVal - minVal

  ctx.strokeStyle = color
  ctx.lineWidth = 1.5 * dpr
  ctx.globalAlpha = 0.7
  ctx.beginPath()
  let started = false

  for (let i = 0; i < times.length; i++) {
    const val = values[i]
    if (val <= 0) {
      if (started) {
        ctx.stroke()
        ctx.beginPath()
        started = false
      }
      continue
    }

    const x = times[i] * pixelsPerSecond
    const normalized = range > 0 ? (val - minVal) / range : 0.5
    const y = physicalHeight * (1 - Math.max(0, Math.min(1, normalized)))

    if (!started) {
      ctx.moveTo(x, y)
      started = true
    } else {
      ctx.lineTo(x, y)
    }
  }
  if (started) ctx.stroke()
  ctx.globalAlpha = 1
}

/**
 * Draw frequency axis labels on the right edge of the spectrogram.
 */
export function renderFrequencyAxis(
  ctx: CanvasRenderingContext2D,
  maxFreq: number,
  options: SpectrogramRenderOptions
): void {
  const { width, height } = options
  const dpr = options.dpr ?? Math.min(window.devicePixelRatio || 1, 2)
  const physicalWidth = Math.floor(width * dpr)
  const physicalHeight = Math.floor(height * dpr)

  ctx.fillStyle = 'rgba(255, 255, 255, 0.8)'
  ctx.font = `${10 * dpr}px sans-serif`
  ctx.textAlign = 'right'

  // Pick frequency markers every 1000 Hz
  const step = maxFreq > 4000 ? 1000 : 500
  for (let freq = step; freq < maxFreq; freq += step) {
    const y = physicalHeight * (1 - freq / maxFreq)
    // Draw faint horizontal line
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)'
    ctx.lineWidth = 0.5 * dpr
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(physicalWidth, y)
    ctx.stroke()
    // Draw label
    ctx.fillText(`${freq}`, physicalWidth - 4 * dpr, y + 4 * dpr)
  }
}

/**
 * Binary search for the nearest index in a sorted array.
 */
function findNearestIndex(arr: number[], target: number, len: number): number {
  if (len === 0) return -1
  if (target <= arr[0]) return 0
  if (target >= arr[len - 1]) return len - 1

  let lo = 0
  let hi = len - 1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (arr[mid] === target) return mid
    if (arr[mid] < target) lo = mid + 1
    else hi = mid - 1
  }

  // lo is the insertion point; compare neighbors
  if (lo >= len) return len - 1
  if (lo === 0) return 0
  return Math.abs(arr[lo] - target) < Math.abs(arr[lo - 1] - target) ? lo : lo - 1
}
