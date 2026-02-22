/**
 * Spectrogram Rendering Utilities
 * Shared rendering functions for spectrogram heatmap and formant track overlay.
 * Used by both WavesurferWaveform (annotation mode) and AudioVisualization (history view).
 *
 * Rendering approach:
 * - Spectrogram heatmap: create a small offscreen canvas at data resolution
 *   (nTimes × nFreqs), paint each data point as one pixel, then drawImage()
 *   to scale it up to the target canvas. This is orders of magnitude faster
 *   than per-pixel rendering because the browser uses GPU-accelerated scaling.
 * - Formant/overlay curves: drawn with standard Canvas2D stroke operations
 *   in physical pixel coordinates.
 */

/**
 * Convert a normalized energy value [0, 1] to a viridis-like color.
 * 0 = dark purple/black (low energy), 1 = yellow (high energy)
 */
export function energyToColor(normalized: number): [number, number, number] {
  const t = Math.max(0, Math.min(1, normalized))
  let r: number, g: number, b: number

  if (t < 0.25) {
    const s = t / 0.25
    r = Math.round(68 * (1 - s) + 59 * s)
    g = Math.round(1 * (1 - s) + 82 * s)
    b = Math.round(84 * (1 - s) + 139 * s)
  } else if (t < 0.5) {
    const s = (t - 0.25) / 0.25
    r = Math.round(59 * (1 - s) + 33 * s)
    g = Math.round(82 * (1 - s) + 145 * s)
    b = Math.round(139 * (1 - s) + 140 * s)
  } else if (t < 0.75) {
    const s = (t - 0.5) / 0.25
    r = Math.round(33 * (1 - s) + 143 * s)
    g = Math.round(145 * (1 - s) + 215 * s)
    b = Math.round(140 * (1 - s) + 68 * s)
  } else {
    const s = (t - 0.75) / 0.25
    r = Math.round(143 * (1 - s) + 253 * s)
    g = Math.round(215 * (1 - s) + 231 * s)
    b = Math.round(68 * (1 - s) + 37 * s)
  }

  return [r, g, b]
}

/** Formant colors: F1=red, F2=orange, F3=blue, F4=cyan, F5=magenta */
export const FORMANT_COLORS = ['#FF4444', '#FF8800', '#4488FF', '#00CCCC', '#CC44CC']

export interface SpectrogramRenderOptions {
  /** Canvas width in CSS pixels */
  width: number
  /** Canvas height in CSS pixels */
  height: number
  /** Duration in seconds */
  duration: number
  /** Pixels per second (optional) */
  pixelsPerSecond?: number
  /** Device pixel ratio (default min(devicePixelRatio, 2)) */
  dpr?: number
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
 *
 * Strategy: paint an offscreen canvas at data resolution (nTimes × nFreqs),
 * then use drawImage() to scale it up to the target canvas.
 * This is ~100x faster than per-pixel rendering for large canvases.
 */
export function renderSpectrogram(
  ctx: CanvasRenderingContext2D,
  data: SpectrogramDataInput,
  options: SpectrogramRenderOptions
): void {
  const { times, frequencies, energy_matrix, dynamic_range } = data
  if (!times.length || !frequencies.length || !energy_matrix.length) {
    console.warn('[renderSpectrogram] Empty data, skipping')
    return
  }

  const canvasW = ctx.canvas.width
  const canvasH = ctx.canvas.height
  if (canvasW <= 0 || canvasH <= 0) return

  const nTimes = times.length
  const nFreqs = frequencies.length

  // Find max dB for normalization
  let maxDb = -Infinity
  for (let t = 0; t < energy_matrix.length; t++) {
    const row = energy_matrix[t]
    if (!row) continue
    for (let f = 0; f < row.length; f++) {
      if (row[f] > maxDb) maxDb = row[f]
    }
  }
  if (!isFinite(maxDb)) return
  const minDb = maxDb - dynamic_range

  // Create offscreen canvas at DATA resolution (very small: e.g. 2000 x 128)
  const offscreen = document.createElement('canvas')
  offscreen.width = nTimes
  offscreen.height = nFreqs
  const offCtx = offscreen.getContext('2d')
  if (!offCtx) return

  const imageData = offCtx.createImageData(nTimes, nFreqs)
  const pixels = imageData.data

  // Fill pixels: each data point = 1 pixel
  // Row 0 in imageData = top of canvas = highest frequency
  for (let fy = 0; fy < nFreqs; fy++) {
    const freqIdx = nFreqs - 1 - fy  // flip: top = high freq

    for (let tx = 0; tx < nTimes; tx++) {
      const row = energy_matrix[tx]
      if (!row) continue
      const dbVal = row[freqIdx] ?? minDb
      const normalized = Math.max(0, Math.min(1, (dbVal - minDb) / dynamic_range))
      const [r, g, b] = energyToColor(normalized)

      const offset = (fy * nTimes + tx) * 4
      pixels[offset] = r
      pixels[offset + 1] = g
      pixels[offset + 2] = b
      pixels[offset + 3] = 255
    }
  }

  offCtx.putImageData(imageData, 0, 0)

  // Scale the offscreen canvas (nTimes × nFreqs) to the full target canvas (canvasW × canvasH).
  // The browser uses GPU-accelerated bilinear interpolation for smooth scaling.
  // The canvas is always sized to exactly fit the audio width, so we draw to the full canvas.
  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)

  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(offscreen, 0, 0, nTimes, nFreqs, 0, 0, canvasW, canvasH)

