/**
 * LDA Visualization Panel
 * D3.js visualizations for LDA results with interactive features
 * Follows BERTopic design pattern
 */

import { useState, useRef, useEffect, useCallback, type RefObject } from 'react'
import {
  Box,
  Typography,
  Paper,
  Tabs,
  Tab,
  Stack,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Tooltip,
  IconButton,
  Divider,
  CircularProgress,
  FormControlLabel,
  Checkbox
} from '@mui/material'
import { NumberInput } from '../../../components/common'
import SaveAltIcon from '@mui/icons-material/SaveAlt'
import ImageIcon from '@mui/icons-material/Image'
import InsertChartIcon from '@mui/icons-material/InsertChart'
import { useTranslation } from 'react-i18next'
import * as d3 from 'd3'
import type { LDAResult, LDATopic, LDADynamicResult } from '../../../types/topicModeling'
import { useResizeObserver, useTooltip, getTopicColor } from '../components/visualizations/d3/useD3'
import { API_BASE_URL } from '../../../api/client'
import { COLOR_SCHEMES, COLOR_SCHEME_LABELS, DEFAULT_COLOR_SCHEME, type ColorSchemeName } from '../shared/colorSchemes'

// Import dynamic visualization components
import TopicEvolutionSankey from './components/TopicEvolutionSankey'
import LDASimilarityHeatmap from './components/LDASimilarityHeatmap'
import LDATopicTimeline from './components/LDATopicTimeline'
import { TopicWordBars } from '../components/visualizations/d3'

interface LDAVisualizationPanelProps {
  result: LDADynamicResult | null
}

type VizType = 'topicWords' | 'topicPie' | 'docDist' | 'pyldavis' | 'sankey' | 'heatmap' | 'timeline'

// Helper function to build similarity matrix data from topics
function buildSimilarityData(topics: LDATopic[]): Array<[number, number, number]> {
  const n = topics.length
  const data: Array<[number, number, number]> = []
  
  // Build word weight vectors for each topic
  const allWords = new Set<string>()
  topics.forEach(topic => {
    topic.keywords.forEach(kw => allWords.add(kw.word))
  })
  
  const wordList = Array.from(allWords)
  const topicVectors: number[][] = topics.map(topic => {
    const vector = new Array(wordList.length).fill(0)
    topic.keywords.forEach(kw => {
      const idx = wordList.indexOf(kw.word)
      if (idx >= 0) {
        vector[idx] = kw.weight
      }
    })
    return vector
  })
  
  // Calculate cosine similarity
  const cosineSimilarity = (a: number[], b: number[]): number => {
    let dotProduct = 0
    let normA = 0
    let normB = 0
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i]
      normA += a[i] * a[i]
      normB += b[i] * b[i]
    }
    if (normA === 0 || normB === 0) return 0
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB))
  }
  
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const similarity = cosineSimilarity(topicVectors[i], topicVectors[j])
      data.push([i, j, similarity])
    }
  }
  
  return data
}

