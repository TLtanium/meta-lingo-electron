/**
 * NMF Results Panel
 * Display NMF analysis results with topic cards and table (same format as BERTopic)
 */

import { useCallback, useState } from 'react'
import {
  Box,
  Typography,
  Paper,
  Stack,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Divider,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Button,
  Tooltip,
  Tabs,
  Tab,
  Grid,
  Card,
  CardContent,
  IconButton,
  useTheme,
  LinearProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField
} from '@mui/material'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import BubbleChartIcon from '@mui/icons-material/BubbleChart'
import DownloadIcon from '@mui/icons-material/Download'
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome'
import EditIcon from '@mui/icons-material/Edit'
import { useTranslation } from 'react-i18next'
import { NumberInput } from '../../../components/common'
import { WordActionMenu } from '../../../components/common'
import type { NMFResult, NMFTopic } from '../../../types/topicModeling'
import type { SelectionMode } from '../../../types/crossLink'
import { topicModelingApi } from '../../../api'

interface NMFResultsPanelProps {
  result: NMFResult | null
  // Ollama props
  ollamaConnected?: boolean
  ollamaUrl?: string
  ollamaModel?: string
  ollamaLanguage?: 'en' | 'zh'
  onTopicsUpdate?: (topics: NMFTopic[]) => void
  // Cross-link props
  corpusId?: string
  textIds?: string[] | 'all'
  selectionMode?: SelectionMode
  selectedTags?: string[]
}

