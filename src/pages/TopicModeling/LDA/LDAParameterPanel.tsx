/**
 * LDA Parameter Panel
 * Configuration for LDA topic modeling using Gensim engine
 * with asymmetric alpha support
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Box,
  Typography,
  Paper,
  Stack,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Button,
  CircularProgress,
  Alert,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Divider,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  Tooltip,
  Slider,
  Grid,
  LinearProgress,
  Chip
} from '@mui/material'
import { NumberInput } from '../../../components/common'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import TuneIcon from '@mui/icons-material/Tune'
import AutoGraphIcon from '@mui/icons-material/AutoGraph'
import SettingsIcon from '@mui/icons-material/Settings'
import RestartAltIcon from '@mui/icons-material/RestartAlt'
import CloseIcon from '@mui/icons-material/Close'
import SaveAltIcon from '@mui/icons-material/SaveAlt'
import ImageIcon from '@mui/icons-material/Image'
import { useTranslation } from 'react-i18next'
import * as d3 from 'd3'
import type { LDAPreprocessConfig, LDAConfig, LDAResult, LDAOptimizeResult, LDADynamicConfig, LDADynamicResult } from '../../../types/topicModeling'
import { topicModelingApi } from '../../../api'

interface LDAParameterPanelProps {
  corpusId: string
  textIds: string[]
  language: string
  preprocessConfig: LDAPreprocessConfig
  config: LDAConfig
  onConfigChange: (config: LDAConfig) => void
  dynamicConfig?: LDADynamicConfig
  textDates?: Record<string, string>
  onAnalysisStart: () => void
  onAnalysisComplete: (result: LDADynamicResult) => void
  onOptimizeComplete: (result: LDAOptimizeResult) => void
  disabled?: boolean
}

export default function LDAParameterPanel({
  corpusId,
  textIds,
  language,
  preprocessConfig,
  config,
  onConfigChange,
  dynamicConfig,
  textDates,
  onAnalysisStart,
  onAnalysisComplete,
  onOptimizeComplete,
  disabled = false
}: LDAParameterPanelProps) {
  const { t } = useTranslation()
  
  const [analyzing, setAnalyzing] = useState(false)
  const [optimizing, setOptimizing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [advancedExpanded, setAdvancedExpanded] = useState(false)
  
  // Gensim asymmetric alpha dialog
  const [alphaDialogOpen, setAlphaDialogOpen] = useState(false)
  const [customAlphaValues, setCustomAlphaValues] = useState<number[]>([])
  
  // Topic optimization settings
  const [optimizeDialogOpen, setOptimizeDialogOpen] = useState(false)
  const [topicMin, setTopicMin] = useState(2)
  const [topicMax, setTopicMax] = useState(20)
  const [topicStep, setTopicStep] = useState(2)
  
  // Initialize custom alpha values when dialog opens or num_topics changes
  useEffect(() => {
    if (alphaDialogOpen) {
      // Parse existing values or create default uniform distribution
      if (config.alpha.startsWith('[')) {
        try {
          const parsed = JSON.parse(config.alpha)
          if (Array.isArray(parsed) && parsed.length === config.num_topics) {
            setCustomAlphaValues(parsed)
            return
          }
        } catch {}
      }
      // Default: uniform distribution
      setCustomAlphaValues(Array(config.num_topics).fill(1 / config.num_topics))
    }
  }, [alphaDialogOpen, config.num_topics])
  
  // Handle config change
  const handleConfigChange = (key: keyof LDAConfig, value: unknown) => {
    onConfigChange({ ...config, [key]: value })
  }
  
  // Handle alpha mode change for Gensim
  const handleAlphaChange = (value: string) => {
    if (value === 'custom') {
      setAlphaDialogOpen(true)
    } else {
      handleConfigChange('alpha', value)
    }
  }
  
  // Handle single alpha slider change
  const handleAlphaSliderChange = (index: number, value: number) => {
    const newValues = [...customAlphaValues]
    newValues[index] = value
    setCustomAlphaValues(newValues)
  }
  
  // Reset all alpha values to uniform
  const handleResetAlpha = () => {
    setCustomAlphaValues(Array(config.num_topics).fill(1 / config.num_topics))
  }
  
  // Handle custom alpha save
  const handleCustomAlphaSave = () => {
    handleConfigChange('alpha', JSON.stringify(customAlphaValues))
    setAlphaDialogOpen(false)
  }
  
  // Run analysis
  const handleAnalyze = async () => {
    if (!corpusId || textIds.length === 0) {
      setError(t('topicModeling.lda.selectTextsFirst', 'Please select texts first'))
      return
    }
    
    setAnalyzing(true)
    setError(null)
    onAnalysisStart()
    
    try {
      // Use dynamic analysis if enabled and has text dates
      if (dynamicConfig?.enabled && textDates && Object.keys(textDates).length > 0) {
        const response = await topicModelingApi.analyzeLDADynamic(
          corpusId,
          textIds,
          language,
          preprocessConfig,
          config,
          dynamicConfig,
          textDates
        )
        
        if (response.success && response.data) {
          if (response.data.success) {
            onAnalysisComplete(response.data)
          } else {
            setError(response.data.error || 'Dynamic analysis failed')
          }
        } else {
          setError(response.error || 'Dynamic analysis failed')
        }
      } else {
        // Standard LDA analysis
        const response = await topicModelingApi.analyzeLDA(
          corpusId,
          textIds,
          language,
          preprocessConfig,
          config
        )
        
        if (response.success && response.data) {
          if (response.data.success) {
            onAnalysisComplete(response.data as LDADynamicResult)
          } else {
            setError(response.data.error || 'Analysis failed')
          }
        } else {
          setError(response.error || 'Analysis failed')
        }
      }
    } catch (err) {
      setError(String(err))
    } finally {
      setAnalyzing(false)
    }
  }
  
  // Optimization result state
  const [optimizeResult, setOptimizeResult] = useState<LDAOptimizeResult | null>(null)
  
  // Run topic optimization
  const handleOptimize = async () => {
    if (!corpusId || textIds.length === 0) {
      setError(t('topicModeling.lda.selectTextsFirst', 'Please select texts first'))
      return
    }
    
    // Don't close dialog, show loading in dialog
    setOptimizing(true)
    setOptimizeResult(null)
    setError(null)
    onAnalysisStart()
    
    try {
      const response = await topicModelingApi.optimizeLDATopics(
        corpusId,
        textIds,
        language,
        preprocessConfig,
        config,
        topicMin,
        topicMax,
        topicStep
      )
      
      if (response.success && response.data) {
        if (response.data.success) {
          setOptimizeResult(response.data)
          onOptimizeComplete(response.data)
        } else {
          setError(t('topicModeling.lda.optimizeFailed', 'Topic optimization failed'))
        }
      } else {
        setError(response.error || t('topicModeling.lda.optimizeFailed', 'Topic optimization failed'))
      }
    } catch (err) {
      setError(String(err))
    } finally {
      setOptimizing(false)
    }
  }
  
  // Reset optimization when dialog closes
  const handleOptimizeDialogClose = () => {
    setOptimizeDialogOpen(false)
    setOptimizeResult(null)
    setError(null)
  }
  
  // Get display text for alpha
  const getAlphaDisplayText = () => {
    if (config.alpha.startsWith('[')) {
      return t('topicModeling.lda.params.custom', 'Custom')
    }
    return config.alpha
  }
  
  return (
    <Paper sx={{ p: 2 }}>
      <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 2 }}>
        {t('topicModeling.lda.params.title', 'LDA Parameters')}
      </Typography>
      
      <Stack spacing={2}>
        {/* Basic Parameters */}
        <Stack direction="row" spacing={2}>
          <NumberInput
            label={t('topicModeling.lda.params.numTopics', 'Topics')}
            size="small"
            value={config.num_topics}
            onChange={(val) => handleConfigChange('num_topics', val)}
            min={2}
            max={100}
            integer
            sx={{ flex: 1 }}
          />
          <NumberInput
            label={t('topicModeling.lda.params.topNKeywords', 'Keywords')}
            size="small"
            value={config.top_n_keywords}
            onChange={(val) => handleConfigChange('top_n_keywords', val)}
            min={5}
            max={50}
            integer
            sx={{ flex: 1 }}
          />
        </Stack>
        
        {/* Alpha & Eta */}
        <Stack direction="row" spacing={2} alignItems="center">
          <FormControl size="small" sx={{ flex: 1 }}>
            <InputLabel>Alpha</InputLabel>
            <Select
              value={config.alpha.startsWith('[') ? 'custom' : config.alpha}
              label="Alpha"
              onChange={(e) => handleAlphaChange(e.target.value)}
            >
              <MenuItem value="auto">{t('topicModeling.lda.params.auto', 'Auto')}</MenuItem>
              <MenuItem value="symmetric">{t('topicModeling.lda.params.symmetric', 'Symmetric')}</MenuItem>
              <MenuItem value="asymmetric">{t('topicModeling.lda.params.asymmetric', 'Asymmetric')}</MenuItem>
              <MenuItem value="custom">{t('topicModeling.lda.params.custom', 'Custom')}</MenuItem>
            </Select>
          </FormControl>
          {config.alpha.startsWith('[') && (
            <Tooltip title={t('topicModeling.lda.params.editAlpha', 'Edit Alpha Values')}>
              <IconButton size="small" onClick={() => setAlphaDialogOpen(true)} color="primary">
                <SettingsIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          <FormControl size="small" sx={{ flex: 1 }}>
            <InputLabel>Eta</InputLabel>
            <Select
              value={config.eta}
              label="Eta"
              onChange={(e) => handleConfigChange('eta', e.target.value)}
            >
              <MenuItem value="auto">{t('topicModeling.lda.params.auto', 'Auto')}</MenuItem>
              <MenuItem value="symmetric">{t('topicModeling.lda.params.symmetric', 'Symmetric')}</MenuItem>
            </Select>
          </FormControl>
        </Stack>
        
        {/* Advanced Parameters */}
        <Accordion
          expanded={advancedExpanded}
          onChange={(_, isExpanded) => setAdvancedExpanded(isExpanded)}
          sx={{
            '&:before': { display: 'none' },
            boxShadow: 'none',
            border: 1,
            borderColor: 'divider',
            borderRadius: 1
          }}
        >
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Stack direction="row" alignItems="center" spacing={1}>
              <TuneIcon fontSize="small" color="action" />
              <Typography variant="subtitle2">
                {t('topicModeling.lda.params.advanced', 'Advanced')}
              </Typography>
            </Stack>
          </AccordionSummary>
          
          <AccordionDetails>
            <Stack spacing={2}>
              {/* Gensim parameters */}
              <Stack direction="row" spacing={2}>
                <NumberInput
                  label={t('topicModeling.lda.params.passes', 'Passes')}
                  size="small"
                  value={config.passes}
                  onChange={(val) => handleConfigChange('passes', val)}
                  min={1}
                  max={100}
                  integer
                  sx={{ flex: 1 }}
                />
                <NumberInput
                  label={t('topicModeling.lda.params.iterations', 'Iterations')}
                  size="small"
                  value={config.iterations}
                  onChange={(val) => handleConfigChange('iterations', val)}
                  min={10}
                  max={500}
                  integer
                  sx={{ flex: 1 }}
                />
              </Stack>
              
              <Stack direction="row" spacing={2}>
                <NumberInput
                  label={t('topicModeling.lda.params.chunksize', 'Chunk Size')}
                  size="small"
                  value={config.chunksize}
                  onChange={(val) => handleConfigChange('chunksize', val)}
                  min={100}
                  max={10000}
                  integer
                  sx={{ flex: 1 }}
                />
                <NumberInput
                  label={t('topicModeling.lda.params.minProb', 'Min Prob')}
                  size="small"
                  value={config.minimum_probability}
                  onChange={(val) => handleConfigChange('minimum_probability', val)}
                  min={0}
                  max={0.5}
                  step={0.01}
                  sx={{ flex: 1 }}
                />
              </Stack>
              
              <Divider />
              
              {/* Random seed */}
              <NumberInput
                label={t('topicModeling.lda.params.randomSeed', 'Random Seed')}
                size="small"
                value={config.random_state}
                onChange={(val) => handleConfigChange('random_state', val)}
                min={0}
                max={99999}
                integer
                sx={{ width: '50%' }}
              />
            </Stack>
          </AccordionDetails>
        </Accordion>
        
        {/* Error */}
        {error && (
          <Alert severity="error" onClose={() => setError(null)}>
            {error}
          </Alert>
        )}
        
        {/* Action Buttons */}
        <Stack direction="row" spacing={1}>
          <Button
            variant="contained"
            color="primary"
            startIcon={analyzing ? <CircularProgress size={20} color="inherit" /> : <PlayArrowIcon />}
            onClick={handleAnalyze}
            disabled={analyzing || optimizing || disabled || textIds.length === 0}
            sx={{ flex: 1 }}
          >
            {analyzing
              ? t('topicModeling.lda.analyzing', 'Analyzing...')
              : t('topicModeling.lda.analyze', 'Run LDA')
            }
          </Button>
          <Tooltip title={t('topicModeling.lda.optimizeTopics', 'Find Optimal Topic Number')}>
            <Button
              variant="outlined"
              color="primary"
              startIcon={optimizing ? <CircularProgress size={20} /> : <AutoGraphIcon />}
              onClick={() => setOptimizeDialogOpen(true)}
              disabled={analyzing || optimizing || disabled || textIds.length === 0}
            >
              {optimizing ? '...' : t('topicModeling.lda.optimize', 'Optimize')}
            </Button>
          </Tooltip>
        </Stack>
        
        {/* Info text */}
        <Typography variant="caption" color="text.secondary">
          {t('topicModeling.lda.info', 'LDA discovers abstract topics in document collections.')}
        </Typography>
      </Stack>
      
      {/* Gensim Custom Alpha Dialog with Sliders */}
      <Dialog open={alphaDialogOpen} onClose={() => setAlphaDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography variant="h6">
            {t('topicModeling.lda.params.customAlphaTitle', 'Custom Alpha Values')}
          </Typography>
          <Tooltip title={t('topicModeling.lda.params.resetAlpha', 'Reset to Uniform')}>
            <IconButton size="small" onClick={handleResetAlpha}>
              <RestartAltIcon />
            </IconButton>
          </Tooltip>
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            {t('topicModeling.lda.params.customAlphaSliderDesc', 'Adjust alpha for each topic. Higher values increase the probability of documents being assigned to that topic.')}
          </Typography>
          
          <Box sx={{ mt: 2, maxHeight: 400, overflow: 'auto' }}>
            <Grid container spacing={2}>
              {customAlphaValues.map((value, index) => (
                <Grid item xs={12} key={index}>
                  <Stack direction="row" spacing={2} alignItems="center">
                    <Typography variant="body2" sx={{ minWidth: 70 }}>
                      Topic {index}
                    </Typography>
                    <Slider
                      value={value}
                      onChange={(_, newValue) => handleAlphaSliderChange(index, newValue as number)}
                      min={0.001}
                      max={1}
                      step={0.001}
                      sx={{ flex: 1 }}
                    />
                    <Typography variant="body2" sx={{ minWidth: 50, textAlign: 'right' }}>
                      {value.toFixed(3)}
                    </Typography>
                  </Stack>
                </Grid>
              ))}
            </Grid>
          </Box>
          
          <Box sx={{ mt: 2, p: 1.5, bgcolor: 'action.hover', borderRadius: 1 }}>
            <Typography variant="caption" color="text.secondary">
              {t('topicModeling.lda.params.alphaSum', 'Sum')}: {customAlphaValues.reduce((a, b) => a + b, 0).toFixed(3)}
            </Typography>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAlphaDialogOpen(false)}>{t('common.cancel')}</Button>
          <Button onClick={handleCustomAlphaSave} variant="contained">{t('common.save')}</Button>
        </DialogActions>
      </Dialog>
      
      {/* Topic Optimization Dialog with integrated chart */}
      <OptimizeDialog
        open={optimizeDialogOpen}
        onClose={handleOptimizeDialogClose}
        optimizing={optimizing}
        optimizeResult={optimizeResult}
        topicMin={topicMin}
        topicMax={topicMax}
        topicStep={topicStep}
        onTopicMinChange={setTopicMin}
        onTopicMaxChange={setTopicMax}
        onTopicStepChange={setTopicStep}
        onRunOptimize={handleOptimize}
        error={error}
        t={t}
      />
    </Paper>
  )
}

