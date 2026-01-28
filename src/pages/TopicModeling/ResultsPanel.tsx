/**
 * Results Panel for Topic Modeling
 * Display topic analysis results with cards and table
 */

import { useState } from 'react'
import {
  Box,
  Typography,
  Paper,
  Grid,
  Card,
  CardContent,
  Stack,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Tooltip,
  Button,
  LinearProgress,
  Tabs,
  Tab,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  CircularProgress,
  Checkbox,
  TextField,
  useTheme
} from '@mui/material'
import { NumberInput } from '../../components/common'
import FileDownloadIcon from '@mui/icons-material/FileDownload'
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome'
import QueryStatsIcon from '@mui/icons-material/QueryStats'
import BubbleChartIcon from '@mui/icons-material/BubbleChart'
import MergeIcon from '@mui/icons-material/MergeType'
import EditIcon from '@mui/icons-material/Edit'
import { useTranslation } from 'react-i18next'
import type { TopicAnalysisResult, TopicItem } from '../../types/topicModeling'
import type { SelectionMode } from '../../types/crossLink'
import { topicModelingApi } from '../../api'
import type { OutlierEstimationResult } from '../../api/topicModeling'
import { WordActionMenu } from '../../components/common'

interface ResultsPanelProps {
  result: TopicAnalysisResult | null
  ollamaConnected: boolean
  ollamaUrl: string
  ollamaModel: string
  ollamaLanguage?: 'en' | 'zh'
  onTopicsUpdate?: (topics: TopicItem[]) => void
  // Cross-link props
  corpusId?: string
  textIds?: string[] | 'all'
  selectionMode?: SelectionMode
  selectedTags?: string[]
}

