import type { Annotation, VideoBox, VideoFrame, VideoKeyframe } from '../types'

/** Keep the latest adjustment when a frame is visited more than once. */
export function upsertVideoKeyframe(
  keyframes: VideoKeyframe[],
  keyframe: VideoKeyframe
): VideoKeyframe[] {
  return [...keyframes.filter(item => item.frameNumber !== keyframe.frameNumber), keyframe]
    .sort((a, b) => a.frameNumber - b.frameNumber)
}

/** Persist the human anchors as well as the deterministic, linear interpolation. */
export function buildVideoTrack(
  id: number,
  keyframes: VideoKeyframe[],
  currentKeyframe: VideoKeyframe | null,
  labelPath?: string
): VideoBox | null {
  const anchors = keyframes.reduce<VideoKeyframe[]>(upsertVideoKeyframe, [])
  const sequence = currentKeyframe ? upsertVideoKeyframe(anchors, currentKeyframe) : anchors
  if (!sequence.length) return null

  const frames: VideoFrame[] = []
  sequence.forEach((start, index) => {
    const end = sequence[index + 1]
    if (!end) {
      frames.push({ frameNumber: start.frameNumber, bbox: [...start.bbox], time: start.time, label: start.label })
      return
    }
    const count = end.frameNumber - start.frameNumber
    for (let offset = 0; offset < count; offset++) {
      const fraction = offset / count
      frames.push({
        frameNumber: start.frameNumber + offset,
        bbox: start.bbox.map((value, axis) => value + (end.bbox[axis] - value) * fraction) as VideoFrame['bbox'],
        time: start.time + (end.time - start.time) * fraction,
        label: start.label
      })
    }
  })

  const first = sequence[0]
  const last = sequence[sequence.length - 1]
  return {
    id,
    label: first.label,
    labelPath: labelPath || first.label,
    color: first.color || '#E91E63',
    startFrame: first.frameNumber,
    endFrame: last.frameNumber,
    frameCount: frames.length,
    startTime: first.time,
    endTime: last.time,
    interpolation: 'linear',
    keyframes: sequence.map(frame => ({ ...frame, bbox: [...frame.bbox] })),
    frames
  }
}

/** A linked annotation is the table entry for a track, not a second video box. */
export function getUnlinkedVideoAnnotations(annotations: Annotation[], tracks: VideoBox[]): Annotation[] {
  return annotations.filter(annotation => annotation.type === 'video' && !tracks.some(track => {
    if (track.annotationId) return track.annotationId === annotation.id
    // Older archives can contain both representations without an explicit link.
    return annotation.frameNumber === track.startFrame &&
      (annotation.frameCount || 1) === track.frameCount && annotation.label === track.label &&
      annotation.bbox?.every((value, index) => value === track.keyframes[0]?.bbox[index])
  }))
}

export function findVideoTrack(annotationsId: string, tracks: VideoBox[]): VideoBox | undefined {
  return tracks.find(track => track.annotationId === annotationsId)
}