export default function NMFResultsPanel({ 
  result,
  ollamaConnected = false,
  ollamaUrl = 'http://localhost:11434',
  ollamaModel = '',
  ollamaLanguage = 'en',
  onTopicsUpdate,
  corpusId,
  textIds,
  selectionMode = 'all',
  selectedTags
}: NMFResultsPanelProps) {
  const { t } = useTranslation()
  const theme = useTheme()
  
  // Keyword display count configuration
  const [keywordDisplayCount, setKeywordDisplayCount] = useState(10)
  
  // Tab and selection states
  const [tabValue, setTabValue] = useState(0)
  const [selectedTopicId, setSelectedTopicId] = useState<number | null>(null)
  
  // Ollama naming states
  const [generatingNames, setGeneratingNames] = useState(false)
  
  // Custom label dialog states
  const [labelDialogOpen, setLabelDialogOpen] = useState(false)
  const [editingTopicId, setEditingTopicId] = useState<number | null>(null)
  const [editingLabel, setEditingLabel] = useState('')
  const [savingLabel, setSavingLabel] = useState(false)
  
  // Generate topic names using Ollama
  const handleGenerateNames = useCallback(async () => {
    if (!ollamaConnected || !ollamaModel || !result?.result_id) return
    
    setGeneratingNames(true)
    try {
      const response = await topicModelingApi.generateNMFTopicNames(
        result.result_id,
        ollamaUrl,
        ollamaModel,
        { language: ollamaLanguage, delay: 0.5, topNWords: keywordDisplayCount }
      )
      
      if (response.success && response.data?.success) {
        onTopicsUpdate?.(response.data.topics)
      }
    } catch (err) {
      console.error('Failed to generate NMF topic names:', err)
    } finally {
      setGeneratingNames(false)
    }
  }, [ollamaConnected, ollamaUrl, ollamaModel, ollamaLanguage, result?.result_id, keywordDisplayCount, onTopicsUpdate])
  
  // Open label edit dialog
  const openLabelDialog = useCallback((topicId: number) => {
    const topic = result?.topics?.find(t => t.topic_id === topicId)
    setEditingTopicId(topicId)
    setEditingLabel(topic?.custom_label || '')
    setLabelDialogOpen(true)
  }, [result?.topics])
  
  // Save custom label
  const handleSaveLabel = useCallback(async () => {
    if (!result?.result_id || editingTopicId === null) return
    
    setSavingLabel(true)
    try {
      const response = await topicModelingApi.updateNMFTopicLabel(
        result.result_id,
        editingTopicId,
        editingLabel
      )
      
      if (response.success) {
        // Update local state
        const updatedTopics = result.topics?.map(t =>
          t.topic_id === editingTopicId
            ? { ...t, custom_label: editingLabel }
            : t
        ) || []
        onTopicsUpdate?.(updatedTopics)
        setLabelDialogOpen(false)
      }
    } catch (err) {
      console.error('Failed to save NMF label:', err)
    } finally {
      setSavingLabel(false)
    }
  }, [result?.result_id, result?.topics, editingTopicId, editingLabel, onTopicsUpdate])
  
  // Export topics to CSV
  const handleExportCSV = useCallback(() => {
    if (!result || !result.topics) return
    
    // Count documents per topic
    const topicCounts: Record<number, number> = {}
    if (result.doc_topics) {
      result.doc_topics.forEach(doc => {
        topicCounts[doc.dominant_topic] = (topicCounts[doc.dominant_topic] || 0) + 1
      })
    }
    
    // Generate CSV content
    const csvRows: string[] = []
    
    // Header row
    const topN = Math.min(5, keywordDisplayCount)
    csvRows.push([
      t('topicModeling.nmf.viz.topicId', 'Topic ID'),
      t('topicModeling.results.topicName', 'Topic Name'),
      t('topicModeling.nmf.viz.topKeywords', `Top ${keywordDisplayCount} Keywords (Weight)`),
      t('topicModeling.nmf.viz.numDocuments', 'Number of Documents'),
      t('topicModeling.nmf.viz.docPercentage', 'Percentage of Documents (%)'),
      t('topicModeling.nmf.viz.representativeKeywords', `Representative Keywords (Top ${topN})`)
    ].join(','))
    
    // Data rows
    result.topics.forEach(topic => {
      const docCount = topicCounts[topic.topic_id] || 0
      const numDocs = result.num_documents || 0
      const docPercentage = numDocs > 0 ? (docCount / numDocs * 100).toFixed(2) : '0.00'
      
      // Get topic name (custom label or default from keywords)
      const defaultName = topic.keywords.slice(0, 3).map(kw => kw.word).join('_')
      const topicName = topic.custom_label || defaultName
      
      const keywordsWithWeights = topic.keywords.slice(0, keywordDisplayCount)
        .map(k => `${k.word}(${(k.weight * 100).toFixed(2)}%)`)
        .join('; ')
      const topKeywords = topic.keywords.slice(0, topN).map(k => k.word).join(', ')
      
      csvRows.push([
        `Topic ${topic.topic_id}`,
        `"${topicName}"`,
        `"${keywordsWithWeights}"`,
        docCount.toString(),
        docPercentage,
        `"${topKeywords}"`
      ].join(','))
    })
    
    // Add summary row
    csvRows.push('')
    csvRows.push([
      'Summary',
      `Total Topics: ${result.num_topics}`,
      `Total Documents: ${result.num_documents}`,
      `Vocabulary Size: ${result.vocabulary_size}`,
      result.reconstruction_error != null ? `Reconstruction Error: ${result.reconstruction_error.toFixed(4)}` : '',
      result.sparsity != null ? `Sparsity: ${(result.sparsity * 100).toFixed(2)}%` : ''
    ].join(','))
    
    // Create and download file
    const csvContent = csvRows.join('\n')
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    
    const link = document.createElement('a')
    link.href = url
    link.download = `nmf_topics_${new Date().toISOString().split('T')[0]}.csv`
    link.click()
    
    URL.revokeObjectURL(url)
  }, [result, keywordDisplayCount])
  
  if (!result || !result.success) {
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
          {t('topicModeling.results.noResults', 'No Results')}
        </Typography>
        <Typography variant="body2" color="text.secondary" textAlign="center">
          {t('topicModeling.results.runAnalysisFirst', 'Run NMF analysis to see results')}
        </Typography>
      </Box>
    )
  }
  
  // Count documents per topic
  const topicCounts: Record<number, number> = {}
  if (result.doc_topics) {
    result.doc_topics.forEach(doc => {
      topicCounts[doc.dominant_topic] = (topicCounts[doc.dominant_topic] || 0) + 1
    })
  }
  
  const selectedTopic = result.topics?.find(t => t.topic_id === selectedTopicId)
  
  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Stack direction="row" spacing={2} alignItems="center">
            <Chip
              label="sklearn NMF"
              variant="outlined"
              color="primary"
            />
            <Chip label={`${result.num_topics} ${t('topicModeling.results.topics')}`} color="primary" />
            <Chip label={`${result.num_documents} ${t('topicModeling.results.documents')}`} variant="outlined" />
            <Chip label={`${result.vocabulary_size} ${t('topicModeling.nmf.results.vocabulary', 'Vocabulary')}`} variant="outlined" />
          </Stack>
          <Stack direction="row" spacing={2} alignItems="center">
            {result.reconstruction_error != null && (
              <Chip 
                label={`${t('topicModeling.nmf.results.reconstructionError', 'Reconstruction Error')}: ${result.reconstruction_error.toFixed(4)}`}
                variant="outlined"
              />
            )}
            {result.sparsity != null && (
              <Chip 
                label={`${t('topicModeling.nmf.results.sparsity', 'Sparsity')}: ${(result.sparsity * 100).toFixed(1)}%`}
                variant="outlined"
                color="success"
              />
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
            <Tooltip title={t('topicModeling.nmf.results.exportTopics', 'Export topics table (CSV)')}>
              <IconButton onClick={handleExportCSV}>
                <DownloadIcon />
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
          <Tab label={t('topicModeling.nmf.results.docTopics', 'Document-Topic Distribution')} />
        </Tabs>
      </Box>
      
      {/* Content */}
      <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
        {/* Topic Cards View */}
        {tabValue === 0 && (
          <>
            {/* Toolbar */}
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
                max={30}
                integer
                size="small"
                sx={{ width: 90 }}
              />
            </Box>
            
            {/* Topic Cards */}
            <Grid container spacing={2}>
              {result.topics?.map((topic) => {
                const docCount = topicCounts[topic.topic_id] || 0
                return (
                  <Grid item xs={12} sm={6} md={4} lg={3} key={topic.topic_id}>
                    <Card
                      sx={{
                        height: '100%',
                        cursor: 'pointer',
                        border: selectedTopicId === topic.topic_id ? 2 : 0,
                        borderColor: 'primary.main',
                        transition: 'all 0.2s',
                        '&:hover': {
                          boxShadow: 4
                        }
                      }}
                      onClick={() => setSelectedTopicId(topic.topic_id === selectedTopicId ? null : topic.topic_id)}
                    >
                      <CardContent>
                        <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1}>
                          <Typography variant="subtitle2" color="primary">
                            Topic {topic.topic_id}
                          </Typography>
                          <Stack direction="row" spacing={0.5} alignItems="center">
                            <Tooltip title={t('topicModeling.results.editLabel')}>
                              <IconButton
                                size="small"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  openLabelDialog(topic.topic_id)
                                }}
                              >
                                <EditIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            <Chip label={docCount} size="small" />
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
                          {topic.keywords.slice(0, keywordDisplayCount).map((kw, index) => (
                            <span key={kw.word}>
                              <span style={{ 
                                fontWeight: index < 3 ? 600 : 400,
                                color: index < 3 ? '#333' : undefined
                              }}>
                                {kw.word}
                              </span>
                              {index < topic.keywords.slice(0, keywordDisplayCount).length - 1 && ', '}
                            </span>
                          ))}
                        </Typography>
                      </CardContent>
                    </Card>
                  </Grid>
                )
              })}
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
                      label={`Topic ${selectedTopic.topic_id}`} 
                      size="small" 
                      color="primary"
                      variant="outlined"
                    />
                    <Typography variant="body2" color="text.secondary" sx={{ ml: 'auto' }}>
                      {topicCounts[selectedTopic.topic_id] || 0} {t('topicModeling.results.documents')}
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
                      {selectedTopic.keywords.map((kw, index) => {
                        const maxWeight = selectedTopic.keywords[0]?.weight || 1
                        const normalizedWidth = (kw.weight / maxWeight) * 100
                        const isTop3 = index < 3
                        
                        return (
                          <TableRow 
                            key={kw.word}
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
                                {kw.word}
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
                                {(kw.weight * 100).toFixed(2)}%
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
                                  word={kw.word}
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
        
        {/* Topic Table View */}
        {tabValue === 1 && (
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
                {result.num_topics} {t('topicModeling.results.topics')}
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography variant="caption" color="text.secondary">
                  {t('topicModeling.results.keywordCount')}
                </Typography>
                <NumberInput
                  value={keywordDisplayCount}
                  onChange={(val) => setKeywordDisplayCount(val)}
                  min={1}
                  max={30}
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
                  {result.topics?.map((topic, index) => {
                    const docCount = topicCounts[topic.topic_id] || 0
                    // Generate default name from top keywords if no custom label
                    const defaultName = topic.keywords.slice(0, 3).map(kw => kw.word).join('_')
                    const topicName = topic.custom_label || defaultName
                    return (
                      <TableRow 
                        key={topic.topic_id}
                        hover
                        selected={selectedTopicId === topic.topic_id}
                        onClick={() => setSelectedTopicId(topic.topic_id === selectedTopicId ? null : topic.topic_id)}
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
                            label={topic.topic_id} 
                            size="small" 
                            variant="outlined"
                            sx={{ minWidth: 36 }}
                          />
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" fontWeight={600} noWrap>
                            {topicName}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">
                          <Typography variant="body2" fontWeight={500}>
                            {docCount}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap sx={{ gap: 0.5 }}>
                            {topic.keywords.slice(0, keywordDisplayCount).map((kw, i) => (
                              <Chip 
                                key={i}
                                label={kw.word}
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
                    )
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        )}
        
        {/* Document-Topic Distribution */}
        {tabValue === 2 && result.doc_topics && result.doc_topics.length > 0 && (
          <Paper sx={{ borderRadius: 2, overflow: 'hidden' }}>
            <TableContainer sx={{ maxHeight: 500 }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow sx={{ '& th': { bgcolor: 'grey.100', fontWeight: 600 } }}>
                    <TableCell>{t('topicModeling.nmf.results.docId', 'Doc')}</TableCell>
                    <TableCell>{t('topicModeling.nmf.results.dominantTopic', 'Dominant Topic')}</TableCell>
                    <TableCell>{t('topicModeling.nmf.results.weight', 'Weight')}</TableCell>
                    <TableCell>{t('topicModeling.nmf.results.distribution', 'Distribution')}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {result.doc_topics.slice(0, 100).map((doc) => (
                    <TableRow key={doc.doc_id}>
                      <TableCell>{doc.doc_id + 1}</TableCell>
                      <TableCell>
                        <Chip
                          label={`Topic ${doc.dominant_topic}`}
                          size="small"
                          color="primary"
                          variant="outlined"
                        />
                      </TableCell>
                      <TableCell>{(doc.dominant_topic_weight * 100).toFixed(1)}%</TableCell>
                      <TableCell sx={{ width: 200 }}>
                        <TopicDistributionBar distribution={doc.distribution} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
            {result.doc_topics.length > 100 && (
              <Box sx={{ p: 1, borderTop: 1, borderColor: 'divider' }}>
                <Typography variant="caption" color="text.secondary">
                  {t('topicModeling.nmf.results.showingFirst', 'Showing first 100 of')} {result.doc_topics.length} {t('common.items')}
                </Typography>
              </Box>
            )}
          </Paper>
        )}
        
        {tabValue === 2 && (!result.doc_topics || result.doc_topics.length === 0) && (
          <Box sx={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            height: 200
          }}>
            <Typography color="text.secondary">
              {t('topicModeling.nmf.results.noDocTopics', 'No document-topic distribution data')}
            </Typography>
          </Box>
        )}
      </Box>
      
      {/* Custom Label Edit Dialog */}
      <Dialog 
        open={labelDialogOpen} 
        onClose={() => setLabelDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>{t('topicModeling.results.editLabel')}</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            label={t('topicModeling.results.customLabel')}
            value={editingLabel}
            onChange={(e) => setEditingLabel(e.target.value)}
            sx={{ mt: 1 }}
            placeholder={t('topicModeling.results.customLabelPlaceholder')}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setLabelDialogOpen(false)}>
            {t('common.cancel')}
          </Button>
          <Button 
            onClick={handleSaveLabel} 
            variant="contained"
            disabled={savingLabel}
          >
            {savingLabel ? t('common.saving') : t('common.save')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

// Topic Distribution Bar Component
function TopicDistributionBar({ distribution }: { distribution: number[] }) {
  const colors = [
    '#1976d2', '#dc004e', '#9c27b0', '#ff9800', '#4caf50',
    '#00bcd4', '#795548', '#607d8b', '#e91e63', '#3f51b5'
  ]
  
  return (
    <Box sx={{ display: 'flex', height: 16, borderRadius: 1, overflow: 'hidden' }}>
      {distribution.map((weight, idx) => (
        <Box
          key={idx}
          sx={{
            width: `${weight * 100}%`,
            bgcolor: colors[idx % colors.length],
            minWidth: weight > 0.01 ? 2 : 0
          }}
          title={`Topic ${idx}: ${(weight * 100).toFixed(1)}%`}
        />
      ))}
    </Box>
  )
}
