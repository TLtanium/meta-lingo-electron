/**
 * MultiTrackTimeline Component
 * 多轨时间轴组件 - DAW 范式设计
 * 
 * Features:
 * - DAW-style playhead behavior (3 phases)
 * - YOLO tracking segments visualization
 * - Whisper transcript segments with timestamps
 * - User annotation track
 * - Keyframe markers
 * - Click to seek
 * - Time ruler
 */

import { useRef, useCallback, useMemo, useEffect, useState } from 'react'
import { Box, Typography, Paper, Tooltip, Chip, Stack } from '@mui/material'
import type { YoloTrack, TranscriptSegment, Annotation, VideoKeyframe } from '../../types'

interface MultiTrackTimelineProps {
  duration: number                    // Total duration in seconds
  currentTime: number                 // Current playback time
  yoloTracks: YoloTrack[]            // YOLO detection tracks
  transcriptSegments: TranscriptSegment[]  // Whisper transcript segments
  annotations: Annotation[]           // User annotations (text + video)
  keyframes: VideoKeyframe[]          // User keyframe markers
  onSeek: (time: number) => void     // Callback when user clicks to seek
  onSegmentClick?: (segment: TranscriptSegment) => void  // Click transcript segment
  onAnnotationClick?: (annotation: Annotation) => void   // Click annotation
  onKeyframeClick?: (keyframe: VideoKeyframe) => void    // Click keyframe
}

// Pixels per second for timeline
const PPS = 50

// Track label width
const LABEL_WIDTH = 80

// Format time in MM:SS format
function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
}

// Generate YOLO track colors based on class name
function getYoloTrackColor(className: string): string {
  const colors: Record<string, string> = {
    person: '#4CAF50',
    car: '#2196F3',
    dog: '#FF9800',
    cat: '#9C27B0',
    bird: '#00BCD4',
    bicycle: '#795548',
    motorcycle: '#E91E63',
    bus: '#3F51B5',
    truck: '#607D8B',
    boat: '#009688'
  }
  return colors[className.toLowerCase()] || '#757575'
}

