/**
 * 3D Landscape View for Bibliographic Visualization
 *
 * Renders a 3D terrain/surface plot where height represents research density.
 * Uses Plotly.js for interactive 3D rendering.
 */

import { useMemo } from 'react'
import Plot from 'react-plotly.js'
import { Box, CircularProgress, Typography, useTheme } from '@mui/material'
import { useTranslation } from 'react-i18next'
import type { LandscapeVisualizationData } from '../../../../types/biblio'

const CLUSTER_COLORS = [
  '#1976d2', '#388e3c', '#7b1fa2', '#f57c00', '#d32f2f',
  '#00796b', '#5d4037', '#455a64', '#c2185b', '#0097a7'
]

interface LandscapeViewProps {
  data: LandscapeVisualizationData | null
  loading?: boolean
  colorScheme?: string
}

export default function LandscapeView({
  data,
  loading = false,
  colorScheme: _colorScheme = 'blue'
}: LandscapeViewProps) {
  const { t } = useTranslation()
  const theme = useTheme()
  const isDark = theme.palette.mode === 'dark'

  const { traces, layout, config } = useMemo(() => {
    if (!data || data.points.length === 0) {
      return { traces: [], layout: {}, config: {} }
    }

    const points = data.points
    const clusters = data.clusters

    // Build scatter3d traces per cluster
    const clusterMap = new Map<number, typeof points>()
    for (const p of points) {
      const arr = clusterMap.get(p.cluster) || []
      arr.push(p)
      clusterMap.set(p.cluster, arr)
    }

    const plotTraces: any[] = []

    clusterMap.forEach((pts, clusterId) => {
      const clusterInfo = clusters.find(c => c.id === clusterId)
      const color = CLUSTER_COLORS[clusterId % CLUSTER_COLORS.length]

      plotTraces.push({
        type: 'scatter3d',
        mode: 'markers+text',
        name: clusterInfo?.label || `Cluster ${clusterId}`,
        x: pts.map(p => p.x),
        y: pts.map(p => p.y),
        z: pts.map(p => p.z),
        text: pts.map(p => p.label.length > 20 ? p.label.slice(0, 20) + '...' : p.label),
        textposition: 'top center',
        textfont: { size: 8, color: isDark ? '#ccc' : '#333' },
        marker: {
          size: pts.map(p => Math.max(3, Math.min(15, p.z * 2))),
          color,
          opacity: 0.85,
          line: { width: 1, color: isDark ? '#444' : '#999' }
        },
        hovertemplate: '%{text}<br>z: %{z:.2f}<extra></extra>'
      })
    })

    // Build a surface from the points using a simple grid interpolation
    if (points.length >= 4) {
      const xs = points.map(p => p.x)
      const ys = points.map(p => p.y)
      const zs = points.map(p => p.z)
      const gridSize = 20
      const xMin = Math.min(...xs) - 1, xMax = Math.max(...xs) + 1
      const yMin = Math.min(...ys) - 1, yMax = Math.max(...ys) + 1
      const xStep = (xMax - xMin) / (gridSize - 1)
      const yStep = (yMax - yMin) / (gridSize - 1)

      const xGrid = Array.from({ length: gridSize }, (_, i) => xMin + i * xStep)
      const yGrid = Array.from({ length: gridSize }, (_, i) => yMin + i * yStep)

      // Simple IDW (Inverse Distance Weighting) interpolation
      const zGrid = yGrid.map(yg =>
        xGrid.map(xg => {
          let weightSum = 0
          let valueSum = 0
          for (let k = 0; k < xs.length; k++) {
            const dist = Math.sqrt((xs[k] - xg) ** 2 + (ys[k] - yg) ** 2) + 0.01
            const w = 1 / (dist * dist)
            weightSum += w
            valueSum += w * zs[k]
          }
          return valueSum / weightSum
        })
      )

      plotTraces.unshift({
        type: 'surface',
        x: xGrid,
        y: yGrid,
        z: zGrid,
        colorscale: 'YlOrRd',
        opacity: 0.6,
        showscale: true,
        colorbar: {
          title: { text: t('biblio.heatmapDensity'), font: { color: isDark ? '#ccc' : '#333' } },
          tickfont: { color: isDark ? '#ccc' : '#333' }
        },
        hoverinfo: 'skip'
      })
    }

    const fontColor = isDark ? '#e0e0e0' : '#333'
    const bgColor = 'rgba(0,0,0,0)'
    const gridColor = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'

    const plotLayout: any = {
      autosize: true,
      height: 500,
      margin: { l: 0, r: 0, t: 30, b: 0 },
      paper_bgcolor: bgColor,
      font: { color: fontColor, size: 11 },
      scene: {
        xaxis: { title: '', gridcolor: gridColor, showbackground: false },
        yaxis: { title: '', gridcolor: gridColor, showbackground: false },
        zaxis: {
          title: { text: t('biblio.heatmapDensity'), font: { color: fontColor } },
          gridcolor: gridColor,
          showbackground: false
        },
        bgcolor: isDark ? 'rgba(30,30,30,0.3)' : 'rgba(245,245,245,0.3)',
        camera: { eye: { x: 1.5, y: 1.5, z: 1.2 } }
      },
      legend: {
        font: { color: fontColor },
        bgcolor: 'rgba(0,0,0,0)'
      }
    }

    const plotConfig: any = {
      displayModeBar: true,
      displaylogo: false,
      responsive: true,
      modeBarButtonsToRemove: ['lasso2d', 'select2d'],
      toImageButtonOptions: {
        format: 'png',
        filename: 'biblio-landscape',
        scale: 3
      }
    }

    return { traces: plotTraces, layout: plotLayout, config: plotConfig }
  }, [data, isDark, t])

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
        <CircularProgress />
      </Box>
    )
  }

  if (!data || data.points.length === 0) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
        <Typography color="text.secondary">{t('biblio.noData')}</Typography>
      </Box>
    )
  }

  return (
    <Box sx={{ width: '100%', height: '100%', position: 'relative' }}>
      <Plot
        data={traces}
        layout={layout}
        config={config}
        style={{ width: '100%', height: '100%' }}
        useResizeHandler
      />
    </Box>
  )
}