// Optimize Dialog Component with integrated chart
interface OptimizeDialogProps {
  open: boolean
  onClose: () => void
  optimizing: boolean
  optimizeResult: LDAOptimizeResult | null
  topicMin: number
  topicMax: number
  topicStep: number
  onTopicMinChange: (val: number) => void
  onTopicMaxChange: (val: number) => void
  onTopicStepChange: (val: number) => void
  onRunOptimize: () => void
  error: string | null
  t: (key: string, defaultValue?: string) => string
}

const COLOR_SCHEMES = {
  default: ['#1976d2', '#dc004e', '#4caf50'],
  pastel: ['#7986cb', '#f48fb1', '#a5d6a7'],
  paired: ['#a6cee3', '#fb9a99', '#b2df8a'],
  set3: ['#8dd3c7', '#fb8072', '#80b1d3']
}

function OptimizeDialog({
  open,
  onClose,
  optimizing,
  optimizeResult,
  topicMin,
  topicMax,
  topicStep,
  onTopicMinChange,
  onTopicMaxChange,
  onTopicStepChange,
  onRunOptimize,
  error,
  t
}: OptimizeDialogProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const [colorScheme, setColorScheme] = useState<keyof typeof COLOR_SCHEMES>('default')
  
  // Draw chart
  useEffect(() => {
    if (!open || !containerRef.current || !svgRef.current || !optimizeResult?.results?.length) return
    
    const container = containerRef.current
    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()
    
    const { width, height } = container.getBoundingClientRect()
    const margin = { top: 70, right: 80, bottom: 60, left: 70 }
    const innerWidth = width - margin.left - margin.right
    const innerHeight = height - margin.top - margin.bottom
    
    const colors = COLOR_SCHEMES[colorScheme]
    
    // Create tooltip
    const tooltip = d3.select(tooltipRef.current)
      .style('position', 'fixed')
      .style('visibility', 'hidden')
      .style('background', 'rgba(0,0,0,0.85)')
      .style('color', 'white')
      .style('padding', '10px 14px')
      .style('border-radius', '6px')
      .style('font-size', '12px')
      .style('pointer-events', 'none')
      .style('z-index', '1000')
      .style('box-shadow', '0 2px 8px rgba(0,0,0,0.2)')
    
    // Title - BERTopic style (consistent with other visualizations)
    svg.append('text')
      .attr('x', width / 2)
      .attr('y', 28)
      .attr('text-anchor', 'middle')
      .attr('font-size', '18px')
      .attr('font-weight', 'bold')
      .attr('fill', '#2c3e50')
      .text(t('topicModeling.lda.optimizeTitle', 'Topic Number Optimization'))
    
    // Subtitle
    svg.append('text')
      .attr('x', width / 2)
      .attr('y', 48)
      .attr('text-anchor', 'middle')
      .attr('font-size', '12px')
      .attr('fill', '#666')
      .text(t('topicModeling.lda.viz.perplexityCoherence', 'Perplexity & Coherence Scores'))
    
    const g = svg
      .attr('width', width)
      .attr('height', height)
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`)
    
    // X scale
    const xScale = d3.scaleLinear()
      .domain(d3.extent(optimizeResult.results, d => d.num_topics) as [number, number])
      .range([0, innerWidth])
    
    // Filter valid data
    const perplexityData = optimizeResult.results.filter(d => d.perplexity !== null)
    const coherenceData = optimizeResult.results.filter(d => d.coherence !== null)
    
    // Y scales for perplexity (left axis)
    const perplexityExtent = d3.extent(perplexityData, d => d.perplexity) as [number, number]
    const yPerplexity = d3.scaleLinear()
      .domain([perplexityExtent[0] * 0.9, perplexityExtent[1] * 1.1])
      .range([innerHeight, 0])
    
    // Y scale for coherence (right axis)
    const coherenceExtent = d3.extent(coherenceData, d => d.coherence) as [number, number]
    const yCoherence = d3.scaleLinear()
      .domain([coherenceExtent[0] * 0.9, coherenceExtent[1] * 1.1])
      .range([innerHeight, 0])
    
    // Grid lines
    g.append('g')
      .attr('class', 'grid')
      .selectAll('line')
      .data(yPerplexity.ticks(6))
      .join('line')
      .attr('x1', 0)
      .attr('x2', innerWidth)
      .attr('y1', d => yPerplexity(d))
      .attr('y2', d => yPerplexity(d))
      .attr('stroke', '#e0e0e0')
      .attr('stroke-dasharray', '3,3')
    
    // Draw perplexity line
    if (perplexityData.length > 0) {
      const perplexityLine = d3.line<typeof optimizeResult.results[0]>()
        .x(d => xScale(d.num_topics))
        .y(d => yPerplexity(d.perplexity!))
        .curve(d3.curveMonotoneX)
      
      g.append('path')
        .datum(perplexityData)
        .attr('fill', 'none')
        .attr('stroke', colors[0])
        .attr('stroke-width', 2.5)
        .attr('d', perplexityLine)
      
      // Perplexity points
      g.selectAll('.perplexity-point')
        .data(perplexityData)
        .join('circle')
        .attr('class', 'perplexity-point')
        .attr('cx', d => xScale(d.num_topics))
        .attr('cy', d => yPerplexity(d.perplexity!))
        .attr('r', 6)
        .attr('fill', colors[0])
        .attr('stroke', 'white')
        .attr('stroke-width', 2)
        .attr('cursor', 'pointer')
        .on('mouseover', function(event, d) {
          d3.select(this).attr('r', 9)
          tooltip
            .style('visibility', 'visible')
            .html(`<strong>${t('topicModeling.lda.params.numTopics')}: ${d.num_topics}</strong><br/>${t('topicModeling.lda.results.perplexity')}: ${d.perplexity?.toFixed(2)}`)
        })
        .on('mousemove', function(event) {
          tooltip
            .style('top', (event.pageY + 10) + 'px')
            .style('left', (event.pageX + 10) + 'px')
        })
        .on('mouseout', function() {
          d3.select(this).attr('r', 6)
          tooltip.style('visibility', 'hidden')
        })
    }
    
    // Draw coherence line
    if (coherenceData.length > 0) {
      const coherenceLine = d3.line<typeof optimizeResult.results[0]>()
        .x(d => xScale(d.num_topics))
        .y(d => yCoherence(d.coherence!))
        .curve(d3.curveMonotoneX)
      
      g.append('path')
        .datum(coherenceData)
        .attr('fill', 'none')
        .attr('stroke', colors[1])
        .attr('stroke-width', 2.5)
        .attr('d', coherenceLine)
      
      // Coherence points
      g.selectAll('.coherence-point')
        .data(coherenceData)
        .join('circle')
        .attr('class', 'coherence-point')
        .attr('cx', d => xScale(d.num_topics))
        .attr('cy', d => yCoherence(d.coherence!))
        .attr('r', 6)
        .attr('fill', colors[1])
        .attr('stroke', 'white')
        .attr('stroke-width', 2)
        .attr('cursor', 'pointer')
        .on('mouseover', function(event, d) {
          d3.select(this).attr('r', 9)
          tooltip
            .style('visibility', 'visible')
            .html(`<strong>${t('topicModeling.lda.params.numTopics')}: ${d.num_topics}</strong><br/>${t('topicModeling.lda.results.coherence')}: ${d.coherence?.toFixed(4)}`)
        })
        .on('mousemove', function(event) {
          tooltip
            .style('top', (event.pageY + 10) + 'px')
            .style('left', (event.pageX + 10) + 'px')
        })
        .on('mouseout', function() {
          d3.select(this).attr('r', 6)
          tooltip.style('visibility', 'hidden')
        })
    }
    
    // X axis
    g.append('g')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(d3.axisBottom(xScale).ticks(optimizeResult.results.length).tickFormat(d => String(d)))
      .selectAll('text')
      .attr('font-size', '11px')
    
    // Left Y axis (Perplexity)
    const leftAxis = g.append('g')
      .call(d3.axisLeft(yPerplexity).ticks(6))
    
    leftAxis.selectAll('text').attr('font-size', '11px')
    leftAxis.selectAll('path, line').attr('stroke', colors[0])
    
    leftAxis.append('text')
      .attr('fill', colors[0])
      .attr('transform', 'rotate(-90)')
      .attr('y', -55)
      .attr('x', -innerHeight / 2)
      .attr('text-anchor', 'middle')
      .attr('font-size', '12px')
      .attr('font-weight', 'bold')
      .text(t('topicModeling.lda.results.perplexity'))
    
    // Right Y axis (Coherence)
    const rightAxis = g.append('g')
      .attr('transform', `translate(${innerWidth}, 0)`)
      .call(d3.axisRight(yCoherence).ticks(6))
    
    rightAxis.selectAll('text').attr('font-size', '11px')
    rightAxis.selectAll('path, line').attr('stroke', colors[1])
    
    rightAxis.append('text')
      .attr('fill', colors[1])
      .attr('transform', 'rotate(-90)')
      .attr('y', 55)
      .attr('x', -innerHeight / 2)
      .attr('text-anchor', 'middle')
      .attr('font-size', '12px')
      .attr('font-weight', 'bold')
      .text(t('topicModeling.lda.results.coherence'))
    
    // X axis label
    svg.append('text')
      .attr('x', width / 2)
      .attr('y', height - 10)
      .attr('text-anchor', 'middle')
      .attr('font-size', '12px')
      .attr('fill', '#666')
      .text(t('topicModeling.lda.params.numTopics', 'Number of Topics'))
    
    // Legend
    const legend = svg.append('g')
      .attr('transform', `translate(${margin.left + 20}, ${margin.top - 5})`)
    
    const legendItems = [
      { label: `${t('topicModeling.lda.results.perplexity')} (${t('topicModeling.lda.lowerBetter', 'lower is better')})`, color: colors[0] },
      { label: `${t('topicModeling.lda.results.coherence')} (${t('topicModeling.lda.higherBetter', 'higher is better')})`, color: colors[1] }
    ]
    
    legendItems.forEach((item, i) => {
      const row = legend.append('g')
        .attr('transform', `translate(${i * 240}, 0)`)
      
      row.append('line')
        .attr('x1', 0)
        .attr('x2', 24)
        .attr('y1', 0)
        .attr('y2', 0)
        .attr('stroke', item.color)
        .attr('stroke-width', 2.5)
      
      row.append('circle')
        .attr('cx', 12)
        .attr('cy', 0)
        .attr('r', 5)
        .attr('fill', item.color)
        .attr('stroke', 'white')
        .attr('stroke-width', 1.5)
      
      row.append('text')
        .attr('x', 30)
        .attr('y', 4)
        .attr('font-size', '11px')
        .attr('fill', '#444')
        .text(item.label)
    })
    
  }, [open, optimizeResult, colorScheme, t])
  
  // Export SVG
  const handleExportSVG = useCallback(() => {
    const svg = svgRef.current
    if (!svg) return

    const serializer = new XMLSerializer()
    const svgString = serializer.serializeToString(svg)
    const blob = new Blob([svgString], { type: 'image/svg+xml' })
    const url = URL.createObjectURL(blob)
    
    const link = document.createElement('a')
    link.href = url
    link.download = 'lda-perplexity-curve.svg'
    link.click()
    
    URL.revokeObjectURL(url)
  }, [])

  // Export PNG
  const handleExportPNG = useCallback(async () => {
    const container = containerRef.current
    if (!container) return

    try {
      const html2canvas = (await import('html2canvas')).default
      const canvas = await html2canvas(container, {
        backgroundColor: '#fafafa',
        scale: 3,
        useCORS: true
      })
      
      canvas.toBlob((blob) => {
        if (!blob) return
        
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = 'lda-perplexity-curve.png'
        link.click()
        
        URL.revokeObjectURL(url)
      }, 'image/png')
    } catch (error) {
      console.error('Failed to export PNG:', error)
    }
  }, [])
  
  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: { height: '85vh', maxHeight: 700 }
      }}
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 1 }}>
        <Stack direction="row" spacing={2} alignItems="center">
          <Typography variant="h6">
            {t('topicModeling.lda.optimizeTitle', 'Topic Number Optimization')}
          </Typography>
          {optimizeResult?.best_by_coherence && (
            <Chip
              label={`${t('topicModeling.lda.bestCoherence', 'Best Coherence')}: ${optimizeResult.best_by_coherence.num_topics} topics`}
              size="small"
              color="secondary"
              variant="outlined"
            />
          )}
          {optimizeResult?.best_by_perplexity && (
            <Chip
              label={`${t('topicModeling.lda.bestPerplexity', 'Best Perplexity')}: ${optimizeResult.best_by_perplexity.num_topics} topics`}
              size="small"
              color="primary"
              variant="outlined"
            />
          )}
        </Stack>
        <IconButton onClick={onClose} size="small">
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      
      {/* Settings bar - only show when no result or when result exists */}
      {(!optimizeResult || optimizeResult.results.length === 0) && (
        <Box sx={{ px: 3, py: 1.5, bgcolor: 'action.hover', borderTop: 1, borderBottom: 1, borderColor: 'divider' }}>
          <Stack direction="row" spacing={2} alignItems="center" justifyContent="space-between">
            <Typography variant="body2" color="text.secondary">
              {t('topicModeling.lda.optimizeDesc', 'Test different topic numbers to find the optimal value based on perplexity and coherence.')}
            </Typography>
          </Stack>
        </Box>
      )}
      
      {/* Chart settings bar - only show when result exists */}
      {optimizeResult && optimizeResult.results.length > 0 && (
        <Box sx={{ px: 3, py: 1.5, bgcolor: 'action.hover', borderTop: 1, borderBottom: 1, borderColor: 'divider' }}>
          <Stack direction="row" spacing={2} alignItems="center" justifyContent="space-between">
            <FormControl size="small" sx={{ minWidth: 120 }}>
              <InputLabel>{t('topicModeling.lda.viz.colors')}</InputLabel>
              <Select
                value={colorScheme}
                label={t('topicModeling.lda.viz.colors')}
                onChange={(e) => setColorScheme(e.target.value as keyof typeof COLOR_SCHEMES)}
              >
                <MenuItem value="default">Default</MenuItem>
                <MenuItem value="pastel">Pastel</MenuItem>
                <MenuItem value="paired">Paired</MenuItem>
                <MenuItem value="set3">Set3</MenuItem>
              </Select>
            </FormControl>
            
            <Stack direction="row" spacing={0.5}>
              <Tooltip title={t('wordFrequency.viz.export') + ' SVG'}>
                <IconButton size="small" onClick={handleExportSVG}>
                  <SaveAltIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title={t('wordFrequency.viz.export') + ' PNG'}>
                <IconButton size="small" onClick={handleExportPNG}>
                  <ImageIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Stack>
          </Stack>
        </Box>
      )}
      
      <DialogContent dividers sx={{ p: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {optimizing ? (
          <Box sx={{ 
            display: 'flex', 
            flexDirection: 'column',
            alignItems: 'center', 
            justifyContent: 'center', 
            height: '100%',
            gap: 2,
            p: 4
          }}>
            <CircularProgress size={60} />
            <Typography variant="h6" color="text.secondary">
              {t('topicModeling.lda.optimizing', 'Optimizing...')}
            </Typography>
            <Typography variant="body2" color="text.secondary" textAlign="center">
              {t('topicModeling.lda.optimizeProgress', 'Testing different topic numbers. This may take a while.')}
            </Typography>
          </Box>
        ) : optimizeResult && optimizeResult.results.length > 0 ? (
          <Box
            ref={containerRef}
            sx={{
              width: '100%',
              height: '100%',
              bgcolor: '#fafafa',
              position: 'relative',
              minHeight: 500
            }}
          >
            <svg ref={svgRef} style={{ width: '100%', height: '100%' }} />
            <div ref={tooltipRef} />
          </Box>
        ) : (
          <Box sx={{ p: 3 }}>
            {error && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {error}
              </Alert>
            )}
            <Typography variant="body2" color="text.secondary" gutterBottom>
              {t('topicModeling.lda.optimizeDesc', 'Test different topic numbers to find the optimal value based on perplexity and coherence.')}
            </Typography>
            <Stack spacing={2} sx={{ mt: 2 }}>
              <Stack direction="row" spacing={2}>
                <NumberInput
                  label={t('topicModeling.lda.topicMin', 'Min Topics')}
                  value={topicMin}
                  onChange={onTopicMinChange}
                  min={2}
                  max={50}
                  integer
                  size="small"
                  sx={{ flex: 1 }}
                />
                <NumberInput
                  label={t('topicModeling.lda.topicMax', 'Max Topics')}
                  value={topicMax}
                  onChange={onTopicMaxChange}
                  min={3}
                  max={100}
                  integer
                  size="small"
                  sx={{ flex: 1 }}
                />
              </Stack>
              <NumberInput
                label={t('topicModeling.lda.topicStep', 'Step')}
                value={topicStep}
                onChange={onTopicStepChange}
                min={1}
                max={10}
                integer
                size="small"
                sx={{ width: '50%' }}
              />
            </Stack>
          </Box>
        )}
      </DialogContent>
      
      <DialogActions>
        {optimizeResult && optimizeResult.results.length > 0 ? (
          <Button onClick={onClose}>{t('common.close')}</Button>
        ) : (
          <>
            <Button onClick={onClose} disabled={optimizing}>{t('common.cancel')}</Button>
            <Button 
              onClick={onRunOptimize} 
              variant="contained" 
              startIcon={optimizing ? <CircularProgress size={20} color="inherit" /> : <AutoGraphIcon />}
              disabled={optimizing}
            >
              {t('topicModeling.lda.runOptimize', 'Run Optimization')}
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  )
}
