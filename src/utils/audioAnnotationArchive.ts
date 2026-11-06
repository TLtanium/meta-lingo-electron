import type { AcousticData } from '../types/corpus'
import type { Annotation, AnnotationArchive, AudioBox, PitchDataArchive, SelectedLabel, WaveformData } from '../types/annotation'

export function createAudioBoxFromPixels(
  box: { x1: number; y1: number; x2: number; y2: number; label: string; color: string; labelPath?: string },
  zoom: number,
  height: number,
  duration: number
): Omit<AudioBox, 'id'> | null {
  if (!(zoom > 0 && height > 0 && duration > 0)) return null
  const startTime = Math.max(0, Math.min(duration, Math.min(box.x1, box.x2) / zoom))
  const endTime = Math.max(0, Math.min(duration, Math.max(box.x1, box.x2) / zoom))
  const y = Math.max(0, Math.min(1, Math.min(box.y1, box.y2) / height))
  const bottom = Math.max(0, Math.min(1, Math.max(box.y1, box.y2) / height))
  if (endTime <= startTime || bottom <= y) return null
  return { label: box.label, labelPath: box.labelPath, color: box.color, startTime, endTime, y, height: bottom - y }
}

interface WaveformInput {
  enabled: boolean
  peaks?: number[]
  duration?: number
  sample_rate?: number
}

interface PitchInput {
  enabled: boolean
  f0?: number[]
  times?: number[]
  fmin?: number
  fmax?: number
  periodicity?: number[]
  hop_length_ms?: number
  sample_rate?: number
}

/** Audio interval annotations must retain both boundaries, independently of video frames. */
export function createAudioIntervalAnnotation(
  start: number,
  end: number,
  label: SelectedLabel,
  text?: string
): Omit<Annotation, 'id'> {
  return {
    text: text || `[${start.toFixed(2)}s - ${end.toFixed(2)}s]`,
    startPosition: 0,
    endPosition: 0,
    label: label.node.name,
    labelPath: label.path,
    color: label.color,
    type: 'audio',
    timestamp: start,
    startTime: start,
    endTime: end
  }
}

/** Keep the numerical analysis, not only the generated SVG preview. */
export function createAudioAnalysisArchive(
  waveform: WaveformInput | null,
  pitch: PitchInput | null,
  acoustic: AcousticData | null
): { waveformData?: WaveformData; pitchData?: PitchDataArchive; acousticData?: AcousticData } {
  return {
    waveformData: waveform?.enabled && waveform.peaks && waveform.duration !== undefined ? {
      enabled: true,
      peaks: waveform.peaks,
      duration: waveform.duration,
      sampleRate: waveform.sample_rate
    } : undefined,
    pitchData: pitch?.enabled && pitch.f0 && pitch.times ? {
      enabled: true,
      f0: pitch.f0,
      times: pitch.times,
      fmin: pitch.fmin ?? 50,
      fmax: pitch.fmax ?? 550,
      periodicity: pitch.periodicity,
      hop_length_ms: pitch.hop_length_ms,
      sample_rate: pitch.sample_rate
    } : undefined,
    acousticData: acoustic?.enabled ? acoustic : undefined
  }
}

export function restoreAudioAnalysis(archive: AnnotationArchive) {
  const waveform = archive.waveformData
  return {
    waveform: waveform ? {
      enabled: waveform.enabled ?? true,
      peaks: waveform.peaks,
      duration: waveform.duration,
      sample_rate: waveform.sampleRate ?? waveform.sample_rate
    } : null,
    pitch: archive.pitchData || null,
    acoustic: archive.acousticData || null
  }
}

export function audioBoxesToCsv(boxes: AudioBox[], headers: string[]): string {
  const quote = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`
  const rows = boxes.map(box => [box.id, box.label, box.labelPath || '', box.startTime, box.endTime,
    box.endTime - box.startTime, box.y, box.height, box.remark ?? box.text ?? ''])
  return [headers, ...rows].map(row => row.map(quote).join(',')).join('\n')
}
