/**
 * Visualization Panel for Synonym Analysis
 * Container for synonym visualizations with chart type switching
 * Design follows WordFrequency VisualizationPanel
 */

import { useState, useRef, useCallback } from 'react'
import {
  Box,
  Tabs,
  Tab,
  Typography,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Stack,
  FormControlLabel,
  Switch,
  IconButton,
  Tooltip,
  Paper,
  Divider
} from '@mui/material'
import HubIcon from '@mui/icons-material/Hub'
import AccountTreeIcon from '@mui/icons-material/AccountTree'
import ViewListIcon from '@mui/icons-material/ViewList'
import InsertChartIcon from '@mui/icons-material/InsertChart'
import SaveAltIcon from '@mui/icons-material/SaveAlt'
import ImageIcon from '@mui/icons-material/Image'
import { useTranslation } from 'react-i18next'
import { NumberInput } from '../../components/common'
import type { SynonymResult, SynonymVizConfig } from '../../types/synonym'
import SynonymNetwork from './components/SynonymNetwork'
import SynonymTree from './components/SynonymTree'

interface VisualizationPanelProps {
  data: SynonymResult[]
  config: SynonymVizConfig
  onConfigChange: (config: SynonymVizConfig) => void
  onWordClick: (word: string) => void
}

type ChartType = 'network' | 'tree' | 'list'

const COLOR_SCHEMES = [
  { value: 'default', label: 'Default' },
  { value: 'category10', label: 'Category' },
  { value: 'pastel', label: 'Pastel' },
  { value: 'warm', label: 'Warm' },
  { value: 'cool', label: 'Cool' }
]

