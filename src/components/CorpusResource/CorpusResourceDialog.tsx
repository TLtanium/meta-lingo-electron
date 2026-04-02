/**
 * Corpus Resource Dialog Component
 * A dialog for selecting a corpus resource with search and tag filtering
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  InputAdornment,
  Box,
  Chip,
  Stack,
  Typography,
  Grid,
  Divider,
  CircularProgress,
  Alert,
  IconButton,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Collapse,
  Paper,
  useTheme
} from '@mui/material'
import {
  Search as SearchIcon,
  Close as CloseIcon,
  FilterList as FilterIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  Refresh as RefreshIcon
} from '@mui/icons-material'
import { useTranslation } from 'react-i18next'
import { corpusResourceApi } from '../../api'
import type { CorpusResource } from '../../types/keyword'
import { CorpusResourceCard } from './CorpusResourceCard'

interface CorpusResourceDialogProps {
  open: boolean
  onClose: () => void
  onSelect: (resource: CorpusResource) => void
  selectedResourceId?: string
  title?: string
}

// Color mapping for corpus type chips
// Keys correspond to CorpusResource.prefix values (see backend CorpusResourceService)
const CORPUS_COLORS: Record<string, string> = {
  // Legacy / generic
  bnc: '#42a5f5',        // Light blue (BNC 1994)
  brown: '#7b1fa2',
  ame06: '#c62828',      // Red (American English 2006)
  be06: '#283593',       // Indigo (British English 2006)
  now: '#388e3c',
  oanc: '#ef6c00',       // Orange (OANC)
  // BNC variants
  bnc1994: '#1976d2',  // Blue (BNC 1994 folder prefix)
  bnc2014: '#1565c0',   // Darker blue
  // COCA / COHA
  coca: '#00897b',      // Teal
  coha: '#00695c',      // Dark teal
  // Web-based corpora
  glowbe: '#6d4c41',    // Brown (GloWbE)
  // Other large corpora
  coronavirus: '#ad1457', // Deep pink (Coronavirus)
  iweb: '#8d6e63',       // Warm brownish (iWeb)
  movies: '#ff7043',    // Deep orange
  soap: '#d81b60',      // Pink (SOAP)
  tv: '#1e88e5',        // Blue (TV)
  wikipedia: '#0097a7'  // Cyan
}

// In-memory cache to avoid rebuilding corpus resource lists repeatedly.
// Cache lives only for the current app runtime; user can force refresh via the button.
let corpusResourceDialogCache:
  | { resources: CorpusResource[]; allTags: { en: string[]; zh: string[] } }
  | null = null

const CORPUS_RESOURCE_DIALOG_CACHE_KEY = 'meta-lingo:corpus-resource-dialog-cache:v1'

function getPrefixLabel(prefix: string): string {
  // Some CSVs are stored under the bnc1994 folder but named with prefix "bnc_*.csv"
  // So we alias "bnc" to the expected "BNC1994" display.
  if (prefix === 'bnc' || prefix === 'bnc1994') return 'BNC1994'
  if (prefix === 'bnc2014') return 'BNC2014'
  return prefix.toUpperCase()
}

export const CorpusResourceDialog: React.FC<CorpusResourceDialogProps> = ({
  open,
  onClose,
  onSelect,
  selectedResourceId,
  title
}) => {
  const { t, i18n } = useTranslation()
  const theme = useTheme()
  const isZh = i18n.language === 'zh'

  // State
  const [resources, setResources] = useState<CorpusResource[]>([])
  const [allTags, setAllTags] = useState<{ en: string[]; zh: string[] }>({ en: [], zh: [] })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Filters
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [selectedPrefix, setSelectedPrefix] = useState<string>('')
  const [showFilters, setShowFilters] = useState(false)

  // Temporarily selected resource (before confirming)
  const [tempSelectedId, setTempSelectedId] = useState<string | undefined>(selectedResourceId)

  // Load resources and tags on open
  useEffect(() => {
    if (open) {
      // Always reflect current selection, but avoid re-fetching data if we already have cached results.
      setTempSelectedId(selectedResourceId)

      // Reset filters when opening
      setSearchQuery('')
      setSelectedTags([])
      setSelectedPrefix('')

      if (corpusResourceDialogCache) {
        setResources(corpusResourceDialogCache.resources)
        setAllTags(corpusResourceDialogCache.allTags)
        setError(null)
        setLoading(false)
        return
      } else {
        // Try to use persisted cache to avoid re-initializing backend on every app start.
        try {
          const raw = localStorage.getItem(CORPUS_RESOURCE_DIALOG_CACHE_KEY)
          if (raw) {
            const parsed = JSON.parse(raw) as {
              resources: CorpusResource[]
              allTags: { en: string[]; zh: string[] }
            }
            if (parsed?.resources?.length) {
              corpusResourceDialogCache = parsed
              setResources(parsed.resources)
              setAllTags(parsed.allTags)
              setError(null)
              setLoading(false)
              return
            }
          }
        } catch (e) {
          // Ignore cache parse errors and fall back to fetching.
          console.warn('CorpusResourceDialog cache parse failed:', e)
        }

        loadData()
      }
    }
  }, [open, selectedResourceId])

  const loadData = async (forceRefresh: boolean = false) => {
    setLoading(true)
    setError(null)
    try {
      const lang = isZh ? 'zh' : 'en'
      const [resourcesRes, tagsRes] = await Promise.all([
        corpusResourceApi.list(lang, forceRefresh),
        corpusResourceApi.getTags(forceRefresh)
      ])

      // Note:
      // `api.get()` in `src/api/client.ts` wraps backend JSON into `{ success, data }`.
      // So `resourcesRes.data` is the backend payload object, not the raw array.
      const listPayload = resourcesRes.data as any

      if (resourcesRes.success && listPayload?.success && Array.isArray(listPayload?.data)) {
        const nextResources = listPayload.data as CorpusResource[]
        setResources(nextResources)

        // Tags are required for filtering, but if tags request fails we can still show the resources.
        const tagsPayload = tagsRes.data as any
        const nextTags = {
          en: tagsRes.success && tagsPayload?.success ? (tagsPayload.tags_en || []) : [],
          zh: tagsRes.success && tagsPayload?.success ? (tagsPayload.tags_zh || []) : []
        }

        setAllTags(nextTags)
        corpusResourceDialogCache = { resources: nextResources, allTags: nextTags }

        // Persist cache for app restarts (best-effort).
        try {
          localStorage.setItem(
            CORPUS_RESOURCE_DIALOG_CACHE_KEY,
            JSON.stringify(corpusResourceDialogCache)
          )
        } catch (e) {
          // ignore quota / privacy mode
        }
      } else {
        setError(isZh ? '加载语料库资源失败' : 'Failed to load corpus resources')
      }
    } catch (err) {
      setError(isZh ? '加载语料库资源失败，请检查后端服务' : 'Failed to load corpus resources, please check backend service')
      console.error('Error loading corpus resources:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleRefresh = useCallback(() => {
    // Force re-fetch and overwrite the cached snapshot.
    corpusResourceDialogCache = null
    try {
      localStorage.removeItem(CORPUS_RESOURCE_DIALOG_CACHE_KEY)
    } catch (e) {
      // ignore
    }
    loadData(true)
  }, [isZh])

  // Get unique prefixes from resources
  const prefixes = useMemo(() => {
    const prefixSet = new Set<string>()
    resources.forEach(r => prefixSet.add(r.prefix))
    return Array.from(prefixSet).sort()
  }, [resources])

  // Current tags based on language
  const currentTags = useMemo(() => {
    return isZh ? allTags.zh : allTags.en
  }, [isZh, allTags])

  // Filter resources
  const filteredResources = useMemo(() => {
    return resources.filter(resource => {
      // Search query filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase()
        const name = (isZh ? resource.name_zh : resource.name_en).toLowerCase()
        const id = resource.id.toLowerCase()
        const desc = (isZh ? resource.description_zh : resource.description_en).toLowerCase()
        if (!name.includes(query) && !id.includes(query) && !desc.includes(query)) {
          return false
        }
      }

      // Prefix filter
      if (selectedPrefix && resource.prefix !== selectedPrefix) {
        return false
      }

      // Tags filter (must match ALL selected tags)
      if (selectedTags.length > 0) {
        const resourceTags = (isZh ? resource.tags_zh : resource.tags_en)
          .map(t => t.toLowerCase())
        const hasAllTags = selectedTags.every(tag =>
          resourceTags.includes(tag.toLowerCase())
        )
        if (!hasAllTags) {
          return false
        }
      }

      return true
    })
  }, [resources, searchQuery, selectedPrefix, selectedTags, isZh])

  // Handle tag toggle
  const handleTagToggle = useCallback((tag: string) => {
    setSelectedTags(prev =>
      prev.includes(tag)
        ? prev.filter(t => t !== tag)
        : [...prev, tag]
    )
  }, [])

  // Handle resource selection
  const handleResourceClick = useCallback((resource: CorpusResource) => {
    setTempSelectedId(resource.id)
  }, [])

  // Handle confirm
  const handleConfirm = useCallback(() => {
    const selected = resources.find(r => r.id === tempSelectedId)
    if (selected) {
      onSelect(selected)
      onClose()
    }
  }, [resources, tempSelectedId, onSelect, onClose])

  // Clear filters
  const handleClearFilters = useCallback(() => {
    setSearchQuery('')
    setSelectedTags([])
    setSelectedPrefix('')
  }, [])

  // Get filter count
  const filterCount = selectedTags.length + (selectedPrefix ? 1 : 0)

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: { height: '80vh', maxHeight: 700, display: 'flex', flexDirection: 'column' }
      }}
    >
      <DialogTitle sx={{ pb: 1, borderBottom: 1, borderColor: 'divider' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography variant="h6">
            {title || (isZh ? '选择参照语料库' : 'Select Reference Corpus')}
          </Typography>
          <Stack direction="row" spacing={1} alignItems="center">
            <IconButton
              onClick={handleRefresh}
              size="small"
              disabled={loading}
              title={isZh ? '刷新语料库资源' : 'Refresh corpus resources'}
            >
              <RefreshIcon fontSize="small" />
            </IconButton>
            <IconButton onClick={onClose} size="small">
              <CloseIcon />
            </IconButton>
          </Stack>
        </Box>
      </DialogTitle>

      <Box sx={{ p: 2, bgcolor: theme.palette.mode === 'dark' ? 'grey.900' : 'grey.50' }}>
        {/* Search */}
        <TextField
          fullWidth
          size="small"
          placeholder={isZh ? '搜索语料库名称或描述...' : 'Search corpus name or description...'}
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon color="action" />
              </InputAdornment>
            ),
            endAdornment: searchQuery && (
              <InputAdornment position="end">
                <IconButton size="small" onClick={() => setSearchQuery('')}>
                  <CloseIcon fontSize="small" />
                </IconButton>
              </InputAdornment>
            )
          }}
          sx={{ bgcolor: 'background.paper' }}
        />

        {/* Corpus type quick filters */}
        <Stack direction="row" spacing={1} sx={{ mt: 1.5, flexWrap: 'wrap' }} useFlexGap>
          <Chip
            label={isZh ? '全部' : 'All'}
            size="small"
            variant={selectedPrefix === '' ? 'filled' : 'outlined'}
            color={selectedPrefix === '' ? 'primary' : 'default'}
            onClick={() => setSelectedPrefix('')}
          />
          {prefixes.map(prefix => {
            const color = CORPUS_COLORS[prefix] || theme.palette.text.secondary
            return (
              <Chip
                key={prefix}
                label={getPrefixLabel(prefix)}
                size="small"
                variant={selectedPrefix === prefix ? 'filled' : 'outlined'}
                onClick={() => setSelectedPrefix(selectedPrefix === prefix ? '' : prefix)}
                sx={{
                  bgcolor: selectedPrefix === prefix ? color : 'transparent',
                  borderColor: color,
                  color: selectedPrefix === prefix ? 'white' : color,
                  '&:hover': {
                    bgcolor: selectedPrefix === prefix ? color : `${color}15`
                  }
                }}
              />
            )
          })}
        </Stack>

        {/* Advanced filters toggle */}
        <Button
          size="small"
          startIcon={<FilterIcon />}
          endIcon={showFilters ? <ExpandLessIcon /> : <ExpandMoreIcon />}
          onClick={() => setShowFilters(!showFilters)}
          sx={{ mt: 1 }}
        >
          {isZh ? '标签筛选' : 'Tag Filters'}
          {filterCount > 0 && (
            <Chip
              size="small"
              label={filterCount}
              color="primary"
              sx={{ ml: 1, height: 18, '& .MuiChip-label': { px: 0.8, fontSize: 10 } }}
            />
          )}
        </Button>

        {/* Tags filter panel */}
        <Collapse in={showFilters}>
          <Paper variant="outlined" sx={{ mt: 1, p: 1.5 }}>
            <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
              {isZh ? '点击选择标签（多选）' : 'Click to select tags (multiple)'}
            </Typography>
            <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
              {currentTags.map((tag, index) => (
                <Chip
                  key={index}
                  label={tag}
                  size="small"
                  variant={selectedTags.includes(tag) ? 'filled' : 'outlined'}
                  color={selectedTags.includes(tag) ? 'primary' : 'default'}
                  onClick={() => handleTagToggle(tag)}
                  sx={{ mb: 0.5 }}
                />
              ))}
            </Stack>
            {selectedTags.length > 0 && (
              <Button size="small" onClick={() => setSelectedTags([])} sx={{ mt: 1 }}>
                {isZh ? '清除标签' : 'Clear Tags'}
              </Button>
            )}
          </Paper>
        </Collapse>
      </Box>

      <Divider />

      {/* Resources list */}
      <DialogContent sx={{ p: 2, flex: 1, overflow: 'auto' }}>
        {loading ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', py: 6 }}>
            <CircularProgress size={40} />
            <Typography color="text.secondary" sx={{ mt: 2 }}>
              {isZh ? '加载语料库资源...' : 'Loading corpus resources...'}
            </Typography>
          </Box>
        ) : error ? (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>
            <Button startIcon={<RefreshIcon />} onClick={loadData}>
              {isZh ? '重试' : 'Retry'}
            </Button>
          </Box>
        ) : filteredResources.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 6 }}>
            <Typography color="text.secondary">
              {isZh ? '没有找到匹配的语料库资源' : 'No matching corpus resources found'}
            </Typography>
            {(searchQuery || selectedTags.length > 0 || selectedPrefix) && (
              <Button size="small" onClick={handleClearFilters} sx={{ mt: 1 }}>
                {isZh ? '清除筛选条件' : 'Clear Filters'}
              </Button>
            )}
          </Box>
        ) : (
          <Grid container spacing={2}>
            {filteredResources.map(resource => (
              <Grid item xs={12} sm={6} md={4} key={resource.id}>
                <CorpusResourceCard
                  resource={resource}
                  selected={tempSelectedId === resource.id}
                  onClick={() => handleResourceClick(resource)}
                />
              </Grid>
            ))}
          </Grid>
        )}
      </DialogContent>

      <Divider />

      <DialogActions sx={{ px: 3, py: 2, justifyContent: 'space-between' }}>
        <Typography variant="body2" color="text.secondary">
          {isZh 
            ? `共 ${filteredResources.length} 个语料库${filteredResources.length !== resources.length ? ` (筛选自 ${resources.length} 个)` : ''}`
            : `${filteredResources.length} resources${filteredResources.length !== resources.length ? ` (filtered from ${resources.length})` : ''}`
          }
        </Typography>
        <Stack direction="row" spacing={1}>
          <Button onClick={onClose} color="inherit">
            {isZh ? '取消' : 'Cancel'}
          </Button>
          <Button
            variant="contained"
            onClick={handleConfirm}
            disabled={!tempSelectedId}
          >
            {isZh ? '确认选择' : 'Confirm'}
          </Button>
        </Stack>
      </DialogActions>
    </Dialog>
  )
}

export default CorpusResourceDialog
