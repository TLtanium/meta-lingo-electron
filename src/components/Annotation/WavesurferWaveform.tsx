/**
 * WavesurferWaveform Component
 * Displays audio waveform with word-level alignment, F0 pitch curve, and region selection
 * Uses Wavesurfer.js for waveform rendering
 */

import React, { useEffect, useRef, useState, useCallback, useImperativeHandle, forwardRef } from 'react'
import WaveSurfer from 'wavesurfer.js'
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.js'
import { Box, Typography, IconButton, Switch, FormControlLabel, Chip, Stack, Tooltip, ToggleButton, useTheme } from '@mui/material'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import PauseIcon from '@mui/icons-material/Pause'
import StopIcon from '@mui/icons-material/Stop'
import ZoomInIcon from '@mui/icons-material/ZoomIn'
import ZoomOutIcon from '@mui/icons-material/ZoomOut'
import ShowChartIcon from '@mui/icons-material/ShowChart'
import Forward5Icon from '@mui/icons-material/Forward5'
import Replay5Icon from '@mui/icons-material/Replay5'
import HighlightAltIcon from '@mui/icons-material/HighlightAlt'
import { useTranslation } from 'react-i18next'
import type { AudioBox } from '../../types'

// Types
interface WordAlignment {
  word: string
  start: number
  end: number
  score: number
}

interface PitchData {
  enabled: boolean
  hop_length_ms: number
  sample_rate: number
  fmin: number
  fmax: number
  f0: number[]
  periodicity: number[]
  times: number[]
}

interface TimeRange {
  start: number
  end: number
}

// 选中的标签
interface SelectedLabel {
  node: { name: string }
  color: string
  path: string
}

interface WavesurferWaveformProps {
  audioUrl: string
  duration: number
  currentTime: number
  wordAlignments?: WordAlignment[]
  pitchData?: PitchData
  selectedRange?: TimeRange | null
  onSeek?: (time: number) => void
  onTimeUpdate?: (time: number) => void
  onDurationChange?: (duration: number) => void
  onRangeSelect?: (range: TimeRange) => void
  onWordClick?: (word: WordAlignment) => void
  onPlay?: () => void
  onPause?: () => void
  height?: number  // 默认 300，波形图高度
  // 画框标注相关
  selectedLabel?: SelectedLabel | null
  savedAudioBoxes?: AudioBox[]
  onAudioBoxAdd?: (box: Omit<AudioBox, 'id'>) => void
  onDrawModeChange?: (isDrawMode: boolean) => void  // 通知父组件画框模式状态
  // 初始缩放级别（用于数据可视化等场景）
  initialZoom?: number
  // Pre-computed waveform peaks (to skip Web Audio API decode which crashes in Electron packaged app)
  precomputedPeaks?: number[]
}

// Exposed methods via ref
export interface WavesurferWaveformRef {
  seekTo: (time: number) => void
  play: () => void
  pause: () => void
  exportToSVG: () => string | null  // 导出为 SVG 字符串
}

// Color utilities
const getScoreColor = (score: number): string => {
  // Green for high scores, red for low scores
  const hue = score * 120 // 0 = red, 120 = green
  return `hsla(${hue}, 70%, 50%, 0.3)`
}

