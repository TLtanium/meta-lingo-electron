/**
 * LSA Visualization Panel
 * D3.js visualizations for LSA results with interactive features
 * Follows LDA design pattern
 */

import { useState, useRef, useEffect, useCallback } from 'react'
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
  FormControlLabel,
  Checkbox
} from '@mui/material'
import { NumberInput } from '../../../components/common'
import SaveAltIcon from '@mui/icons-material/SaveAlt'
import ImageIcon from '@mui/icons-material/Image'
import InsertChartIcon from '@mui/icons-material/InsertChart'
import { useTranslation } from 'react-i18next'
import * as d3 from 'd3'
import type { LSAResult, LSATopic } from '../../../types/topicModeling'
import { useResizeObserver, useTooltip, getTopicColor } from '../components/visualizations/d3/useD3'
import { TopicWordBars } from '../components/visualizations/d3'
import { COLOR_SCHEMES, COLOR_SCHEME_LABELS, DEFAULT_COLOR_SCHEME, type ColorSchemeName } from '../shared/colorSchemes'

interface LSAVisualizationPanelProps {
  result: LSAResult | null
}

type VizType = 'topicWords' | 'topicPie' | 'docDist'

export default function LSAVisualizationPanel({ result }: LSAVisualizationPanelProps) {
  const { t, i18n } = useTranslation()
  const [vizType, setVizType] = useState<VizType>('topicWords')
  const [colorScheme, setColorScheme] = useState<ColorSchemeName>(DEFAULT_COLOR_SCHEME)
  const [nWords, setNWords] = useState(5)
  const [useCustomLabels, setUseCustomLabels] = useState(false)
  const chartContainerRef = useRef<HTMLDivElement>(null)
  
  // Export SVG
  const handleExportSVG = useCallback(() => {
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
    link.download = `lsa-${vizType}-chart.svg`
    link.click()
    
    URL.revokeObjectURL(url)
  }, [vizType])

  // Export PNG
  const handleExportPNG = useCallback(async () => {
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
        link.download = `lsa-${vizType}-chart.png`
        link.click()
        
        URL.revokeObjectURL(url)
      }, 'image/png')
    } catch (error) {
      console.error('Failed to export PNG:', error)
    }
  }, [vizType])
  
  // Check if we have data
  const hasData = result?.success && result?.topics
  
  // Transform LSA topics to TopicWordBars format
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
          variant="fullWidth"
        >
          <Tab value="topicWords" label={t('topicModeling.visualization.barchart', 'Topic Word Bars')} />
          <Tab value="topicPie" label={t('topicModeling.lsa.viz.topicPie', 'Topic Distribution')} />
          <Tab value="docDist" label={t('topicModeling.lsa.viz.docDist', 'Document Distribution')} />
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
            <InputLabel>{t('topicModeling.lsa.viz.colors', 'Colors')}</InputLabel>
            <Select
              value={colorScheme}
              label={t('topicModeling.lsa.viz.colors', 'Colors')}
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
            <Tooltip title={t('wordFrequency.viz.export', 'Export') + ' SVG'}>
              <IconButton size="small" onClick={handleExportSVG}>
                <SaveAltIcon fontSize="small" />
              </IconButton>
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
          </Box>
        )}
      </Box>
    </Box>
  )
}

// Topic Pie Chart with interactivity
function TopicPieChart({
  topics,
  docTopics,
  colorScheme,
  useCustomLabels = false
}: {
  topics: LSATopic[]
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
    
    // Title
    svg.append('text')
      .attr('x', width / 2)
      .attr('y', 28)
      .attr('text-anchor', 'middle')
      .attr('font-size', '18px')
      .attr('font-weight', 'bold')
      .attr('fill', '#2c3e50')
      .text(t('topicModeling.lsa.viz.topicPie', 'Topic Distribution'))
    
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
      .text(d => d.data.count > 0 ? `T${d.data.topic_id}` : '')
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
      .text('documents')
    
    // Legend with interactivity
    const legend = svg.append('g')
      .attr('transform', `translate(${width - 150}, ${margin.top + 20})`)
    
    data.forEach((d, i) => {
      const row = legend.append('g')
        .attr('transform', `translate(0,${i * 24})`)
        .attr('cursor', 'pointer')
        .on('mouseenter', function() {
          // Highlight corresponding arc
          arcs.filter((ad) => ad.data.topic_id === d.topic_id)
            .select('path')
            .transition()
            .duration(200)
            .attr('d', arcHover)
            .attr('opacity', 1)
          
          // Highlight legend item
          d3.select(this).select('rect')
            .transition()
            .duration(200)
            .attr('stroke', colors[i % colors.length])
            .attr('stroke-width', 3)
        })
        .on('mouseleave', function() {
          // Reset arc
          arcs.filter((ad) => ad.data.topic_id === d.topic_id)
            .select('path')
            .transition()
            .duration(200)
            .attr('d', arc)
            .attr('opacity', 0.9)
          
          // Reset legend item
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

// Document Distribution Chart
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
  topics?: LSATopic[]
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
    
    // Title
    svg.append('text')
      .attr('x', width / 2)
      .attr('y', 28)
      .attr('text-anchor', 'middle')
      .attr('font-size', '18px')
      .attr('font-weight', 'bold')
      .attr('fill', '#2c3e50')
      .text(t('topicModeling.lsa.viz.documentDistribution', 'Document Distribution'))
    
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
    
    // Draw areas
    const areas = g.selectAll('path.area')
      .data(series)
      .join('path')
      .attr('class', 'area')
      .attr('fill', (_, i) => colors[i % colors.length])
      .attr('d', d => area(d))
      .attr('opacity', 0.8)
      .attr('cursor', 'pointer')
    
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
    
    // Legend
    const legend = svg.append('g')
      .attr('transform', `translate(${width - 100}, ${margin.top + 10})`)
    
    keys.slice(0, 10).forEach((key, i) => {
      const row = legend.append('g')
        .attr('transform', `translate(0,${i * 20})`)
        .attr('cursor', 'pointer')
        .on('mouseenter', function() {
          // Highlight corresponding area
          g.selectAll('path.area')
            .filter((ad: any) => ad.key === key)
            .transition()
            .duration(100)
            .attr('opacity', 1)
          
          // Dim other areas
          g.selectAll('path.area')
            .filter((ad: any) => ad.key !== key)
            .transition()
            .duration(100)
            .attr('opacity', 0.3)
          
          // Highlight legend item
          d3.select(this).select('rect')
            .transition()
            .duration(100)
            .attr('stroke', colors[i % colors.length])
            .attr('stroke-width', 2)
        })
        .on('mouseleave', function() {
          // Reset all areas
          g.selectAll('path.area')
            .transition()
            .duration(100)
            .attr('opacity', 0.8)
          
          // Reset legend item
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
