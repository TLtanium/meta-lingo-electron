/**
 * Filter Panel for Bibliographic Visualization
 * 
 * Provides filtering controls for bibliographic entries
 */

import { useState, useEffect } from 'react'
import {
  Box,
  Typography,
  Slider,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Autocomplete,
  TextField,
  Button,
  Chip,
  Collapse,
  IconButton,
  Paper
} from '@mui/material'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import ExpandLessIcon from '@mui/icons-material/ExpandLess'
import FilterListIcon from '@mui/icons-material/FilterList'
import ClearIcon from '@mui/icons-material/Clear'
import { useTranslation } from 'react-i18next'
import type { BiblioFilter, FilterOptions } from '../../types/biblio'
import * as biblioApi from '../../api/biblio'

interface FilterPanelProps {
  libraryId: string
  filters: BiblioFilter
  onFiltersChange: (filters: BiblioFilter) => void
}

export default function FilterPanel({ libraryId, filters, onFiltersChange }: FilterPanelProps) {
  const { t } = useTranslation()
  
  const [expanded, setExpanded] = useState(false)
  const [options, setOptions] = useState<FilterOptions | null>(null)
  const [loading, setLoading] = useState(true)
  
  // Load filter options
  useEffect(() => {
    const loadOptions = async () => {
      setLoading(true)
      const response = await biblioApi.getFilterOptions(libraryId)
      setLoading(false)
      
      if (response.success && response.data) {
        setOptions(response.data)
      }
    }
    
    loadOptions()
  }, [libraryId])
  
  // Calculate year range
  const yearMin = options?.years?.length ? Math.min(...options.years.map(Number)) : 1990
  const yearMax = options?.years?.length ? Math.max(...options.years.map(Number)) : new Date().getFullYear()
  
  const handleYearChange = (_: Event, value: number | number[]) => {
    if (Array.isArray(value)) {
      onFiltersChange({
        ...filters,
        year_start: value[0],
        year_end: value[1]
      })
    }
  }
  
  const handleClearFilters = () => {
    onFiltersChange({})
  }
  
  const hasActiveFilters = Object.values(filters).some(v => v !== undefined && v !== null && v !== '')
  
  return (
    <Paper>
      <Box 
        sx={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'space-between',
          p: 1.5,
          cursor: 'pointer'
        }}
        onClick={() => setExpanded(!expanded)}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <FilterListIcon color="action" />
          <Typography variant="subtitle1">
            {t('biblio.filters')}
          </Typography>
          {hasActiveFilters && (
            <Chip 
              label={t('biblio.activeFilters')} 
              size="small" 
              color="primary" 
              variant="outlined"
            />
          )}
        </Box>
        <IconButton size="small">
          {expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
        </IconButton>
      </Box>
      
      <Collapse in={expanded}>
        <Box sx={{ p: 2, pt: 0 }}>
          {/* Year Range */}
          <Box sx={{ mb: 3 }}>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              {t('biblio.yearRange')}: {filters.year_start || yearMin} - {filters.year_end || yearMax}
            </Typography>
            <Slider
              value={[filters.year_start || yearMin, filters.year_end || yearMax]}
              onChange={handleYearChange}
              valueLabelDisplay="auto"
              min={yearMin}
              max={yearMax}
              disabled={loading}
            />
          </Box>
          
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 2 }}>
            {/* Author filter */}
            <Autocomplete
              options={options?.authors || []}
              value={filters.author || null}
              onChange={(_, value) => onFiltersChange({ ...filters, author: value || undefined })}
              renderInput={(params) => (
                <TextField {...params} label={t('biblio.author')} size="small" />
              )}
              loading={loading}
              freeSolo
            />
            
            {/* Institution filter */}
            <Autocomplete
              options={options?.institutions || []}
              value={filters.institution || null}
              onChange={(_, value) => onFiltersChange({ ...filters, institution: value || undefined })}
              renderInput={(params) => (
                <TextField {...params} label={t('biblio.institution')} size="small" />
              )}
              loading={loading}
              freeSolo
            />
            
            {/* Keyword filter */}
            <Autocomplete
              options={options?.keywords || []}
              value={filters.keyword || null}
              onChange={(_, value) => onFiltersChange({ ...filters, keyword: value || undefined })}
              renderInput={(params) => (
                <TextField {...params} label={t('biblio.keyword')} size="small" />
              )}
              loading={loading}
              freeSolo
            />
            
            {/* Journal filter */}
            <Autocomplete
              options={options?.journals || []}
              value={filters.journal || null}
              onChange={(_, value) => onFiltersChange({ ...filters, journal: value || undefined })}
              renderInput={(params) => (
                <TextField {...params} label={t('biblio.journal')} size="small" />
              )}
              loading={loading}
              freeSolo
            />
            
            {/* Document type filter */}
            <FormControl size="small">
              <InputLabel>{t('biblio.docType')}</InputLabel>
              <Select
                value={filters.doc_type || ''}
                label={t('biblio.docType')}
                onChange={(e) => onFiltersChange({ ...filters, doc_type: e.target.value || undefined })}
              >
                <MenuItem value="">{t('common.all')}</MenuItem>
                {options?.doc_types?.map((type) => (
                  <MenuItem key={type} value={type}>{type}</MenuItem>
                ))}
              </Select>
            </FormControl>
            
            {/* Country filter */}
            <Autocomplete
              options={options?.countries || []}
              value={filters.country || null}
              onChange={(_, value) => onFiltersChange({ ...filters, country: value || undefined })}
              renderInput={(params) => (
                <TextField {...params} label={t('biblio.country')} size="small" />
              )}
              loading={loading}
              freeSolo
            />
          </Box>
          
          {/* Clear filters button */}
          {hasActiveFilters && (
            <Box sx={{ mt: 2, display: 'flex', justifyContent: 'flex-end' }}>
              <Button
                size="small"
                startIcon={<ClearIcon />}
                onClick={handleClearFilters}
              >
                {t('biblio.clearFilters')}
              </Button>
            </Box>
          )}
        </Box>
      </Collapse>
    </Paper>
  )
}