export default function VisualizationPanel({
  data,
  config,
  onConfigChange,
  onWordClick
}: VisualizationPanelProps) {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState<ChartType>(config.type)
  const chartContainerRef = useRef<HTMLDivElement>(null)
  // Separate SVG refs for each chart type
  const networkSvgRef = useRef<SVGSVGElement | null>(null)
  const treeSvgRef = useRef<SVGSVGElement | null>(null)

  // Get maxNodes for current chart type
  const getCurrentMaxNodes = (): number => {
    const defaults: Record<ChartType, number> = {
      network: 50,
      tree: 5,
      list: 200
    }
    return config.maxNodesByType?.[activeTab] ?? config.maxNodes ?? defaults[activeTab]
  }

  // Handle tab change - maintain separate maxNodes for each chart type
  const handleTabChange = (_: React.SyntheticEvent, newValue: ChartType) => {
    // Save current maxNodes for the old chart type
    const currentMaxNodes = getCurrentMaxNodes()
    const defaults: Record<ChartType, number> = {
      network: 50,
      tree: 5,
      list: 200
    }
    
    // Get the maxNodes for the new chart type (use saved value or default)
    const newChartMaxNodes = config.maxNodesByType?.[newValue] ?? defaults[newValue]
    
    const newMaxNodesByType = {
      ...(config.maxNodesByType || {}),
      [activeTab]: currentMaxNodes,
      // Ensure new chart type has its own value
      [newValue]: newChartMaxNodes
    }
    
    setActiveTab(newValue)
    onConfigChange({ 
      ...config, 
      type: newValue,
      maxNodes: newChartMaxNodes,  // Update main maxNodes for backward compatibility
      maxNodesByType: newMaxNodesByType
    })
  }

  // Handle max nodes change
  const handleMaxNodesChange = (value: number) => {
    const newMaxNodesByType = {
      ...(config.maxNodesByType || {}),
      [activeTab]: value
    }
    onConfigChange({ 
      ...config, 
      maxNodes: value,  // Keep for backward compatibility
      maxNodesByType: newMaxNodesByType
    })
  }

  // Handle color scheme change
  const handleColorSchemeChange = (value: string) => {
    onConfigChange({ ...config, colorScheme: value })
  }

  // Handle show definitions toggle
  const handleShowDefinitionsChange = (checked: boolean) => {
    onConfigChange({ ...config, showDefinitions: checked })
  }

  // Export SVG - export the full SVG content
  const handleExportSVG = useCallback(() => {
    // Get current SVG ref based on active tab
    const svgRef = activeTab === 'network' ? networkSvgRef.current : 
                    activeTab === 'tree' ? treeSvgRef.current : null
    if (!svgRef) return

    // Clone the SVG to avoid modifying the original
    const svgClone = svgRef.cloneNode(true) as SVGSVGElement
    
    // Get the content group
    const gElement = svgClone.querySelector('g')
    if (!gElement) return
    
    // Get bounding box of all content
    const originalG = svgRef.querySelector('g')
    if (!originalG) return
    
    // Use getBBox for actual content size
    const contentBbox = originalG.getBBox()
    const padding = 40
    
    // Keep the transform but adjust viewBox
    svgClone.setAttribute('viewBox', `${contentBbox.x - padding} ${contentBbox.y - padding} ${contentBbox.width + padding * 2} ${contentBbox.height + padding * 2}`)
    svgClone.setAttribute('width', String(contentBbox.width + padding * 2))
    svgClone.setAttribute('height', String(contentBbox.height + padding * 2))

    const serializer = new XMLSerializer()
    const svgString = serializer.serializeToString(svgClone)
    const blob = new Blob([svgString], { type: 'image/svg+xml' })
    const url = URL.createObjectURL(blob)
    
    const link = document.createElement('a')
    link.href = url
    link.download = `synonym-${activeTab}-chart.svg`
    link.click()
    
    URL.revokeObjectURL(url)
  }, [activeTab])

  // Export PNG - export full content for all views
  const handleExportPNG = useCallback(async () => {
    try {
      // For list view, capture the entire scrollable content
      if (activeTab === 'list') {
        const html2canvas = (await import('html2canvas')).default
        
        // Get the list content element by id
        const listContent = document.getElementById('synonym-list-content')
        if (!listContent) return
        
        const canvas = await html2canvas(listContent, {
          backgroundColor: '#ffffff',
          scale: 3,
          useCORS: true,
          scrollY: -window.scrollY,
          height: listContent.scrollHeight,
          windowHeight: listContent.scrollHeight + 100
        })
        
        canvas.toBlob((blob) => {
          if (!blob) return
          
          const url = URL.createObjectURL(blob)
          const link = document.createElement('a')
          link.href = url
          link.download = `synonym-list.png`
          link.click()
          
          URL.revokeObjectURL(url)
        }, 'image/png')
      } else {
        // For network and tree views - convert SVG to PNG with full content
        const svgRef = activeTab === 'network' ? networkSvgRef.current : 
                        activeTab === 'tree' ? treeSvgRef.current : null
        if (!svgRef) return
        
        // Get the content group's bounding box
        const gElement = svgRef.querySelector('g')
        if (!gElement) return
        
        const bbox = gElement.getBBox()
        const padding = 60
        const width = bbox.width + padding * 2
        const height = bbox.height + padding * 2
        
        // Clone SVG keeping the transform
        const svgClone = svgRef.cloneNode(true) as SVGSVGElement
        
        // Set viewBox to capture all content
        svgClone.setAttribute('viewBox', `${bbox.x - padding} ${bbox.y - padding} ${width} ${height}`)
        svgClone.setAttribute('width', String(width))
        svgClone.setAttribute('height', String(height))
        
        // Add white background as first element
        const bgRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
        bgRect.setAttribute('x', String(bbox.x - padding))
        bgRect.setAttribute('y', String(bbox.y - padding))
        bgRect.setAttribute('width', String(width))
        bgRect.setAttribute('height', String(height))
        bgRect.setAttribute('fill', '#ffffff')
        svgClone.insertBefore(bgRect, svgClone.firstChild)
        
        // Convert to data URL
        const serializer = new XMLSerializer()
        const svgString = serializer.serializeToString(svgClone)
        const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' })
        const svgUrl = URL.createObjectURL(svgBlob)
        
        // Create image and canvas
        const img = new Image()
        img.onload = () => {
          const canvas = document.createElement('canvas')
          const scale = 3 // High resolution
          canvas.width = width * scale
          canvas.height = height * scale
          
          const ctx = canvas.getContext('2d')
          if (!ctx) return
          
          ctx.scale(scale, scale)
          ctx.fillStyle = '#ffffff'
          ctx.fillRect(0, 0, width, height)
          ctx.drawImage(img, 0, 0, width, height)
          
          canvas.toBlob((blob) => {
            if (!blob) return
            
            const url = URL.createObjectURL(blob)
            const link = document.createElement('a')
            link.href = url
            link.download = `synonym-${activeTab}-chart.png`
            link.click()
            
            URL.revokeObjectURL(url)
          }, 'image/png')
          
          URL.revokeObjectURL(svgUrl)
        }
        img.src = svgUrl
      }
    } catch (error) {
      console.error('Failed to export PNG:', error)
    }
  }, [activeTab])

  // Render chart based on active tab
  const renderChart = () => {
    if (data.length === 0) {
      return (
        <Box
          sx={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            height: '100%',
            color: 'text.secondary',
            flexDirection: 'column',
            gap: 2,
            p: 4
          }}
        >
          <InsertChartIcon sx={{ fontSize: 80, color: 'text.disabled' }} />
          <Typography variant="h6" color="text.secondary">
            {t('synonym.visualization.noData')}
          </Typography>
          <Typography variant="body2" color="text.secondary" textAlign="center">
            {t('synonym.visualization.runAnalysisFirst')}
          </Typography>
        </Box>
      )
    }

    const currentMaxNodes = getCurrentMaxNodes()
    
    switch (activeTab) {
      case 'network':
        return (
          <Box sx={{ height: '100%' }}>
            <SynonymNetwork
              data={data}
              maxNodes={currentMaxNodes}
              colorScheme={config.colorScheme}
              showDefinitions={config.showDefinitions}
              onWordClick={onWordClick}
              onSvgRef={(ref) => { networkSvgRef.current = ref }}
            />
          </Box>
        )
      case 'tree':
        return (
          <Box sx={{ height: '100%' }}>
            <SynonymTree
              data={data}
              maxNodes={currentMaxNodes}
              colorScheme={config.colorScheme}
              showDefinitions={config.showDefinitions}
              onWordClick={onWordClick}
              onSvgRef={(ref) => { treeSvgRef.current = ref }}
            />
          </Box>
        )
      case 'list':
        return (
          <Box sx={{ height: '100%', overflow: 'auto' }}>
            <SynonymListView 
              data={data} 
              maxNodes={currentMaxNodes}
              onWordClick={onWordClick}
            />
          </Box>
        )
      default:
        return null
    }
  }

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Chart Type Tabs */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs 
          value={activeTab} 
          onChange={handleTabChange}
          variant="fullWidth"
        >
          <Tab 
            value="network" 
            icon={<HubIcon />} 
            label={t('synonym.visualization.network')} 
            iconPosition="start"
          />
          <Tab 
            value="tree" 
            icon={<AccountTreeIcon />} 
            label={t('synonym.visualization.tree')} 
            iconPosition="start"
          />
          <Tab 
            value="list" 
            icon={<ViewListIcon />} 
            label={t('synonym.visualization.list')} 
            iconPosition="start"
          />
        </Tabs>
      </Box>

      {/* Chart Settings */}
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
        <Stack direction="row" spacing={3} alignItems="center" flexWrap="wrap">
          {/* Max Nodes */}
          <NumberInput
            label={t('synonym.visualization.maxNodes')}
            size="small"
            value={getCurrentMaxNodes()}
            onChange={handleMaxNodesChange}
            min={5}
            max={activeTab === 'tree' ? 1000 : activeTab === 'list' ? 1000 : 200}
            step={activeTab === 'tree' ? 1 : activeTab === 'list' ? 20 : 5}
            integer
            defaultValue={activeTab === 'tree' ? 5 : activeTab === 'list' ? 200 : 50}
            sx={{ width: 140 }}
          />

          {/* Color Scheme (for network and tree) */}
          {activeTab !== 'list' && (
            <FormControl size="small" sx={{ minWidth: 150 }}>
              <InputLabel>{t('synonym.visualization.colorScheme')}</InputLabel>
              <Select
                value={config.colorScheme}
                label={t('synonym.visualization.colorScheme')}
                onChange={(e) => handleColorSchemeChange(e.target.value)}
              >
                {COLOR_SCHEMES.map(scheme => (
                  <MenuItem key={scheme.value} value={scheme.value}>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Box 
                        sx={{ 
                          width: 16, 
                          height: 16, 
                          borderRadius: 0.5,
                          bgcolor: scheme.value === 'default' ? '#1976d2' :
                                  scheme.value === 'category10' ? '#1f77b4' :
                                  scheme.value === 'pastel' ? '#aec6cf' :
                                  scheme.value === 'warm' ? '#ff6b6b' : '#0984e3'
                        }} 
                      />
                      <span>{t(`synonym.visualization.colors.${scheme.value}`)}</span>
                    </Stack>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}

          {/* Show Definitions (for network and tree) */}
          {activeTab !== 'list' && (
            <FormControlLabel
              control={
                <Switch
                  checked={config.showDefinitions}
                  onChange={(e) => handleShowDefinitionsChange(e.target.checked)}
                  size="small"
                />
              }
              label={
                <Typography variant="body2">
                  {t('synonym.visualization.showDefinitions')}
                </Typography>
              }
            />
          )}
        </Stack>

        {/* Export buttons */}
        {data.length > 0 && (
          <Stack direction="row" spacing={0.5} alignItems="center">
            <Divider orientation="vertical" flexItem sx={{ mx: 1 }} />
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
        )}
      </Paper>

      {/* Chart Container */}
      <Box ref={chartContainerRef} sx={{ flex: 1, overflow: 'auto', p: 1 }}>
        {renderChart()}
      </Box>
    </Box>
  )
}

// Simple list view of synonyms
function SynonymListView({ 
  data, 
  maxNodes,
  onWordClick
}: { 
  data: SynonymResult[]
  maxNodes: number
  onWordClick: (word: string) => void
}) {
  const { t } = useTranslation()
  const limitedData = data.slice(0, maxNodes)
  
  return (
    <Stack spacing={2} sx={{ p: 1, bgcolor: '#fff' }} id="synonym-list-content">
      {limitedData.map(result => (
        <Paper 
          key={result.word} 
          variant="outlined" 
          sx={{ 
            p: 2,
            cursor: 'pointer',
            '&:hover': { bgcolor: 'action.hover' }
          }}
          onClick={() => onWordClick(result.word)}
        >
          <Stack direction="row" spacing={2} alignItems="flex-start">
            <Box sx={{ minWidth: 120 }}>
              <Typography variant="subtitle1" fontWeight={600}>
                {result.word}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {t('synonym.results.frequency')}: {result.frequency}
              </Typography>
              <br />
              <Typography variant="caption" color="text.secondary">
                {t('synonym.results.synonymCount')}: {result.synonym_count}
              </Typography>
            </Box>
            <Box sx={{ flex: 1 }}>
              <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                {result.all_synonyms.slice(0, 15).map(syn => (
                  <Typography 
                    key={syn} 
                    variant="body2"
                    sx={{ 
                      bgcolor: 'primary.light', 
                      color: 'primary.contrastText',
                      px: 1,
                      py: 0.25,
                      borderRadius: 1,
                      fontSize: '0.8rem'
                    }}
                  >
                    {syn}
                  </Typography>
                ))}
                {result.all_synonyms.length > 15 && (
                  <Typography variant="body2" color="text.secondary">
                    +{result.all_synonyms.length - 15} {t('common.more')}
                  </Typography>
                )}
              </Stack>
              {result.synsets[0] && (
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1, fontStyle: 'italic' }}>
                  {result.synsets[0].definition}
                </Typography>
              )}
            </Box>
          </Stack>
        </Paper>
      ))}
    </Stack>
  )
}
