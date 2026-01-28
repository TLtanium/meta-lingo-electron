import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  Chip,
  Stack,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Tooltip,
  CircularProgress,
  TextField,
  InputAdornment
} from '@mui/material'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import SearchIcon from '@mui/icons-material/Search'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import { useTranslation } from 'react-i18next'
import apiClient from '../../api/client'

interface USASCategory {
  code: string
  description: string
}

interface USASDomainsData {
  major_categories: Record<string, string>
  domains_by_category: Record<string, USASCategory[]>
  total_domains: number
}

interface USASTagSelectorProps {
  open: boolean
  onClose: () => void
  selectedDomains: string[]
  onSave: (domains: string[]) => void
}

export default function USASTagSelector({
  open,
  onClose,
  selectedDomains,
  onSave
}: USASTagSelectorProps) {
  const { t } = useTranslation()
  
  const [domainsData, setDomainsData] = useState<USASDomainsData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set(selectedDomains))
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set())

  // Load domains data when dialog opens
  useEffect(() => {
    if (open && !domainsData) {
      loadDomains()
    }
  }, [open])

  // Reset selected when dialog opens
  useEffect(() => {
    if (open) {
      setSelected(new Set(selectedDomains))
    }
  }, [open, selectedDomains])

  const loadDomains = async () => {
    setLoading(true)
    setError(null)
    
    try {
      const response = await apiClient.get('/api/usas/domains')
      if (response.data.success) {
        setDomainsData(response.data.data)
      } else {
        setError(response.data.error || 'Failed to load domains')
      }
    } catch (err) {
      setError('Failed to load USAS domains')
      console.error('Error loading USAS domains:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleToggleDomain = (code: string) => {
    const newSelected = new Set(selected)
    if (newSelected.has(code)) {
      newSelected.delete(code)
    } else {
      newSelected.add(code)
    }
    setSelected(newSelected)
  }

  const handleToggleCategory = (categoryCode: string) => {
    setExpandedCategories(prev => {
      const newSet = new Set(prev)
      if (newSet.has(categoryCode)) {
        newSet.delete(categoryCode)
      } else {
        newSet.add(categoryCode)
      }
      return newSet
    })
  }

  const handleSave = () => {
    onSave(Array.from(selected))
    onClose()
  }

  const handleClear = () => {
    setSelected(new Set())
  }

  // Filter domains based on search query
  const filterDomains = (domains: USASCategory[]): USASCategory[] => {
    if (!searchQuery.trim()) return domains
    
    const query = searchQuery.toLowerCase()
    return domains.filter(d => 
      d.code.toLowerCase().includes(query) ||
      d.description.toLowerCase().includes(query)
    )
  }

  // Get category display name with translation
  const getCategoryName = (code: string, name: string): string => {
    const translationKey = `settings.usas.categories.${code}`
    const translated = t(translationKey)
    return translated !== translationKey ? translated : name
  }

  // Count selected in category
  const getSelectedCountInCategory = (categoryCode: string): number => {
    if (!domainsData) return 0
    const domains = domainsData.domains_by_category[categoryCode] || []
    return domains.filter(d => selected.has(d.code)).length
  }

  return (
    <Dialog 
      open={open} 
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: { height: '80vh' }
      }}
    >
      <DialogTitle>
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Typography variant="h6">
            {t('settings.usas.selectDomains', 'Select Priority Semantic Domains')}
          </Typography>
          <Chip 
            label={`${selected.size} ${t('common.selected', 'selected')}`}
            color="primary"
            size="small"
          />
        </Stack>
      </DialogTitle>
      
      <DialogContent dividers>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress />
          </Box>
        ) : error ? (
          <Typography color="error" align="center" sx={{ py: 4 }}>
            {error}
          </Typography>
        ) : domainsData ? (
          <Box>
            {/* Search */}
            <TextField
              fullWidth
              size="small"
              placeholder={t('settings.usas.searchDomains', 'Search domains...')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              sx={{ mb: 2 }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon />
                  </InputAdornment>
                )
              }}
            />
            
            {/* Selected domains summary */}
            {selected.size > 0 && (
              <Box sx={{ mb: 2, p: 1.5, bgcolor: 'action.hover', borderRadius: 1 }}>
                <Typography variant="caption" color="text.secondary" gutterBottom>
                  {t('settings.usas.selectedDomains', 'Selected domains:')}
                </Typography>
                <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap sx={{ mt: 0.5 }}>
                  {Array.from(selected).slice(0, 10).map(code => (
                    <Chip
                      key={code}
                      label={code}
                      size="small"
                      onDelete={() => handleToggleDomain(code)}
                      color="primary"
                      variant="outlined"
                    />
                  ))}
                  {selected.size > 10 && (
                    <Chip
                      label={`+${selected.size - 10}`}
                      size="small"
                      variant="outlined"
                    />
                  )}
                </Stack>
              </Box>
            )}
            
            {/* Category accordions */}
            {Object.entries(domainsData.major_categories).map(([code, name]) => {
              const domains = domainsData.domains_by_category[code] || []
              const filteredDomains = filterDomains(domains)
              const selectedCount = getSelectedCountInCategory(code)
              
              // Skip empty categories after filtering
              if (searchQuery && filteredDomains.length === 0) return null
              
              return (
                <Accordion 
                  key={code}
                  expanded={expandedCategories.has(code)}
                  onChange={() => handleToggleCategory(code)}
                  sx={{ 
                    '&:before': { display: 'none' },
                    boxShadow: 'none',
                    border: '1px solid',
                    borderColor: 'divider',
                    borderRadius: '4px !important',
                    mb: 1,
                    '&.Mui-expanded': { mb: 1 }
                  }}
                >
                  <AccordionSummary 
                    expandIcon={<ExpandMoreIcon />}
                    sx={{ 
                      minHeight: 48,
                      '&.Mui-expanded': { minHeight: 48 }
                    }}
                  >
                    <Stack direction="row" spacing={1} alignItems="center" sx={{ width: '100%', pr: 2 }}>
                      <Chip 
                        label={code} 
                        size="small" 
                        color={selectedCount > 0 ? 'primary' : 'default'}
                        sx={{ fontWeight: 600, minWidth: 32 }}
                      />
                      <Typography variant="body2" sx={{ flexGrow: 1 }}>
                        {getCategoryName(code, name)}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {filteredDomains.length} {t('settings.usas.domains', 'domains')}
                        {selectedCount > 0 && (
                          <Chip
                            icon={<CheckCircleIcon sx={{ fontSize: 14 }} />}
                            label={selectedCount}
                            size="small"
                            color="primary"
                            sx={{ ml: 1, height: 20, '& .MuiChip-label': { px: 0.5 } }}
                          />
                        )}
                      </Typography>
                    </Stack>
                  </AccordionSummary>
                  <AccordionDetails sx={{ pt: 0 }}>
                    <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                      {filteredDomains.map(domain => (
                        <Tooltip 
                          key={domain.code}
                          title={domain.description}
                          placement="top"
                          arrow
                        >
                          <Chip
                            label={domain.code}
                            size="small"
                            variant={selected.has(domain.code) ? 'filled' : 'outlined'}
                            color={selected.has(domain.code) ? 'primary' : 'default'}
                            onClick={() => handleToggleDomain(domain.code)}
                            sx={{ 
                              cursor: 'pointer',
                              fontSize: '0.75rem',
                              '&:hover': { 
                                bgcolor: selected.has(domain.code) ? 'primary.dark' : 'action.hover'
                              }
                            }}
                          />
                        </Tooltip>
                      ))}
                    </Stack>
                  </AccordionDetails>
                </Accordion>
              )
            })}
          </Box>
        ) : null}
      </DialogContent>
      
      <DialogActions>
        <Button onClick={handleClear} color="inherit">
          {t('common.clear', 'Clear')}
        </Button>
        <Box sx={{ flexGrow: 1 }} />
        <Button onClick={onClose}>
          {t('common.cancel', 'Cancel')}
        </Button>
        <Button onClick={handleSave} variant="contained">
          {t('common.save', 'Save')}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
