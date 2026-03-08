/**
 * Unified Corpus or Literature selector for analysis modules.
 * Outputs { corpusId, textIds } for use with existing analysis APIs (shadow corpus for literature).
 */

import { useState, useEffect, useMemo, useRef } from 'react'
import {
  Box,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  OutlinedInput,
  Checkbox,
  ListItemText,
  Button,
  Typography,
  Paper,
  Divider,
  FormControlLabel,
  Stack,
  SelectChangeEvent,
  RadioGroup,
  Radio,
  Alert,
  CircularProgress,
  TextField,
  InputAdornment,
  ToggleButtonGroup,
  ToggleButton
} from '@mui/material'
import SearchIcon from '@mui/icons-material/Search'
import MenuBookIcon from '@mui/icons-material/MenuBook'
import StorageIcon from '@mui/icons-material/Storage'
import { useTranslation } from 'react-i18next'
import { corpusApi } from '../../api'
import * as biblioApi from '../../api/biblio'
import type { Corpus, CorpusText } from '../../types'
import type { BiblioLibrary, BiblioEntry } from '../../types/biblio'

export type DataSourceType = 'corpus' | 'library'

export type SelectionMode = 'all' | 'selected' | 'tags' | 'keywords'

export interface CorpusOrLibrarySelection {
  corpusId: string
  textIds: string[] | 'all'
  language: string
  dataSource: DataSourceType
  selectionMode: SelectionMode
  selectedTags?: string[]
  selectedKeywords?: string[]
  /** When dataSource is 'library', the library id for syncing selector on cross-link */
  libraryId?: string
  /** When dataSource is 'library' and selectionMode is 'selected', entry IDs for restoring manual selection on cross-link */
  selectedEntryIds?: string[]
  /** For corpus mode: all texts in the selected corpus (e.g. for dynamic topic date counting) */
  allTexts?: CorpusText[]
  /** When dataSource is 'library': text_id -> date string (year) for dynamic topic from entry year */
  textDates?: Record<string, string>
}

interface CorpusOrLibrarySelectorProps {
  onSelectionChange: (selection: CorpusOrLibrarySelection | null) => void
  /** Section title above the selector */
  sectionTitle?: string
  /** Use compact layout (e.g. inside another panel) */
  compact?: boolean
  /** When set (e.g. from crossLinkParams), sync selector to this selection so corpus/library choice is visible */
  externalSelection?: CorpusOrLibrarySelection | null
  /** When set (e.g. 10000), do not include allTexts in selection when text count exceeds this (avoids huge arrays for keyness reference corpus) */
  capAllTextsAt?: number
}

const PAGE_SIZE_ENTRIES = 500

