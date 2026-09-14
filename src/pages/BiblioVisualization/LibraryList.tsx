/**
 * Library List Component for Bibliographic Visualization
 * 
 * Displays list of bibliographic libraries with statistics
 */

import { useState, useEffect } from 'react'
import {
  Box,
  Typography,
  Card,
  CardContent,
  CardActions,
  Button,
  Grid,
  Chip,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  LinearProgress,
  Alert,
  TextField,
  InputAdornment,
  Stack,
  ToggleButtonGroup,
  ToggleButton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  Paper,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  CircularProgress
} from '@mui/material'
import DeleteIcon from '@mui/icons-material/Delete'
import EditIcon from '@mui/icons-material/Edit'
import VisibilityIcon from '@mui/icons-material/Visibility'
import StorageIcon from '@mui/icons-material/Storage'
import AddIcon from '@mui/icons-material/Add'
import RefreshIcon from '@mui/icons-material/Refresh'
import SearchIcon from '@mui/icons-material/Search'
import ViewListIcon from '@mui/icons-material/ViewList'
import ViewModuleIcon from '@mui/icons-material/ViewModule'
import ArchiveIcon from '@mui/icons-material/Archive'
import { useTranslation } from 'react-i18next'
import type { BiblioLibrary } from '../../types/biblio'
import * as biblioApi from '../../api/biblio'
import ExportBundleDialog from '../../components/Migration/ExportBundleDialog'
import ImportBundleButton from '../../components/Migration/ImportBundleButton'
import { LANGUAGE_OPTIONS } from './constants'

interface LibraryListProps {
  onSelectLibrary: (library: BiblioLibrary) => void
  onCreateNew: () => void
}

