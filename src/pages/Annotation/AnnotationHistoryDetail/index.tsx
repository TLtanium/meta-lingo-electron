/**
 * AnnotationHistoryDetail - 标注历史详情页面
 * 
 * 功能：
 * - 显示存档基本信息
 * - 文本标注表格展示
 * - 视频标注表格展示（多模态）
 * - 数据可视化图表
 */

import { useState, useEffect } from 'react'
import {
  Box,
  Typography,
  Paper,
  Button,
  Stack,
  Chip,
  Alert,
  CircularProgress,
  Tabs,
  Tab,
  Divider
} from '@mui/material'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import DescriptionIcon from '@mui/icons-material/Description'
import VideoFileIcon from '@mui/icons-material/VideoFile'
import AudioFileIcon from '@mui/icons-material/AudioFile'
import TableChartIcon from '@mui/icons-material/TableChart'
import BarChartIcon from '@mui/icons-material/BarChart'
import { useTranslation } from 'react-i18next'
import { api } from '../../../api/client'
import type { AnnotationArchive, Annotation, YoloTrack, VideoBox, ClipAnnotationData, AudioBox, PitchDataArchive, AcousticDataArchive } from '../../../types'
import AnnotationDataTable from './AnnotationDataTable'
import VideoAnnotationTable from './VideoAnnotationTable'
import AudioAnnotationTable from './AudioAnnotationTable'
import AnnotationVisualization from './AnnotationVisualization'
import MultimodalVisualization from './MultimodalVisualization'
import AudioVisualization from './AudioVisualization'

// 存档信息类型（从列表传入）
interface ArchiveInfo {
  id: string
  filename: string
  type: 'text' | 'multimodal'
  mediaType?: 'video' | 'audio'  // 媒体类型
  framework: string
  textName?: string
  resourceName?: string
  annotationCount: number
  clipFrameCount?: number
  yoloCount?: number
  manualCount?: number
  timestamp: string
  corpus: string
}

interface AnnotationHistoryDetailProps {
  archive: ArchiveInfo
  onBack: () => void
}

// Tab 面板组件
interface TabPanelProps {
  children?: React.ReactNode
  index: number
  value: number
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props
  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      {...other}
    >
      {value === index && <Box sx={{ pt: 2 }}>{children}</Box>}
    </div>
  )
}

