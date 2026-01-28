/**
 * AudioWaveform Component
 * 音频波形显示组件 - 使用 Web Audio API 绘制波形并支持时间段选择
 * 
 * Features:
 * - Web Audio API waveform visualization
 * - Click/drag to select time range
 * - Sync with timeline scrolling
 * - Transcript segment highlighting
 * - Playhead indicator
 */

import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { Box, Typography, Paper, CircularProgress, Stack, Chip } from '@mui/material'
import type { TranscriptSegment } from '../../types'

interface AudioWaveformProps {
  audioUrl: string
  duration: number
  currentTime: number
  transcriptSegments: TranscriptSegment[]
  onSeek: (time: number) => void
  onRangeSelect?: (start: number, end: number) => void
  selectedRange?: { start: number; end: number } | null
  height?: number
}

// Format time in MM:SS.ms format
function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  const ms = Math.floor((seconds % 1) * 10)
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms}`
}

export default function AudioWaveform({
  audioUrl,
  duration,
  currentTime,
  transcriptSegments,
  onSeek,
  onRangeSelect,
  selectedRange,
  height = 100
}: AudioWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [audioData, setAudioData] = useState<Float32Array | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState<number | null>(null)
  const [dragEnd, setDragEnd] = useState<number | null>(null)
  const [hoveredTime, setHoveredTime] = useState<number | null>(null)

  // Calculate dimensions
  const width = useMemo(() => {
    return Math.max(duration * 50, 800) // 50px per second minimum
  }, [duration])

  const pixelsPerSecond = useMemo(() => {
    return width / Math.max(duration, 1)
  }, [width, duration])

  // Load audio data
  useEffect(() => {
    if (!audioUrl) return

    setLoading(true)
    setError(null)

    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()

    fetch(audioUrl)
      .then(response => {
        if (!response.ok) throw new Error('Failed to fetch audio')
        return response.arrayBuffer()
      })
      .then(arrayBuffer => audioContext.decodeAudioData(arrayBuffer))
      .then(audioBuffer => {
        // Get the audio data from the first channel
        const rawData = audioBuffer.getChannelData(0)
        
        // Downsample for visualization
        const samples = Math.min(rawData.length, width * 2)
        const blockSize = Math.floor(rawData.length / samples)
        const filteredData = new Float32Array(samples)
        
        for (let i = 0; i < samples; i++) {
          let sum = 0
          for (let j = 0; j < blockSize; j++) {
            sum += Math.abs(rawData[i * blockSize + j])
          }
          filteredData[i] = sum / blockSize
        }
        
        setAudioData(filteredData)
        setLoading(false)
      })
      .catch(err => {
        console.error('Audio loading error:', err)
        setError(err.message)
        setLoading(false)
      })
      .finally(() => {
        audioContext.close()
      })
  }, [audioUrl, width])

  // Draw waveform
  useEffect(() => {
    if (!canvasRef.current || !audioData) return

    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    canvas.width = width * dpr
    canvas.height = height * dpr
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`
    ctx.scale(dpr, dpr)

    // Clear canvas
    ctx.fillStyle = '#fafafa'
    ctx.fillRect(0, 0, width, height)

    // Draw transcript segments background
    transcriptSegments.forEach((segment, idx) => {
      const x = segment.start * pixelsPerSecond
      const segWidth = (segment.end - segment.start) * pixelsPerSecond
      ctx.fillStyle = idx % 2 === 0 ? 'rgba(33, 150, 243, 0.05)' : 'rgba(33, 150, 243, 0.1)'
      ctx.fillRect(x, 0, segWidth, height)
    })

    // Draw selected range
    if (selectedRange) {
      const x = selectedRange.start * pixelsPerSecond
      const rangeWidth = (selectedRange.end - selectedRange.start) * pixelsPerSecond
      ctx.fillStyle = 'rgba(255, 152, 0, 0.3)'
      ctx.fillRect(x, 0, rangeWidth, height)
    }

    // Draw drag selection
    if (isDragging && dragStart !== null && dragEnd !== null) {
      const x = Math.min(dragStart, dragEnd) * pixelsPerSecond
      const selWidth = Math.abs(dragEnd - dragStart) * pixelsPerSecond
      ctx.fillStyle = 'rgba(156, 39, 176, 0.3)'
      ctx.fillRect(x, 0, selWidth, height)
    }

    // Draw waveform
    const centerY = height / 2
    const amplitude = height * 0.8

    ctx.beginPath()
    ctx.moveTo(0, centerY)

    // Find max value for normalization
    let maxVal = 0
    for (let i = 0; i < audioData.length; i++) {
      if (audioData[i] > maxVal) maxVal = audioData[i]
    }
    maxVal = maxVal || 1

    // Draw waveform path
    for (let i = 0; i < audioData.length; i++) {
      const x = (i / audioData.length) * width
      const y = centerY - (audioData[i] / maxVal) * amplitude / 2
      ctx.lineTo(x, y)
    }

    // Draw bottom half (mirror)
    for (let i = audioData.length - 1; i >= 0; i--) {
      const x = (i / audioData.length) * width
      const y = centerY + (audioData[i] / maxVal) * amplitude / 2
      ctx.lineTo(x, y)
    }

    ctx.closePath()
    ctx.fillStyle = 'rgba(63, 81, 181, 0.6)'
    ctx.fill()

    // Draw center line
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.1)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(0, centerY)
    ctx.lineTo(width, centerY)
    ctx.stroke()

    // Draw time markers
    const interval = 5 // seconds between markers
    ctx.fillStyle = '#666'
    ctx.font = '10px sans-serif'
    for (let t = 0; t <= duration; t += interval) {
      const x = t * pixelsPerSecond
      ctx.fillStyle = 'rgba(0, 0, 0, 0.2)'
      ctx.fillRect(x, 0, 1, height)
      ctx.fillStyle = '#666'
      ctx.fillText(formatTime(t), x + 2, height - 4)
    }

    // Draw playhead
    const playheadX = currentTime * pixelsPerSecond
    ctx.strokeStyle = '#f44336'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(playheadX, 0)
    ctx.lineTo(playheadX, height)
    ctx.stroke()

    // Draw playhead marker
    ctx.fillStyle = '#f44336'
    ctx.beginPath()
    ctx.arc(playheadX, 6, 6, 0, Math.PI * 2)
    ctx.fill()

    // Draw hover indicator
    if (hoveredTime !== null && !isDragging) {
      const hoverX = hoveredTime * pixelsPerSecond
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)'
      ctx.lineWidth = 1
      ctx.setLineDash([4, 4])
      ctx.beginPath()
      ctx.moveTo(hoverX, 0)
      ctx.lineTo(hoverX, height)
      ctx.stroke()
      ctx.setLineDash([])

      // Draw time tooltip
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)'
      const tooltipText = formatTime(hoveredTime)
      const textWidth = ctx.measureText(tooltipText).width
      ctx.fillRect(hoverX - textWidth / 2 - 4, 10, textWidth + 8, 16)
      ctx.fillStyle = '#fff'
      ctx.fillText(tooltipText, hoverX - textWidth / 2, 22)
    }
  }, [audioData, width, height, duration, currentTime, pixelsPerSecond, transcriptSegments, selectedRange, isDragging, dragStart, dragEnd, hoveredTime])

  // Handle mouse events
  const getTimeFromX = useCallback((clientX: number): number => {
    if (!containerRef.current) return 0
    const rect = containerRef.current.getBoundingClientRect()
    const scrollLeft = containerRef.current.scrollLeft
    const x = clientX - rect.left + scrollLeft
    return Math.max(0, Math.min(duration, x / pixelsPerSecond))
  }, [duration, pixelsPerSecond])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const time = getTimeFromX(e.clientX)
    setIsDragging(true)
    setDragStart(time)
    setDragEnd(time)
  }, [getTimeFromX])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const time = getTimeFromX(e.clientX)
    setHoveredTime(time)

    if (isDragging) {
      setDragEnd(time)
    }
  }, [getTimeFromX, isDragging])

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    if (!isDragging) return

    const time = getTimeFromX(e.clientX)
    
    if (dragStart !== null) {
      const start = Math.min(dragStart, time)
      const end = Math.max(dragStart, time)
      
      // If it's a click (not drag), seek to position
      if (Math.abs(end - start) < 0.5) {
        onSeek(time)
      } else if (onRangeSelect) {
        onRangeSelect(start, end)
      }
    }

    setIsDragging(false)
    setDragStart(null)
    setDragEnd(null)
  }, [isDragging, dragStart, getTimeFromX, onSeek, onRangeSelect])

  const handleMouseLeave = useCallback(() => {
    setHoveredTime(null)
    if (isDragging) {
      setIsDragging(false)
      setDragStart(null)
      setDragEnd(null)
    }
  }, [isDragging])

  // Auto-scroll to keep playhead visible
  useEffect(() => {
    if (containerRef.current) {
      const containerWidth = containerRef.current.clientWidth
      const playheadX = currentTime * pixelsPerSecond
      const scrollLeft = containerRef.current.scrollLeft

      if (playheadX < scrollLeft || playheadX > scrollLeft + containerWidth - 50) {
        containerRef.current.scrollLeft = Math.max(0, playheadX - containerWidth / 2)
      }
    }
  }, [currentTime, pixelsPerSecond])

  // Find current transcript segment
  const currentSegment = useMemo(() => {
    return transcriptSegments.find(s => currentTime >= s.start && currentTime <= s.end)
  }, [transcriptSegments, currentTime])

  if (loading) {
    return (
      <Paper sx={{ p: 3, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <CircularProgress size={24} sx={{ mr: 2 }} />
        <Typography>加载音频波形...</Typography>
      </Paper>
    )
  }

  if (error) {
    return (
      <Paper sx={{ p: 2, bgcolor: 'error.light', color: 'error.contrastText' }}>
        <Typography>加载波形失败: {error}</Typography>
      </Paper>
    )
  }

  return (
    <Paper sx={{ overflow: 'hidden' }}>
      {/* Header */}
      <Box sx={{ 
        px: 2, 
        py: 1, 
        bgcolor: 'grey.50', 
        borderBottom: '1px solid', 
        borderColor: 'divider',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <Typography variant="subtitle2" fontWeight={600}>
          音频波形
        </Typography>
        <Stack direction="row" spacing={1} alignItems="center">
          <Chip 
            label={formatTime(currentTime)} 
            size="small" 
            color="primary" 
            variant="outlined"
          />
          {selectedRange && (
            <Chip 
              label={`选中: ${formatTime(selectedRange.start)} - ${formatTime(selectedRange.end)}`}
              size="small"
              color="secondary"
              onDelete={() => onRangeSelect?.(0, 0)}
            />
          )}
        </Stack>
      </Box>

      {/* Waveform */}
      <Box
        ref={containerRef}
        sx={{
          overflowX: 'auto',
          overflowY: 'hidden',
          cursor: 'pointer'
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
      >
        <canvas
          ref={canvasRef}
          style={{
            display: 'block'
          }}
        />
      </Box>

      {/* Current subtitle */}
      {currentSegment && (
        <Box sx={{ 
          px: 2, 
          py: 1, 
          bgcolor: 'primary.main', 
          color: 'primary.contrastText'
        }}>
          <Typography variant="body2">
            {currentSegment.text}
          </Typography>
        </Box>
      )}
    </Paper>
  )
}

