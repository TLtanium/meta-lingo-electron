/**
 * SyntaxVisualization Component
 * Modal dialog for viewing constituency and dependency syntax structures
 * 
 * Features:
 * - Dialog modal presentation
 * - Tab switching between constituency and dependency views
 * - Sentence navigation with arrow controls
 * - Dependency parsing options (compact mode, collapse punct/phrases)
 * - Scrollable visualization area
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Box,
  Dialog,
  DialogTitle,
  DialogContent,
  Tabs,
  Tab,
  Typography,
  IconButton,
  Stack,
  CircularProgress,
  Alert,
  Tooltip,
  FormControlLabel,
  Checkbox,
  Divider,
  useTheme,
  Button
} from '@mui/material'
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp'
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown'
import AccountTreeIcon from '@mui/icons-material/AccountTree'
import DeviceHubIcon from '@mui/icons-material/DeviceHub'
import CloseIcon from '@mui/icons-material/Close'
import ImageIcon from '@mui/icons-material/Image'
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile'
import { useTranslation } from 'react-i18next'
import { syntaxApi } from '../../../api'
import type { DependencyOptions } from '../../../api/syntax'
import ConstituencyTree from './ConstituencyTree'
import DependencyGraph from './DependencyGraph'
import type { 
  SyntaxType, 
  ConstituencyData, 
  DependencyData, 
  SentenceInfo 
} from './types'

interface SyntaxVisualizationProps {
  open: boolean
  onClose: () => void
  sentences: SentenceInfo[]
  initialSentenceIndex?: number
  language?: string
}

export default function SyntaxVisualization({
  open,
  onClose,
  sentences,
  initialSentenceIndex = 0,
  language = 'english'
}: SyntaxVisualizationProps) {
  const { t } = useTranslation()
  const theme = useTheme()
  
  // Current state
  const [syntaxType, setSyntaxType] = useState<SyntaxType>('dependency')
  const [currentIndex, setCurrentIndex] = useState(initialSentenceIndex)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [exporting, setExporting] = useState<'png' | 'svg' | null>(null)
  
  // Refs for export
  const visualizationRef = useRef<HTMLDivElement>(null)
  
  // Dependency options
  const [depOptions, setDepOptions] = useState<DependencyOptions>({
    compact: false,
    collapse_punct: true,
    collapse_phrases: false
  })
  
  // Analysis results cache
  const [constituencyCache, setConstituencyCache] = useState<Map<number, ConstituencyData>>(new Map())
  const [dependencyCache, setDependencyCache] = useState<Map<string, DependencyData>>(new Map())
  
  // Service availability
  const [constituencyAvailable, setConstituencyAvailable] = useState<boolean | null>(null)
  const [dependencyAvailable, setDependencyAvailable] = useState<boolean | null>(null)

  // Current sentence
  const currentSentence = sentences[currentIndex]

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setCurrentIndex(initialSentenceIndex)
      setError(null)
    }
  }, [open, initialSentenceIndex])

  // Check service availability on mount
  useEffect(() => {
    if (!open) return
    
    const checkStatus = async () => {
      try {
        const response = await syntaxApi.getStatus()
        if (response.success && response.data) {
          setConstituencyAvailable(response.data.constituency_available)
          setDependencyAvailable(response.data.dependency_available)
        }
      } catch (err) {
        console.error('Failed to check syntax service status:', err)
      }
    }
    checkStatus()
  }, [open])

  // Generate cache key for dependency with options
  const getDependencyCacheKey = useCallback((index: number) => {
    return `${index}-${depOptions.compact}-${depOptions.collapse_punct}-${depOptions.collapse_phrases}`
  }, [depOptions])

  // Analyze current sentence when index, type, or options change
  useEffect(() => {
    if (!open || !currentSentence) return

    const analyze = async () => {
      setLoading(true)
      setError(null)

      try {
        if (syntaxType === 'constituency') {
          // Check cache first
          if (constituencyCache.has(currentIndex)) {
            setLoading(false)
            return
          }

          const response = await syntaxApi.analyzeConstituency(
            currentSentence.text,
            language
          )

          if (response.success && response.data) {
            if (response.data.success) {
              setConstituencyCache(prev => new Map(prev).set(currentIndex, {
                tree_string: response.data!.tree_string,
                tree_data: response.data!.tree_data
              }))
            } else {
              setError(response.data.error || t('syntax.analysisError', 'Analysis failed'))
            }
          } else {
            setError(response.error || t('syntax.requestError', 'Request failed'))
          }
        } else {
          // Check cache first with options key
          const cacheKey = getDependencyCacheKey(currentIndex)
          if (dependencyCache.has(cacheKey)) {
            setLoading(false)
            return
          }

          const response = await syntaxApi.analyzeDependency(
            currentSentence.text,
            language,
            depOptions
          )

          if (response.success && response.data) {
            if (response.data.success) {
              setDependencyCache(prev => new Map(prev).set(cacheKey, {
                svg_html: response.data!.svg_html,
                tokens: response.data!.tokens,
                arcs: response.data!.arcs
              }))
            } else {
              setError(response.data.error || t('syntax.analysisError', 'Analysis failed'))
            }
          } else {
            setError(response.error || t('syntax.requestError', 'Request failed'))
          }
        }
      } catch (err: any) {
        setError(err.message || t('syntax.unknownError', 'Unknown error'))
      } finally {
        setLoading(false)
      }
    }

    analyze()
  }, [open, currentIndex, syntaxType, currentSentence, language, depOptions, constituencyCache, dependencyCache, getDependencyCacheKey, t])

  // Navigation handlers
  const handlePrevSentence = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1)
    }
  }, [currentIndex])

  const handleNextSentence = useCallback(() => {
    if (currentIndex < sentences.length - 1) {
      setCurrentIndex(prev => prev + 1)
    }
  }, [currentIndex, sentences.length])

  // Tab change handler
  const handleTabChange = (_: React.SyntheticEvent, newValue: SyntaxType) => {
    setSyntaxType(newValue)
    setError(null)
  }

  // Option change handlers
  const handleOptionChange = (option: keyof DependencyOptions) => {
    setDepOptions(prev => ({
      ...prev,
      [option]: !prev[option]
    }))
  }

  // Export handlers
  const handleExportPNG = useCallback(async () => {
    const container = visualizationRef.current
    if (!container) return

    setExporting('png')
    try {
      const svgElement = container.querySelector('svg') as SVGElement
      
      if (!svgElement) {
        throw new Error('No SVG element found')
      }

      // Get SVG dimensions
      const bbox = svgElement.getBBox()
      const svgWidth = Math.max(
        parseFloat(svgElement.getAttribute('width') || '0'),
        bbox.width,
        svgElement.scrollWidth || 800
      )
      const svgHeight = Math.max(
        parseFloat(svgElement.getAttribute('height') || '0'),
        bbox.height,
        svgElement.scrollHeight || 600
      )

      const padding = 40
      const canvasWidth = svgWidth + padding * 2
      const canvasHeight = svgHeight + padding * 2

      // Clone SVG
      const clonedSvg = svgElement.cloneNode(true) as SVGElement
      clonedSvg.setAttribute('width', svgWidth.toString())
      clonedSvg.setAttribute('height', svgHeight.toString())
      
      // Copy computed styles
      const copyStyles = (source: Element, target: Element) => {
        const computedStyle = window.getComputedStyle(source)
        for (let i = 0; i < computedStyle.length; i++) {
          const prop = computedStyle[i]
          ;(target as HTMLElement).style.setProperty(
            prop,
            computedStyle.getPropertyValue(prop)
          )
        }
        
        // Recursively copy styles for children
        for (let i = 0; i < source.children.length; i++) {
          if (target.children[i]) {
            copyStyles(source.children[i], target.children[i])
          }
        }
      }
      
      copyStyles(svgElement, clonedSvg)

      // Serialize SVG to string
      const serializer = new XMLSerializer()
      const svgString = serializer.serializeToString(clonedSvg)
      const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' })
      const url = URL.createObjectURL(svgBlob)

      // Create image from SVG
      const img = new Image()
      img.onload = () => {
        // Create canvas
        const canvas = document.createElement('canvas')
        canvas.width = canvasWidth * 2  // 2x for retina
        canvas.height = canvasHeight * 2
        const ctx = canvas.getContext('2d')
        
        if (!ctx) {
          throw new Error('Failed to get canvas context')
        }

        // Set background
        ctx.fillStyle = theme.palette.mode === 'dark' ? '#121212' : '#ffffff'
        ctx.fillRect(0, 0, canvas.width, canvas.height)

        // Draw SVG image with padding
        ctx.drawImage(
          img,
          padding * 2,
          padding * 2,
          svgWidth * 2,
          svgHeight * 2
        )

        // Export to PNG
        canvas.toBlob((blob) => {
          if (!blob) {
            throw new Error('Failed to create blob')
          }
          
          const link = document.createElement('a')
          const fileName = `syntax-${syntaxType}-sentence-${currentIndex + 1}-${Date.now()}.png`
          link.download = fileName
          link.href = URL.createObjectURL(blob)
          link.click()
          
          URL.revokeObjectURL(link.href)
          URL.revokeObjectURL(url)
          setExporting(null)
        }, 'image/png', 1.0)
      }

      img.onerror = () => {
        URL.revokeObjectURL(url)
        throw new Error('Failed to load SVG as image')
      }

      img.src = url
    } catch (error) {
      console.error('PNG export error:', error)
      alert(t('syntax.exportError', 'Export failed: ') + (error as Error).message)
      setExporting(null)
    }
  }, [syntaxType, currentIndex, theme.palette.mode, t])

  const handleExportSVG = useCallback(() => {
    const container = visualizationRef.current
    if (!container) return

    setExporting('svg')
    try {
      let svgElement: SVGElement | null = null

      if (syntaxType === 'dependency') {
        // For dependency, get the SVG from the rendered HTML
        svgElement = container.querySelector('svg') as SVGElement
      } else {
        // For constituency, get the SVG from D3
        svgElement = container.querySelector('svg') as SVGElement
      }

      if (!svgElement) {
        throw new Error('No SVG element found')
      }

      // Clone the SVG to avoid modifying the original
      const clonedSvg = svgElement.cloneNode(true) as SVGElement

      // Get computed styles and apply them
      const computedStyle = window.getComputedStyle(svgElement)
      clonedSvg.setAttribute('style', svgElement.getAttribute('style') || '')

      // Create SVG data URL
      const serializer = new XMLSerializer()
      const svgString = serializer.serializeToString(clonedSvg)
      const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' })
      const url = URL.createObjectURL(svgBlob)

      const link = document.createElement('a')
      const fileName = `syntax-${syntaxType}-sentence-${currentIndex + 1}-${Date.now()}.svg`
      link.download = fileName
      link.href = url
      link.click()

      URL.revokeObjectURL(url)
    } catch (error) {
      console.error('SVG export error:', error)
      alert(t('syntax.exportError', 'Export failed: ') + (error as Error).message)
    } finally {
      setExporting(null)
    }
  }, [syntaxType, currentIndex, t])

  // Get current data
  const constituencyData = constituencyCache.get(currentIndex)
  const dependencyData = dependencyCache.get(getDependencyCacheKey(currentIndex))

  return (
    <Dialog 
      open={open} 
      onClose={onClose}
      maxWidth="lg"
      fullWidth
      PaperProps={{
        sx: {
          height: '80vh',
          maxHeight: 700
        }
      }}
    >
      <DialogTitle sx={{ pb: 1 }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between">
          <Typography variant="h6">
            {t('syntax.viewSyntax', 'Syntax Structure')}
          </Typography>
          <Stack direction="row" spacing={0.5} alignItems="center">
            {/* Export buttons */}
            <Tooltip title={t('syntax.exportPNG', 'Export as PNG')}>
              <span>
                <IconButton
                  size="small"
                  onClick={handleExportPNG}
                  disabled={exporting !== null || loading || !currentSentence}
                  sx={{ 
                    bgcolor: exporting === 'png' ? 'action.disabled' : 'action.hover',
                    '&:hover': { bgcolor: 'primary.light', color: 'white' }
                  }}
                >
                  {exporting === 'png' ? (
                    <CircularProgress size={18} />
                  ) : (
                    <ImageIcon fontSize="small" />
                  )}
                </IconButton>
              </span>
            </Tooltip>
            <Tooltip title={t('syntax.exportSVG', 'Export as SVG')}>
              <span>
                <IconButton
                  size="small"
                  onClick={handleExportSVG}
                  disabled={exporting !== null || loading || !currentSentence}
                  sx={{ 
                    bgcolor: exporting === 'svg' ? 'action.disabled' : 'action.hover',
                    '&:hover': { bgcolor: 'secondary.light', color: 'white' }
                  }}
                >
                  {exporting === 'svg' ? (
                    <CircularProgress size={18} />
                  ) : (
                    <InsertDriveFileIcon fontSize="small" />
                  )}
                </IconButton>
              </span>
            </Tooltip>
            <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
            <IconButton onClick={onClose} size="small">
              <CloseIcon />
            </IconButton>
          </Stack>
        </Stack>
      </DialogTitle>
      
      <DialogContent sx={{ p: 0, display: 'flex', flexDirection: 'column' }}>
        {sentences.length === 0 ? (
          <Box sx={{ p: 3, textAlign: 'center' }}>
            <Typography color="text.secondary">
              {t('syntax.noSentences', 'No sentences available for analysis')}
            </Typography>
          </Box>
        ) : (
          <>
            {/* Header with tabs and navigation */}
            <Box 
              sx={{ 
                px: 2, 
                py: 1, 
                bgcolor: theme.palette.mode === 'dark' ? 'grey.800' : 'grey.100',
                borderBottom: 1,
                borderColor: 'divider'
              }}
            >
              <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={1}>
                {/* Syntax type tabs */}
                <Tabs 
                  value={syntaxType} 
                  onChange={handleTabChange}
                  sx={{ minHeight: 36 }}
                >
                  <Tab 
                    icon={<AccountTreeIcon fontSize="small" />}
                    iconPosition="start"
                    label={t('syntax.constituency', 'Constituency')}
                    value="constituency"
                    disabled={constituencyAvailable === false}
                    sx={{ minHeight: 36, py: 0.5 }}
                  />
                  <Tab 
                    icon={<DeviceHubIcon fontSize="small" />}
                    iconPosition="start"
                    label={t('syntax.dependency', 'Dependency')}
                    value="dependency"
                    disabled={dependencyAvailable === false}
                    sx={{ minHeight: 36, py: 0.5 }}
                  />
                </Tabs>

                {/* Sentence navigation */}
                <Stack direction="row" alignItems="center" spacing={0.5}>
                  <Typography variant="body2" color="text.secondary" sx={{ mr: 1 }}>
                    {t('syntax.sentence', 'Sentence')}
                  </Typography>
                  
                  <Tooltip title={t('syntax.prevSentence', 'Previous sentence')}>
                    <span>
                      <IconButton 
                        size="small" 
                        onClick={handlePrevSentence}
                        disabled={currentIndex === 0}
                        sx={{ 
                          border: 1, 
                          borderColor: 'divider',
                          borderRadius: 1
                        }}
                      >
                        <KeyboardArrowUpIcon fontSize="small" />
                      </IconButton>
                    </span>
                  </Tooltip>
                  
                  <Box 
                    sx={{ 
                      px: 1.5, 
                      py: 0.25,
                      minWidth: 60,
                      textAlign: 'center',
                      bgcolor: 'background.paper',
                      border: 1,
                      borderColor: 'divider',
                      borderRadius: 1
                    }}
                  >
                    <Typography variant="body2" fontWeight={500}>
                      {currentIndex + 1} / {sentences.length}
                    </Typography>
                  </Box>
                  
                  <Tooltip title={t('syntax.nextSentence', 'Next sentence')}>
                    <span>
                      <IconButton 
                        size="small" 
                        onClick={handleNextSentence}
                        disabled={currentIndex === sentences.length - 1}
                        sx={{ 
                          border: 1, 
                          borderColor: 'divider',
                          borderRadius: 1
                        }}
                      >
                        <KeyboardArrowDownIcon fontSize="small" />
                      </IconButton>
                    </span>
                  </Tooltip>
                </Stack>
              </Stack>
            </Box>

            {/* Dependency options */}
            {syntaxType === 'dependency' && (
              <Box sx={{ px: 2, py: 1, bgcolor: 'background.paper', borderBottom: 1, borderColor: 'divider' }}>
                <Stack direction="row" spacing={2} flexWrap="wrap">
                  <FormControlLabel
                    control={
                      <Checkbox 
                        checked={depOptions.compact} 
                        onChange={() => handleOptionChange('compact')}
                        size="small"
                      />
                    }
                    label={
                      <Typography variant="body2">
                        {t('syntax.compactMode', 'Compact Mode (Straight Lines)')}
                      </Typography>
                    }
                  />
                  <FormControlLabel
                    control={
                      <Checkbox 
                        checked={depOptions.collapse_punct} 
                        onChange={() => handleOptionChange('collapse_punct')}
                        size="small"
                      />
                    }
                    label={
                      <Typography variant="body2">
                        {t('syntax.collapsePunct', 'Collapse Punctuation')}
                      </Typography>
                    }
                  />
                  <FormControlLabel
                    control={
                      <Checkbox 
                        checked={depOptions.collapse_phrases} 
                        onChange={() => handleOptionChange('collapse_phrases')}
                        size="small"
                      />
                    }
                    label={
                      <Typography variant="body2">
                        {t('syntax.collapsePhrases', 'Collapse Phrases')}
                      </Typography>
                    }
                  />
                </Stack>
              </Box>
            )}

            {/* Visualization area */}
            <Box sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              {loading ? (
                <Box 
                  sx={{ 
                    flex: 1,
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center',
                    flexDirection: 'column',
                    gap: 2
                  }}
                >
                  <CircularProgress size={40} />
                  <Typography color="text.secondary">
                    {t('syntax.analyzing', 'Analyzing syntax...')}
                  </Typography>
                </Box>
              ) : error ? (
                <Box sx={{ p: 2 }}>
                  <Alert severity="error">
                    {error}
                  </Alert>
                </Box>
              ) : (
                <Box 
                  ref={visualizationRef}
                  sx={{ 
                    flex: 1, 
                    overflow: 'auto',
                    p: 2,
                    bgcolor: theme.palette.mode === 'dark' ? 'grey.900' : '#fafafa'
                  }}
                >
                  {syntaxType === 'constituency' ? (
                    <ConstituencyTree 
                      treeData={constituencyData?.tree_data || null}
                      treeString={constituencyData?.tree_string}
                      height={400}
                    />
                  ) : (
                    <DependencyGraph
                      svgHtml={dependencyData?.svg_html || ''}
                      tokens={dependencyData?.tokens}
                      arcs={dependencyData?.arcs}
                      height={400}
                    />
                  )}
                </Box>
              )}
            </Box>

            {/* Current sentence display */}
            <Box 
              sx={{ 
                px: 2, 
                py: 1.5, 
                bgcolor: theme.palette.mode === 'dark' ? 'grey.800' : 'grey.50',
                borderTop: 1,
                borderColor: 'divider'
              }}
            >
              <Typography 
                variant="body2" 
                sx={{ 
                  fontStyle: 'italic',
                  color: 'text.secondary',
                  textAlign: 'center'
                }}
              >
                "{currentSentence?.text}"
              </Typography>
            </Box>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

// Re-export types and sub-components
export type { SyntaxType, ConstituencyData, DependencyData, SentenceInfo }
export { ConstituencyTree, DependencyGraph }