  ctx.restore()
}

/**
 * Render formant tracks (F1-F5) as colored dots/lines on top of the spectrogram.
 * Uses dot rendering for Praat-like appearance.
 */
export function renderFormantTracks(
  ctx: CanvasRenderingContext2D,
  formants: FormantDataInput,
  options: SpectrogramRenderOptions,
  maxFreq: number
): void {
  const canvasW = ctx.canvas.width
  const canvasH = ctx.canvas.height
  if (canvasW <= 0 || canvasH <= 0) return

  const { duration } = options
  const dpr = options.dpr ?? Math.min(window.devicePixelRatio || 1, 2)
  const pxPerSec = canvasW / duration

  const formantArrays = [formants.f1, formants.f2, formants.f3, formants.f4, formants.f5]
  const fTimes = formants.times

  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)

  // Render formants as dots (Praat-like) for better readability
  const dotRadius = Math.max(1.5, 1.2 * dpr)

  formantArrays.forEach((fArr, idx) => {
    if (!fArr || !fArr.length) return

    ctx.fillStyle = FORMANT_COLORS[idx]
    ctx.globalAlpha = 0.9

    // Also draw connecting lines for smoother appearance
    ctx.strokeStyle = FORMANT_COLORS[idx]
    ctx.lineWidth = Math.max(1, 0.8 * dpr)
    ctx.globalAlpha = 0.4
    ctx.beginPath()
    let lineStarted = false

    for (let i = 0; i < fArr.length; i++) {
      const freq = fArr[i]
      if (freq <= 0 || freq > maxFreq) {
        if (lineStarted) {
          ctx.stroke()
          ctx.beginPath()
          lineStarted = false
        }
        continue
      }

      const x = fTimes[i] * pxPerSec
      const y = canvasH * (1 - freq / maxFreq)

      if (!lineStarted) {
        ctx.moveTo(x, y)
        lineStarted = true
      } else {
        ctx.lineTo(x, y)
      }
    }
    if (lineStarted) ctx.stroke()

    // Draw dots on top
    ctx.globalAlpha = 0.9
    for (let i = 0; i < fArr.length; i++) {
      const freq = fArr[i]
      if (freq <= 0 || freq > maxFreq) continue

      const x = fTimes[i] * pxPerSec
      const y = canvasH * (1 - freq / maxFreq)

      ctx.beginPath()
      ctx.arc(x, y, dotRadius, 0, Math.PI * 2)
      ctx.fill()
    }
  })

  ctx.globalAlpha = 1
  ctx.restore()
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

  const canvasW = ctx.canvas.width
  const canvasH = ctx.canvas.height
  if (canvasW <= 0 || canvasH <= 0) return

  const { duration } = options
  const dpr = options.dpr ?? Math.min(window.devicePixelRatio || 1, 2)
  const pxPerSec = canvasW / duration
  const range = maxVal - minVal

  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)

  ctx.strokeStyle = color
  ctx.lineWidth = Math.max(1.5, 1.5 * dpr)
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

    const x = times[i] * pxPerSec
    const normalized = range > 0 ? (val - minVal) / range : 0.5
    const y = canvasH * (1 - Math.max(0, Math.min(1, normalized)))

    if (!started) {
      ctx.moveTo(x, y)
      started = true
    } else {
      ctx.lineTo(x, y)
    }
  }
  if (started) ctx.stroke()
  ctx.globalAlpha = 1
  ctx.restore()
}

/**
 * Draw frequency axis labels on the right edge of the spectrogram.
 */
export function renderFrequencyAxis(
  ctx: CanvasRenderingContext2D,
  maxFreq: number,
  options: SpectrogramRenderOptions
): void {
  const canvasW = ctx.canvas.width
  const canvasH = ctx.canvas.height
  if (canvasW <= 0 || canvasH <= 0) return

  const dpr = options.dpr ?? Math.min(window.devicePixelRatio || 1, 2)

  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)

  ctx.fillStyle = 'rgba(255, 255, 255, 0.85)'
  ctx.font = `${Math.max(10, 10 * dpr)}px sans-serif`
  ctx.textAlign = 'right'

  const step = maxFreq > 4000 ? 1000 : 500
  for (let freq = step; freq < maxFreq; freq += step) {
    const y = canvasH * (1 - freq / maxFreq)
    // Faint horizontal line
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)'
    ctx.lineWidth = 0.5 * dpr
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(canvasW, y)
    ctx.stroke()
    // Label with background for readability
    const label = `${freq}`
    const textW = ctx.measureText(label).width
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)'
    ctx.fillRect(canvasW - textW - 8 * dpr, y - 6 * dpr, textW + 4 * dpr, 12 * dpr)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)'
    ctx.fillText(label, canvasW - 4 * dpr, y + 4 * dpr)
  }

  ctx.restore()
}
