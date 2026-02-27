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
  Divider,
  useTheme
} from '@mui/material'
import HubIcon from '@mui/icons-material/Hub'
import AccountTreeIcon from '@mui/icons-material/AccountTree'
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

type ChartType = 'network' | 'tree'

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
  const theme = useTheme()
  const isDarkMode = theme.palette.mode === 'dark'
  const [activeTab, setActiveTab] = useState<ChartType>(config.type)
  const chartContainerRef = useRef<HTMLDivElement>(null)
  // Separate SVG refs for each chart type
  const networkSvgRef = useRef<SVGSVGElement | null>(null)
  const treeSvgRef = useRef<SVGSVGElement | null>(null)

  // Get maxNodes for current chart type
  const getCurrentMaxNodes = (): number => {
    const defaults: Record<ChartType, number> = {
      network: 50,
      tree: 5
    }
    return config.maxNodesByType?.[activeTab] ?? config.maxNodes ?? defaults[activeTab]
  }

  // Handle tab change - maintain separate maxNodes for each chart type
  const handleTabChange = (_: React.SyntheticEvent, newValue: ChartType) => {
    const currentMaxNodes = getCurrentMaxNodes()
    const defaults: Record<ChartType, number> = {
      network: 50,
      tree: 5
    }
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

  // Export PNG - convert SVG to PNG with full content
  const handleExportPNG = useCallback(async () => {
    try {
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
              isDarkMode={isDarkMode}
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
              isDarkMode={isDarkMode}
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
            max={activeTab === 'tree' ? 1000 : 200}
            step={activeTab === 'tree' ? 1 : 5}
            integer
            defaultValue={activeTab === 'tree' ? 5 : 50}
            sx={{ width: 140 }}
          />

          {/* Color Scheme */}
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

          {/* Show Definitions */}
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

