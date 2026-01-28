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
  Paper
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
const CORPUS_COLORS: Record<string, string> = {
  bnc: '#1976d2',
  brown: '#7b1fa2',
  now: '#388e3c',
  oanc: '#f57c00'
}

export const CorpusResourceDialog: React.FC<CorpusResourceDialogProps> = ({
  open,
  onClose,
  onSelect,
  selectedResourceId,
  title
}) => {
  const { t, i18n } = useTranslation()
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
      loadData()
      setTempSelectedId(selectedResourceId)
      // Reset filters when opening
      setSearchQuery('')
      setSelectedTags([])
      setSelectedPrefix('')
    }
  }, [open, selectedResourceId])

  const loadData = async () => {
    setLoading(true)
    setError(null)
    try {
      const lang = isZh ? 'zh' : 'en'
      const [resourcesRes, tagsRes] = await Promise.all([
        corpusResourceApi.list(lang),
        corpusResourceApi.getTags()
      ])

      // resourcesRes.data is CorpusResourceListResponse { success, data, total }
      if (resourcesRes.success && resourcesRes.data && resourcesRes.data.success) {
        setResources(resourcesRes.data.data || [])
      } else {
        setError(isZh ? '加载语料库资源失败' : 'Failed to load corpus resources')
      }
      
      // tagsRes.data is TagsListResponse { success, tags_en, tags_zh }
      if (tagsRes.success && tagsRes.data) {
        setAllTags({
          en: tagsRes.data.tags_en || [],
          zh: tagsRes.data.tags_zh || []
        })
      }
    } catch (err) {
      setError(isZh ? '加载语料库资源失败，请检查后端服务' : 'Failed to load corpus resources, please check backend service')
      console.error('Error loading corpus resources:', err)
    } finally {
      setLoading(false)
    }
  }

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
          <IconButton onClick={onClose} size="small">
            <CloseIcon />
          </IconButton>
        </Box>
      </DialogTitle>

      <Box sx={{ p: 2, bgcolor: 'grey.50' }}>
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
          {prefixes.map(prefix => (
            <Chip
              key={prefix}
              label={prefix.toUpperCase()}
              size="small"
              variant={selectedPrefix === prefix ? 'filled' : 'outlined'}
              onClick={() => setSelectedPrefix(selectedPrefix === prefix ? '' : prefix)}
              sx={{
                bgcolor: selectedPrefix === prefix ? CORPUS_COLORS[prefix] : 'transparent',
                borderColor: CORPUS_COLORS[prefix],
                color: selectedPrefix === prefix ? 'white' : CORPUS_COLORS[prefix],
                '&:hover': {
                  bgcolor: selectedPrefix === prefix ? CORPUS_COLORS[prefix] : `${CORPUS_COLORS[prefix]}15`
                }
              }}
            />
          ))}
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