export default function MultiTrackTimeline({
  duration,
  currentTime,
  yoloTracks,
  transcriptSegments,
  annotations,
  keyframes,
  onSeek,
  onSegmentClick,
  onAnnotationClick,
  onKeyframeClick
}: MultiTrackTimelineProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(0)

  // Calculate timeline width based on duration
  const timelineWidth = useMemo(() => {
    return Math.max(800, duration * PPS)
  }, [duration])

  // Calculate playhead position
  const playheadPosition = useMemo(() => {
    return currentTime * PPS
  }, [currentTime])

  // Get container width on mount and resize
  useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) {
        setContainerWidth(containerRef.current.clientWidth)
      }
    }
    updateWidth()
    window.addEventListener('resize', updateWidth)
    return () => window.removeEventListener('resize', updateWidth)
  }, [])

  // DAW-style auto-scroll behavior
  useEffect(() => {
    if (!scrollContainerRef.current || containerWidth <= 0 || duration <= 0) return

    const viewportWidth = containerWidth - LABEL_WIDTH
    const viewportCenter = viewportWidth / 2
    const maxScroll = Math.max(0, timelineWidth - viewportWidth)

    let targetScroll = 0

    if (playheadPosition <= viewportCenter) {
      // Phase 1: Beginning - no scroll
      targetScroll = 0
    } else if (playheadPosition >= timelineWidth - viewportCenter) {
      // Phase 3: End - max scroll
      targetScroll = maxScroll
    } else {
      // Phase 2: Middle - keep playhead centered
      targetScroll = playheadPosition - viewportCenter
    }

    scrollContainerRef.current.scrollLeft = Math.max(0, Math.min(targetScroll, maxScroll))
  }, [playheadPosition, containerWidth, timelineWidth, duration])

  // Handle click on timeline to seek
  const handleTimelineClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const scrollLeft = scrollContainerRef.current?.scrollLeft || 0
    const clickX = e.clientX - rect.left + scrollLeft
    const time = Math.max(0, Math.min(duration, clickX / PPS))
    onSeek(time)
  }, [duration, onSeek])

  // Generate time markers
  const timeMarkers = useMemo(() => {
    const markers: { time: number; label: string }[] = []
    const interval = 5 // seconds between markers
    for (let t = 0; t <= duration; t += interval) {
      markers.push({ time: t, label: formatTime(t) })
    }
    return markers
  }, [duration])

  // Filter video annotations
  const videoAnnotations = annotations.filter(a => a.type === 'video')
  const textAnnotations = annotations.filter(a => a.type !== 'video')

  // Calculate total height for tracks
  // Always show playback, YOLO and transcript tracks for consistent layout
  const trackHeights = {
    ruler: 25,
    playback: 30,  // Always show playback track
    yolo: 50,      // Always show YOLO track (empty if no data)
    transcript: 50,
    videoAnn: videoAnnotations.length > 0 ? 35 : 0,
    textAnn: textAnnotations.length > 0 ? 35 : 0,
    keyframes: keyframes.length > 0 ? 30 : 0
  }
  const totalHeight = Object.values(trackHeights).reduce((a, b) => a + b, 0)

  return (
    <Paper 
      ref={containerRef}
      sx={{ 
        overflow: 'hidden', 
        bgcolor: '#fafafa', 
        border: '1px solid', 
        borderColor: 'divider', 
        borderRadius: 1 
      }}
    >
      {/* Header */}
      <Box sx={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'space-between',
        px: 2, 
        py: 1, 
        bgcolor: 'grey.100',
        borderBottom: '1px solid',
        borderColor: 'divider'
      }}>
        <Typography variant="subtitle2" fontWeight={600}>
          多轨时间轴
        </Typography>
        <Stack direction="row" spacing={1} alignItems="center">
          <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
            {formatTime(currentTime)} / {formatTime(duration)}
          </Typography>
          <Chip
            size="small"
            label={`YOLO: ${yoloTracks.length}`}
            sx={{ bgcolor: '#4CAF50', color: 'white', fontSize: '0.65rem', height: 20 }}
          />
          <Chip
            size="small"
            label={`转录: ${transcriptSegments.length}`}
            sx={{ bgcolor: '#2196F3', color: 'white', fontSize: '0.65rem', height: 20 }}
          />
        </Stack>
      </Box>

      {/* Timeline container */}
      <Box sx={{ display: 'flex', position: 'relative', height: totalHeight }}>
        {/* Track Labels (fixed left column) */}
        <Box sx={{ 
          width: LABEL_WIDTH, 
          minWidth: LABEL_WIDTH, 
          bgcolor: '#f0f4f8', 
          borderRight: '1px solid',
          borderColor: 'divider',
          flexShrink: 0
        }}>
          {/* Ruler label */}
          <Box sx={{ height: trackHeights.ruler, bgcolor: 'grey.200' }} />
          
          {/* Playback label - always visible */}
          <Box sx={{ 
            height: trackHeights.playback, 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            borderBottom: '1px solid',
            borderColor: 'divider',
            bgcolor: '#fff3e0'
          }}>
            <Typography variant="caption" fontWeight={600} sx={{ color: '#FF5722', fontSize: '0.7rem' }}>
              播放
            </Typography>
          </Box>
          
          {/* YOLO label - always visible */}
          <Box sx={{ 
            height: trackHeights.yolo, 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            borderBottom: '1px solid',
            borderColor: 'divider'
          }}>
            <Typography variant="caption" fontWeight={600} sx={{ color: '#4CAF50', fontSize: '0.7rem' }}>
              YOLO{yoloTracks.length === 0 && ' (无)'}
            </Typography>
          </Box>
          
          {/* Transcript label */}
          <Box sx={{ 
            height: trackHeights.transcript, 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            borderBottom: '1px solid',
            borderColor: 'divider'
          }}>
            <Typography variant="caption" fontWeight={600} sx={{ color: '#2196F3', fontSize: '0.7rem' }}>
              转录
            </Typography>
          </Box>

          {/* Video annotations label */}
          {videoAnnotations.length > 0 && (
            <Box sx={{ 
              height: trackHeights.videoAnn, 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              borderBottom: '1px solid',
              borderColor: 'divider'
            }}>
              <Typography variant="caption" fontWeight={600} sx={{ color: '#FF9800', fontSize: '0.7rem' }}>
                视频标注
              </Typography>
            </Box>
          )}

          {/* Text annotations label */}
          {textAnnotations.length > 0 && (
            <Box sx={{ 
              height: trackHeights.textAnn, 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              borderBottom: '1px solid',
              borderColor: 'divider'
            }}>
              <Typography variant="caption" fontWeight={600} sx={{ color: '#9C27B0', fontSize: '0.7rem' }}>
                文本标注
              </Typography>
            </Box>
          )}

          {/* Keyframes label */}
          {keyframes.length > 0 && (
            <Box sx={{ 
              height: trackHeights.keyframes, 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center'
            }}>
              <Typography variant="caption" fontWeight={600} sx={{ color: '#E91E63', fontSize: '0.7rem' }}>
                关键帧
              </Typography>
            </Box>
          )}
        </Box>

        {/* Scrollable track content */}
        <Box 
          ref={scrollContainerRef}
          sx={{ 
            flex: 1, 
            overflowX: 'auto', 
            overflowY: 'hidden',
            position: 'relative',
            '&::-webkit-scrollbar': { height: 6 },
            '&::-webkit-scrollbar-thumb': { bgcolor: 'grey.400', borderRadius: 3 }
          }}
        >
          <Box 
            sx={{ 
              width: timelineWidth, 
              height: totalHeight, 
              position: 'relative',
              cursor: 'pointer'
            }}
            onClick={handleTimelineClick}
          >
            {/* Time Ruler */}
            <Box sx={{ 
              height: trackHeights.ruler, 
              background: 'linear-gradient(180deg, #f5f5f5 0%, #eeeeee 100%)',
              borderBottom: '1px solid',
              borderColor: 'divider',
              position: 'relative'
            }}>
              {timeMarkers.map((marker) => (
                <Box
                  key={marker.time}
                  sx={{
                    position: 'absolute',
                    left: marker.time * PPS,
                    top: 0,
                    height: '100%',
                    borderLeft: '1px solid',
                    borderColor: 'grey.400'
                  }}
                >
                  <Typography
                    variant="caption"
                    sx={{
                      position: 'absolute',
                      left: 4,
                      top: 5,
                      fontSize: '0.6rem',
                      color: 'text.secondary',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {marker.label}
                  </Typography>
                </Box>
              ))}
            </Box>

            {/* Playback Track - always visible */}
            <Box sx={{ 
              height: trackHeights.playback, 
              position: 'relative',
              borderBottom: '1px solid',
              borderColor: 'divider',
              bgcolor: '#fff8f0',
              background: 'repeating-linear-gradient(90deg, transparent, transparent 49px, #e0e0e0 49px, #e0e0e0 50px)'
            }}>
              {/* Progress indicator */}
              <Box
                sx={{
                  position: 'absolute',
                  left: 0,
                  top: 8,
                  height: 14,
                  width: playheadPosition,
                  bgcolor: 'rgba(255, 87, 34, 0.3)',
                  borderRadius: '0 2px 2px 0'
                }}
              />
              {/* Current frame indicator */}
              <Box
                sx={{
                  position: 'absolute',
                  left: playheadPosition - 6,
                  top: 5,
                  width: 12,
                  height: 20,
                  bgcolor: '#FF5722',
                  borderRadius: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  '&::after': {
                    content: '""',
                    width: 0,
                    height: 0,
                    borderLeft: '4px solid transparent',
                    borderRight: '4px solid transparent',
                    borderTop: '6px solid #FF5722',
                    position: 'absolute',
                    bottom: -5
                  }
                }}
              />
            </Box>

            {/* YOLO Track - always visible */}
            <Box sx={{ 
              height: trackHeights.yolo, 
              position: 'relative',
              borderBottom: '1px solid',
              borderColor: 'divider',
              bgcolor: yoloTracks.length > 0 ? 'white' : '#f5f5f5'
            }}>
              {yoloTracks.length === 0 ? (
                <Box sx={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center', 
                  height: '100%',
                  color: 'grey.400'
                }}>
                  <Typography variant="caption">上传视频时启用 YOLO 检测以显示目标追踪</Typography>
                </Box>
              ) : (
                yoloTracks.map((track, idx) => (
                  <Tooltip
                    key={track.trackId}
                    title={`${track.className} (ID: ${track.trackId})`}
                  >
                    <Box
                      sx={{
                        position: 'absolute',
                        left: track.startTime * PPS,
                        width: Math.max(20, (track.endTime - track.startTime) * PPS),
                        height: 18,
                        top: (idx % 2) * 24 + 5,
                        bgcolor: track.color || getYoloTrackColor(track.className),
                        borderRadius: 0.5,
                        display: 'flex',
                        alignItems: 'center',
                        px: 0.5,
                        overflow: 'hidden',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
                        cursor: 'pointer',
                        '&:hover': { opacity: 0.8 }
                      }}
                      onClick={(e) => {
                        e.stopPropagation()
                        onSeek(track.startTime)
                      }}
                    >
                      <Typography
                        variant="caption"
                        sx={{ color: 'white', fontSize: '0.6rem', whiteSpace: 'nowrap' }}
                      >
                        {track.className}
                      </Typography>
                    </Box>
                  </Tooltip>
                ))
              )}
            </Box>

            {/* Transcript Track */}
            <Box sx={{ 
              height: trackHeights.transcript, 
              position: 'relative',
              borderBottom: '1px solid',
              borderColor: 'divider',
              bgcolor: 'white'
            }}>
              {transcriptSegments.map((segment) => (
                <Tooltip
                  key={segment.id}
                  title={segment.text}
                >
                  <Box
                    onClick={(e) => {
                      e.stopPropagation()
                      onSegmentClick?.(segment)
                    }}
                    sx={{
                      position: 'absolute',
                      left: segment.start * PPS,
                      width: Math.max(30, (segment.end - segment.start) * PPS),
                      height: 40,
                      top: 5,
                      bgcolor: 'rgba(33, 150, 243, 0.1)',
                      border: '1px solid',
                      borderColor: 'primary.main',
                      borderRadius: 0.5,
                      px: 0.5,
                      overflow: 'hidden',
                      cursor: 'pointer',
                      '&:hover': { bgcolor: 'rgba(33, 150, 243, 0.2)' }
                    }}
                  >
                    <Typography
                      variant="caption"
                      sx={{
                        fontSize: '0.6rem',
                        color: 'text.primary',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden'
                      }}
                    >
                      {segment.text}
                    </Typography>
                  </Box>
                </Tooltip>
              ))}
            </Box>

            {/* Video Annotations Track */}
            {videoAnnotations.length > 0 && (
              <Box sx={{ 
                height: trackHeights.videoAnn, 
                position: 'relative',
                borderBottom: '1px solid',
                borderColor: 'divider',
                bgcolor: 'white'
              }}>
                {videoAnnotations.map((ann) => (
                  <Tooltip
                    key={ann.id}
                    title={`${ann.label}: ${ann.text}`}
                  >
                    <Box
                      onClick={(e) => {
                        e.stopPropagation()
                        onAnnotationClick?.(ann)
                      }}
                      sx={{
                        position: 'absolute',
                        left: (ann.timestamp || 0) * PPS,
                        width: 60,
                        height: 24,
                        top: 6,
                        bgcolor: ann.color,
                        borderRadius: 0.5,
                        display: 'flex',
                        alignItems: 'center',
                        px: 0.5,
                        overflow: 'hidden',
                        cursor: 'pointer',
                        '&:hover': { opacity: 0.8 }
                      }}
                    >
                      <Typography
                        variant="caption"
                        sx={{ color: 'white', fontSize: '0.6rem', whiteSpace: 'nowrap' }}
                      >
                        {ann.label}
                      </Typography>
                    </Box>
                  </Tooltip>
                ))}
              </Box>
            )}

            {/* Text Annotations Track */}
            {textAnnotations.length > 0 && (
              <Box sx={{ 
                height: trackHeights.textAnn, 
                position: 'relative',
                borderBottom: '1px solid',
                borderColor: 'divider',
                bgcolor: 'white'
              }}>
                {textAnnotations.map((ann, idx) => {
                  const segment = transcriptSegments.find(
                    s => ann.startPosition >= 0 && ann.startPosition < s.text.length
                  )
                  const time = segment ? segment.start : idx * 2

                  return (
                    <Tooltip
                      key={ann.id}
                      title={`${ann.label}: ${ann.text}`}
                    >
                      <Box
                        onClick={(e) => {
                          e.stopPropagation()
                          onAnnotationClick?.(ann)
                        }}
                        sx={{
                          position: 'absolute',
                          left: time * PPS,
                          minWidth: 40,
                          height: 24,
                          top: 6,
                          bgcolor: ann.color,
                          borderRadius: 0.5,
                          display: 'flex',
                          alignItems: 'center',
                          px: 0.5,
                          overflow: 'hidden',
                          cursor: 'pointer',
                          '&:hover': { opacity: 0.8 }
                        }}
                      >
                        <Typography
                          variant="caption"
                          sx={{ color: 'white', fontSize: '0.6rem', whiteSpace: 'nowrap' }}
                        >
                          {ann.text.slice(0, 8)}...
                        </Typography>
                      </Box>
                    </Tooltip>
                  )
                })}
              </Box>
            )}

            {/* Keyframes Track */}
            {keyframes.length > 0 && (
              <Box sx={{ 
                height: trackHeights.keyframes, 
                position: 'relative',
                bgcolor: 'white'
              }}>
                {keyframes.map((kf, idx) => (
                  <Tooltip
                    key={idx}
                    title={`关键帧 ${idx + 1}: ${kf.label} @ ${formatTime(kf.time)}`}
                  >
                    <Box
                      onClick={(e) => {
                        e.stopPropagation()
                        onKeyframeClick?.(kf)
                      }}
                      sx={{
                        position: 'absolute',
                        left: kf.time * PPS - 8,
                        width: 16,
                        height: 16,
                        top: 7,
                        bgcolor: kf.color || '#E91E63',
                        borderRadius: '50%',
                        border: '2px solid white',
                        boxShadow: 1,
                        cursor: 'pointer',
                        '&:hover': { transform: 'scale(1.2)' }
                      }}
                    />
                  </Tooltip>
                ))}
              </Box>
            )}

            {/* Playhead - Absolute positioned within scrollable area */}
            <Box
              sx={{
                position: 'absolute',
                left: playheadPosition,
                top: 0,
                bottom: 0,
                width: 2,
                bgcolor: '#FF4444',
                zIndex: 100,
                pointerEvents: 'none',
                '&::before': {
                  content: '""',
                  position: 'absolute',
                  top: 0,
                  left: -5,
                  width: 12,
                  height: 12,
                  bgcolor: '#FF4444',
                  borderRadius: '50%'
                }
              }}
            />
          </Box>
        </Box>
      </Box>

      {/* Legend */}
      <Box sx={{ 
        display: 'flex', 
        gap: 1.5, 
        px: 2, 
        py: 1, 
        bgcolor: 'grey.50',
        borderTop: '1px solid',
        borderColor: 'divider',
        flexWrap: 'wrap',
        alignItems: 'center'
      }}>
        <Typography variant="caption" color="text.secondary">
          点击时间轴跳转 | 播放时自动滚动
        </Typography>
        <Box sx={{ flex: 1 }} />
        {videoAnnotations.length > 0 && (
          <Chip
            size="small"
            label={`视频: ${videoAnnotations.length}`}
            sx={{ bgcolor: '#FF9800', color: 'white', fontSize: '0.65rem', height: 18 }}
          />
        )}
        {textAnnotations.length > 0 && (
          <Chip
            size="small"
            label={`文本: ${textAnnotations.length}`}
            sx={{ bgcolor: '#9C27B0', color: 'white', fontSize: '0.65rem', height: 18 }}
          />
        )}
        {keyframes.length > 0 && (
          <Chip
            size="small"
            label={`关键帧: ${keyframes.length}`}
            sx={{ bgcolor: '#E91E63', color: 'white', fontSize: '0.65rem', height: 18 }}
          />
        )}
      </Box>
    </Paper>
  )
}
