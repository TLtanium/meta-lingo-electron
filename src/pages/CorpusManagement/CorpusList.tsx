import { useState, useEffect, useCallback } from 'react'
import {
  Box,
  Paper,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  IconButton,
  Chip,
  Tooltip,
  TextField,
  InputAdornment,
  Button,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Stack,
  Grid,
  Card,
  CardContent,
  CardActions,
  ToggleButtonGroup,
  ToggleButton,
  FormControl,
  InputLabel,
  Select,
  Skeleton,
  Alert,
  Divider,
  CircularProgress
} from '@mui/material'
import SearchIcon from '@mui/icons-material/Search'
import VisibilityIcon from '@mui/icons-material/Visibility'
import EditIcon from '@mui/icons-material/Edit'
import DeleteIcon from '@mui/icons-material/Delete'
import MoreVertIcon from '@mui/icons-material/MoreVert'
import AddIcon from '@mui/icons-material/Add'
import FolderIcon from '@mui/icons-material/Folder'
import ViewListIcon from '@mui/icons-material/ViewList'
import ViewModuleIcon from '@mui/icons-material/ViewModule'
import RefreshIcon from '@mui/icons-material/Refresh'
import TextSnippetIcon from '@mui/icons-material/TextSnippet'
import AudioFileIcon from '@mui/icons-material/AudioFile'
import VideoFileIcon from '@mui/icons-material/VideoFile'
import LabelIcon from '@mui/icons-material/Label'
import { useTranslation } from 'react-i18next'
import { corpusApi } from '../../api'
import type { Corpus, CorpusFilters } from '../../types'

interface CorpusListProps {
  onSelectCorpus: (corpus: Corpus) => void
  onCreateNew?: () => void
}

// Translation mappings for text types and sources
const TEXT_TYPE_TRANSLATION_KEYS: Record<string, string> = {
  'General Text': 'corpus.textTypes.generalText',
  'Academic Paper': 'corpus.textTypes.academicPaper',
  'Social Media': 'corpus.textTypes.socialMedia',
  'News Article': 'corpus.textTypes.newsArticle',
  'Novel/Fiction': 'corpus.textTypes.novelFiction',
  'Video Material': 'corpus.textTypes.videoMaterial',
  'Audio Material': 'corpus.textTypes.audioMaterial',
  'Speech/Presentation': 'corpus.textTypes.speechPresentation',
  'Interview Transcript': 'corpus.textTypes.interviewTranscript',
  'Meeting Minutes': 'corpus.textTypes.meetingMinutes',
  'Technical Document': 'corpus.textTypes.technicalDocument',
  'Legal Document': 'corpus.textTypes.legalDocument',
  'Medical Literature': 'corpus.textTypes.medicalLiterature',
  'Custom': 'corpus.textTypes.custom',
  'Other': 'corpus.textTypes.other'
}

const SOURCE_TRANSLATION_KEYS: Record<string, string> = {
  'Web Crawl': 'corpus.sources.webCrawl',
  'Manual Input': 'corpus.sources.manualInput',
  'File Upload': 'corpus.sources.fileUpload',
  'Database Export': 'corpus.sources.databaseExport',
  'API Collection': 'corpus.sources.apiCollection',
  'Archive': 'corpus.sources.archive',
  'Library': 'corpus.sources.library',
  'Research Dataset': 'corpus.sources.researchDataset',
  'Social Media Platform': 'corpus.sources.socialMediaPlatform',
  'News Agency': 'corpus.sources.newsAgency',
  'Custom': 'corpus.sources.custom',
  'Other': 'corpus.sources.other'
}

