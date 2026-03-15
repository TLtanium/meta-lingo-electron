/**
 * 3D Landscape View for Bibliographic Visualization
 *
 * Vanilla Three.js (no @react-three/fiber) to avoid Vite dev-mode
 * reconciler conflicts. Uses useEffect + canvas ref with OrbitControls,
 * IDW terrain, Matrix-style wireframe overlay, and raycaster hover.
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
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

export default function LandscapeView({ data, loading = false }: LandscapeViewProps) {
  const { t } = useTranslation()
  const theme = useTheme()
  const isDark = theme.palette.mode === 'dark'
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [hoveredLabel, setHoveredLabel] = useState<string | null>(null)

  const hoveredLabelRef = useRef<string | null>(null)
  const setHoveredStable = useCallback((label: string | null) => {
    if (hoveredLabelRef.current !== label) {
      hoveredLabelRef.current = label
      setHoveredLabel(label)
    }
  }, [])

  useEffect(() => {
    if (!data || data.points.length === 0 || !canvasRef.current || !containerRef.current) return

    const canvas = canvasRef.current
    const container = containerRef.current
    const bgColor = isDark ? 0x060a06 : 0xf0f4f0
    const wireColor = isDark ? 0x00ff88 : 0x00aa55
    const wireOpacity = isDark ? 0.35 : 0.25

    // ---- Renderer ----
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setClearColor(bgColor)
    const { clientWidth: initW, clientHeight: initH } = container
    renderer.setSize(initW, initH)

    // ---- Scene ----
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(bgColor)
    scene.fog = new THREE.Fog(bgColor, 14, 28)

    // ---- Camera ----
    const camera = new THREE.PerspectiveCamera(60, initW / Math.max(initH, 1), 0.1, 100)
    camera.position.set(7, 5, 7)
    camera.lookAt(0, 0, 0)

    // ---- Lights ----
    scene.add(new THREE.AmbientLight(0xffffff, isDark ? 0.4 : 0.6))
    const sun = new THREE.DirectionalLight(0xffffff, isDark ? 0.7 : 0.9)
    sun.position.set(5, 10, 5)
    scene.add(sun)
    const fill = new THREE.DirectionalLight(0xffffff, 0.3)
    fill.position.set(-5, 5, -5)
    scene.add(fill)

    // ---- Terrain geometry ----
    const points = data.points
    const xs = points.map(p => p.x)
    const ys = points.map(p => p.y)
    const zs = points.map(p => p.z)
    const xMin = Math.min(...xs), xMax = Math.max(...xs)
    const yMin = Math.min(...ys), yMax = Math.max(...ys)
    const xRange = xMax - xMin || 1
    const yRange = yMax - yMin || 1
    const maxZ = Math.max(...zs) || 1
    const hScale = 3.0
    const halfW = 5
    const halfH = 5 * (yRange / xRange)
    const gridSize = 40

    const geo = new THREE.PlaneGeometry(10, 10 * (yRange / xRange), gridSize - 1, gridSize - 1)
    const posAttr = geo.attributes.position as THREE.BufferAttribute
    const colorsArr = new Float32Array(posAttr.count * 3)

    for (let i = 0; i < posAttr.count; i++) {
      const px = posAttr.getX(i)
      const py = posAttr.getY(i)
      const dataX = xMin + ((px + halfW) / (2 * halfW)) * xRange
      const dataY = yMin + ((py + halfH) / (2 * halfH)) * yRange

      let weightSum = 0, valueSum = 0
      for (let k = 0; k < points.length; k++) {
        const dist = Math.sqrt((points[k].x - dataX) ** 2 + (points[k].y - dataY) ** 2) + 0.01
        const w = 1 / (dist * dist)
        weightSum += w
        valueSum += w * points[k].z
      }
      const t = Math.min(1, Math.max(0, (valueSum / weightSum) / maxZ))
      posAttr.setZ(i, t * hScale)

      const color = new THREE.Color()
      if (t < 0.25) color.setHSL(0.6, 0.8, 0.2 + t * 2)
      else if (t < 0.5) color.setHSL(0.45 - (t - 0.25) * 1.2, 0.85, 0.4 + (t - 0.25))
      else if (t < 0.75) color.setHSL(0.15 - (t - 0.5) * 0.4, 0.9, 0.5 + (t - 0.5) * 0.4)
      else color.setHSL(0.0, 0.9, 0.5 + (t - 0.75) * 0.5)
      colorsArr[i * 3] = color.r
      colorsArr[i * 3 + 1] = color.g
      colorsArr[i * 3 + 2] = color.b
    }
    geo.computeVertexNormals()
    geo.setAttribute('color', new THREE.BufferAttribute(colorsArr, 3))

    const terrainGroup = new THREE.Group()
    terrainGroup.rotation.x = -Math.PI / 2.6

    const solidMat = new THREE.MeshStandardMaterial({
      vertexColors: true, transparent: true, opacity: 0.38,
      side: THREE.DoubleSide, roughness: 0.6, metalness: 0.1
    })
    terrainGroup.add(new THREE.Mesh(geo, solidMat))

    const wireGeo = new THREE.WireframeGeometry(geo)
    const wireMat = new THREE.LineBasicMaterial({ color: wireColor, transparent: true, opacity: wireOpacity })
    terrainGroup.add(new THREE.LineSegments(wireGeo, wireMat))
    scene.add(terrainGroup)

    // ---- Scatter spheres ----
    const sorted = [...points].sort((a, b) => b.z - a.z).slice(0, 60)
    const scatterGroup = new THREE.Group()
    scatterGroup.rotation.x = -Math.PI / 2.6
    const sphereData: { mesh: THREE.Mesh; label: string }[] = []

    sorted.forEach(p => {
      const cx = ((p.x - xMin) / xRange) * 2 * halfW - halfW
      const cy = (p.z / maxZ) * hScale + 0.15
      const cz = -(((p.y - yMin) / yRange) * 2 * halfH - halfH)
      const radius = Math.max(0.06, Math.min(0.2, p.z / maxZ * 0.25))
      const hex = new THREE.Color(CLUSTER_COLORS[p.cluster % CLUSTER_COLORS.length])
      const mat = new THREE.MeshStandardMaterial({
        color: hex, emissive: hex, emissiveIntensity: 0.35,
        transparent: true, opacity: 0.92
      })
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 10, 7), mat)
      mesh.position.set(cx, cy, cz)
      scatterGroup.add(mesh)
      sphereData.push({ mesh, label: p.label })
    })
    scene.add(scatterGroup)

    // ---- Grid ----
    const grid = new THREE.GridHelper(
      14, 28,
      isDark ? 0x003322 : 0x88bb99,
      isDark ? 0x001a11 : 0xbbddcc
    )
    grid.position.y = -0.12
    scene.add(grid)

    // ---- OrbitControls ----
    const controls = new OrbitControls(camera, canvas)
    controls.enableDamping = true
    controls.dampingFactor = 0.1
    controls.minDistance = 3
    controls.maxDistance = 20
    controls.maxPolarAngle = Math.PI / 1.8

    // ---- Raycaster ----
    const raycaster = new THREE.Raycaster()
    const mouse = new THREE.Vector2(-9999, -9999)
    const sphereMeshes = sphereData.map(d => d.mesh)

    const onMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect()
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
    }
    const onMouseLeave = () => {
      mouse.set(-9999, -9999)
      setHoveredStable(null)
    }
    canvas.addEventListener('mousemove', onMouseMove)
    canvas.addEventListener('mouseleave', onMouseLeave)

    // ---- ResizeObserver ----
    const obs = new ResizeObserver(() => {
      const cw = container.clientWidth
      const ch = container.clientHeight
      renderer.setSize(cw, ch)
      camera.aspect = cw / Math.max(ch, 1)
      camera.updateProjectionMatrix()
    })
    obs.observe(container)

    // ---- Animation loop ----
    let rafId: number
    let driftAngle = 0
    let lastTime = performance.now()

    const tick = (now: number) => {
      rafId = requestAnimationFrame(tick)
      const delta = Math.min((now - lastTime) / 1000, 0.1)
      lastTime = now

      controls.update()

      driftAngle += delta * 0.015
      terrainGroup.rotation.z = driftAngle
      scatterGroup.rotation.z = driftAngle

      // Hover
      raycaster.setFromCamera(mouse, camera)
      const hits = raycaster.intersectObjects(sphereMeshes)
      if (hits.length > 0) {
        const idx = sphereMeshes.indexOf(hits[0].object as THREE.Mesh)
        setHoveredStable(idx >= 0 ? sphereData[idx].label : null)
      } else {
        setHoveredStable(null)
      }

      renderer.render(scene, camera)
    }
    rafId = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(rafId)
      obs.disconnect()
      canvas.removeEventListener('mousemove', onMouseMove)
      canvas.removeEventListener('mouseleave', onMouseLeave)
      controls.dispose()
      renderer.dispose()
      geo.dispose()
      wireGeo.dispose()
      solidMat.dispose()
      wireMat.dispose()
    }
  }, [data, isDark, setHoveredStable])

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
    <Box
      ref={containerRef}
      sx={{
        width: '100%', height: '100%', position: 'relative',
        bgcolor: isDark ? '#060a06' : '#f0f4f0', borderRadius: 1, overflow: 'hidden'
      }}
    >
      <canvas
        ref={canvasRef}
        style={{ display: 'block', width: '100%', height: '100%' }}
      />

      {hoveredLabel && (
        <Box sx={{
          position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)',
          bgcolor: 'rgba(0,0,0,0.82)', color: 'white',
          px: 1.5, py: 0.6, borderRadius: 1, fontSize: 11,
          pointerEvents: 'none', zIndex: 10, maxWidth: 260, textAlign: 'center'
        }}>
          {hoveredLabel}
        </Box>
      )}

      <Box sx={{
        position: 'absolute', bottom: 8, left: 8,
        bgcolor: isDark ? 'rgba(0,0,0,0.72)' : 'rgba(255,255,255,0.85)',
        p: 1, borderRadius: 1, fontSize: 10, color: 'text.secondary',
        display: 'flex', flexDirection: 'column', gap: 0.3
      }}>
        {data.clusters.slice(0, 8).map((c, i) => (
          <Box key={c.id} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: CLUSTER_COLORS[i % CLUSTER_COLORS.length], flexShrink: 0 }} />
            <span>#{c.id} {c.label.slice(0, 18)}</span>
          </Box>
        ))}
      </Box>

      <Box sx={{
        position: 'absolute', bottom: 8, right: 8,
        bgcolor: isDark ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.7)',
        px: 1, py: 0.5, borderRadius: 1, fontSize: 10, color: 'text.secondary'
      }}>
        {t('biblio.landscape3dHint', '拖拽旋转 · 滚轮缩放')}
      </Box>
    </Box>
  )
}
