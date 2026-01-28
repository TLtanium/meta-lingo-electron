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
  Alert
} from '@mui/material'
import DeleteIcon from '@mui/icons-material/Delete'
import VisibilityIcon from '@mui/icons-material/Visibility'
import StorageIcon from '@mui/icons-material/Storage'
import CalendarTodayIcon from '@mui/icons-material/CalendarToday'
import ArticleIcon from '@mui/icons-material/Article'
import AddIcon from '@mui/icons-material/Add'
import { useTranslation } from 'react-i18next'
import type { BiblioLibrary } from '../../types/biblio'
import * as biblioApi from '../../api/biblio'

interface LibraryListProps {
  onSelectLibrary: (library: BiblioLibrary) => void
  onCreateNew: () => void
}

export default function LibraryList({ onSelectLibrary, onCreateNew }: LibraryListProps) {
  const { t } = useTranslation()
  
  const [libraries, setLibraries] = useState<BiblioLibrary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [libraryToDelete, setLibraryToDelete] = useState<BiblioLibrary | null>(null)
  const [deleting, setDeleting] = useState(false)
  
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
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={onCreateNew}
        >
          {t('biblio.createLibrary')}
        </Button>
      </Box>
      
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
      ) : (
        <Grid container spacing={3}>
          {libraries.map((library) => (
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
                </CardActions>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}
      
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