export default function CorpusList({ onSelectCorpus, onCreateNew }: CorpusListProps) {
  const { t } = useTranslation()
  
  // Helper function to translate text type
  const translateTextType = (textType: string | undefined): string => {
    if (!textType || textType === '-') return '-'
    const translationKey = TEXT_TYPE_TRANSLATION_KEYS[textType]
    return translationKey ? t(translationKey, textType) : textType
  }
  
  // Helper function to translate source
  const translateSource = (source: string | undefined): string => {
    if (!source || source === '-') return '-'
    const translationKey = SOURCE_TRANSLATION_KEYS[source]
    return translationKey ? t(translationKey, source) : source
  }
  
  // Helper function to translate language
  const translateLanguage = (language: string | undefined): string => {
    if (!language || language === '-') return '-'
    const translationKey = `corpus.languages.${language}`
    return t(translationKey, language)
  }
  
  // Data state
  const [corpora, setCorpora] = useState<Corpus[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [allTags, setAllTags] = useState<string[]>([])
  
  // Filter state
  const [searchQuery, setSearchQuery] = useState('')
  const [filterLanguage, setFilterLanguage] = useState<string>('')
  const [filterTag, setFilterTag] = useState<string>('')
  
  // UI state
  const [viewMode, setViewMode] = useState<'list' | 'card'>('card')
  const [page, setPage] = useState(0)
  const [rowsPerPage, setRowsPerPage] = useState(12)
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null)
  const [selectedCorpus, setSelectedCorpus] = useState<Corpus | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  
  // Edit dialog state
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editFormData, setEditFormData] = useState<{
    name: string
    language: string
    author: string
    source: string
    textType: string
    description: string
  }>({ name: '', language: '', author: '', source: '', textType: '', description: '' })
  const [saving, setSaving] = useState(false)

  // Load corpora on mount
  useEffect(() => {
    loadCorpora()
    loadTags()
  }, [])

  const loadCorpora = async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await corpusApi.listCorpora()
      if (response.success && response.data) {
        setCorpora(Array.isArray(response.data) ? response.data : [])
      } else {
        setError(response.message || 'Failed to load corpora')
        setCorpora([])
      }
    } catch (err) {
      console.error('Failed to load corpora:', err)
      setError('Failed to load corpora: ' + (err as Error).message)
      setCorpora([])
    } finally {
      setLoading(false)
    }
  }

  const loadTags = async () => {
    try {
      const response = await corpusApi.getAllTags()
      if (response.success && response.data) {
        setAllTags(Array.isArray(response.data) ? response.data : [])
      } else {
        setAllTags([])
      }
    } catch (err) {
      console.error('Failed to load tags:', err)
      setAllTags([])
    }
  }

  // Filter corpora
  const filteredCorpora = corpora.filter(corpus => {
    const tags = corpus.tags || []
    const matchesSearch = !searchQuery || 
      corpus.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      corpus.language?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      corpus.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()))
    
    const matchesLanguage = !filterLanguage || corpus.language === filterLanguage
    const matchesTag = !filterTag || tags.includes(filterTag)
    
    return matchesSearch && matchesLanguage && matchesTag
  })

  // Get unique languages
  const languages = [...new Set(corpora.map(c => c.language).filter(Boolean))]

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>, corpus: Corpus) => {
    event.stopPropagation()
    setAnchorEl(event.currentTarget)
    setSelectedCorpus(corpus)
  }

  const handleMenuClose = () => {
    setAnchorEl(null)
  }

  const handleView = () => {
    if (selectedCorpus) {
      onSelectCorpus(selectedCorpus)
    }
    handleMenuClose()
  }

  const handleEdit = () => {
    if (selectedCorpus) {
      setEditFormData({
        name: selectedCorpus.name || '',
        language: selectedCorpus.language || '',
        author: selectedCorpus.author || '',
        source: selectedCorpus.source || '',
        textType: selectedCorpus.textType || '',
        description: selectedCorpus.description || ''
      })
      setEditDialogOpen(true)
    }
    handleMenuClose()
  }

  const handleEditSave = async () => {
    if (!selectedCorpus) return
    
    setSaving(true)
    try {
      const response = await corpusApi.updateCorpus(selectedCorpus.id, {
        name: editFormData.name,
        language: editFormData.language || undefined,
        author: editFormData.author || undefined,
        source: editFormData.source || undefined,
        textType: editFormData.textType || undefined,
        description: editFormData.description || undefined
      })
      if (response.success) {
        // Update local state
        setCorpora(prev => prev.map(c => 
          c.id === selectedCorpus.id 
            ? { ...c, ...editFormData }
            : c
        ))
        setEditDialogOpen(false)
        setSelectedCorpus(null)
      } else {
        setError(response.message || 'Failed to update corpus')
      }
    } catch (err) {
      setError('Failed to update corpus: ' + (err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteClick = () => {
    setDeleteDialogOpen(true)
    handleMenuClose()
  }

  const handleDeleteConfirm = async () => {
    if (!selectedCorpus) return
    
    setDeleting(true)
    try {
      const response = await corpusApi.deleteCorpus(selectedCorpus.id)
      if (response.success) {
        setCorpora(prev => prev.filter(c => c.id !== selectedCorpus.id))
      } else {
        setError(response.message || 'Failed to delete corpus')
      }
    } catch (err) {
      setError('Failed to delete corpus: ' + (err as Error).message)
    } finally {
      setDeleting(false)
      setDeleteDialogOpen(false)
      setSelectedCorpus(null)
    }
  }

  const handleRowClick = (corpus: Corpus) => {
    onSelectCorpus(corpus)
  }

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '-'
    try {
      return new Date(dateStr).toLocaleDateString()
    } catch {
      return dateStr
    }
  }

  // Render card view
  const renderCardView = () => (
    <Grid container spacing={3}>
      {filteredCorpora
        .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
        .map((corpus) => (
          <Grid item xs={12} sm={6} md={4} lg={3} key={corpus.id}>
            <Card 
              sx={{ 
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                cursor: 'pointer',
                transition: 'all 0.25s ease-in-out',
                borderRadius: 2,
                border: '1px solid',
                borderColor: 'divider',
                bgcolor: 'background.paper',
                position: 'relative',
                overflow: 'hidden',
                '&:hover': {
                  transform: 'translateY(-4px)',
                  boxShadow: (theme) => theme.palette.mode === 'dark'
                    ? '0 4px 12px rgba(0, 0, 0, 0.3)'
                    : '0 4px 12px rgba(0, 0, 0, 0.08)',
                  borderColor: 'primary.light',
                }
              }}
              onClick={() => handleRowClick(corpus)}
            >
              <CardContent sx={{ flexGrow: 1, pb: 1 }}>
                {/* Header with title and menu */}
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', flexGrow: 1, mr: 1 }}>
                    <Box
                      sx={{
                        width: 40,
                        height: 40,
                        borderRadius: 2,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        bgcolor: (theme) => theme.palette.mode === 'dark'
                          ? 'rgba(144, 202, 249, 0.15)'
                          : 'rgba(25, 118, 210, 0.08)',
                        mr: 1.5,
                        flexShrink: 0
                      }}
                    >
                      <FolderIcon sx={{ color: 'primary.main', fontSize: 22 }} />
                    </Box>
                    <Typography 
                      variant="h6" 
                      sx={{ 
                        fontWeight: 600,
                        fontSize: '1.1rem',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        lineHeight: 1.3
                      }}
                    >
                      {corpus.name}
                    </Typography>
                  </Box>
                  <IconButton
                    size="small"
                    onClick={(e) => handleMenuOpen(e, corpus)}
                    sx={{
                      opacity: 0.7,
                      '&:hover': { 
                        opacity: 1,
                        bgcolor: 'action.hover'
                      }
                    }}
                  >
                    <MoreVertIcon fontSize="small" />
                  </IconButton>
                </Box>
                
                {/* Description */}
                {corpus.description && (
                  <Typography 
                    variant="body2" 
                    color="text.secondary" 
                    sx={{ 
                      mb: 2,
                      minHeight: 40,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      lineHeight: 1.5
                    }}
                  >
                    {corpus.description}
                  </Typography>
                )}
                
                {/* Statistics */}
                <Box 
                  sx={{ 
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: 2,
                    mb: 2,
                    p: 1.5,
                    bgcolor: (theme) => theme.palette.mode === 'dark' 
                      ? 'rgba(255, 255, 255, 0.03)' 
                      : 'rgba(0, 0, 0, 0.015)',
                    borderRadius: 1.5,
                    border: '1px solid',
                    borderColor: (theme) => theme.palette.mode === 'dark'
                      ? 'rgba(255, 255, 255, 0.05)'
                      : 'rgba(0, 0, 0, 0.04)'
                  }}
                >
                  <Box sx={{ textAlign: 'center' }}>
                    <Typography variant="h6" color="primary" fontWeight={600}>
                      {corpus.textCount}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
                      {t('corpus.textCount')}
                    </Typography>
                  </Box>
                  <Box sx={{ textAlign: 'center' }}>
                    <Typography 
                      variant="h6" 
                      color="text.primary"
                      fontWeight={600}
                      sx={{ fontSize: '0.95rem' }}
                    >
                      {translateLanguage(corpus.language)}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
                      {t('corpus.language')}
                    </Typography>
                  </Box>
                </Box>
                
                {/* Tags */}
                {(corpus.tags || []).length > 0 && (
                  <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap sx={{ mb: 1 }}>
                    {(corpus.tags || []).slice(0, 3).map(tag => (
                      <Chip 
                        key={tag} 
                        label={tag} 
                        size="small" 
                        variant="outlined"
                        sx={{
                          height: 22,
                          fontSize: '0.7rem',
                          borderColor: 'primary.light',
                          color: 'primary.main',
                          bgcolor: 'transparent',
                          '& .MuiChip-label': {
                            px: 1
                          }
                        }}
                      />
                    ))}
                    {(corpus.tags || []).length > 3 && (
                      <Chip 
                        label={`+${(corpus.tags || []).length - 3}`} 
                        size="small"
                        variant="outlined"
                        sx={{
                          height: 22,
                          fontSize: '0.7rem',
                          borderColor: 'divider',
                          color: 'text.secondary',
                          bgcolor: 'transparent',
                          '& .MuiChip-label': {
                            px: 1
                          }
                        }}
                      />
                    )}
                  </Stack>
                )}
              </CardContent>
              
              <Divider sx={{ opacity: 0.6 }} />
              
              <CardActions 
                sx={{ 
                  justifyContent: 'space-between', 
                  px: 2,
                  py: 1.5,
                }}
              >
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
                  {formatDate(corpus.updatedAt)}
                </Typography>
                <Button 
                  size="small" 
                  variant="text"
                  onClick={(e) => { e.stopPropagation(); handleRowClick(corpus) }}
                  sx={{ 
                    textTransform: 'none',
                    fontWeight: 500,
                    minWidth: 'auto',
                    px: 1.5,
                    py: 0.5
                  }}
                >
                  {t('common.view')}
                </Button>
              </CardActions>
            </Card>
          </Grid>
        ))}
    </Grid>
  )

  // Render list view
  const renderListView = () => (
    <TableContainer component={Paper}>
      <Table>
        <TableHead>
          <TableRow>
            <TableCell>{t('corpus.name')}</TableCell>
            <TableCell>{t('corpus.language')}</TableCell>
            <TableCell>{t('corpus.textType')}</TableCell>
            <TableCell align="center">{t('corpus.textCount')}</TableCell>
            <TableCell>{t('corpus.tags')}</TableCell>
            <TableCell>{t('corpus.updatedAt')}</TableCell>
            <TableCell align="right"></TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {filteredCorpora
            .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
            .map((corpus) => (
              <TableRow
                key={corpus.id}
                hover
                sx={{ cursor: 'pointer' }}
                onClick={() => handleRowClick(corpus)}
              >
                <TableCell>
                  <Typography fontWeight={500}>{corpus.name}</Typography>
                  {corpus.description && (
                    <Typography variant="caption" color="text.secondary" display="block" noWrap sx={{ maxWidth: 200 }}>
                      {corpus.description}
                    </Typography>
                  )}
                </TableCell>
                <TableCell>{translateLanguage(corpus.language)}</TableCell>
                <TableCell>{translateTextType(corpus.textType)}</TableCell>
                <TableCell align="center">{corpus.textCount}</TableCell>
                <TableCell>
                  <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                    {(corpus.tags || []).slice(0, 3).map(tag => (
                      <Chip key={tag} label={tag} size="small" />
                    ))}
                    {(corpus.tags || []).length > 3 && (
                      <Chip label={`+${(corpus.tags || []).length - 3}`} size="small" variant="outlined" />
                    )}
                  </Stack>
                </TableCell>
                <TableCell>
                  {formatDate(corpus.updatedAt)}
                </TableCell>
                <TableCell align="right">
                  <IconButton
                    size="small"
                    onClick={(e) => handleMenuOpen(e, corpus)}
                  >
                    <MoreVertIcon />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
        </TableBody>
      </Table>
    </TableContainer>
  )

  // Loading skeleton
  if (loading) {
    return (
      <Box sx={{ p: 3 }}>
        <Skeleton variant="rectangular" height={56} sx={{ mb: 2 }} />
        <Grid container spacing={2}>
          {[1, 2, 3, 4, 5, 6].map(i => (
            <Grid item xs={12} sm={6} md={4} key={i}>
              <Skeleton variant="rectangular" height={180} />
            </Grid>
          ))}
        </Grid>
      </Box>
    )
  }

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h5" fontWeight={600}>
          {t('corpus.list')} ({filteredCorpora.length})
        </Typography>
        <Stack direction="row" spacing={2} alignItems="center">
          <ToggleButtonGroup
            value={viewMode}
            exclusive
            onChange={(_, mode) => mode && setViewMode(mode)}
            size="small"
          >
            <ToggleButton value="card">
              <ViewModuleIcon />
            </ToggleButton>
            <ToggleButton value="list">
              <ViewListIcon />
            </ToggleButton>
          </ToggleButtonGroup>
          <IconButton onClick={loadCorpora}>
            <RefreshIcon />
          </IconButton>
          {onCreateNew && (
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={onCreateNew}
            >
              {t('corpus.create')}
            </Button>
          )}
        </Stack>
      </Box>

      {/* Filters */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          <TextField
            size="small"
            placeholder={t('common.search')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            sx={{ minWidth: 200, flexGrow: 1 }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon />
                </InputAdornment>
              )
            }}
          />
          
          <FormControl size="small" sx={{ minWidth: 120 }}>
            <InputLabel>{t('corpus.filterByLanguage')}</InputLabel>
            <Select
              value={filterLanguage}
              onChange={(e) => setFilterLanguage(e.target.value)}
              label={t('corpus.filterByLanguage')}
            >
              <MenuItem value="">{t('corpus.allLanguages')}</MenuItem>
              {languages.map(lang => (
                <MenuItem key={lang} value={lang}>{lang}</MenuItem>
              ))}
            </Select>
          </FormControl>
          
          <FormControl size="small" sx={{ minWidth: 120 }}>
            <InputLabel>{t('corpus.filterByTag')}</InputLabel>
            <Select
              value={filterTag}
              onChange={(e) => setFilterTag(e.target.value)}
              label={t('corpus.filterByTag')}
            >
              <MenuItem value="">{t('corpus.allTags')}</MenuItem>
              {allTags.map(tag => (
                <MenuItem key={tag} value={tag}>{tag}</MenuItem>
              ))}
            </Select>
          </FormControl>
        </Stack>
      </Paper>

      {/* Error message */}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Corpus content */}
      {filteredCorpora.length === 0 ? (
        <Paper sx={{ p: 6, textAlign: 'center' }}>
          <FolderIcon sx={{ fontSize: 64, color: 'text.disabled', mb: 2 }} />
          <Typography variant="h6" color="text.secondary" gutterBottom>
            {searchQuery || filterLanguage || filterTag ? 'No matching corpora' : t('corpus.noCorpus')}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            {searchQuery || filterLanguage || filterTag ? 
              'Try adjusting your filters' : 
              t('corpus.createFirst')
            }
          </Typography>
          {onCreateNew && !searchQuery && !filterLanguage && !filterTag && (
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={onCreateNew}
            >
              {t('corpus.create')}
            </Button>
          )}
        </Paper>
      ) : (
        <>
          {viewMode === 'card' ? renderCardView() : renderListView()}
          
          <TablePagination
            component="div"
            count={filteredCorpora.length}
            page={page}
            onPageChange={(_, newPage) => setPage(newPage)}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={(e) => {
              setRowsPerPage(parseInt(e.target.value, 10))
              setPage(0)
            }}
            rowsPerPageOptions={viewMode === 'card' ? [6, 12, 24] : [5, 10, 25]}
            sx={{ mt: 2 }}
          />
        </>
      )}

      {/* Context menu */}
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleMenuClose}
      >
        <MenuItem onClick={handleView}>
          <ListItemIcon><VisibilityIcon fontSize="small" /></ListItemIcon>
          <ListItemText>{t('corpus.detail')}</ListItemText>
        </MenuItem>
        <MenuItem onClick={handleEdit}>
          <ListItemIcon><EditIcon fontSize="small" /></ListItemIcon>
          <ListItemText>{t('common.edit')}</ListItemText>
        </MenuItem>
        <Divider />
        <MenuItem onClick={handleDeleteClick} sx={{ color: 'error.main' }}>
          <ListItemIcon><DeleteIcon fontSize="small" color="error" /></ListItemIcon>
          <ListItemText>{t('common.delete')}</ListItemText>
        </MenuItem>
      </Menu>

      {/* Delete confirmation dialog */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>{t('common.confirm')}</DialogTitle>
        <DialogContent>
          <Typography>
            {t('corpus.deleteCorpusConfirm', { name: selectedCorpus?.name })}
          </Typography>
          <Typography variant="body2" color="error" sx={{ mt: 1 }}>
            {t('corpus.deleteCorpusWarning')}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)} disabled={deleting}>
            {t('common.cancel')}
          </Button>
          <Button 
            onClick={handleDeleteConfirm} 
            color="error" 
            variant="contained"
            disabled={deleting}
            startIcon={deleting && <CircularProgress size={16} />}
          >
            {t('common.delete')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Edit corpus dialog */}
      <Dialog 
        open={editDialogOpen} 
        onClose={() => setEditDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>{t('corpus.editCorpus', '编辑语料库')}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label={t('corpus.name')}
              value={editFormData.name}
              onChange={(e) => setEditFormData(prev => ({ ...prev, name: e.target.value }))}
              fullWidth
              required
            />
            <TextField
              label={t('corpus.language')}
              value={editFormData.language}
              onChange={(e) => setEditFormData(prev => ({ ...prev, language: e.target.value }))}
              fullWidth
            />
            <TextField
              label={t('corpus.author')}
              value={editFormData.author}
              onChange={(e) => setEditFormData(prev => ({ ...prev, author: e.target.value }))}
              fullWidth
            />
            <TextField
              label={t('corpus.source')}
              value={editFormData.source}
              onChange={(e) => setEditFormData(prev => ({ ...prev, source: e.target.value }))}
              fullWidth
            />
            <TextField
              label={t('corpus.textType')}
              value={editFormData.textType}
              onChange={(e) => setEditFormData(prev => ({ ...prev, textType: e.target.value }))}
              fullWidth
            />
            <TextField
              label={t('corpus.description')}
              value={editFormData.description}
              onChange={(e) => setEditFormData(prev => ({ ...prev, description: e.target.value }))}
              fullWidth
              multiline
              rows={3}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditDialogOpen(false)} disabled={saving}>
            {t('common.cancel')}
          </Button>
          <Button 
            onClick={handleEditSave} 
            variant="contained"
            disabled={saving || !editFormData.name.trim()}
            startIcon={saving && <CircularProgress size={16} />}
          >
            {t('common.save')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