export default function LDAVisualizationPanel({ result }: LDAVisualizationPanelProps) {
  const { t, i18n } = useTranslation()
  const [vizType, setVizType] = useState<VizType>('pyldavis')
  const [colorScheme, setColorScheme] = useState<ColorSchemeName>(DEFAULT_COLOR_SCHEME)
  const [nWords, setNWords] = useState(5)
  const [useCustomLabels, setUseCustomLabels] = useState(false)
  const chartContainerRef = useRef<HTMLDivElement>(null)
  const pyldavisIframeRef = useRef<HTMLIFrameElement>(null)
  
  // Helper function to get topic label
  const getTopicLabel = useCallback((topic: LDATopic): string => {
    if (useCustomLabels && topic.custom_label) {
      return topic.custom_label
    }
    return t('topicModeling.lda.viz.topicLabel', 'Topic {{topicId}}', { topicId: topic.topic_id })
  }, [useCustomLabels, t])
  
  // Export SVG
  const handleExportSVG = useCallback(() => {
    // Handle pyLDAvis iframe export
    if (vizType === 'pyldavis') {
      const iframe = pyldavisIframeRef.current
      if (!iframe) return
      
      try {
        const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document
        if (!iframeDoc) return
        
        // Try to find all SVGs in iframe (pyLDAvis may have multiple SVGs)
        const svgs = iframeDoc.querySelectorAll('svg')
        if (svgs.length > 0) {
          // If multiple SVGs, combine them or export the main one
          const mainSvg = svgs[0] // Usually the first one is the main visualization
          const serializer = new XMLSerializer()
          
          // Create a wrapper SVG to contain all content
          const wrapperSvg = iframeDoc.createElementNS('http://www.w3.org/2000/svg', 'svg')
          wrapperSvg.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
          wrapperSvg.setAttribute('width', mainSvg.getAttribute('width') || '100%')
          wrapperSvg.setAttribute('height', mainSvg.getAttribute('height') || '100%')
          
          // Clone all SVGs into wrapper
          svgs.forEach((svg, index) => {
            const clonedSvg = svg.cloneNode(true) as SVGElement
            if (index > 0) {
              clonedSvg.setAttribute('transform', `translate(0, ${index * 600})`)
            }
            wrapperSvg.appendChild(clonedSvg)
          })
          
          const svgString = serializer.serializeToString(wrapperSvg)
          const blob = new Blob([svgString], { type: 'image/svg+xml' })
          const url = URL.createObjectURL(blob)
          
          const link = document.createElement('a')
          link.href = url
          link.download = `lda-pyldavis-chart.svg`
          link.click()
          
          URL.revokeObjectURL(url)
        } else {
          // If no SVG, export the entire iframe content as HTML (fallback)
          const htmlContent = iframeDoc.documentElement.outerHTML
          const blob = new Blob([htmlContent], { type: 'text/html' })
          const url = URL.createObjectURL(blob)
          
          const link = document.createElement('a')
          link.href = url
          link.download = `lda-pyldavis-chart.html`
          link.click()
          
          URL.revokeObjectURL(url)
        }
      } catch (error) {
        console.error('Failed to export pyLDAvis SVG:', error)
        alert('无法导出 pyLDAvis SVG。可能是跨域限制。建议使用 PNG 导出。')
      }
      return
    }

    // Handle regular SVG export
    const container = chartContainerRef.current
    if (!container) return

    const svg = container.querySelector('svg')
    if (!svg) return

    const serializer = new XMLSerializer()
    const svgString = serializer.serializeToString(svg)
    const blob = new Blob([svgString], { type: 'image/svg+xml' })
    const url = URL.createObjectURL(blob)
    
    const link = document.createElement('a')
    link.href = url
    link.download = `lda-${vizType}-chart.svg`
    link.click()
    
    URL.revokeObjectURL(url)
  }, [vizType])

  // Export PNG
  const handleExportPNG = useCallback(async () => {
    // Handle pyLDAvis iframe export
    if (vizType === 'pyldavis') {
      const iframe = pyldavisIframeRef.current
      if (!iframe) return

      try {
        const html2canvas = (await import('html2canvas')).default
        const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document
        if (!iframeDoc) return
        
        // Get the main container element (usually the body or a specific container)
        const body = iframeDoc.body
        const html = iframeDoc.documentElement
        
        // Calculate full dimensions including scroll
        const fullWidth = Math.max(
          body.scrollWidth,
          body.offsetWidth,
          html.clientWidth,
          html.scrollWidth,
          html.offsetWidth
        )
        const fullHeight = Math.max(
          body.scrollHeight,
          body.offsetHeight,
          html.clientHeight,
          html.scrollHeight,
          html.offsetHeight
        )
        
        // Capture the entire iframe content with full dimensions
        const canvas = await html2canvas(body, {
          backgroundColor: '#fff',
          scale: 3,
          useCORS: true,
          allowTaint: true,
          logging: false,
          width: fullWidth,
          height: fullHeight,
          windowWidth: fullWidth,
          windowHeight: fullHeight,
          scrollX: 0,
          scrollY: 0
        })
        
        canvas.toBlob((blob) => {
          if (!blob) return
          
          const url = URL.createObjectURL(blob)
          const link = document.createElement('a')
          link.href = url
          link.download = `lda-pyldavis-chart.png`
          link.click()
          
          URL.revokeObjectURL(url)
        }, 'image/png')
      } catch (error) {
        console.error('Failed to export pyLDAvis PNG:', error)
        alert('无法导出 pyLDAvis PNG。可能是跨域限制。请确保 pyLDAvis 内容已完全加载。')
      }
      return
    }

    // Handle regular PNG export
    const container = chartContainerRef.current
    if (!container) return

    const svg = container.querySelector('svg')
    if (!svg) return

    try {
      const html2canvas = (await import('html2canvas')).default
      const chartElement = container.querySelector('[class*="MuiPaper-root"], [class*="MuiBox-root"]') || container
      
      const canvas = await html2canvas(chartElement as HTMLElement, {
        backgroundColor: '#fafafa',
        scale: 3,
        useCORS: true
      })
      
      canvas.toBlob((blob) => {
        if (!blob) return
        
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = `lda-${vizType}-chart.png`
        link.click()
        
        URL.revokeObjectURL(url)
      }, 'image/png')
    } catch (error) {
      console.error('Failed to export PNG:', error)
    }
  }, [vizType])
  
  // Check if we have data
  const hasData = result?.success && result?.topics
  
  // Transform LDA topics to TopicWordBars format
  const topicBarData = result?.topics?.map((topic, idx) => ({
    topic_id: topic.topic_id,
    topic_name: useCustomLabels && topic.custom_label ? topic.custom_label : `Topic ${topic.topic_id}`,
    words: topic.keywords.map(kw => ({
      word: kw.word,
      weight: kw.weight * 100 // Convert to percentage for display
    })),
    color: getTopicColor(idx)
  })) || []
  
  // Check if any topic has custom label
  const hasAnyCustomLabel = result?.topics?.some(t => t.custom_label) || false
  
  // Render parameter controls based on visualization type
  const renderParamControls = () => {
    switch (vizType) {
      case 'topicWords':
        return (
          <NumberInput
            label={t('topicModeling.visualization.nWords', 'Words')}
            value={nWords}
            onChange={setNWords}
            size="small"
            min={3}
            max={15}
            integer
            sx={{ width: 100 }}
          />
        )
      default:
        return null
    }
  }
  
  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Visualization Tabs */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs 
          value={vizType} 
          onChange={(_, v) => setVizType(v)}
          variant="scrollable"
          scrollButtons="auto"
        >
          <Tab value="pyldavis" label={t('topicModeling.lda.viz.pyldavis', 'pyLDAvis')} />
          <Tab value="topicWords" label={t('topicModeling.visualization.barchart', 'Topic Word Bars')} />
          <Tab value="topicPie" label={t('topicModeling.lda.viz.topicPie', 'Topic Distribution')} />
          <Tab value="docDist" label={t('topicModeling.lda.viz.docDist', 'Document Distribution')} />
          <Tab value="heatmap" label={t('topicModeling.lda.viz.heatmap', 'Similarity Heatmap')} />
          {result?.has_dynamic && (
            <Tab value="sankey" label={t('topicModeling.lda.viz.sankey', 'Topic Flow')} />
          )}
          {result?.has_dynamic && (
            <Tab value="timeline" label={t('topicModeling.lda.viz.timeline', 'Evolution Timeline')} />
          )}
        </Tabs>
      </Box>
      
      {/* Parameter Panel - Gray Settings Bar */}
      <Paper 
        elevation={0} 
        sx={{ 
          px: 2, 
          py: 1.5, 
          borderBottom: 1, 
          borderColor: 'divider',
          bgcolor: 'action.hover',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}
      >
        <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap">
          {renderParamControls()}
          <FormControl size="small" sx={{ minWidth: 120 }}>
            <InputLabel>{t('topicModeling.lda.viz.colors', 'Colors')}</InputLabel>
            <Select
              value={colorScheme}
              label={t('topicModeling.lda.viz.colors', 'Colors')}
              onChange={(e) => setColorScheme(e.target.value as ColorSchemeName)}
              MenuProps={{ PaperProps: { sx: { maxHeight: 300 } } }}
            >
              {(Object.keys(COLOR_SCHEME_LABELS) as ColorSchemeName[]).map((key) => (
                <MenuItem key={key} value={key}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Box sx={{ 
                      display: 'flex', 
                      gap: '2px',
                      '& > span': { width: 8, height: 12, borderRadius: '1px' }
                    }}>
                      {COLOR_SCHEMES[key].slice(0, 5).map((color, i) => (
                        <span key={i} style={{ backgroundColor: color }} />
                      ))}
                    </Box>
                    <Typography variant="body2">
                      {i18n.language === 'zh' ? COLOR_SCHEME_LABELS[key].zh : COLOR_SCHEME_LABELS[key].en}
                    </Typography>
                  </Box>
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          {hasAnyCustomLabel && (
            <FormControlLabel
              control={
                <Checkbox
                  checked={useCustomLabels}
                  onChange={(e) => setUseCustomLabels(e.target.checked)}
                  size="small"
                />
              }
              label={
                <Typography variant="body2">
                  {t('topicModeling.visualization.useCustomLabels', 'Use Custom Labels')}
                </Typography>
              }
            />
          )}
        </Stack>

        {/* Export buttons */}
        {hasData && (
          <Stack direction="row" spacing={0.5} alignItems="center">
            <Divider orientation="vertical" flexItem sx={{ mx: 1 }} />
            <Tooltip title={vizType === 'pyldavis' ? t('topicModeling.lda.viz.pyldavisSvgNotAvailable', 'SVG export not available for pyLDAvis') : t('wordFrequency.viz.export', 'Export') + ' SVG'}>
              <span>
                <IconButton 
                  size="small" 
                  onClick={handleExportSVG}
                  disabled={vizType === 'pyldavis'}
                >
                  <SaveAltIcon fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
            <Tooltip title={t('wordFrequency.viz.export', 'Export') + ' PNG'}>
              <IconButton size="small" onClick={handleExportPNG}>
                <ImageIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Stack>
        )}
      </Paper>
      
      {/* Visualization Content */}
      <Box 
        ref={chartContainerRef}
        sx={{ 
          flex: 1, 
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        {!hasData ? (
          <Box sx={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            height: '100%',
            minHeight: 400,
            flexDirection: 'column',
            gap: 2,
            p: 4
          }}>
            <InsertChartIcon sx={{ fontSize: 80, color: 'text.disabled' }} />
            <Typography variant="h6" color="text.secondary">
              {t('topicModeling.visualization.noResult')}
            </Typography>
            <Typography variant="body2" color="text.secondary" textAlign="center">
              {t('topicModeling.visualization.runAnalysisFirst')}
            </Typography>
          </Box>
        ) : (
          <Box sx={{ 
            flex: 1, 
            width: '100%', 
            height: '100%',
            display: 'flex'
          }}>
            {vizType === 'topicWords' && result?.topics && (
              <Box sx={{ flex: 1, width: '100%', height: '100%', overflow: 'auto' }}>
                <TopicWordBars
                  data={topicBarData}
                  height={Math.max(500, result.num_topics * 60)}
                  nWords={nWords}
                  scoreType="weight"
                />
              </Box>
            )}
            {vizType === 'topicPie' && result && (
              <TopicPieChart
                key="topicPie"
                topics={result.topics || []}
                docTopics={result.doc_topics || []}
                colorScheme={colorScheme}
                useCustomLabels={useCustomLabels}
              />
            )}
            {vizType === 'docDist' && result && (
              <DocDistributionChart
                key="docDist"
                docTopics={result.doc_topics || []}
                numTopics={result.num_topics || 10}
                colorScheme={colorScheme}
                topics={result.topics || []}
                useCustomLabels={useCustomLabels}
              />
            )}
            {vizType === 'pyldavis' && result && (
              <PyLDAvisViewer
                key="pyldavis"
                resultId={result.result_id}
                iframeRef={pyldavisIframeRef}
              />
            )}
            {vizType === 'heatmap' && result && (
              <Box sx={{ flex: 1, width: '100%', display: 'flex' }}>
                <LDASimilarityHeatmap
                  key="heatmap"
                  data={result.result_id ? {
                    type: 'heatmap',
                    data: buildSimilarityData(result.topics || []),
                    labels: (result.topics || []).map(topic => 
                      useCustomLabels && topic.custom_label 
                        ? topic.custom_label 
                        : t('topicModeling.lda.viz.topicLabel', 'Topic {{topicId}}', { topicId: topic.topic_id })
                    ),
                    min_value: 0,
                    max_value: 1
                  } : null}
                />
              </Box>
            )}
            {vizType === 'sankey' && result?.has_dynamic && result.sankey_data && (
              <Box sx={{ flex: 1, width: '100%', display: 'flex' }}>
                <TopicEvolutionSankey
                  key="sankey"
                  data={result.sankey_data}
                  topics={result.topics}
                  useCustomLabels={useCustomLabels}
                />
              </Box>
            )}
            {vizType === 'timeline' && result?.has_dynamic && result.topic_evolution && (
              <Box sx={{ flex: 1, width: '100%', display: 'flex' }}>
                <LDATopicTimeline
                  key="timeline"
                  data={result.topic_evolution}
                  topics={result.topics}
                  useCustomLabels={useCustomLabels}
                />
              </Box>
            )}
          </Box>
        )}
      </Box>
    </Box>
  )
}

// Topic Pie Chart with interactivity - BERTopic style
function TopicPieChart({
  topics,
  docTopics,
  colorScheme,
  useCustomLabels = false
}: {
  topics: LDATopic[]
  docTopics: Array<{ doc_id: number; dominant_topic: number; dominant_topic_weight: number }>
  colorScheme: ColorSchemeName
  useCustomLabels?: boolean
}) {
  const { t } = useTranslation()
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const dimensions = useResizeObserver(containerRef)
  const tooltip = useTooltip()
  
  const renderChart = useCallback(() => {
    if (!svgRef.current || !dimensions || !topics.length) return
    
    const { width, height } = dimensions
    if (width === 0 || height === 0) return
    
    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()
    
    const margin = { top: 70, right: 160, bottom: 30, left: 30 }
    const chartWidth = width - margin.left - margin.right
    const chartHeight = height - margin.top - margin.bottom
    const radius = Math.min(chartWidth, chartHeight) / 2 - 20
    
    if (radius <= 0) return
    
    const colors = COLOR_SCHEMES[colorScheme]
    
    // Title - BERTopic style
    svg.append('text')
      .attr('x', width / 2)
      .attr('y', 28)
      .attr('text-anchor', 'middle')
      .attr('font-size', '18px')
      .attr('font-weight', 'bold')
      .attr('fill', '#2c3e50')
      .text(t('topicModeling.lda.viz.topicDistribution', 'Topic Distribution'))
    
    // Subtitle
    svg.append('text')
      .attr('x', width / 2)
      .attr('y', 48)
      .attr('text-anchor', 'middle')
      .attr('font-size', '12px')
      .attr('fill', '#666')
      .text(t('topicModeling.lda.viz.topicDistributionSubtitle', 'Documents per Topic (Dominant Topic)'))
    
    // Count documents per topic
    const topicCounts: Record<number, number> = {}
    docTopics.forEach(doc => {
      topicCounts[doc.dominant_topic] = (topicCounts[doc.dominant_topic] || 0) + 1
    })
    
    const data = topics.map(t => ({
      topic_id: t.topic_id,
      count: topicCounts[t.topic_id] || 0,
      keywords: t.keywords.slice(0, 3).map(k => k.word).join(', '),
      label: useCustomLabels && t.custom_label ? t.custom_label : `Topic ${t.topic_id}`
    })).filter(d => d.count > 0)
    
    const pie = d3.pie<typeof data[0]>()
      .value(d => d.count)
      .sort(null)
    
    const arc = d3.arc<d3.PieArcDatum<typeof data[0]>>()
      .innerRadius(radius * 0.4)
      .outerRadius(radius)
    
    const arcHover = d3.arc<d3.PieArcDatum<typeof data[0]>>()
      .innerRadius(radius * 0.4)
      .outerRadius(radius * 1.08)
    
    // Center the pie chart
    const centerX = margin.left + chartWidth / 2
    const centerY = margin.top + chartHeight / 2
    
    const g = svg.append('g')
      .attr('transform', `translate(${centerX},${centerY})`)
    
    // Arcs with animation
    const arcs = g.selectAll('arc')
      .data(pie(data))
      .join('g')
      .attr('class', 'arc')
    
    const paths = arcs.append('path')
      .attr('fill', (_, i) => colors[i % colors.length])
      .attr('stroke', 'white')
      .attr('stroke-width', 2)
      .attr('cursor', 'pointer')
      .attr('opacity', 0)
    
    // Animate arcs
    paths.transition()
      .duration(600)
      .delay((_, i) => i * 50)
      .attr('d', arc)
      .attr('opacity', 0.9)
    
    // Arc hover
    paths
      .on('mouseenter', function(event, d) {
        const color = colors[data.findIndex(t => t.topic_id === d.data.topic_id) % colors.length]
        
        d3.select(this)
          .transition()
          .duration(200)
          .attr('d', arcHover)
          .attr('opacity', 1)
        
        tooltip.show(`
          <div style="margin-bottom:6px;">
            <span style="display:inline-block;width:10px;height:10px;background:${color};border-radius:2px;margin-right:8px;"></span>
            <span style="font-weight:bold;color:${color}">${d.data.label}</span>
          </div>
          <div style="color:#555;">
            <span style="font-weight:500;">${t('topicModeling.lda.viz.documents', 'Documents')}:</span> 
            <span style="font-weight:bold;color:#333">${d.data.count}</span>
          </div>
          <div style="color:#555;">
            <span style="font-weight:500;">${t('topicModeling.lda.viz.keywords', 'Keywords')}:</span> 
            <span style="color:#333">${d.data.keywords}</span>
          </div>
        `, event as unknown as MouseEvent)
      })
      .on('mousemove', (event) => {
        tooltip.move(event as unknown as MouseEvent)
      })
      .on('mouseleave', function() {
        d3.select(this)
          .transition()
          .duration(200)
          .attr('d', arc)
          .attr('opacity', 0.9)
        tooltip.hide()
      })
    
    // Labels on arcs
    arcs.append('text')
      .attr('transform', d => `translate(${arc.centroid(d)})`)
      .attr('text-anchor', 'middle')
      .attr('font-size', '11px')
      .attr('fill', 'white')
      .attr('font-weight', 'bold')
      .attr('opacity', 0)
      .text(d => d.data.count > 0 ? t('topicModeling.lda.viz.topicLabelShort', 'T{{topicId}}', { topicId: d.data.topic_id }) : '')
      .transition()
      .delay((_, i) => 600 + i * 50)
      .duration(200)
      .attr('opacity', 1)
    
    // Center text
    g.append('text')
      .attr('text-anchor', 'middle')
      .attr('font-size', '22px')
      .attr('font-weight', 'bold')
      .attr('fill', '#2c3e50')
      .text(`${docTopics.length}`)
    
    g.append('text')
      .attr('text-anchor', 'middle')
      .attr('y', 22)
      .attr('font-size', '12px')
      .attr('fill', '#666')
      .text(t('topicModeling.lda.viz.documents', 'Documents').toLowerCase())
    
    // Legend
    const legend = svg.append('g')
      .attr('transform', `translate(${width - 150}, ${margin.top + 20})`)
    
    data.forEach((d, i) => {
      const row = legend.append('g')
        .attr('transform', `translate(0,${i * 24})`)
        .attr('cursor', 'pointer')
        .on('mouseenter', function() {
          arcs.filter((ad) => ad.data.topic_id === d.topic_id)
            .select('path')
            .transition()
            .duration(200)
            .attr('d', arcHover)
            .attr('opacity', 1)
          
          d3.select(this).select('rect')
            .transition()
            .duration(200)
            .attr('stroke', colors[i % colors.length])
            .attr('stroke-width', 3)
        })
        .on('mouseleave', function() {
          arcs.filter((ad) => ad.data.topic_id === d.topic_id)
            .select('path')
            .transition()
            .duration(200)
            .attr('d', arc)
            .attr('opacity', 0.9)
          
          d3.select(this).select('rect')
            .transition()
            .duration(200)
            .attr('stroke', 'none')
            .attr('stroke-width', 0)
        })
      
      row.append('rect')
        .attr('width', 14)
        .attr('height', 14)
        .attr('fill', colors[i % colors.length])
        .attr('rx', 2)
      
      row.append('text')
        .attr('x', 20)
        .attr('y', 11)
        .attr('font-size', '11px')
        .attr('fill', '#444')
        .text(`${d.label}: ${d.count}`)
    })
    
  }, [dimensions, topics, docTopics, colorScheme, tooltip, t, useCustomLabels])
  
  useEffect(() => {
    if (dimensions) {
      renderChart()
    }
  }, [dimensions, renderChart])
  
  return (
    <Box 
      ref={containerRef} 
      sx={{ 
        flex: 1,
        width: '100%', 
        height: '100%', 
        overflow: 'hidden',
        display: 'flex',
        '& svg': {
          display: 'block',
          width: '100%',
          height: '100%'
        }
      }}
    >
      {dimensions && dimensions.width > 0 && dimensions.height > 0 && (
        <svg 
          ref={svgRef} 
          width={dimensions.width} 
          height={dimensions.height}
        />
      )}
    </Box>
  )
}

// Document Distribution Chart with interactivity - BERTopic style
function DocDistributionChart({
  docTopics,
  numTopics,
  colorScheme,
  topics = [],
  useCustomLabels = false
}: {
  docTopics: Array<{ doc_id: number; dominant_topic: number; distribution: number[] }>
  numTopics: number
  colorScheme: ColorSchemeName
  topics?: LDATopic[]
  useCustomLabels?: boolean
}) {
  const { t } = useTranslation()
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const dimensions = useResizeObserver(containerRef)
  const tooltip = useTooltip()
  
  const renderChart = useCallback(() => {
    if (!svgRef.current || !dimensions || !docTopics.length) return
    
    const { width, height } = dimensions
    if (width === 0 || height === 0) return
    
    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()
    
    const margin = { top: 70, right: 120, bottom: 60, left: 70 }
    const innerWidth = width - margin.left - margin.right
    const innerHeight = height - margin.top - margin.bottom
    
    if (innerWidth <= 0 || innerHeight <= 0) return
    
    const colors = COLOR_SCHEMES[colorScheme]
    
    // Title - BERTopic style
    svg.append('text')
      .attr('x', width / 2)
      .attr('y', 28)
      .attr('text-anchor', 'middle')
      .attr('font-size', '18px')
      .attr('font-weight', 'bold')
      .attr('fill', '#2c3e50')
      .text(t('topicModeling.lda.viz.docDistribution', 'Document Distribution'))
    
    // Subtitle
    svg.append('text')
      .attr('x', width / 2)
      .attr('y', 48)
      .attr('text-anchor', 'middle')
      .attr('font-size', '12px')
      .attr('fill', '#666')
      .text(t('topicModeling.lda.viz.docDistributionSubtitle', 'Topic Weight Distribution Across Documents'))
    
    // Sample if too many documents
    const maxDocs = 100
    const sampleData = docTopics.length > maxDocs
      ? docTopics.filter((_, i) => i % Math.ceil(docTopics.length / maxDocs) === 0)
      : docTopics
    
    // Scales
    const xScale = d3.scaleLinear()
      .domain([0, sampleData.length - 1])
      .range([0, innerWidth])
    
    const yScale = d3.scaleLinear()
      .domain([0, 1])
      .range([innerHeight, 0])
    
    const g = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`)
    
    // Stack data
    const stackData = sampleData.map((doc, i) => ({
      index: i,
      doc_id: doc.doc_id,
      ...doc.distribution.reduce((acc, val, topicIdx) => {
        acc[`topic${topicIdx}`] = val
        return acc
      }, {} as Record<string, number>)
    }))
    
    const keys = Array.from({ length: numTopics }, (_, i) => `topic${i}`)
    const stack = d3.stack<typeof stackData[0]>().keys(keys)
    const series = stack(stackData)
    
    // Area generator
    const area = d3.area<any>()
      .x((d, i) => xScale(i))
      .y0(d => yScale(d[0]))
      .y1(d => yScale(d[1]))
      .curve(d3.curveMonotoneX)
    
    // Legend - create first so it can be referenced
    const legend = svg.append('g')
      .attr('transform', `translate(${width - 100}, ${margin.top + 10})`)
    
    // Draw areas with animation
    const areas = g.selectAll('path.area')
      .data(series)
      .join('path')
      .attr('class', 'area')
      .attr('fill', (_, i) => colors[i % colors.length])
      .attr('d', d => area(d))
      .attr('opacity', 0)
      .attr('cursor', 'pointer')
    
    // Animate areas
    areas.transition()
      .duration(600)
      .delay((_, i) => i * 30)
      .attr('opacity', 0.8)
    
    // Helper to get topic label
    const getLabel = (topicIdx: number): string => {
      const topic = topics.find(t => t.topic_id === topicIdx)
      if (useCustomLabels && topic?.custom_label) {
        return topic.custom_label
      }
      return t('topicModeling.lda.viz.topicLabel', 'Topic {{topicId}}', { topicId: topicIdx })
    }
    
    // Area hover
    areas
      .on('mouseenter', function(event, d) {
        const topicIdx = keys.indexOf(d.key)
        const color = colors[topicIdx % colors.length]
        const label = getLabel(topicIdx)
        
        d3.select(this)
          .transition()
          .duration(100)
          .attr('opacity', 1)
        
        // Dim other areas
        g.selectAll('path.area')
          .filter((pd) => pd !== d)
          .transition()
          .duration(100)
          .attr('opacity', 0.3)
        
        tooltip.show(`
          <div style="margin-bottom:4px;">
            <span style="display:inline-block;width:10px;height:10px;background:${color};border-radius:2px;margin-right:8px;"></span>
            <span style="font-weight:bold;color:${color}">${label}</span>
          </div>
        `, event as unknown as MouseEvent)
      })
      .on('mousemove', (event) => {
        tooltip.move(event as unknown as MouseEvent)
      })
      .on('mouseleave', function() {
        g.selectAll('path.area')
          .transition()
          .duration(100)
          .attr('opacity', 0.8)
        tooltip.hide()
      })
    
    // Axes
    g.append('g')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(d3.axisBottom(xScale).ticks(5))
      .selectAll('text')
      .attr('font-size', '11px')
    
    g.append('g')
      .call(d3.axisLeft(yScale).ticks(5).tickFormat(d => `${(Number(d) * 100).toFixed(0)}%`))
      .selectAll('text')
      .attr('font-size', '11px')
    
    // X axis label
    svg.append('text')
      .attr('x', width / 2)
      .attr('y', height - 10)
      .attr('text-anchor', 'middle')
      .attr('font-size', '12px')
      .attr('fill', '#666')
      .text(t('topicModeling.lda.viz.documentIndex', 'Document Index'))
    
    // Y axis label
    svg.append('text')
      .attr('transform', 'rotate(-90)')
      .attr('x', -height / 2)
      .attr('y', 20)
      .attr('text-anchor', 'middle')
      .attr('font-size', '12px')
      .attr('fill', '#666')
      .text(t('topicModeling.lda.viz.topicWeightPercent', 'Topic Weight (%)'))
    
    // Legend items
    keys.slice(0, 10).forEach((key, i) => {
      const row = legend.append('g')
        .attr('transform', `translate(0,${i * 20})`)
        .attr('cursor', 'pointer')
        .on('mouseenter', function() {
          g.selectAll('path.area')
            .filter((ad: any) => ad.key === key)
            .transition()
            .duration(100)
            .attr('opacity', 1)
          
          g.selectAll('path.area')
            .filter((ad: any) => ad.key !== key)
            .transition()
            .duration(100)
            .attr('opacity', 0.3)
          
          d3.select(this).select('rect')
            .transition()
            .duration(100)
            .attr('stroke', colors[i % colors.length])
            .attr('stroke-width', 2)
        })
        .on('mouseleave', function() {
          g.selectAll('path.area')
            .transition()
            .duration(100)
            .attr('opacity', 0.8)
          
          d3.select(this).select('rect')
            .transition()
            .duration(100)
            .attr('stroke', 'none')
            .attr('stroke-width', 0)
        })
      
      row.append('rect')
        .attr('width', 12)
        .attr('height', 12)
        .attr('fill', colors[i % colors.length])
        .attr('rx', 2)
      
      row.append('text')
        .attr('x', 18)
        .attr('y', 10)
        .attr('font-size', '11px')
        .attr('fill', '#444')
        .text(getLabel(i))
    })
    
  }, [dimensions, docTopics, numTopics, colorScheme, tooltip, t, topics, useCustomLabels])
  
  useEffect(() => {
    if (dimensions) {
      renderChart()
    }
  }, [dimensions, renderChart])
  
  return (
    <Box 
      ref={containerRef} 
      sx={{ 
        flex: 1,
        width: '100%', 
        height: '100%', 
        overflow: 'hidden',
        display: 'flex',
        '& svg': {
          display: 'block',
          width: '100%',
          height: '100%'
        }
      }}
    >
      {dimensions && dimensions.width > 0 && dimensions.height > 0 && (
        <svg 
          ref={svgRef} 
          width={dimensions.width} 
          height={dimensions.height}
        />
      )}
    </Box>
  )
}

// PyLDAvis Viewer Component
function PyLDAvisViewer({ 
  resultId, 
  iframeRef 
}: { 
  resultId: string
  iframeRef: RefObject<HTMLIFrameElement>
}) {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [htmlContent, setHtmlContent] = useState<string | null>(null)

  useEffect(() => {
    const fetchPyLDAvis = async () => {
      try {
        setLoading(true)
        setError(null)

        const url = `${API_BASE_URL}/api/topic-modeling/lda/results/${resultId}/pyldavis`
        console.log('Fetching pyLDAvis from:', url)
        
        const response = await fetch(url)
        
        // Check if response is ok (status 200-299)
        if (!response.ok) {
          // Try to parse error response
          let errorData
          try {
            errorData = await response.json()
            console.error('pyLDAvis API error response:', errorData)
          } catch {
            errorData = { error: response.statusText || `HTTP ${response.status}` }
            console.error('pyLDAvis API error (non-JSON):', response.status, response.statusText)
          }
          
          if (response.status === 404) {
            setError(t('topicModeling.lda.viz.pyldavisError', 'Failed to load pyLDAvis visualization') + ': LDA result not found')
          } else if (response.status === 400) {
            setError(errorData.detail || errorData.error || 'Gensim model data not available. Please re-run LDA analysis.')
          } else if (response.status === 503) {
            setError(t('topicModeling.lda.viz.pyldavisNotAvailable', 'pyLDAvis not available. Please install pyLDAvis package.'))
          } else {
            const errorMsg = errorData.detail || errorData.error || t('topicModeling.lda.viz.pyldavisError', 'Failed to load pyLDAvis visualization')
            setError(`${errorMsg} (HTTP ${response.status})`)
          }
          return
        }

        const data = await response.json()
        console.log('pyLDAvis API response:', { success: data.success, hasHtml: !!data.html, errorType: data.error_type })

        if (!data.success) {
          if (data.error_type === 'import_error') {
            setError(t('topicModeling.lda.viz.pyldavisNotAvailable', 'pyLDAvis not available. Please install pyLDAvis package.'))
          } else if (data.error_type === 'insufficient_data') {
            let errorMsg = t('topicModeling.lda.viz.pyldavisInsufficientData', 'Insufficient data for pyLDAvis visualization')
            errorMsg += `\n\n${data.error}`
            if (data.suggestions && data.suggestions.length > 0) {
              errorMsg += `\n\n${t('topicModeling.lda.viz.pyldavisSuggestions', 'Suggestions')}:\n`
              errorMsg += data.suggestions.map((s: string) => `• ${s}`).join('\n')
            }
            setError(errorMsg)
          } else {
            setError(data.error || t('topicModeling.lda.viz.pyldavisError', 'Failed to load pyLDAvis visualization'))
          }
        } else {
          if (!data.html) {
            console.warn('pyLDAvis response success but no HTML content')
            setError(t('topicModeling.lda.viz.pyldavisError', 'Failed to load pyLDAvis visualization') + ': No HTML content received')
          } else {
            console.log('pyLDAvis HTML received, length:', data.html.length)
            setHtmlContent(data.html)
          }
        }
      } catch (err) {
        console.error('Failed to fetch pyLDAvis:', err)
        setError(t('topicModeling.lda.viz.pyldavisError', 'Failed to load pyLDAvis visualization') + ': ' + (err instanceof Error ? err.message : String(err)))
      } finally {
        setLoading(false)
      }
    }

    if (resultId) {
      fetchPyLDAvis()
    }
  }, [resultId, t])

  useEffect(() => {
    if (htmlContent && iframeRef.current) {
      const iframe = iframeRef.current
      const doc = iframe.contentDocument || iframe.contentWindow?.document
      if (doc) {
        doc.open()
        doc.write(htmlContent)
        doc.close()
      }
    }
  }, [htmlContent])

  if (loading) {
    return (
      <Box sx={{ 
        flex: 1, 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        flexDirection: 'column',
        gap: 2,
        p: 4
      }}>
        <CircularProgress size={60} />
        <Typography variant="body1" color="text.secondary">
          {t('topicModeling.lda.viz.pyldavisLoading', 'Loading pyLDAvis visualization...')}
        </Typography>
      </Box>
    )
  }

  if (error) {
    return (
      <Box sx={{ 
        flex: 1, 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        flexDirection: 'column',
        gap: 2,
        p: 4,
      }}>
        <InsertChartIcon sx={{ fontSize: 80, color: 'error.light' }} />
        <Typography variant="h6" color="error.main" textAlign="center">
          {t('topicModeling.lda.viz.pyldavisError', 'Failed to load pyLDAvis visualization')}
        </Typography>
        <Typography 
          variant="body2" 
          color="text.secondary" 
          textAlign="center"
          sx={{ whiteSpace: 'pre-line', maxWidth: 600 }}
        >
          {error}
        </Typography>
      </Box>
    )
  }

  return (
    <Box sx={{ flex: 1, width: '100%', height: '100%', display: 'flex' }}>
      <iframe
        ref={iframeRef}
        title="pyLDAvis Visualization"
        style={{
          width: '100%',
          height: '100%',
          border: 'none',
          background: '#fff'
        }}
        sandbox="allow-scripts allow-same-origin"
      />
    </Box>
  )
}
