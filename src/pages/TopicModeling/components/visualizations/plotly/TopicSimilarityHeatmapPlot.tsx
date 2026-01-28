/**
 * Topic Similarity Heatmap Plot Component
 * Uses react-plotly.js to display topic similarity matrix
 */

import { useMemo } from 'react'
import Plot from 'react-plotly.js'
import { Box, CircularProgress, Typography } from '@mui/material'
import { useTranslation } from 'react-i18next'
import { useTheme } from '@mui/material/styles'

interface TopicSimilarityHeatmapPlotProps {
  data: any // Plotly figure data
  height?: number
}

export default function TopicSimilarityHeatmapPlot({ data, height = 600 }: TopicSimilarityHeatmapPlotProps) {
  const { t } = useTranslation()
  const theme = useTheme()

  const plotlyConfig = useMemo(() => {
    return {
      displayModeBar: true,
      displaylogo: false,
      modeBarButtonsToRemove: ['pan2d', 'lasso2d'],
      responsive: true,
      toImageButtonOptions: {
        format: 'png',
        filename: 'topic-similarity-heatmap',
        height,
        width: 800,
        scale: 3
      }
    }
  }, [height])

  const plotlyLayout = useMemo(() => {
    if (!data || !data.layout) {
      return {
        autosize: true,
        height,
        paper_bgcolor: 'rgba(0,0,0,0)',
        plot_bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.02)',
        font: {
          color: theme.palette.text.primary,
          family: 'Arial, sans-serif',
          size: 12
        }
      }
    }

    // Merge with theme-aware colors
    return {
      ...data.layout,
      autosize: true,
      height,
      paper_bgcolor: 'rgba(0,0,0,0)',
      plot_bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.02)',
      font: {
        ...data.layout.font,
        color: theme.palette.text.primary
      }
    }
  }, [data, height, theme])

  if (!data) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height }}>
        <CircularProgress />
      </Box>
    )
  }

  if (data.error) {
    return (
      <Box sx={{ p: 2, textAlign: 'center' }}>
        <Typography variant="body2" color="error">
          {data.error}
        </Typography>
      </Box>
    )
  }

  return (
    <Box sx={{ width: '100%', height }}>
      <Plot
        data={data.data || []}
        layout={plotlyLayout}
        config={plotlyConfig}
        style={{ width: '100%', height: '100%' }}
        useResizeHandler
      />
    </Box>
  )
}