export default function ResultsPanel({
  result,
  ollamaConnected,
  ollamaUrl,
  ollamaModel,
  ollamaLanguage = 'en',
  onTopicsUpdate,
  corpusId,
  textIds,
  selectionMode = 'all',
  selectedTags
}: ResultsPanelProps) {
  const { t } = useTranslation()
  const theme = useTheme()
  const [selectedTopicId, setSelectedTopicId] = useState<number | null>(null)
  const [tabValue, setTabValue] = useState(0)
  const [generatingNames, setGeneratingNames] = useState(false)
  
  // Keyword display count configuration
  const [keywordDisplayCount, setKeywordDisplayCount] = useState(10)
  
  // Outlier estimation states
  const [outlierDialogOpen, setOutlierDialogOpen] = useState(false)
  const [outlierStrategy, setOutlierStrategy] = useState<'distributions' | 'probabilities' | 'c-tf-idf' | 'embeddings'>('distributions')
  const [outlierThreshold, setOutlierThreshold] = useState(0.0)
  const [estimating, setEstimating] = useState(false)
  const [estimationResult, setEstimationResult] = useState<OutlierEstimationResult | null>(null)
  const [estimationError, setEstimationError] = useState<string | null>(null)
  
  // Topic merge states
  const [mergeDialogOpen, setMergeDialogOpen] = useState(false)
  const [selectedTopicsForMerge, setSelectedTopicsForMerge] = useState<number[]>([])
  const [merging, setMerging] = useState(false)
  const [mergeError, setMergeError] = useState<string | null>(null)
  
  // Custom label states
  const [labelDialogOpen, setLabelDialogOpen] = useState(false)
  const [editingTopicId, setEditingTopicId] = useState<number | null>(null)
  const [editingLabel, setEditingLabel] = useState('')
  const [savingLabel, setSavingLabel] = useState(false)

  if (!result) {
    return (
      <Box sx={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center', 
        height: '100%',
        flexDirection: 'column',
        gap: 2,
        p: 4
      }}>
        <BubbleChartIcon sx={{ fontSize: 80, color: 'text.disabled' }} />
        <Typography variant="h6" color="text.secondary">
          {t('topicModeling.results.noResults')}
        </Typography>
        <Typography variant="body2" color="text.secondary" textAlign="center">
          {t('topicModeling.results.runAnalysisFirst')}
        </Typography>
      </Box>
    )
  }

  const validTopics = result.topics.filter(t => t.id !== -1)
  const outlierTopic = result.topics.find(t => t.id === -1)
  const selectedTopic = validTopics.find(t => t.id === selectedTopicId)

  const handleExportCSV = () => {
    const lines = [`Topic ID,Topic Name,Count,Top ${keywordDisplayCount} Keywords (Weight)`]
    validTopics.forEach(topic => {
      const displayWords = topic.words.slice(0, keywordDisplayCount)
      // Format: word1(0.1234); word2(0.0987); ...
      const wordsWithWeights = displayWords.map(w => `${w.word}(${w.weight.toFixed(4)})`).join('; ')
      const name = topic.custom_label || topic.name
      lines.push(`${topic.id},"${name}",${topic.count},"${wordsWithWeights}"`)
    })

    // Add BOM for UTF-8 support
    const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `topics_${result.result_id}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleGenerateNames = async () => {
    if (!ollamaConnected || !ollamaModel || !result?.result_id) return

    setGeneratingNames(true)
    try {
      const response = await topicModelingApi.generateTopicNames(
        validTopics,
        ollamaUrl,
        ollamaModel,
        { language: ollamaLanguage, delay: 0.5, topNWords: keywordDisplayCount }
      )

      if (response.success && response.data) {
        // Update frontend state
        onTopicsUpdate?.(response.data.topics)
        
        // Sync updated topics to backend cache for visualizations
        // Include outlier topic if exists
        const allTopics = outlierTopic 
          ? [...response.data.topics, outlierTopic]
          : response.data.topics
        await topicModelingApi.updateTopics(result.result_id, allTopics)
      }
    } catch (err) {
      console.error('Failed to generate names:', err)
    } finally {
      setGeneratingNames(false)
    }
  }

  const handleEstimateOutliers = async () => {
    if (!result?.result_id) return
    
    setEstimating(true)
    setEstimationError(null)
    setEstimationResult(null)
    
    try {
      const response = await topicModelingApi.estimateOutliers(
        result.result_id,
        outlierStrategy,
        outlierThreshold
      )
      
      if (response.success && response.data) {
        setEstimationResult(response.data)
      } else {
        setEstimationError(response.error || t('common.error'))
      }
    } catch (err) {
      setEstimationError(String(err))
    } finally {
      setEstimating(false)
    }
  }

  const openOutlierDialog = () => {
    setOutlierDialogOpen(true)
    setEstimationResult(null)
    setEstimationError(null)
  }

  // Topic merge handlers
  const openMergeDialog = () => {
    setMergeDialogOpen(true)
    setSelectedTopicsForMerge([])
    setMergeError(null)
  }

  const handleMergeTopicToggle = (topicId: number) => {
    setSelectedTopicsForMerge(prev => 
      prev.includes(topicId) 
        ? prev.filter(id => id !== topicId)
        : [...prev, topicId]
    )
  }

  const handleMergeTopics = async () => {
    if (!result?.result_id || selectedTopicsForMerge.length < 2) return
    
    setMerging(true)
    setMergeError(null)
    
    try {
      const response = await topicModelingApi.mergeTopics(
        result.result_id,
        selectedTopicsForMerge
      )
      
      if (response.success && response.data) {
        onTopicsUpdate?.(response.data.topics)
        setMergeDialogOpen(false)
        setSelectedTopicsForMerge([])
      } else {
        setMergeError(response.error || t('common.error'))
      }
    } catch (err) {
      setMergeError(String(err))
    } finally {
      setMerging(false)
    }
  }

  // Custom label handlers
  const openLabelDialog = (topicId: number) => {
    const topic = validTopics.find(t => t.id === topicId)
    setEditingTopicId(topicId)
    setEditingLabel(topic?.custom_label || '')
    setLabelDialogOpen(true)
  }

  const handleSaveLabel = async () => {
    if (!result?.result_id || editingTopicId === null) return
    
    setSavingLabel(true)
    
    try {
      const response = await topicModelingApi.updateTopicLabel(
        result.result_id,
        editingTopicId,
        editingLabel
      )
      
      if (response.success) {
        // Update local state
        const updatedTopics = result.topics.map(t => 
          t.id === editingTopicId 
            ? { ...t, custom_label: editingLabel }
            : t
        )
        onTopicsUpdate?.(updatedTopics)
        setLabelDialogOpen(false)
      }
    } catch (err) {
      console.error('Failed to save label:', err)
    } finally {
      setSavingLabel(false)
    }
  }

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Stack direction="row" spacing={2} alignItems="center">
            <Chip label={`${validTopics.length} ${t('topicModeling.results.topics')}`} color="primary" />
            <Chip label={`${result.stats.total_documents} ${t('topicModeling.results.documents')}`} variant="outlined" />
            {result.stats.outlier_count > 0 && (
              <Chip 
                label={`${result.stats.outlier_count} ${t('topicModeling.results.outliers')} (${result.stats.outlier_percentage}%)`} 
                variant="outlined"
                color="warning"
              />
            )}
          </Stack>
          <Stack direction="row" spacing={1}>
            {result.stats.outlier_count > 0 && (
              <Tooltip title={t('topicModeling.results.estimateOutliers')}>
                <Button
                  variant="outlined"
                  size="small"
                  color="warning"
                  startIcon={<QueryStatsIcon />}
                  onClick={openOutlierDialog}
                >
                  {t('topicModeling.results.estimateOutliers')}
                </Button>
              </Tooltip>
            )}
            {validTopics.length >= 2 && (
              <Tooltip title={t('topicModeling.results.mergeTopics')}>
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<MergeIcon />}
                  onClick={openMergeDialog}
                >
                  {t('topicModeling.results.mergeTopics')}
                </Button>
              </Tooltip>
            )}
            {ollamaConnected && (
              <Tooltip title={t('topicModeling.ollama.generateNames')}>
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<AutoAwesomeIcon />}
                  onClick={handleGenerateNames}
                  disabled={generatingNames}
                >
                  {generatingNames ? t('common.loading') : t('topicModeling.ollama.generateNames')}
                </Button>
              </Tooltip>
            )}
            <Tooltip title={t('common.export')}>
              <IconButton onClick={handleExportCSV}>
                <FileDownloadIcon />
              </IconButton>
            </Tooltip>
          </Stack>
        </Stack>
      </Box>

      {generatingNames && <LinearProgress />}

      {/* Tabs */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs value={tabValue} onChange={(_, v) => setTabValue(v)}>
          <Tab label={t('topicModeling.results.topicCards')} />
          <Tab label={t('topicModeling.results.topicTable')} />
        </Tabs>
      </Box>

      {/* Content */}
      <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
        {tabValue === 0 && (
          <>
            {/* Toolbar for cards view */}
            <Box sx={{ 
              mb: 2,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end'
            }}>
              <Typography variant="caption" color="text.secondary" sx={{ mr: 1 }}>
                {t('topicModeling.results.keywordCount')}
              </Typography>
              <NumberInput
                value={keywordDisplayCount}
                onChange={(val) => setKeywordDisplayCount(val)}
                min={1}
                max={20}
                integer
                size="small"
                sx={{ width: 90 }}
              />
            </Box>
            
            {/* Topic Cards */}
            <Grid container spacing={2}>
              {validTopics.map((topic) => (
                <Grid item xs={12} sm={6} md={4} lg={3} key={topic.id}>
                  <Card
                    sx={{
                      height: '100%',
                      cursor: 'pointer',
                      border: selectedTopicId === topic.id ? 2 : 0,
                      borderColor: 'primary.main',
                      transition: 'all 0.2s',
                      '&:hover': {
                        boxShadow: 4
                      }
                    }}
                    onClick={() => setSelectedTopicId(topic.id === selectedTopicId ? null : topic.id)}
                  >
                    <CardContent>
                      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1}>
                        <Typography variant="subtitle2" color="primary">
                          Topic {topic.id + 1}
                        </Typography>
                        <Stack direction="row" spacing={0.5} alignItems="center">
                          <Tooltip title={t('topicModeling.results.editLabel')}>
                            <IconButton 
                              size="small" 
                              onClick={(e) => {
                                e.stopPropagation()
                                openLabelDialog(topic.id)
                              }}
                            >
                              <EditIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Chip label={topic.count} size="small" />
                        </Stack>
                      </Stack>

                      {topic.custom_label && (
                        <Typography variant="body2" fontWeight={600} gutterBottom noWrap>
                          {topic.custom_label}
                        </Typography>
                      )}

                      {/* Keywords - flat style */}
                      <Typography 
                        variant="body2" 
                        color="text.secondary"
                        sx={{ 
                          lineHeight: 1.6,
                          fontSize: '0.8rem'
                        }}
                      >
                        {topic.words.slice(0, keywordDisplayCount).map((word, index) => (
                          <span key={word.word}>
                            <span style={{ 
                              fontWeight: index < 3 ? 600 : 400,
                              color: index < 3 ? '#333' : undefined
                            }}>
                              {word.word}
                            </span>
                            {index < topic.words.slice(0, keywordDisplayCount).length - 1 && ', '}
                          </span>
                        ))}
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
              ))}
            </Grid>

            {/* Selected Topic Details */}
            {selectedTopic && (
              <Paper 
                variant="outlined"
                sx={{ 
                  mt: 3, 
                  borderRadius: 1,
                  overflow: 'hidden'
                }}
              >
                {/* Header */}
                <Box sx={{ 
                  px: 2, 
                  py: 1.5, 
                  bgcolor: theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.05)' : '#f5f5f5',
                  borderBottom: 1,
                  borderColor: 'divider'
                }}>
                  <Stack direction="row" alignItems="center" spacing={1}>
                    <Chip 
                      label={`Topic ${selectedTopic.id + 1}`} 
                      size="small" 
                      color="primary"
                      variant="outlined"
                    />
                    {selectedTopic.custom_label && (
                      <Typography variant="subtitle2" fontWeight={600}>
                        {selectedTopic.custom_label}
                      </Typography>
                    )}
                    <Typography variant="body2" color="text.secondary" sx={{ ml: 'auto' }}>
                      {selectedTopic.count} {t('topicModeling.results.documents')}
                    </Typography>
                  </Stack>
                </Box>
                
                {/* Table */}
                <TableContainer sx={{ maxHeight: 400 }}>
                  <Table size="small" stickyHeader>
                    <TableHead>
                      <TableRow sx={{ '& th': { bgcolor: theme.palette.mode === 'dark' ? '#1e1e2e' : '#fafafa', fontWeight: 600, fontSize: '0.8rem' } }}>
                        <TableCell sx={{ width: 50 }}>#</TableCell>
                        <TableCell sx={{ minWidth: 120 }}>{t('topicModeling.words')}</TableCell>
                        <TableCell align="right" sx={{ width: 100 }}>{t('topicModeling.weight')}</TableCell>
                        <TableCell sx={{ width: 200 }}>{t('topicModeling.results.contribution')}</TableCell>
                        {corpusId && (
                          <TableCell align="center" sx={{ width: 50 }}></TableCell>
                        )}
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {selectedTopic.words.map((word, index) => {
                        const maxWeight = selectedTopic.words[0]?.weight || 1
                        const normalizedWidth = (word.weight / maxWeight) * 100
                        const isTop3 = index < 3
                        
                        return (
                          <TableRow 
                            key={word.word}
                            sx={{ 
                              bgcolor: index % 2 === 0 ? 'transparent' : (theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.02)' : 'rgba(0,0,0,0.02)'),
                              '&:hover': { bgcolor: 'action.hover' }
                            }}
                          >
                            <TableCell>
                              <Typography 
                                variant="body2" 
                                sx={{ 
                                  fontWeight: isTop3 ? 600 : 400,
                                  color: isTop3 ? 'primary.main' : 'text.secondary'
                                }}
                              >
                                {index + 1}
                              </Typography>
                            </TableCell>
                            <TableCell>
                              <Typography 
                                variant="body2"
                                sx={{ 
                                  fontWeight: isTop3 ? 600 : 400,
                                  color: isTop3 ? 'text.primary' : 'text.secondary'
                                }}
                              >
                                {word.word}
                              </Typography>
                            </TableCell>
                            <TableCell align="right">
                              <Typography 
                                variant="body2" 
                                sx={{ 
                                  fontFamily: 'monospace',
                                  fontWeight: isTop3 ? 600 : 400,
                                  color: isTop3 ? 'primary.main' : 'text.secondary'
                                }}
                              >
                                {(word.weight * 100).toFixed(2)}%
                              </Typography>
                            </TableCell>
                            <TableCell>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <Box
                                  sx={{
                                    flex: 1,
                                    height: 8,
                                    borderRadius: 0.5,
                                    bgcolor: theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'grey.200',
                                    overflow: 'hidden'
                                  }}
                                >
                                  <Box
                                    sx={{
                                      width: `${normalizedWidth}%`,
                                      height: '100%',
                                      bgcolor: isTop3 ? 'primary.main' : 'primary.light',
                                      borderRadius: 0.5
                                    }}
                                  />
                                </Box>
                              </Box>
                            </TableCell>
                            {corpusId && (
                              <TableCell align="center" sx={{ p: 0.5 }}>
                                <WordActionMenu
                                  word={word.word}
                                  corpusId={corpusId}
                                  textIds={textIds || 'all'}
                                  selectionMode={selectionMode}
                                  selectedTags={selectedTags}
                                  showCollocation={true}
                                  showWordSketch={true}
                                />
                              </TableCell>
                            )}
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Paper>
            )}
          </>
        )}

        {tabValue === 1 && (
          /* Topic Table View */
          <Paper sx={{ borderRadius: 2, overflow: 'hidden' }}>
            {/* Toolbar */}
            <Box sx={{ 
              px: 2, 
              py: 1.5, 
              bgcolor: 'background.default',
              borderBottom: 1,
              borderColor: 'divider',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <Typography variant="body2" fontWeight={500}>
                {validTopics.length} {t('topicModeling.results.topics')}
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography variant="caption" color="text.secondary">
                  {t('topicModeling.results.keywordCount')}
                </Typography>
                <NumberInput
                  value={keywordDisplayCount}
                  onChange={(val) => setKeywordDisplayCount(val)}
                  min={1}
                  max={20}
                  integer
                  size="small"
                  sx={{ width: 90 }}
                />
              </Box>
            </Box>
            
            <TableContainer sx={{ maxHeight: 500 }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow sx={{ '& th': { bgcolor: theme.palette.mode === 'dark' ? '#1e1e2e' : 'grey.100', fontWeight: 600 } }}>
                    <TableCell sx={{ width: 60 }}>ID</TableCell>
                    <TableCell sx={{ minWidth: 150 }}>
                      {t('topicModeling.results.topicName')}
                    </TableCell>
                    <TableCell align="right" sx={{ width: 80 }}>
                      {t('topicModeling.results.documentCount')}
                    </TableCell>
                    <TableCell>{t('topicModeling.results.topWords')}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {validTopics.map((topic, index) => (
                    <TableRow 
                      key={topic.id}
                      hover
                      selected={selectedTopicId === topic.id}
                      onClick={() => setSelectedTopicId(topic.id === selectedTopicId ? null : topic.id)}
                      sx={{ 
                        cursor: 'pointer',
                        bgcolor: index % 2 === 0 ? 'transparent' : 'action.hover',
                        '&.Mui-selected': {
                          bgcolor: theme.palette.mode === 'dark' ? 'rgba(107, 138, 253, 0.2)' : 'primary.light',
                          '&:hover': {
                            bgcolor: theme.palette.mode === 'dark' ? 'rgba(107, 138, 253, 0.25)' : 'primary.light'
                          }
                        }
                      }}
                    >
                      <TableCell>
                        <Chip 
                          label={topic.id} 
                          size="small" 
                          variant="outlined"
                          sx={{ minWidth: 36 }}
                        />
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" fontWeight={600} noWrap>
                          {topic.custom_label || topic.name}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Typography variant="body2" fontWeight={500}>
                          {topic.count}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap sx={{ gap: 0.5 }}>
                          {topic.words.slice(0, keywordDisplayCount).map((w, i) => (
                            <Chip 
                              key={i}
                              label={w.word}
                              size="small"
                              variant="outlined"
                              sx={{ 
                                fontSize: '0.7rem',
                                height: 22,
                                bgcolor: 'background.paper'
                              }}
                            />
                          ))}
                        </Stack>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        )}
      </Box>

      {/* Outlier Estimation Dialog */}
      <Dialog 
        open={outlierDialogOpen} 
        onClose={() => setOutlierDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>{t('topicModeling.results.estimateOutliers')}</DialogTitle>
        <DialogContent>
          <Stack spacing={3} sx={{ mt: 1 }}>
            <Typography variant="body2" color="text.secondary">
              {t('topicModeling.results.estimateOutliersHelp')}
            </Typography>
            
            <FormControl fullWidth size="small">
              <InputLabel>{t('topicModeling.results.outlierStrategy')}</InputLabel>
              <Select
                value={outlierStrategy}
                label={t('topicModeling.results.outlierStrategy')}
                onChange={(e) => setOutlierStrategy(e.target.value as typeof outlierStrategy)}
              >
                <MenuItem value="distributions">distributions</MenuItem>
                <MenuItem value="probabilities">probabilities</MenuItem>
                <MenuItem value="c-tf-idf">c-tf-idf</MenuItem>
                <MenuItem value="embeddings">embeddings</MenuItem>
              </Select>
            </FormControl>
            
            <NumberInput
              label={t('topicModeling.results.outlierThreshold')}
              size="small"
              value={outlierThreshold}
              onChange={(val) => setOutlierThreshold(val)}
              min={0}
              max={1}
              step={0.001}
              defaultValue={0}
              fullWidth
              helperText={t('topicModeling.results.thresholdHelp')}
            />
            
            {estimationError && (
              <Alert severity="error" onClose={() => setEstimationError(null)}>
                {estimationError}
              </Alert>
            )}
            
            {estimationResult && (
              <Paper variant="outlined" sx={{ p: 2 }}>
                <Stack spacing={1}>
                  <Typography variant="subtitle2">
                    {t('topicModeling.results.estimationResult')}
                  </Typography>
                  <Grid container spacing={2}>
                    <Grid item xs={6}>
                      <Typography variant="body2" color="text.secondary">
                        {t('topicModeling.results.currentOutliers')}
                      </Typography>
                      <Typography variant="h6">
                        {estimationResult.current_outliers} ({estimationResult.current_percentage}%)
                      </Typography>
                    </Grid>
                    <Grid item xs={6}>
                      <Typography variant="body2" color="text.secondary">
                        {t('topicModeling.results.estimatedOutliers')}
                      </Typography>
                      <Typography variant="h6" color="success.main">
                        {estimationResult.estimated_outliers} ({estimationResult.estimated_percentage}%)
                      </Typography>
                    </Grid>
                    <Grid item xs={12}>
                      <Typography variant="body2" color="text.secondary">
                        {t('topicModeling.results.reducedCount')}
                      </Typography>
                      <Typography variant="h6" color="warning.main">
                        -{estimationResult.reduced_count} {t('topicModeling.results.documents')}
                      </Typography>
                    </Grid>
                  </Grid>
                </Stack>
              </Paper>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOutlierDialogOpen(false)}>
            {t('common.close')}
          </Button>
          <Button
            variant="contained"
            onClick={handleEstimateOutliers}
            disabled={estimating}
            startIcon={estimating ? <CircularProgress size={16} /> : <QueryStatsIcon />}
          >
            {estimating ? t('common.loading') : t('topicModeling.results.estimate')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Topic Merge Dialog */}
      <Dialog
        open={mergeDialogOpen}
        onClose={() => setMergeDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>{t('topicModeling.results.mergeTopics')}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Typography variant="body2" color="text.secondary">
              {t('topicModeling.results.mergeTopicsHelp')}
            </Typography>
            
            {mergeError && (
              <Alert severity="error" onClose={() => setMergeError(null)}>
                {mergeError}
              </Alert>
            )}
            
            <Paper variant="outlined" sx={{ maxHeight: 300, overflow: 'auto' }}>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ '& th': { bgcolor: 'grey.50' } }}>
                    <TableCell padding="checkbox" />
                    <TableCell>ID</TableCell>
                    <TableCell>{t('topicModeling.results.topicName')}</TableCell>
                    <TableCell align="right">{t('topicModeling.results.documentCount')}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {validTopics.map((topic) => (
                    <TableRow 
                      key={topic.id}
                      hover
                      onClick={() => handleMergeTopicToggle(topic.id)}
                      sx={{ cursor: 'pointer' }}
                    >
                      <TableCell padding="checkbox">
                        <Checkbox 
                          checked={selectedTopicsForMerge.includes(topic.id)}
                          size="small"
                        />
                      </TableCell>
                      <TableCell>
                        <Chip label={topic.id} size="small" variant="outlined" />
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" noWrap>
                          {topic.custom_label || topic.name}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">{topic.count}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Paper>
            
            <Typography variant="body2" color="text.secondary">
              {t('topicModeling.results.selectedTopics')}: {selectedTopicsForMerge.length}
              {selectedTopicsForMerge.length > 0 && ` (${selectedTopicsForMerge.join(', ')})`}
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setMergeDialogOpen(false)}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="contained"
            onClick={handleMergeTopics}
            disabled={merging || selectedTopicsForMerge.length < 2}
            startIcon={merging ? <CircularProgress size={16} /> : <MergeIcon />}
          >
            {merging ? t('common.loading') : t('topicModeling.results.merge')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Custom Label Dialog */}
      <Dialog
        open={labelDialogOpen}
        onClose={() => setLabelDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          {t('topicModeling.results.editLabel')} - Topic {editingTopicId !== null ? editingTopicId : ''}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Typography variant="body2" color="text.secondary">
              {t('topicModeling.results.editLabelHelp')}
            </Typography>
            
            <TextField
              fullWidth
              label={t('topicModeling.results.customLabel')}
              value={editingLabel}
              onChange={(e) => setEditingLabel(e.target.value)}
              placeholder={t('topicModeling.results.customLabelPlaceholder')}
              size="small"
              autoFocus
            />
            
            <Typography variant="caption" color="text.secondary">
              {t('topicModeling.results.customLabelNote')}
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setLabelDialogOpen(false)}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="contained"
            onClick={handleSaveLabel}
            disabled={savingLabel}
            startIcon={savingLabel ? <CircularProgress size={16} /> : null}
          >
            {savingLabel ? t('common.loading') : t('common.save')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