const WavesurferWaveform = forwardRef<WavesurferWaveformRef, WavesurferWaveformProps>(({
  audioUrl,
  duration: externalDuration,
  currentTime,
  wordAlignments = [],
  pitchData,
  selectedRange,
  onSeek,
  onTimeUpdate,
  onDurationChange,
  onRangeSelect,
  onWordClick,
  onPlay,
  onPause,
  height = 300,  // 与视频播放框高度一致
  selectedLabel,
  savedAudioBoxes = [],
  onAudioBoxAdd,
  onDrawModeChange,
  initialZoom,
  precomputedPeaks
}, ref) => {
  const { t } = useTranslation()
  const theme = useTheme()
  const isDarkMode = theme.palette.mode === 'dark'
  
  // 主题相关颜色
  const themeColors = {
    background: isDarkMode ? '#1e1e1e' : '#fafafa',
    waveColor: isDarkMode ? '#7c78b8' : '#4F4A85',
    progressColor: isDarkMode ? '#5a5690' : '#383351',
    textColor: isDarkMode ? '#e0e0e0' : '#333',
    labelBg: isDarkMode ? 'rgba(30, 30, 30, 0.85)' : 'rgba(255, 255, 255, 0.7)',
    tooltipBg: isDarkMode ? 'rgba(50, 50, 50, 0.95)' : 'rgba(0, 0, 0, 0.8)',
    tooltipText: isDarkMode ? '#e0e0e0' : '#fff',
  }
  
  const containerRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const boxCanvasRef = useRef<HTMLCanvasElement>(null)  // 画框 Canvas
  const wavesurferRef = useRef<WaveSurfer | null>(null)
  const regionsRef = useRef<ReturnType<typeof RegionsPlugin.create> | null>(null)
  const zoomRef = useRef(100) // Store zoom value for event handlers
  
  const [isPlaying, setIsPlaying] = useState(false)
  const [isReady, setIsReady] = useState(false)
  const [zoom, setZoom] = useState(initialZoom || 100) // pixels per second (higher for better word visibility)
  const [showPitch, setShowPitch] = useState(true)
  const [hoveredWord] = useState<WordAlignment | null>(null)
  const [internalTime, setInternalTime] = useState(0)
  const [viewportWidth, setViewportWidth] = useState(800)
  
  // 画框模式状态
  const [drawMode, setDrawMode] = useState(false)
  const drawModeRef = useRef(false)  // 用于在事件处理器中访问最新状态
  const [isDrawing, setIsDrawing] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null)
  const [currentBox, setCurrentBox] = useState<{ 
    x1: number; y1: number; x2: number; y2: number; 
    label: string; color: string 
  } | null>(null)
  
  // 同步 drawMode 状态到 ref
  useEffect(() => {
    drawModeRef.current = drawMode
  }, [drawMode])
  
  // 同步 initialZoom 变化（仅在 initialZoom 改变时更新）
  useEffect(() => {
    if (initialZoom !== undefined) {
      setZoom(initialZoom)
    }
  }, [initialZoom])
  
  // Internal duration state (from WaveSurfer)
  const [duration, setDuration] = useState(externalDuration || 1)
  
  // Calculate container width based on duration and zoom
  // Add viewportWidth/2 extra space so playhead can stay centered until the very end
  // NOTE: Must be defined BEFORE useCallback that depends on it
  const containerWidth = Math.max(
    Math.ceil((duration || 1) * zoom + viewportWidth / 2),
    800
  )
  
  // Track viewport width for container sizing
  useEffect(() => {
    if (!scrollContainerRef.current) return
    
    const updateViewportWidth = () => {
      if (scrollContainerRef.current) {
        setViewportWidth(scrollContainerRef.current.clientWidth)
      }
    }
    
    updateViewportWidth()
    
    const resizeObserver = new ResizeObserver(updateViewportWidth)
    resizeObserver.observe(scrollContainerRef.current)
    
    return () => resizeObserver.disconnect()
  }, [])

  // 导出为 SVG 的方法 - 创建完整波形 canvas，补充截断部分
  const exportToSVG = useCallback((): string | null => {
    try {
      const ws = wavesurferRef.current
      
      if (!ws) {
        console.warn('[exportToSVG] No WaveSurfer instance')
        return null
      }
      
      // 获取 WaveSurfer 的 canvas
      const renderer = (ws as any).renderer
      let waveCanvas: HTMLCanvasElement | null = null
      if (renderer?.wrapper) {
        waveCanvas = renderer.wrapper.querySelector('canvas')
      }
      if (!waveCanvas) {
        const container = (ws as any).options?.container
        if (container) {
          waveCanvas = container.querySelector('canvas')
        }
      }
      
      const pitchCanvas = canvasRef.current
      
      if (!waveCanvas) {
        console.warn('[exportToSVG] No waveform canvas found')
        return null
      }
      
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const svgWidth = containerWidth
      const svgHeight = height
      const waveCanvasCssWidth = waveCanvas.width / dpr
      
      // 创建完整尺寸的离屏 canvas 用于合成波形
      const fullWaveCanvas = document.createElement('canvas')
      fullWaveCanvas.width = Math.ceil(svgWidth * dpr)
      fullWaveCanvas.height = Math.ceil(svgHeight * dpr)
      const fullCtx = fullWaveCanvas.getContext('2d')
      
      if (fullCtx) {
        // 先填充背景色（适配主题）
        fullCtx.fillStyle = themeColors.background
        fullCtx.fillRect(0, 0, fullWaveCanvas.width, fullWaveCanvas.height)
        
        // 复制 WaveSurfer 的 canvas 内容
        fullCtx.drawImage(waveCanvas, 0, 0)
        
        // 如果 WaveSurfer canvas 不够宽，用 getDecodedData 补充剩余部分
        if (waveCanvasCssWidth < svgWidth) {
          try {
            const decodedData = (ws as any).getDecodedData?.()
            if (decodedData) {
              const channelData = decodedData.getChannelData(0)
              const totalSamples = channelData.length
              
              // 计算需要补充的起始位置
              const startX = waveCanvasCssWidth
              const endX = svgWidth
              
              // 计算对应的时间范围
              const startTime = startX / zoom
              const endTime = duration
              
              // 计算对应的采样点范围
              const sampleRate = decodedData.sampleRate
              const startSample = Math.floor(startTime * sampleRate)
              const endSample = Math.min(Math.floor(endTime * sampleRate), totalSamples)
              
              // 计算每像素对应的采样点数
              const pixelWidth = endX - startX
              const samplesPerPixel = (endSample - startSample) / pixelWidth
              
              // 绘制补充部分的波形
              fullCtx.fillStyle = '#4F4A85'
              const waveformY = svgHeight / 2
              const waveformHeight = svgHeight * 0.4
              
              for (let px = 0; px < pixelWidth; px++) {
                const sampleStart = startSample + Math.floor(px * samplesPerPixel)
                const sampleEnd = Math.min(sampleStart + Math.ceil(samplesPerPixel), totalSamples)
                
                let maxVal = 0
                for (let s = sampleStart; s < sampleEnd; s++) {
                  const absVal = Math.abs(channelData[s])
                  if (absVal > maxVal) maxVal = absVal
                }
                
                const barHeight = maxVal * waveformHeight * 2
                const x = (startX + px) * dpr
                const y = (waveformY - barHeight / 2) * dpr
                const barW = Math.max(1, dpr)
                const barH = barHeight * dpr
                
                fullCtx.fillRect(x, y, barW, barH)
              }
            }
          } catch (e) {
            console.warn('[exportToSVG] Failed to supplement waveform:', e)
          }
        }
      }
      
      // 创建 SVG 元素
      let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${svgWidth}" height="${svgHeight}" viewBox="0 0 ${svgWidth} ${svgHeight}">\n`
      
      // 添加背景
      svg += `  <rect width="${svgWidth}" height="${svgHeight}" fill="${themeColors.background}"/>\n`
      
      // 添加时间刻度
      const tickInterval = 5
      for (let t = 0; t <= duration; t += tickInterval) {
        const x = t * zoom
        svg += `  <line x1="${x}" y1="0" x2="${x}" y2="${svgHeight}" stroke="#e0e0e0" stroke-width="1"/>\n`
        svg += `  <text x="${x + 2}" y="12" font-size="10" fill="#666">${t}s</text>\n`
      }
      
      // 嵌入完整波形 canvas
      if (fullCtx) {
        try {
          const waveDataUrl = fullWaveCanvas.toDataURL('image/png')
          svg += `  <image href="${waveDataUrl}" x="0" y="0" width="${svgWidth}" height="${svgHeight}"/>\n`
        } catch (e) {
          console.warn('[exportToSVG] Failed to export full waveform:', e)
        }
      }
      
      // 将音高 canvas 转为 base64 嵌入
      if (pitchCanvas && showPitch) {
        try {
          const pitchDataUrl = pitchCanvas.toDataURL('image/png')
          const pitchWidth = pitchCanvas.width / dpr
          const pitchHeight = pitchCanvas.height / dpr
          svg += `  <image href="${pitchDataUrl}" x="0" y="0" width="${pitchWidth}" height="${pitchHeight}" opacity="0.8"/>\n`
        } catch (e) {
          console.warn('[exportToSVG] Failed to export pitch canvas:', e)
        }
      }
      
      // 用 SVG 矢量绘制画框（保持清晰）
      savedAudioBoxes.forEach((box) => {
        const x1 = box.startTime * zoom
        const x2 = box.endTime * zoom
        const y1 = box.y * svgHeight
        const bh = box.height * svgHeight
        const boxW = x2 - x1
        
        // 框背景
        svg += `  <rect x="${x1}" y="${y1}" width="${boxW}" height="${bh}" fill="${box.color}" fill-opacity="0.25" stroke="${box.color}" stroke-width="2"/>\n`
        
        // 标签背景
        const labelY = Math.max(0, y1 - 16)
        svg += `  <rect x="${x1}" y="${labelY}" width="${box.label.length * 7 + 8}" height="16" fill="${box.color}"/>\n`
        
        // 标签文字
        svg += `  <text x="${x1 + 4}" y="${labelY + 12}" font-size="11" font-weight="bold" fill="white">${box.label}</text>\n`
      })
      
      // 添加单词对齐标记
      wordAlignments.forEach((word) => {
        const x = word.start * zoom
        const w = Math.max(4, (word.end - word.start) * zoom)
        svg += `  <rect x="${x}" y="${svgHeight - 24}" width="${w}" height="24" fill="${getScoreColor(word.score)}" stroke="#666" stroke-width="0.5"/>\n`
        if (w > 20) {
          svg += `  <text x="${x + 2}" y="${svgHeight - 8}" font-size="9" fill="${themeColors.textColor}">${word.word}</text>\n`
        }
      })
      
      svg += `</svg>`
      return svg
    } catch (error) {
      console.error('[exportToSVG] Failed:', error)
      return null
    }
  }, [containerWidth, height, duration, zoom, showPitch, savedAudioBoxes, wordAlignments])

  // Expose methods via ref
  useImperativeHandle(ref, () => ({
    seekTo: (time: number) => {
      if (wavesurferRef.current && isReady) {
        wavesurferRef.current.setTime(time)
        setInternalTime(time)
        onTimeUpdate?.(time)
      }
    },
    play: () => {
      wavesurferRef.current?.play()
    },
    pause: () => {
      wavesurferRef.current?.pause()
    },
    exportToSVG
  }), [isReady, onTimeUpdate, exportToSVG])

  // Keep zoomRef in sync with zoom state for event handlers
  useEffect(() => {
    zoomRef.current = zoom
  }, [zoom])

  // Initialize WaveSurfer
  useEffect(() => {
    if (!containerRef.current || !audioUrl) return

    // Reset error state
    setLoadError(null)

    // Destroy previous instance
    if (wavesurferRef.current) {
      wavesurferRef.current.destroy()
    }

    try {
      // Create regions plugin
      const regions = RegionsPlugin.create()
      regionsRef.current = regions

      // Create WaveSurfer instance - WaveSurfer handles all audio playback
      const ws = WaveSurfer.create({
        container: containerRef.current,
        waveColor: themeColors.waveColor,
        progressColor: themeColors.progressColor,
        cursorColor: '#f44336',
        cursorWidth: 2,
        height: height,
        minPxPerSec: zoom,
        normalize: true,
        plugins: [regions],
        mediaControls: false,
        autoplay: false,
        interact: true,
      })

      wavesurferRef.current = ws

      // Error handling for audio load failures
      ws.on('error', (err) => {
        console.error('[WavesurferWaveform] WaveSurfer error:', err)
        setLoadError(typeof err === 'string' ? err : 'Failed to load audio')
      })

      // Load audio - ws.load returns a Promise
      // If precomputed peaks are available, pass them to skip Web Audio API decode (fixes crash in Electron packaged app)
      const loadPromise = precomputedPeaks && precomputedPeaks.length > 0
        ? ws.load(audioUrl, [precomputedPeaks])  // Pass peaks as [peaks] for single channel
        : ws.load(audioUrl)
      
      if (loadPromise && typeof loadPromise.catch === 'function') {
        loadPromise.catch((err: any) => {
          setLoadError(err?.message || String(err))
        });
      }

    // Event handlers
    ws.on('ready', () => {
      setIsReady(true)
      const wsDuration = ws.getDuration()
      setDuration(wsDuration)
      onDurationChange?.(wsDuration)

      // Add word alignment regions with text labels
      if (wordAlignments.length > 0) {
        wordAlignments.forEach((word, index) => {
          // Create a styled content element for better visibility
          const contentEl = document.createElement('span')
          contentEl.textContent = word.word
          contentEl.style.cssText = `
            font-size: 10px;
            font-weight: 500;
            color: ${themeColors.textColor};
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            padding: 1px 2px;
            background: ${themeColors.labelBg};
            border-radius: 2px;
            position: absolute;
            bottom: 2px;
            left: 2px;
            max-width: calc(100% - 4px);
          `
          
          regions.addRegion({
            start: word.start,
            end: word.end,
            content: contentEl,
            color: getScoreColor(word.score),
            drag: false,
            resize: false,
            id: `word-${index}`,
          })
        })
      }
    })

    ws.on('play', () => {
      setIsPlaying(true)
      onPlay?.()
    })

    ws.on('pause', () => {
      setIsPlaying(false)
      onPause?.()
      // Center playhead on pause
      const currentTime = ws.getCurrentTime()
      const currentZoom = zoomRef.current
      const wsDuration = ws.getDuration()
      
      if (scrollContainerRef.current) {
        const containerRect = scrollContainerRef.current.getBoundingClientRect()
        const vpWidth = containerRect.width
        const playheadPosition = currentTime * currentZoom
        // fullWidth matches containerWidth: duration * zoom + viewport/2
        const fullWidth = wsDuration * currentZoom + vpWidth / 2
        const maxScroll = Math.max(0, fullWidth - vpWidth)
        
        // Simply clamp scroll position to valid range
        let targetScroll = playheadPosition - (vpWidth / 2)
        targetScroll = Math.max(0, Math.min(targetScroll, maxScroll))
        scrollContainerRef.current.scrollLeft = targetScroll
      }
    })

    ws.on('audioprocess', (time: number) => {
      setInternalTime(time)
      onTimeUpdate?.(time)
      
      // Auto-scroll to keep playhead centered during playback using ref for current zoom
      const currentZoom = zoomRef.current
      if (scrollContainerRef.current) {
        const containerRect = scrollContainerRef.current.getBoundingClientRect()
        const vpWidth = containerRect.width
        const playheadPosition = time * currentZoom
        const wsDuration = ws.getDuration()
        // fullWidth matches containerWidth: duration * zoom + viewport/2
        const fullWidth = wsDuration * currentZoom + vpWidth / 2
        const maxScroll = Math.max(0, fullWidth - vpWidth)
        
        // Simply clamp scroll position to valid range
        let targetScroll = playheadPosition - (vpWidth / 2)
        targetScroll = Math.max(0, Math.min(targetScroll, maxScroll))
        scrollContainerRef.current.scrollLeft = targetScroll
      }
    })

    ws.on('seeking', (time: number) => {
      setInternalTime(time)
      onSeek?.(time)
      onTimeUpdate?.(time)
    })

    ws.on('click', (relativeX: number) => {
      const wsDuration = ws.getDuration()
      const time = relativeX * wsDuration
      onSeek?.(time)
    })

    // Region click handler - 画框模式下不触发
    regions.on('region-clicked', (region: any, e: MouseEvent) => {
      e.stopPropagation()
      if (drawModeRef.current) return  // 画框模式下忽略点击
      const index = parseInt(region.id.replace('word-', ''))
      if (!isNaN(index) && wordAlignments[index]) {
        onWordClick?.(wordAlignments[index])
      }
    })

    // 禁用 WaveSurfer 的拖选功能，使用我们自己的画框功能
    // regions.enableDragSelection 已移除，避免与画框功能冲突

      return () => {
        ws.destroy()
      }
    } catch (err) {
      console.error('[WavesurferWaveform] Failed to initialize WaveSurfer:', err)
      setLoadError(err instanceof Error ? err.message : 'Failed to initialize audio player')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioUrl, height, isDarkMode])

  // Update zoom and center playhead
  useEffect(() => {
    if (!wavesurferRef.current || !isReady) return
    
    // 直接更新 WaveSurfer 的 zoom
    wavesurferRef.current.zoom(zoom)
    
    // 更新滚动位置
    requestAnimationFrame(() => {
      if (wavesurferRef.current && scrollContainerRef.current) {
        const currentTime = wavesurferRef.current.getCurrentTime()
        const wsDuration = wavesurferRef.current.getDuration()
        const containerRect = scrollContainerRef.current.getBoundingClientRect()
        const vpWidth = containerRect.width
        const playheadPosition = currentTime * zoom
        const fullWidth = wsDuration * zoom + vpWidth / 2
        const maxScroll = Math.max(0, fullWidth - vpWidth)
        
        let targetScroll = playheadPosition - (vpWidth / 2)
        targetScroll = Math.max(0, Math.min(targetScroll, maxScroll))
        scrollContainerRef.current.scrollLeft = targetScroll
      }
    })
  }, [zoom, isReady])

  // Sync external time changes
  useEffect(() => {
    if (wavesurferRef.current && isReady && Math.abs(currentTime - internalTime) > 0.1) {
      wavesurferRef.current.setTime(currentTime)
    }
  }, [currentTime, isReady])

  // Draw pitch curve on canvas - MUST wait for isReady to have correct duration
  useEffect(() => {
    // CRITICAL: Wait for WaveSurfer to be ready so we have the correct duration
    if (!canvasRef.current || !pitchData?.enabled || !showPitch || !isReady) return

    // Validate pitchData has all required fields before proceeding
    if (!pitchData.f0 || !pitchData.periodicity || !pitchData.times ||
        typeof pitchData.fmin !== 'number' || typeof pitchData.fmax !== 'number') {
      console.warn('[WavesurferWaveform] pitchData missing required fields')
      return
    }

    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // 限制 DPR 最大为 2，避免高分屏性能问题
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const physicalWidth = Math.floor(containerWidth * dpr)
    const physicalHeight = Math.floor(height * dpr)
    
    // 只有尺寸变化时才重新设置 canvas 尺寸
    if (canvas.width !== physicalWidth || canvas.height !== physicalHeight) {
      canvas.width = physicalWidth
      canvas.height = physicalHeight
      canvas.style.width = `${containerWidth}px`
      canvas.style.height = `${height}px`
    }
    
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.scale(dpr, dpr)

    // Clear canvas
    ctx.clearRect(0, 0, containerWidth, height)

    // Extract validated pitch data
    const { f0, periodicity, times, fmin, fmax } = pitchData
    if (f0.length === 0 || fmin >= fmax) {
      console.warn('[WavesurferWaveform] Invalid pitch data values, skipping render')
      return
    }

    const pixelsPerSecond = containerWidth / duration
    const freqRange = fmax - fmin

    // Draw pitch curve
    ctx.beginPath()
    ctx.strokeStyle = '#FF5722'
    ctx.lineWidth = 2

    let started = false
    for (let i = 0; i < f0.length; i++) {
      const freq = f0[i]
      const conf = periodicity[i]
      const time = times[i]

      // Skip unvoiced (0 frequency) or low confidence
      if (freq <= 0 || conf < 0.3) {
        if (started) {
          ctx.stroke()
          ctx.beginPath()
          started = false
        }
        continue
      }

      const x = time * pixelsPerSecond
      // Map frequency to y (inverted, higher freq = higher on screen)
      const normalizedFreq = (freq - fmin) / freqRange
      const y = height - (normalizedFreq * height * 0.8 + height * 0.1)

      // Adjust alpha based on confidence
      ctx.globalAlpha = Math.max(0.3, conf)

      if (!started) {
        ctx.moveTo(x, y)
        started = true
      } else {
        ctx.lineTo(x, y)
      }
    }
    if (started) {
      ctx.stroke()
    }

    ctx.globalAlpha = 1

    // Draw frequency markers on the right side
    ctx.fillStyle = '#666'
    ctx.font = '10px sans-serif'
    ctx.textAlign = 'right'
    
    const freqMarkers = [100, 200, 300, 400, 500]
    freqMarkers.forEach(freq => {
      if (freq >= fmin && freq <= fmax) {
        const normalizedFreq = (freq - fmin) / freqRange
        const y = height - (normalizedFreq * height * 0.8 + height * 0.1)
        ctx.fillStyle = 'rgba(0, 0, 0, 0.2)'
        ctx.fillRect(0, y, containerWidth, 1)
        ctx.fillStyle = '#666'
        ctx.fillText(`${freq}Hz`, containerWidth - 5, y + 3)
      }
    })

  }, [pitchData, showPitch, containerWidth, height, duration, isReady])

  // Playback controls
  const handlePlayPause = useCallback(() => {
    if (wavesurferRef.current) {
      wavesurferRef.current.playPause()
    }
  }, [])

  const handleStop = useCallback(() => {
    if (wavesurferRef.current) {
      wavesurferRef.current.stop()
    }
  }, [])

  const handleZoomIn = useCallback(() => {
    setZoom(prev => Math.min(prev + 20, 300))
  }, [])

  const handleZoomOut = useCallback(() => {
    setZoom(prev => Math.max(prev - 20, 20))
  }, [])

  // Handle mouse wheel zoom on waveform - zoom centered on mouse position
  const handleWheel = useCallback((e: React.WheelEvent) => {
    // Only zoom if Ctrl/Cmd key is pressed
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault()
      
      const scrollContainer = scrollContainerRef.current
      if (!scrollContainer) return
      
      // Get mouse position relative to scroll container
      const rect = scrollContainer.getBoundingClientRect()
      const mouseX = e.clientX - rect.left
      
      // Calculate time at mouse position before zoom
      const scrollLeft = scrollContainer.scrollLeft
      const positionInContent = scrollLeft + mouseX
      const timeAtMouse = positionInContent / zoom
      
      // Calculate new zoom
      const delta = e.deltaY > 0 ? -20 : 20
      const newZoom = Math.max(20, Math.min(300, zoom + delta))
      
      if (newZoom !== zoom) {
        // Calculate new scroll position to keep mouse position at same time
        const newPositionInContent = timeAtMouse * newZoom
        const newScrollLeft = newPositionInContent - mouseX
        
        setZoom(newZoom)
        requestAnimationFrame(() => {
          if (scrollContainer) {
            scrollContainer.scrollLeft = Math.max(0, newScrollLeft)
          }
        })
      }
    }
  }, [zoom])

  // Skip forward/backward 5 seconds
  const handleForward5 = useCallback(() => {
    if (wavesurferRef.current && isReady) {
      const newTime = Math.min(internalTime + 5, duration)
      wavesurferRef.current.setTime(newTime)
      setInternalTime(newTime)
      onTimeUpdate?.(newTime)
    }
  }, [isReady, internalTime, duration, onTimeUpdate])

  const handleBackward5 = useCallback(() => {
    if (wavesurferRef.current && isReady) {
      const newTime = Math.max(internalTime - 5, 0)
      wavesurferRef.current.setTime(newTime)
      setInternalTime(newTime)
      onTimeUpdate?.(newTime)
    }
  }, [isReady, internalTime, onTimeUpdate])

  // ============= 画框标注功能 =============
  
  // 切换画框模式
  const toggleDrawMode = useCallback(() => {
    const newMode = !drawMode
    setDrawMode(newMode)
    setCurrentBox(null)
    setIsDrawing(false)
    setDrawStart(null)
    
    // 清除任何现有的文本选择
    const selection = window.getSelection()
    if (selection) {
      selection.removeAllRanges()
    }
    
    // 通知父组件画框模式状态变化
    onDrawModeChange?.(newMode)
    
    // 切换 WaveSurfer 的交互模式
    if (wavesurferRef.current) {
      // drawMode 开启时禁用 WaveSurfer 的点击交互
      const wsContainer = wavesurferRef.current.getWrapper()
      if (wsContainer) {
        wsContainer.style.pointerEvents = newMode ? 'none' : 'auto'
      }
    }
  }, [drawMode, onDrawModeChange])

  // 画框 Canvas 鼠标按下 - 按照视频标注的模式简化
  const handleBoxMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!drawMode || !selectedLabel) return
    
    const canvas = boxCanvasRef.current
    if (!canvas) return
    
    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    
    setIsDrawing(true)
    setDrawStart({ x, y })
    setCurrentBox({
      x1: x, y1: y, x2: x, y2: y,
      label: selectedLabel.node.name,
      color: selectedLabel.color
    })
  }, [drawMode, selectedLabel])

  // 画框 Canvas 鼠标移动 - 按照视频标注的模式，直接更新无节流
  const handleBoxMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !drawStart || !drawMode) return
    
    const canvas = boxCanvasRef.current
    if (!canvas) return
    
    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    
    const x1 = Math.min(drawStart.x, x)
    const y1 = Math.min(drawStart.y, y)
    const x2 = Math.max(drawStart.x, x)
    const y2 = Math.max(drawStart.y, y)
    
    setCurrentBox(prev => prev ? { ...prev, x1, y1, x2, y2 } : null)
  }, [isDrawing, drawStart, drawMode])

  // 画框 Canvas 鼠标释放 - 按照视频标注的模式简化
  const handleBoxMouseUp = useCallback(() => {
    // 检查是否需要保存画框
    if (isDrawing && currentBox) {
      const boxWidth = Math.abs(currentBox.x2 - currentBox.x1)
      const boxHeight = Math.abs(currentBox.y2 - currentBox.y1)
      
      if (boxWidth > 10 && boxHeight > 10 && onAudioBoxAdd) {
        // 将像素坐标转换为时间和归一化 Y 坐标
        // Canvas 跟随内容滚动，所以不需要加 scrollLeft
        const startTime = currentBox.x1 / zoom
        const endTime = currentBox.x2 / zoom
        const normalizedY = currentBox.y1 / height
        const normalizedHeight = boxHeight / height
        
        onAudioBoxAdd({
          label: currentBox.label,
          color: currentBox.color,
          startTime: Math.max(0, startTime),
          endTime: Math.min(duration, endTime),
          y: Math.max(0, Math.min(1, normalizedY)),
          height: Math.max(0.1, Math.min(1, normalizedHeight))
        })
      }
    }
    
    // 重置状态
    setIsDrawing(false)
    setDrawStart(null)
    setCurrentBox(null)
  }, [isDrawing, currentBox, zoom, height, duration, onAudioBoxAdd])

  // 绘制画框 Canvas - 按照视频标注的模式，Canvas 跟随内容滚动
  useEffect(() => {
    const canvas = boxCanvasRef.current
    if (!canvas) return
    
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    
    // 使用完整的 containerWidth，Canvas 跟随内容滚动
    const cssWidth = containerWidth
    const cssHeight = height
    
    // 设置 canvas 尺寸（只在变化时更新，避免频繁重置）
    if (canvas.width !== cssWidth || canvas.height !== cssHeight) {
      canvas.width = cssWidth
      canvas.height = cssHeight
    }
    
    // 清除画布
    ctx.clearRect(0, 0, cssWidth, cssHeight)
    
    // 绘制已保存的框
    savedAudioBoxes.forEach(box => {
      const x1 = box.startTime * zoom
      const x2 = box.endTime * zoom
      const y1 = box.y * cssHeight
      const bh = box.height * cssHeight
      const boxW = x2 - x1
      
      // 框背景
      ctx.fillStyle = box.color + '40'
      ctx.fillRect(x1, y1, boxW, bh)
      
      // 框边框
      ctx.strokeStyle = box.color
      ctx.lineWidth = 2
      ctx.setLineDash([])
      ctx.strokeRect(x1, y1, boxW, bh)
      
      // 标签背景（在框上方）
      ctx.font = 'bold 11px Arial'
      const textWidth = ctx.measureText(box.label).width
      const labelHeight = 16
      ctx.fillStyle = box.color
      ctx.fillRect(x1, Math.max(0, y1 - labelHeight), textWidth + 8, labelHeight)
      
      // 标签文字
      ctx.fillStyle = '#fff'
      ctx.fillText(box.label, x1 + 4, Math.max(12, y1 - 4))
    })
    
    // 绘制当前正在画的框（这个框的坐标是相对于 Canvas 的，不需要减去 scrollLeft）
    if (currentBox && isDrawing) {
      const { x1, y1, x2, y2, color, label } = currentBox
      const boxW = x2 - x1
      const boxH = y2 - y1
      
      // 框背景（半透明）
      ctx.fillStyle = color + '33'
      ctx.fillRect(x1, y1, boxW, boxH)
      
      // 框边框（实线）
      ctx.strokeStyle = color
      ctx.lineWidth = 2
      ctx.setLineDash([])
      ctx.strokeRect(x1, y1, boxW, boxH)
      
      // 标签背景
      ctx.font = 'bold 12px Arial'
      const textWidth = ctx.measureText(label).width
      const labelHeight = 18
      ctx.fillStyle = color
      ctx.fillRect(x1, Math.max(0, y1 - labelHeight), textWidth + 10, labelHeight)
      
      // 标签文字
      ctx.fillStyle = '#fff'
      ctx.fillText(label, x1 + 5, Math.max(13, y1 - 5))
    }
    
  }, [containerWidth, height, zoom, savedAudioBoxes, currentBox, isDrawing])

  // Format time
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    const ms = Math.floor((seconds % 1) * 100)
    return `${mins}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`
  }

  // Show error state if audio failed to load
  if (loadError) {
    return (
      <Box sx={{ 
        width: '100%', 
        p: 3, 
        bgcolor: themeColors.background, 
        borderRadius: 1,
        textAlign: 'center'
      }}>
        <Typography color="error" gutterBottom>
          {t('annotation.audioLoadError', 'Failed to load audio')}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {loadError}
        </Typography>
      </Box>
    )
  }

  return (
    <Box sx={{ width: '100%', bgcolor: themeColors.background, borderRadius: 1, overflow: 'hidden' }}>
      {/* Toolbar */}
      <Stack 
        direction="row" 
        spacing={1} 
        alignItems="center" 
        sx={{ p: 1, borderBottom: 1, borderColor: 'divider' }}
      >
        {/* Playback controls */}
        <Tooltip title={t('annotation.backward5', 'Backward 5s')}>
          <IconButton size="small" onClick={handleBackward5} disabled={!isReady}>
            <Replay5Icon />
          </IconButton>
        </Tooltip>
        <IconButton size="small" onClick={handlePlayPause} disabled={!isReady}>
          {isPlaying ? <PauseIcon /> : <PlayArrowIcon />}
        </IconButton>
        <IconButton size="small" onClick={handleStop} disabled={!isReady}>
          <StopIcon />
        </IconButton>
        <Tooltip title={t('annotation.forward5', 'Forward 5s')}>
          <IconButton size="small" onClick={handleForward5} disabled={!isReady}>
            <Forward5Icon />
          </IconButton>
        </Tooltip>

        {/* Time display */}
        <Typography variant="body2" sx={{ minWidth: 100, fontFamily: 'monospace' }}>
          {formatTime(internalTime)} / {formatTime(duration)}
        </Typography>

        <Box sx={{ flexGrow: 1 }} />

        {/* Zoom controls */}
        <Tooltip title={t('annotation.zoomOut', 'Zoom out (Ctrl+Scroll)')}>
          <IconButton size="small" onClick={handleZoomOut}>
            <ZoomOutIcon />
          </IconButton>
        </Tooltip>
        <Tooltip title={t('annotation.zoomTip', 'Ctrl+Scroll to zoom')}>
          <Typography variant="caption" sx={{ minWidth: 60, textAlign: 'center', cursor: 'help' }}>
            {zoom}px/s
          </Typography>
        </Tooltip>
        <Tooltip title={t('annotation.zoomIn', 'Zoom in (Ctrl+Scroll)')}>
          <IconButton size="small" onClick={handleZoomIn}>
            <ZoomInIcon />
          </IconButton>
        </Tooltip>

        {/* Pitch toggle */}
        {pitchData?.enabled && (
          <FormControlLabel
            control={
              <Switch
                size="small"
                checked={showPitch}
                onChange={(e) => setShowPitch(e.target.checked)}
              />
            }
            label={
              <Stack direction="row" spacing={0.5} alignItems="center">
                <ShowChartIcon fontSize="small" />
                <Typography variant="caption">F0</Typography>
              </Stack>
            }
            sx={{ ml: 1 }}
          />
        )}

        {/* 画框模式切换 */}
        {onAudioBoxAdd && (
          <Tooltip title={t('annotation.drawBoxMode', 'Draw box annotation (select a label first)')}>
            <ToggleButton
              value="drawMode"
              selected={drawMode}
              onChange={toggleDrawMode}
              size="small"
              disabled={!selectedLabel}
              sx={{ 
                ml: 1,
                borderColor: drawMode ? 'primary.main' : 'divider',
                bgcolor: drawMode ? 'primary.light' : 'transparent',
                '&.Mui-selected': {
                  bgcolor: 'primary.light',
                  color: 'primary.main',
                  '&:hover': { bgcolor: 'primary.light' }
                }
              }}
            >
              <HighlightAltIcon fontSize="small" />
            </ToggleButton>
          </Tooltip>
        )}
        
        {/* 当前选中标签 */}
        {drawMode && selectedLabel && (
          <Chip
            size="small"
            label={selectedLabel.node.name}
            sx={{ 
              bgcolor: selectedLabel.color + '33',
              borderColor: selectedLabel.color,
              color: selectedLabel.color,
              borderWidth: 1,
              borderStyle: 'solid'
            }}
          />
        )}

        {/* Word count */}
        {wordAlignments.length > 0 && (
          <Chip 
            size="small" 
            label={t('annotation.wordsAligned', '{{count}} words', { count: wordAlignments.length })}
            variant="outlined"
          />
        )}
        
        {/* 音频框标注数量 */}
        {savedAudioBoxes.length > 0 && (
          <Chip 
            size="small" 
            label={t('annotation.audioBoxCount', '{{count}} boxes', { count: savedAudioBoxes.length })}
            variant="outlined"
            color="secondary"
          />
        )}
      </Stack>

      {/* Waveform container */}
      <Box 
        ref={scrollContainerRef}
        onWheel={handleWheel}
        sx={{ 
          position: 'relative', 
          width: '100%', 
          overflowX: 'auto',
          overflowY: 'hidden',
          cursor: drawMode ? 'crosshair' : 'default',
          userSelect: drawMode ? 'none' : 'auto'  // 画框模式禁用文本选择
        }}
      >
        {/* Content container - all overlays inside here */}
        <Box
          sx={{
            minWidth: containerWidth,
            height: height,
            position: 'relative'
          }}
        >
          {/* Waveform - let WaveSurfer manage its own width */}
          <Box
            ref={containerRef}
            sx={{
              width: '100%',
              height: '100%',
              position: 'absolute',
              top: 0,
              left: 0
            }}
          />

          {/* Pitch curve overlay */}
          {pitchData?.enabled && showPitch && (
            <canvas
              ref={canvasRef}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                pointerEvents: 'none',
                width: containerWidth,
                height: height
              }}
            />
          )}

          {/* 画框标注 Canvas 层 - 跟随内容滚动，框能跟着画布移动 */}
          <canvas
            ref={boxCanvasRef}
            onMouseDown={drawMode ? handleBoxMouseDown : undefined}
            onMouseMove={drawMode ? handleBoxMouseMove : undefined}
            onMouseUp={drawMode ? handleBoxMouseUp : undefined}
            onMouseLeave={drawMode ? handleBoxMouseUp : undefined}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: containerWidth,
              height: height,
              cursor: drawMode ? 'crosshair' : 'default',
              pointerEvents: drawMode ? 'auto' : 'none',
              zIndex: drawMode ? 10 : 5
            }}
          />
        </Box>

        {/* Hovered word info */}
        {hoveredWord && (
          <Box
            sx={{
              position: 'absolute',
              top: 4,
              left: 4,
              bgcolor: themeColors.tooltipBg,
              color: themeColors.tooltipText,
              px: 1,
              py: 0.5,
              borderRadius: 1,
              fontSize: 12,
              pointerEvents: 'none'
            }}
          >
            "{hoveredWord.word}" ({hoveredWord.start.toFixed(2)}s - {hoveredWord.end.toFixed(2)}s)
            <br />
            Score: {(hoveredWord.score * 100).toFixed(0)}%
          </Box>
        )}
      </Box>

      {/* Selected range info */}
      {selectedRange && (
        <Box sx={{ p: 1, borderTop: 1, borderColor: 'divider', bgcolor: 'warning.light' }}>
          <Typography variant="caption">
            {t('annotation.selectedRange', 'Selected')}: {formatTime(selectedRange.start)} - {formatTime(selectedRange.end)}
            {' '}({(selectedRange.end - selectedRange.start).toFixed(2)}s)
          </Typography>
        </Box>
      )}
    </Box>
  )
})

WavesurferWaveform.displayName = 'WavesurferWaveform'

export default WavesurferWaveform