export default function AnnotationHistoryDetail({ archive, onBack }: AnnotationHistoryDetailProps) {
  const { t } = useTranslation()
  
  // 状态
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [archiveData, setArchiveData] = useState<AnnotationArchive | null>(null)
  const [tabValue, setTabValue] = useState(0)
  
  // 加载存档详情
  useEffect(() => {
    const loadArchiveData = async () => {
      setLoading(true)
      setError(null)
      
      try {
        const response = await api.get(`/api/annotation/load/${archive.corpus}/${archive.id}`)
        const result = response.data as { success: boolean; data: AnnotationArchive }
        
        if (result.success && result.data) {
          setArchiveData(result.data)
        } else {
          setError('Failed to load archive data')
        }
      } catch (err) {
        console.error('Failed to load archive:', err)
        setError('Failed to load archive data')
      } finally {
        setLoading(false)
      }
    }
    
    loadArchiveData()
  }, [archive.corpus, archive.id])
  
  // 格式化时间
  const formatTime = (timestamp: string) => {
    if (!timestamp) return '-'
    // 处理 YYYYMMDD_HHMMSS 格式
    if (timestamp.includes('_') && !timestamp.includes('-')) {
      const [date, time] = timestamp.split('_')
      const year = date.slice(0, 4)
      const month = date.slice(4, 6)
      const day = date.slice(6, 8)
      const hour = time.slice(0, 2)
      const minute = time.slice(2, 4)
      return `${year}-${month}-${day} ${hour}:${minute}`
    }
    const date = new Date(timestamp)
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })
  }
  
  if (loading) {
    return (
      <Box sx={{ height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <CircularProgress />
      </Box>
    )
  }
  
  if (error || !archiveData) {
    return (
      <Box sx={{ height: '100%', p: 2 }}>
        <Button startIcon={<ArrowBackIcon />} onClick={onBack} sx={{ mb: 2 }}>
          {t('annotation.backToList', '返回列表')}
        </Button>
        <Alert severity="error">{error || 'Unknown error'}</Alert>
      </Box>
    )
  }
  
  const isMultimodal = archive.type === 'multimodal'
  const isAudio = isMultimodal && archive.mediaType === 'audio'
  const isVideo = isMultimodal && archive.mediaType !== 'audio'
  const annotations = archiveData.annotations || []
  const yoloAnnotations = archiveData.yoloAnnotations || []
  const manualTracks = archiveData.manualTracks || []
  const clipAnnotations = archiveData.clipAnnotations || null
  const transcriptSegments = archiveData.transcriptSegments || []
  // 音频专用
  const audioBoxes = (archiveData as any).audioBoxes as AudioBox[] || []
  const pitchData = (archiveData as any).pitchData as PitchDataArchive | undefined
  const acousticData = (archiveData as any).acousticData as AcousticDataArchive | undefined
  const audioVisualizationSvg = (archiveData as any).audioVisualizationSvg as string | undefined
  
  // 计算视频标注总数（manualTracks + annotations 中 type === 'video' 的）
  const videoAnnotationsFromAnnotations = annotations.filter(a => a.type === 'video')
  const totalManualVideoCount = manualTracks.length + videoAnnotationsFromAnnotations.length
  
  // 非视频标注数量（用于多模态第一个标签页）
  const textAnnotationsCount = annotations.filter(a => a.type !== 'video').length
  
  // CLIP标注帧数
  const clipFrameCount = clipAnnotations?.frame_results?.length || 0
  
  // 计算音频时长（从转录片段）
  const audioDuration = transcriptSegments.length > 0 
    ? Math.max(...transcriptSegments.map(s => s.end))
    : 60
    
  // 颜色方案
  const cardColor = isAudio ? '#f97316' : (isVideo ? 'secondary.main' : 'primary.main')
  
  return (
    <Box sx={{ height: '100%', width: '100%', overflow: 'auto', p: 2, boxSizing: 'border-box' }}>
      {/* 返回按钮和标题 */}
      <Box sx={{ mb: 2 }}>
        <Button 
          startIcon={<ArrowBackIcon />} 
          onClick={onBack}
          sx={{ mb: 1 }}
        >
          {t('annotation.backToList', '返回列表')}
        </Button>
        
        <Stack direction="row" alignItems="center" spacing={1}>
          {isAudio ? (
            <AudioFileIcon sx={{ fontSize: 32, color: '#f97316' }} />
          ) : isVideo ? (
            <VideoFileIcon color="secondary" fontSize="large" />
          ) : (
            <DescriptionIcon color="primary" fontSize="large" />
          )}
          <Typography variant="h5" fontWeight={600}>
            {archive.textName || archive.resourceName || archive.id}
          </Typography>
          <Chip 
            label={isAudio ? t('annotation.audioAnnotation', '音频标注') : (isVideo ? t('annotation.videoAnnotation', '视频标注') : t('annotation.textAnnotation', '文本标注'))}
            size="small"
            sx={isAudio ? { bgcolor: '#f97316', color: 'white' } : undefined}
            color={isAudio ? undefined : (isVideo ? 'secondary' : 'primary')}
          />
        </Stack>
      </Box>
      
      {/* 基本信息 */}
      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1 }}>
          {t('annotation.basicInfo', '基本信息')}
        </Typography>
        <Stack direction="row" spacing={4} flexWrap="wrap">
          <Box>
            <Typography variant="caption" color="text.secondary">
              {t('annotation.framework', '框架')}
            </Typography>
            <Typography variant="body2">{archiveData.framework}</Typography>
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary">
              {t('corpus.name', '语料库')}
            </Typography>
            <Typography variant="body2">{archive.corpus}</Typography>
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary">
              {isMultimodal ? t('annotation.transcriptAnnotation', '转录标注') : t('annotation.count', '标注数')}
            </Typography>
            <Typography variant="body2">{isMultimodal ? textAnnotationsCount : annotations.length}</Typography>
          </Box>
          {isAudio && (
            <>
              <Box>
                <Typography variant="caption" color="text.secondary">
                  {t('annotation.duration', '时长')}
                </Typography>
                <Typography variant="body2">{Math.floor(audioDuration / 60)}:{String(Math.floor(audioDuration % 60)).padStart(2, '0')}</Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary">
                  {t('annotation.transcriptSegments', '转录片段')}
                </Typography>
                <Typography variant="body2">{transcriptSegments.length}</Typography>
              </Box>
            </>
          )}
          {isVideo && (
            <>
              <Box>
                <Typography variant="caption" color="text.secondary">
                  {t('annotation.yoloDetection', 'YOLO检测')}
                </Typography>
                <Typography variant="body2">{yoloAnnotations.length}</Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary">
                  {t('annotation.clipClassification', 'CLIP分类')}
                </Typography>
                <Typography variant="body2">{clipFrameCount} {t('annotation.frames', '帧')}</Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary">
                  {t('annotation.manualAnnotation', '手动标注')}
                </Typography>
                <Typography variant="body2">{totalManualVideoCount}</Typography>
              </Box>
            </>
          )}
          <Box>
            <Typography variant="caption" color="text.secondary">
              {t('annotation.time', '时间')}
            </Typography>
            <Typography variant="body2">{formatTime(archiveData.timestamp)}</Typography>
          </Box>
        </Stack>
      </Paper>
      
      {/* 内容标签页 */}
      <Paper sx={{ p: 2 }}>
        <Tabs 
          value={tabValue} 
          onChange={(_, v) => setTabValue(v)}
          sx={{ borderBottom: 1, borderColor: 'divider' }}
        >
          <Tab 
            icon={<TableChartIcon />} 
            iconPosition="start" 
            label={t('annotation.textAnnotationList', '文本标注列表')} 
          />
          {(isVideo || isAudio) && (
            <Tab 
              icon={isAudio ? <AudioFileIcon /> : <VideoFileIcon />} 
              iconPosition="start" 
              label={isAudio ? t('annotation.audioAnnotationList', '音频标注列表') : t('annotation.videoAnnotationList', '视频标注列表')} 
            />
          )}
          <Tab 
            icon={<BarChartIcon />} 
            iconPosition="start" 
            label={t('annotation.visualization', '数据可视化')} 
          />
        </Tabs>
        
        {/* 文本/多模态标注表格 — 仅显示文本标注，排除视频和音频画框类型 */}
        <TabPanel value={tabValue} index={0}>
          <AnnotationDataTable
            annotations={annotations.filter(a => a.type !== 'video' && a.type !== 'audio')}
            relations={archiveData.relations}
            archiveName={archive.textName || archive.resourceName || archive.id}
            excludeVideoAnnotations={isVideo || isAudio}
            originalText={archiveData.text}
            spacyTokens={archiveData.spacyAnnotation?.tokens}
            frameworkName={archiveData.framework}
          />
        </TabPanel>
        
        {/* 视频标注表格（仅视频） */}
        {isVideo && (
          <TabPanel value={tabValue} index={1}>
            <VideoAnnotationTable 
              annotations={annotations}
              yoloAnnotations={yoloAnnotations}
              manualTracks={manualTracks}
              clipAnnotations={clipAnnotations}
              archiveName={archive.textName || archive.resourceName || archive.id}
            />
          </TabPanel>
        )}
        
        {/* 音频标注表格（仅音频） */}
        {isAudio && (
          <TabPanel value={tabValue} index={1}>
            <AudioAnnotationTable 
              audioBoxes={audioBoxes}
              annotations={annotations.filter(a => a.type === 'audio')}
              archiveName={archive.textName || archive.resourceName || archive.id}
            />
          </TabPanel>
        )}
        
        {/* 数据可视化 */}
        <TabPanel value={tabValue} index={(isVideo || isAudio) ? 2 : 1}>
          {isAudio ? (
            // 音频标注可视化 - 波形 + 网格 + 音高 + 画框
            <AudioVisualization
              annotations={annotations}
              transcriptSegments={transcriptSegments}
              duration={audioDuration}
              audioUrl={archiveData.mediaPath}
              audioBoxes={audioBoxes}
              pitchData={pitchData}
              acousticData={acousticData}
              audioVisualizationSvg={audioVisualizationSvg}
            />
          ) : isVideo ? (
            <MultimodalVisualization 
              annotations={annotations}
              yoloAnnotations={yoloAnnotations}
              manualTracks={manualTracks}
              clipAnnotations={clipAnnotations}
            />
          ) : (
            <AnnotationVisualization annotations={annotations} />
          )}
        </TabPanel>
      </Paper>
    </Box>
  )
}