export default function LibraryList({ onSelectLibrary, onCreateNew }: LibraryListProps) {
  const { t } = useTranslation()
  
  const [libraries, setLibraries] = useState<BiblioLibrary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [viewMode, setViewMode] = useState<'card' | 'list'>('card')
  const [page, setPage] = useState(0)
  const [rowsPerPage, setRowsPerPage] = useState(12)
  const [exportOpen, setExportOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [libraryToDelete, setLibraryToDelete] = useState<BiblioLibrary | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Edit library metadata (name/description/language) — the API already existed
  // (biblioApi.updateLibrary / PUT /api/biblio/libraries/{id}) but no UI called it.
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [libraryToEdit, setLibraryToEdit] = useState<BiblioLibrary | null>(null)
  const [editFormData, setEditFormData] = useState({ name: '', description: '', language: 'english' })
  const [savingEdit, setSavingEdit] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)

  const filteredLibraries = libraries.filter(
    lib =>
      !searchQuery ||
      lib.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (lib.description || '').toLowerCase().includes(searchQuery.toLowerCase())
  )
  
  // Load libraries
  const loadLibraries = async () => {
    setLoading(true)
    setError(null)
    
    const response = await biblioApi.listLibraries()
    
    setLoading(false)
    
    if (response.success && response.data) {
      setLibraries(response.data.libraries)
    } else {
      setError(response.error || t('biblio.loadFailed'))
    }
  }
  
  useEffect(() => {
    loadLibraries()
  }, [])
  
  // Handle delete
  const handleDeleteClick = (library: BiblioLibrary) => {
    setLibraryToDelete(library)
    setDeleteDialogOpen(true)
  }
  
  const handleDeleteConfirm = async () => {
    if (!libraryToDelete) return
    
    setDeleting(true)
    
    const response = await biblioApi.deleteLibrary(libraryToDelete.id)
    
    setDeleting(false)
    setDeleteDialogOpen(false)
    setLibraryToDelete(null)
    
    if (response.success) {
      loadLibraries()
    }
  }
  
  const handleDeleteCancel = () => {
    setDeleteDialogOpen(false)
    setLibraryToDelete(null)
  }

  // Handle edit
  const handleEditClick = (library: BiblioLibrary) => {
    setLibraryToEdit(library)
    setEditFormData({
      name: library.name || '',
      description: library.description || '',
      language: library.language || 'english'
    })
    setEditError(null)
    setEditDialogOpen(true)
  }

  const handleEditCancel = () => {
    setEditDialogOpen(false)
    setLibraryToEdit(null)
  }

  const handleEditSave = async () => {
    if (!libraryToEdit) return
    if (!editFormData.name.trim()) {
      setEditError(t('biblio.nameRequired'))
      return
    }

    setSavingEdit(true)
    setEditError(null)

    const response = await biblioApi.updateLibrary(libraryToEdit.id, {
      name: editFormData.name.trim(),
      description: editFormData.description.trim() || undefined,
      language: editFormData.language
    })

    setSavingEdit(false)

    if (response.success && response.data) {
      const updated = response.data
      setLibraries(prev => prev.map(l => (l.id === updated.id ? updated : l)))
      setEditDialogOpen(false)
      setLibraryToEdit(null)
    } else {
      setEditError(response.error || t('biblio.updateFailed'))
    }
  }
  
  // Format date
  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '-'
    return new Date(dateStr).toLocaleDateString()
  }
  
  if (loading) {
    return (
      <Box sx={{ p: 3 }}>
        <LinearProgress />
      </Box>
    )
  }
  
  if (error) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">{error}</Alert>
      </Box>
    )
  }
  
  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h6">
          {t('biblio.libraryList')}
        </Typography>
        <Stack direction="row" spacing={1} alignItems="center">
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
          <IconButton onClick={loadLibraries} title={t('common.refresh')}>
            <RefreshIcon />
          </IconButton>
          <ImportBundleButton onImport={biblioApi.importLibraryBundle} onImported={loadLibraries} />
          <Button
            variant="outlined"
            startIcon={<ArchiveIcon />}
            onClick={() => setExportOpen(true)}
            disabled={libraries.length === 0}
          >
            {t('migration.export')}
          </Button>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={onCreateNew}
          >
            {t('biblio.createLibrary')}
          </Button>
        </Stack>
      </Box>

      <ExportBundleDialog
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        title={t('migration.exportLibrariesTitle')}
        items={libraries.map(l => ({ id: l.id, name: l.name, subtitle: l.source_type }))}
        onExport={biblioApi.exportLibraryBundle}
      />

      <TextField
        size="small"
        placeholder={t('common.search')}
        value={searchQuery}
        onChange={e => setSearchQuery(e.target.value)}
        fullWidth
        sx={{ mb: 2 }}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon />
            </InputAdornment>
          )
        }}
      />
      
      {libraries.length === 0 ? (
        <Box sx={{ 
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center', 
          py: 6,
          minHeight: '400px',
          color: 'text.secondary' 
        }}>
          <StorageIcon sx={{ fontSize: 64, mb: 2, opacity: 0.5 }} />
          <Typography variant="h6" gutterBottom>
            {t('biblio.noLibraries')}
          </Typography>
          <Typography variant="body2" sx={{ mb: 2 }}>
            {t('biblio.createFirst')}
          </Typography>
          <Button
            variant="outlined"
            startIcon={<AddIcon />}
            onClick={onCreateNew}
          >
            {t('biblio.createLibrary')}
          </Button>
        </Box>
      ) : filteredLibraries.length === 0 ? (
        <Paper sx={{ p: 6, textAlign: 'center' }}>
          <Typography color="text.secondary">{t('common.noData')}</Typography>
        </Paper>
      ) : viewMode === 'list' ? (
        <TableContainer component={Paper} sx={{ border: 1, borderColor: 'divider', borderRadius: 2 }}>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: (theme) => theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.02)' }}>
                <TableCell>{t('biblio.libraryName')}</TableCell>
                <TableCell>{t('biblio.sourceType')}</TableCell>
                <TableCell align="center">{t('biblio.entries')}</TableCell>
                <TableCell align="right">{t('common.actions')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredLibraries
                .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
                .map(lib => (
                <TableRow key={lib.id} hover sx={{ cursor: 'pointer' }} onClick={() => onSelectLibrary(lib)}>
                  <TableCell>
                    <Typography fontWeight={500}>{lib.name}</Typography>
                    {lib.description && (
                      <Typography variant="caption" color="text.secondary" display="block" noWrap sx={{ maxWidth: 300 }}>
                        {lib.description}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    <Chip label={lib.source_type} size="small" color={lib.source_type === 'WOS' ? 'primary' : 'secondary'} variant="outlined" />
                  </TableCell>
                  <TableCell align="center">{lib.entry_count}</TableCell>
                  <TableCell align="right" onClick={e => e.stopPropagation()}>
                    <IconButton size="small" onClick={() => onSelectLibrary(lib)}><VisibilityIcon /></IconButton>
                    <IconButton size="small" onClick={() => handleEditClick(lib)}><EditIcon fontSize="small" /></IconButton>
                    <IconButton size="small" color="error" onClick={e => { e.stopPropagation(); handleDeleteClick(lib) }}><DeleteIcon fontSize="small" /></IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      ) : (
        <Grid container spacing={3}>
          {filteredLibraries
            .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
            .map((library) => (
            <Grid item xs={12} sm={6} md={4} key={library.id}>
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
                onClick={() => onSelectLibrary(library)}
              >
                <CardContent sx={{ flexGrow: 1, pb: 1 }}>
                  {/* Header with icon and title */}
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
                          flexShrink: 0,
                          border: '1px solid',
                          borderColor: (theme) => theme.palette.mode === 'dark'
                            ? 'rgba(144, 202, 249, 0.2)'
                            : 'rgba(25, 118, 210, 0.12)',
                          transition: 'transform 0.2s',
                          '&:hover': {
                            transform: 'scale(1.05)'
                          }
                        }}
                      >
                        <StorageIcon sx={{ color: 'primary.main', fontSize: 22 }} />
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
                        {library.name}
                      </Typography>
                    </Box>
                    <Chip
                      label={library.source_type}
                      size="small"
                      color={library.source_type === 'WOS' ? 'primary' : 'secondary'}
                      variant="outlined"
                      sx={{
                        flexShrink: 0,
                        fontWeight: 500
                      }}
                    />
                  </Box>
                  
                  {/* Description */}
                  {library.description && (
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
                      {library.description}
                    </Typography>
                  )}
                  
                  {/* Statistics Grid */}
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
                        : 'rgba(0, 0, 0, 0.04)',
                      alignItems: 'center'
                    }}
                  >
                    <Box sx={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                      <Typography 
                        variant="h6" 
                        color="primary" 
                        fontWeight={600}
                        sx={{ 
                          lineHeight: 1.2,
                          mb: 0.5
                        }}
                      >
                        {library.entry_count}
                      </Typography>
                      <Typography 
                        variant="caption" 
                        color="text.secondary" 
                        sx={{ fontSize: '0.7rem', lineHeight: 1.2 }}
                      >
                        {t('biblio.entries')}
                      </Typography>
                    </Box>
                    <Box sx={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                      <Typography 
                        variant="h6" 
                        color="text.primary"
                        fontWeight={600}
                        sx={{ 
                          fontSize: '1.25rem',
                          lineHeight: 1.2,
                          mb: 0.5
                        }}
                      >
                        {formatDate(library.created_at)}
                      </Typography>
                      <Typography 
                        variant="caption" 
                        color="text.secondary" 
                        sx={{ fontSize: '0.7rem', lineHeight: 1.2 }}
                      >
                        {t('common.createdAt')}
                      </Typography>
                    </Box>
                  </Box>
                </CardContent>
                
                <CardActions 
                  sx={{ 
                    justifyContent: 'space-between', 
                    px: 2, 
                    pb: 2,
                    pt: 1.5,
                    mt: 'auto',
                    borderTop: '1px solid',
                    borderColor: 'divider',
                    gap: 1
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <Button
                    size="small"
                    variant="contained"
                    startIcon={<VisibilityIcon />}
                    onClick={() => onSelectLibrary(library)}
                    sx={{
                      textTransform: 'none',
                      fontWeight: 500
                    }}
                  >
                    {t('biblio.view')}
                  </Button>
                  <Box>
                    <IconButton
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleEditClick(library)
                      }}
                      sx={{ opacity: 0.7, '&:hover': { opacity: 1 } }}
                    >
                      <EditIcon fontSize="small" />
                    </IconButton>
                    <IconButton
                      size="small"
                      color="error"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDeleteClick(library)
                      }}
                      sx={{
                        opacity: 0.7,
                        '&:hover': {
                          opacity: 1,
                          bgcolor: 'error.light',
                          color: 'error.contrastText'
                        }
                      }}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Box>
                </CardActions>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      {/* Hide the pagination bar entirely when everything fits on one
          minimum-size page (matches corpus management's list/card thresholds) */}
      {filteredLibraries.length > (viewMode === 'card' ? 6 : 5) && (
        <TablePagination
          component="div"
          count={filteredLibraries.length}
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
      )}

      {/* Edit library dialog */}
      <Dialog open={editDialogOpen} onClose={handleEditCancel} maxWidth="sm" fullWidth>
        <DialogTitle>{t('biblio.editLibrary')}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label={t('biblio.libraryName')}
              value={editFormData.name}
              onChange={e => setEditFormData(prev => ({ ...prev, name: e.target.value }))}
              fullWidth
              required
              disabled={savingEdit}
            />
            <FormControl fullWidth disabled={savingEdit}>
              <InputLabel>{t('biblio.language')}</InputLabel>
              <Select
                value={editFormData.language}
                label={t('biblio.language')}
                onChange={e => setEditFormData(prev => ({ ...prev, language: e.target.value }))}
              >
                {LANGUAGE_OPTIONS.map(opt => (
                  <MenuItem key={opt.value} value={opt.value}>
                    {t(opt.labelKey)}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              label={t('biblio.description')}
              value={editFormData.description}
              onChange={e => setEditFormData(prev => ({ ...prev, description: e.target.value }))}
              fullWidth
              multiline
              rows={3}
              disabled={savingEdit}
            />
            {editError && <Alert severity="error">{editError}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleEditCancel} disabled={savingEdit}>
            {t('common.cancel')}
          </Button>
          <Button
            onClick={handleEditSave}
            variant="contained"
            disabled={savingEdit || !editFormData.name.trim()}
            startIcon={savingEdit ? <CircularProgress size={16} /> : undefined}
          >
            {t('common.save')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete confirmation dialog */}
      <Dialog open={deleteDialogOpen} onClose={handleDeleteCancel}>
        <DialogTitle>{t('biblio.deleteLibrary')}</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {t('biblio.deleteConfirm', { name: libraryToDelete?.name })}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleDeleteCancel} disabled={deleting}>
            {t('common.cancel')}
          </Button>
          <Button 
            onClick={handleDeleteConfirm} 
            color="error" 
            disabled={deleting}
          >
            {deleting ? t('common.deleting') : t('common.delete')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