export default function CorpusOrLibrarySelector({
  onSelectionChange,
  sectionTitle,
  compact = false,
  externalSelection = null,
  capAllTextsAt
}: CorpusOrLibrarySelectorProps) {
  const { t } = useTranslation()

  // Data source toggle
  const [dataSource, setDataSource] = useState<DataSourceType>('corpus')

  // Corpus state
  const [corpora, setCorpora] = useState<Corpus[]>([])
  const [selectedCorpus, setSelectedCorpus] = useState<Corpus | null>(null)
  const [texts, setTexts] = useState<CorpusText[]>([])
  const [loadingCorpora, setLoadingCorpora] = useState(false)
  const [loadingTexts, setLoadingTexts] = useState(false)
  const [corpusSelectionMode, setCorpusSelectionMode] = useState<'all' | 'selected' | 'tags'>('all')
  const [selectedTextIds, setSelectedTextIds] = useState<string[]>([])
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [textSearch, setTextSearch] = useState('')

  // Library state
  const [libraries, setLibraries] = useState<BiblioLibrary[]>([])
  const [selectedLibrary, setSelectedLibrary] = useState<BiblioLibrary | null>(null)
  const [entries, setEntries] = useState<BiblioEntry[]>([])
  const [filterOptions, setFilterOptions] = useState<{ keywords: string[] }>({ keywords: [] })
  const [loadingLibraries, setLoadingLibraries] = useState(false)
  const [loadingEntries, setLoadingEntries] = useState(false)
  const [librarySelectionMode, setLibrarySelectionMode] = useState<'all' | 'keywords' | 'selected'>('all')
  const [selectedKeywordFilters, setSelectedKeywordFilters] = useState<string[]>([])
  const [selectedEntryIds, setSelectedEntryIds] = useState<string[]>([])
  const [entrySearch, setEntrySearch] = useState('')
  const lastEmittedRef = useRef<string | null>(null)
  const lastExternalKeyRef = useRef<string | null>(null)
  const lastLoadedLibraryIdRef = useRef<string | null>(null)

  const entriesWithTextId = useMemo(() => entries.filter(e => e.text_id), [entries])

  // Load corpora (excluding biblio shadow corpora are already excluded by API)
  useEffect(() => {
    loadCorpora()
  }, [])

  // Load libraries when switching to library
  useEffect(() => {
    if (dataSource === 'library') {
      loadLibraries()
    }
  }, [dataSource])

  // Load library detail (corpus_id) and entries/filter-options when library selected
  useEffect(() => {
    if (dataSource === 'library' && selectedLibrary) {
      loadLibraryDetail()
      if (lastLoadedLibraryIdRef.current !== selectedLibrary.id) {
        lastLoadedLibraryIdRef.current = selectedLibrary.id
        loadEntries()
        loadFilterOptions()
      }
    } else if (dataSource === 'library') {
      // Don't clear when applying external selection: listLibraries() will set selectedLibrary soon
      if (!externalSelection?.libraryId) {
        lastLoadedLibraryIdRef.current = null
        setEntries([])
        setFilterOptions({ keywords: [] })
        setSelectedEntryIds([])
        setSelectedKeywordFilters([])
      }
    }
  }, [dataSource, selectedLibrary, externalSelection?.libraryId])

  // Load texts when corpus selected
  useEffect(() => {
    if (dataSource === 'corpus' && selectedCorpus) {
      loadTexts(selectedCorpus.id)
    } else if (dataSource === 'corpus') {
      setTexts([])
      setSelectedTextIds([])
      setSelectedTags([])
    }
  }, [dataSource, selectedCorpus])

  // Sync from external selection (e.g. crossLinkParams) so selector shows the same corpus/library
  useEffect(() => {
    if (!externalSelection?.corpusId) return
    const key = externalSelection.libraryId
      ? `lib:${externalSelection.libraryId}:${externalSelection.textIds === 'all' ? 'all' : (externalSelection.textIds as string[]).length}`
      : `corpus:${externalSelection.corpusId}:${externalSelection.textIds === 'all' ? 'all' : (externalSelection.textIds as string[]).length}`
    // Only skip if we already applied: library branch sets ref when entering; corpus branch only when we found and set the corpus
    if (lastExternalKeyRef.current === key) {
      if (externalSelection.libraryId) return
      if (selectedCorpus?.id === externalSelection.corpusId) return
    }

    if (externalSelection.libraryId) {
      lastExternalKeyRef.current = key
      setDataSource('library')
      biblioApi.listLibraries().then(res => {
        if (res.success && res.data?.libraries) {
          setLibraries(res.data.libraries)
          const lib = res.data.libraries.find((l: BiblioLibrary) => l.id === externalSelection!.libraryId)
          if (lib) setSelectedLibrary(lib)
        }
      })
      if (externalSelection.selectionMode === 'keywords' || (externalSelection.selectedKeywords ?? externalSelection.selectedTags)?.length) {
        setLibrarySelectionMode('keywords')
        setSelectedKeywordFilters((externalSelection.selectedKeywords ?? externalSelection.selectedTags) || [])
      } else if (externalSelection.selectionMode === 'selected' && Array.isArray(externalSelection.textIds)) {
        setLibrarySelectionMode('selected')
        if (externalSelection.selectedEntryIds?.length) {
          setSelectedEntryIds(externalSelection.selectedEntryIds)
        }
      }
    } else {
      if (corpora.length > 0) {
        const c = corpora.find(x => x.id === externalSelection.corpusId)
        if (c) {
          lastExternalKeyRef.current = key
          setDataSource('corpus')
          setSelectedCorpus(c)
          setCorpusSelectionMode(
            externalSelection.selectionMode === 'tags' ? 'tags' :
            externalSelection.selectionMode === 'selected' ? 'selected' : 'all'
          )
          if (externalSelection.selectionMode === 'tags' && (externalSelection.selectedTags?.length || externalSelection.selectedKeywords?.length)) {
            setSelectedTags(externalSelection.selectedTags ?? externalSelection.selectedKeywords ?? [])
          }
          if (externalSelection.selectionMode === 'selected' && Array.isArray(externalSelection.textIds)) {
            setSelectedTextIds(externalSelection.textIds)
          }
        }
      }
    }
  }, [externalSelection, corpora, selectedCorpus?.id])

  // When syncing to library with selected text ids, set selectedEntryIds after entries load (only if not already set from selectedEntryIds)
  useEffect(() => {
    if (!externalSelection?.libraryId || externalSelection.selectionMode !== 'selected' || !Array.isArray(externalSelection.textIds) || entriesWithTextId.length === 0) return
    if (externalSelection.selectedEntryIds?.length) return
    const ids = new Set(externalSelection.textIds)
    const entryIds = entriesWithTextId.filter(e => e.text_id && ids.has(e.text_id)).map(e => e.id)
    if (entryIds.length > 0) setSelectedEntryIds(entryIds)
  }, [externalSelection?.libraryId, externalSelection?.selectionMode, externalSelection?.textIds, externalSelection?.selectedEntryIds, entriesWithTextId])

  const loadCorpora = async () => {
    setLoadingCorpora(true)
    try {
      const res = await corpusApi.listCorpora()
      if (res.success && res.data) setCorpora(res.data)
    } catch (e) {
      console.error('Failed to load corpora', e)
    } finally {
      setLoadingCorpora(false)
    }
  }

  const loadTexts = async (corpusId: string) => {
    setLoadingTexts(true)
    try {
      const res = await corpusApi.getTexts(corpusId)
      if (res.success && res.data) setTexts(res.data)
    } catch (e) {
      console.error('Failed to load texts', e)
    } finally {
      setLoadingTexts(false)
    }
  }

  const loadLibraries = async () => {
    setLoadingLibraries(true)
    try {
      const res = await biblioApi.listLibraries()
      if (res.success && res.data?.libraries) setLibraries(res.data.libraries)
    } catch (e) {
      console.error('Failed to load libraries', e)
    } finally {
      setLoadingLibraries(false)
    }
  }

  const loadLibraryDetail = async () => {
    if (!selectedLibrary) return
    try {
      const res = await biblioApi.getLibrary(selectedLibrary.id)
      if (res.success && res.data?.corpus_id) {
        setSelectedLibrary(prev => prev ? { ...prev, corpus_id: res.data!.corpus_id } : null)
      }
    } catch (e) {
      console.error('Failed to load library detail', e)
    }
  }

  const loadEntries = async () => {
    if (!selectedLibrary) return
    setLoadingEntries(true)
    try {
      const res = await biblioApi.listEntries({
        libraryId: selectedLibrary.id,
        page: 1,
        pageSize: PAGE_SIZE_ENTRIES,
        includeStatus: true
      })
      if (res.success && res.data?.entries) setEntries(res.data.entries)
    } catch (e) {
      console.error('Failed to load entries', e)
    } finally {
      setLoadingEntries(false)
    }
  }

  const loadFilterOptions = async () => {
    if (!selectedLibrary) return
    try {
      const res = await biblioApi.getFilterOptions(selectedLibrary.id)
      if (res.success && res.data) setFilterOptions({ keywords: res.data.keywords || [] })
    } catch (e) {
      console.error('Failed to load filter options', e)
    }
  }

  const allTags = useMemo(() => {
    const s = new Set<string>()
    texts.forEach(t => t.tags.forEach(tag => s.add(tag)))
    return Array.from(s).sort()
  }, [texts])

  const filteredTexts = useMemo(() => {
    let r = texts
    if (textSearch) {
      const q = textSearch.toLowerCase()
      r = r.filter(t => (t.filename || '').toLowerCase().includes(q) || (t.originalFilename || '').toLowerCase().includes(q))
    }
    if (corpusSelectionMode === 'tags' && selectedTags.length > 0) {
      r = r.filter(t => selectedTags.some(tag => t.tags.includes(tag)))
    }
    return r
  }, [texts, textSearch, corpusSelectionMode, selectedTags])

  const filteredEntries = useMemo(() => {
    let r = entriesWithTextId
    if (librarySelectionMode === 'keywords' && selectedKeywordFilters.length > 0) {
      r = r.filter(e => (e.keywords || []).some(k => selectedKeywordFilters.includes(k)))
    }
    if (entrySearch) {
      const q = entrySearch.toLowerCase()
      r = r.filter(e => (e.title || '').toLowerCase().includes(q))
    }
    return r
  }, [entriesWithTextId, librarySelectionMode, selectedKeywordFilters, entrySearch])

  const corpusTextIds = useMemo((): string[] | 'all' => {
    if (!selectedCorpus) return 'all'
    switch (corpusSelectionMode) {
      case 'all':
        return 'all'
      case 'tags':
        return filteredTexts.map(t => t.id)
      case 'selected':
        return selectedTextIds
      default:
        return []
    }
  }, [selectedCorpus, corpusSelectionMode, filteredTexts, selectedTextIds])

  const libraryTextIds = useMemo((): string[] | 'all' => {
    if (!selectedLibrary?.corpus_id) return 'all'
    switch (librarySelectionMode) {
      case 'all':
        return 'all'
      case 'keywords':
        return filteredEntries.map(e => e.text_id!).filter(Boolean)
      case 'selected':
        return entriesWithTextId
          .filter(e => selectedEntryIds.includes(e.id))
          .map(e => e.text_id!)
          .filter(Boolean)
      default:
        return []
    }
  }, [selectedLibrary, librarySelectionMode, entriesWithTextId, filteredEntries, selectedEntryIds])

  useEffect(() => {
    let next: CorpusOrLibrarySelection | null = null
    let key: string

    if (dataSource === 'corpus' && selectedCorpus) {
      const ids = corpusTextIds
      const count = ids === 'all' ? texts.length : ids.length
      if (count > 0) {
        next = {
          corpusId: selectedCorpus.id,
          textIds: corpusTextIds,
          language: selectedCorpus.language || 'english',
          dataSource: 'corpus',
          selectionMode: corpusSelectionMode,
          selectedTags: corpusSelectionMode === 'tags' ? selectedTags : undefined,
          ...(capAllTextsAt == null || texts.length <= capAllTextsAt ? { allTexts: texts } : {})
        }
        const idsKey = ids === 'all' ? `all:${texts.length}` : (ids as string[]).slice(0, 10).join(',') + `:${(ids as string[]).length}`
        key = `corpus:${selectedCorpus.id}:${corpusSelectionMode}:${idsKey}`
      } else {
        key = 'null'
      }
    } else if (dataSource === 'library' && selectedLibrary?.corpus_id) {
      const ids = libraryTextIds
      const allCount = ids === 'all' ? entriesWithTextId.length : ids.length
      if (allCount > 0) {
        const libraryEntries = librarySelectionMode === 'all'
          ? entriesWithTextId
          : librarySelectionMode === 'keywords'
            ? filteredEntries
            : entriesWithTextId.filter(e => selectedEntryIds.includes(e.id))
        const textDates: Record<string, string> = {}
        libraryEntries.forEach(e => {
          if (!e.text_id) return
          const y = (e as { year?: number | string }).year ?? (e as Record<string, unknown>).year
          if (y != null && y !== '') {
            const yearNum = typeof y === 'number' ? y : parseInt(String(y), 10)
            if (!Number.isNaN(yearNum)) textDates[e.text_id] = String(yearNum)
          }
        })
        next = {
          corpusId: selectedLibrary.corpus_id,
          textIds: libraryTextIds,
          language: selectedLibrary.language || 'english',
          dataSource: 'library',
          selectionMode: librarySelectionMode === 'keywords' ? 'keywords' : librarySelectionMode === 'selected' ? 'selected' : 'all',
          selectedKeywords: librarySelectionMode === 'keywords' ? selectedKeywordFilters : undefined,
          libraryId: selectedLibrary.id,
          ...(librarySelectionMode === 'selected' && selectedEntryIds.length > 0 && { selectedEntryIds }),
          textDates: Object.keys(textDates).length > 0 ? textDates : undefined
        }
        const idsKey = ids === 'all' ? `all:${entriesWithTextId.length}` : (ids as string[]).slice(0, 10).join(',') + `:${(ids as string[]).length}`
        key = `library:${selectedLibrary.corpus_id}:${librarySelectionMode}:${idsKey}`
      } else {
        key = 'null'
      }
    } else {
      key = 'null'
    }

    if (lastEmittedRef.current !== key) {
      lastEmittedRef.current = key
      onSelectionChange(next)
    }
    // Use stable deps only: avoid texts / filteredEntries (new ref every render) to prevent effect loop and stack overflow
  }, [dataSource, selectedCorpus, selectedLibrary, corpusTextIds, libraryTextIds, corpusSelectionMode, librarySelectionMode, selectedTags, selectedKeywordFilters, selectedTextIds, selectedEntryIds, texts.length, entriesWithTextId.length])

  const handleCorpusChange = (e: SelectChangeEvent<string>) => {
    const c = corpora.find(x => x.id === e.target.value)
    setSelectedCorpus(c || null)
    setCorpusSelectionMode('all')
    setSelectedTextIds([])
    setSelectedTags([])
  }

  const handleLibraryChange = (e: SelectChangeEvent<string>) => {
    const lib = libraries.find(x => x.id === e.target.value)
    setSelectedLibrary(lib || null)
    setLibrarySelectionMode('all')
    setSelectedEntryIds([])
    setSelectedKeywordFilters([])
  }

  const selectedCount = dataSource === 'corpus'
    ? (corpusTextIds === 'all' ? texts.length : corpusTextIds.length)
    : (libraryTextIds === 'all' ? entriesWithTextId.length : libraryTextIds.length)

  return (
    <Paper sx={compact ? { p: 1.5 } : { p: 2, mb: 2 }}>
      {sectionTitle && (
        <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1.5 }}>
          {sectionTitle}
        </Typography>
      )}

      <Stack spacing={2}>
        <ToggleButtonGroup
          value={dataSource}
          exclusive
          onChange={(_, v) => v && setDataSource(v)}
          size="small"
          fullWidth
        >
          <ToggleButton value="corpus">
            <StorageIcon sx={{ mr: 0.5 }} />
            {t('common.dataSourceCorpus')}
          </ToggleButton>
          <ToggleButton value="library">
            <MenuBookIcon sx={{ mr: 0.5 }} />
            {t('common.dataSourceLibrary')}
          </ToggleButton>
        </ToggleButtonGroup>

        {dataSource === 'corpus' && (
          <>
            <FormControl fullWidth size="small">
              <InputLabel>{t('corpus.selectCorpus')}</InputLabel>
              <Select
                value={selectedCorpus?.id || ''}
                onChange={handleCorpusChange}
                label={t('corpus.selectCorpus')}
                disabled={loadingCorpora}
              >
                {corpora.map(c => (
                  <MenuItem key={c.id} value={c.id}>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Typography>{c.name}</Typography>
                      <Chip label={`${c.textCount} ${t('corpus.textsCount')}`} size="small" />
                    </Stack>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            {selectedCorpus && (
              <>
                <Divider />
                <RadioGroup
                  value={corpusSelectionMode}
                  onChange={e => setCorpusSelectionMode(e.target.value as 'all' | 'selected' | 'tags')}
                >
                  <FormControlLabel value="all" control={<Radio size="small" />} label={<Typography variant="body2">{t('wordFrequency.corpus.selectAll')} ({texts.length} {t('corpus.textsCount')})</Typography>} />
                  <FormControlLabel value="tags" control={<Radio size="small" />} label={<Typography variant="body2">{t('topicModeling.corpus.selectByTags')}</Typography>} />
                  <FormControlLabel value="selected" control={<Radio size="small" />} label={<Typography variant="body2">{t('wordFrequency.corpus.selectManually')}</Typography>} />
                </RadioGroup>

                {corpusSelectionMode === 'tags' && (
                  <FormControl size="small" fullWidth>
                    <InputLabel>{t('corpus.filterByTags')}</InputLabel>
                    <Select
                      multiple
                      value={selectedTags}
                      onChange={e => setSelectedTags(e.target.value as string[])}
                      input={<OutlinedInput label={t('corpus.filterByTags')} />}
                      renderValue={sel => (
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                          {(sel as string[]).map(tag => <Chip key={tag} label={tag} size="small" />)}
                        </Box>
                      )}
                    >
                      {allTags.map(tag => (
                        <MenuItem key={tag} value={tag}>
                          <Checkbox checked={selectedTags.includes(tag)} size="small" />
                          <ListItemText primary={tag} />
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                )}

                {corpusSelectionMode === 'selected' && (
                  <>
                    <TextField
                      size="small"
                      placeholder={t('common.search')}
                      value={textSearch}
                      onChange={e => setTextSearch(e.target.value)}
                      InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
                      fullWidth
                    />
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Typography variant="body2" color="text.secondary">{selectedTextIds.length} / {filteredTexts.length} {t('common.selected')}</Typography>
                      <Stack direction="row" spacing={1}>
                        <Button size="small" onClick={() => setSelectedTextIds(filteredTexts.map(t => t.id))}>{t('common.selectAll')}</Button>
                        <Button size="small" onClick={() => setSelectedTextIds([])}>{t('common.clearAll')}</Button>
                      </Stack>
                    </Box>
                    <Box sx={{ maxHeight: 150, overflow: 'auto', border: 1, borderColor: 'divider', borderRadius: 1 }}>
                      {loadingTexts ? <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}><CircularProgress size={24} /></Box> : filteredTexts.length === 0 ? (
                        <Typography variant="body2" color="text.secondary" sx={{ p: 2, textAlign: 'center' }}>{t('common.noData')}</Typography>
                      ) : (
                        filteredTexts.map(text => (
                          <FormControlLabel
                            key={text.id}
                            control={<Checkbox checked={selectedTextIds.includes(text.id)} onChange={() => setSelectedTextIds(prev => prev.includes(text.id) ? prev.filter(id => id !== text.id) : [...prev, text.id])} size="small" />}
                            label={<Typography variant="body2" noWrap sx={{ maxWidth: 200 }}>{text.filename}</Typography>}
                            sx={{ display: 'flex', width: '100%', m: 0, px: 1, '&:hover': { bgcolor: 'action.hover' } }}
                          />
                        ))
                      )}
                    </Box>
                  </>
                )}

                <Alert severity={selectedCount > 0 ? 'success' : 'warning'} icon={false} sx={{ py: 0.5 }}>
                  <Typography variant="body2">{t('wordFrequency.corpus.selectedCount')}: <strong>{selectedCount}</strong> {t('corpus.textsCount')}</Typography>
                </Alert>
              </>
            )}
          </>
        )}

        {dataSource === 'library' && (
          <>
            <FormControl fullWidth size="small">
              <InputLabel>{t('biblio.selectLibrary')}</InputLabel>
              <Select
                value={selectedLibrary?.id || ''}
                onChange={handleLibraryChange}
                label={t('biblio.selectLibrary')}
                disabled={loadingLibraries}
              >
                {libraries.map(lib => (
                  <MenuItem key={lib.id} value={lib.id}>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Typography>{lib.name}</Typography>
                      <Chip label={`${lib.entry_count} ${t('biblio.entries')}`} size="small" />
                    </Stack>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            {selectedLibrary && (
              <>
                <Divider />
                <RadioGroup
                  value={librarySelectionMode}
                  onChange={e => setLibrarySelectionMode(e.target.value as 'all' | 'keywords' | 'selected')}
                >
                  <FormControlLabel value="all" control={<Radio size="small" />} label={<Typography variant="body2">{t('biblio.selectAllLiterature')} ({entriesWithTextId.length})</Typography>} />
                  <FormControlLabel value="keywords" control={<Radio size="small" />} label={<Typography variant="body2">{t('biblio.filterByKeyword')}</Typography>} />
                  <FormControlLabel value="selected" control={<Radio size="small" />} label={<Typography variant="body2">{t('biblio.selectLiteratureManually')}</Typography>} />
                </RadioGroup>

                {librarySelectionMode === 'keywords' && (
                  <FormControl size="small" fullWidth>
                    <InputLabel>{t('biblio.keyword')}</InputLabel>
                    <Select
                      multiple
                      value={selectedKeywordFilters}
                      onChange={e => setSelectedKeywordFilters(e.target.value as string[])}
                      input={<OutlinedInput label={t('biblio.keyword')} />}
                      renderValue={sel => (
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                          {(sel as string[]).map(k => <Chip key={k} label={k} size="small" />)}
                        </Box>
                      )}
                    >
                      {filterOptions.keywords.slice(0, 200).map(kw => (
                        <MenuItem key={kw} value={kw}>
                          <Checkbox checked={selectedKeywordFilters.includes(kw)} size="small" />
                          <ListItemText primary={kw} />
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                )}

                {librarySelectionMode === 'selected' && (
                  <>
                    <TextField
                      size="small"
                      placeholder={t('common.search')}
                      value={entrySearch}
                      onChange={e => setEntrySearch(e.target.value)}
                      InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
                      fullWidth
                    />
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Typography variant="body2" color="text.secondary">{selectedEntryIds.length} / {filteredEntries.length} {t('common.selected')}</Typography>
                      <Stack direction="row" spacing={1}>
                        <Button size="small" onClick={() => setSelectedEntryIds(filteredEntries.map(e => e.id))}>{t('common.selectAll')}</Button>
                        <Button size="small" onClick={() => setSelectedEntryIds([])}>{t('common.clearAll')}</Button>
                      </Stack>
                    </Box>
                    <Box sx={{ maxHeight: 150, overflow: 'auto', border: 1, borderColor: 'divider', borderRadius: 1 }}>
                      {loadingEntries ? <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}><CircularProgress size={24} /></Box> : filteredEntries.length === 0 ? (
                        <Typography variant="body2" color="text.secondary" sx={{ p: 2, textAlign: 'center' }}>{t('common.noData')}</Typography>
                      ) : (
                        filteredEntries.map(entry => (
                          <FormControlLabel
                            key={entry.id}
                            control={<Checkbox checked={selectedEntryIds.includes(entry.id)} onChange={() => setSelectedEntryIds(prev => prev.includes(entry.id) ? prev.filter(id => id !== entry.id) : [...prev, entry.id])} size="small" />}
                            label={<Typography variant="body2" noWrap sx={{ maxWidth: 280 }}>{entry.title}</Typography>}
                            sx={{ display: 'flex', width: '100%', m: 0, px: 1, '&:hover': { bgcolor: 'action.hover' } }}
                          />
                        ))
                      )}
                    </Box>
                  </>
                )}

                <Alert severity={selectedCount > 0 ? 'success' : 'warning'} icon={false} sx={{ py: 0.5 }}>
                  <Typography variant="body2">{t('wordFrequency.corpus.selectedCount')}: <strong>{selectedCount}</strong> {t('corpus.textsCount')}</Typography>
                </Alert>
              </>
            )}
          </>
        )}
      </Stack>
    </Paper>
  )
}
