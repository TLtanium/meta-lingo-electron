/**
 * MDA results panel: single-row toolbar (summary chips + filter + view toggle
 * + select-all / copy / export-CSV icon buttons, fully matching the Metaphor
 * Analysis toolbar design) above the dimension score / feature statistics
 * tables. The CSV export icon opens a menu with the three MAT-style files.
 */

import { useMemo, useState } from 'react'
import {
  Box,
  Stack,
  Chip,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  IconButton,
  ToggleButtonGroup,
  ToggleButton,
  Tooltip,
  TextField,
  InputAdornment
} from '@mui/material'
import GridOnIcon from '@mui/icons-material/GridOn'
import BarChartIcon from '@mui/icons-material/BarChart'
import FunctionsIcon from '@mui/icons-material/Functions'
import SearchIcon from '@mui/icons-material/Search'
import SelectAllIcon from '@mui/icons-material/SelectAll'
import DeselectIcon from '@mui/icons-material/Deselect'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import FileDownloadIcon from '@mui/icons-material/FileDownload'
import { useTranslation } from 'react-i18next'
import type { MDAResponse, MDAFeatureSummary } from '../../../types/mdaAnalysis'
import { TEXT_TYPE_LABELS_ZH } from './biberReference'
import { exportDimensionsCsv, exportStatisticsCsv, exportZscoresCsv } from './mdaCsv'
import DimensionsTable from './DimensionsTable'
import FeaturesTable from './FeaturesTable'

import type { CorpusOrLibrarySelection } from '../../../components/Corpus/CorpusOrLibrarySelector'

interface ResultsPanelProps {
  result: MDAResponse
  /** Current corpus selection — powers the full cross-module action menu on contributing words */
  corpusSelection?: CorpusOrLibrarySelection | null
}

/** Feature filter predicate — must stay in sync with FeaturesTable */
function matchFeature(f: MDAFeatureSummary, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return (
    f.code.toLowerCase().includes(q)
    || f.name_en.toLowerCase().includes(q)
    || f.name_zh.includes(q)
  )
}

export default function ResultsPanel({ result, corpusSelection }: ResultsPanelProps) {
  const { t, i18n } = useTranslation()
  const isZh = i18n.language === 'zh'
  const [view, setView] = useState<'dimensions' | 'features'>('dimensions')
  const [exportAnchorEl, setExportAnchorEl] = useState<null | HTMLElement>(null)
  const [featureFilter, setFeatureFilter] = useState('')
  const [selectedTexts, setSelectedTexts] = useState<string[]>([])
  const [selectedFeatures, setSelectedFeatures] = useState<string[]>([])

  const corpus = result.corpus
  const filteredFeatureCodes = useMemo(
    () => (result.features ?? []).filter(f => matchFeature(f, featureFilter)).map(f => f.code),
    [result.features, featureFilter]
  )
  if (!corpus || !result.texts || !result.features) return null

  const typeLabel = isZh
    ? `${TEXT_TYPE_LABELS_ZH[corpus.closest_text_type] || corpus.closest_text_type}`
    : corpus.closest_text_type

  const selectedCount = view === 'dimensions' ? selectedTexts.length : selectedFeatures.length

  // Select / deselect ALL rows of the active view (filtered features only)
  const handleSelectAll = () => {
    if (view === 'dimensions') {
      const all = result.texts!.map(x => x.text_id)
      setSelectedTexts(selectedTexts.length === all.length ? [] : all)
    } else {
      setSelectedFeatures(
        selectedFeatures.length === filteredFeatureCodes.length ? [] : filteredFeatureCodes
      )
    }
  }
  const allSelected = view === 'dimensions'
    ? selectedTexts.length === result.texts.length && result.texts.length > 0
    : selectedFeatures.length === filteredFeatureCodes.length && filteredFeatureCodes.length > 0

  // Copy selected rows as TSV
  const handleCopySelected = () => {
    let text = ''
    if (view === 'dimensions') {
      text = result.texts!
        .filter(x => selectedTexts.includes(x.text_id))
        .map(x => [
          x.filename, x.tokens, x.awl.toFixed(2), x.ttr,
          ...[1, 2, 3, 4, 5, 6].map(d => (x.dimensions[String(d)] ?? 0).toFixed(2)),
          x.closest_text_type
        ].join('\t'))
        .join('\n')
    } else {
      text = result.features!
        .filter(f => selectedFeatures.includes(f.code))
        .map(f => [
          f.code, isZh ? f.name_zh : f.name_en, f.raw_total ?? '',
          f.mean.toFixed(2), f.sd.toFixed(2), f.zscore.toFixed(2)
        ].join('\t'))
        .join('\n')
    }
    navigator.clipboard.writeText(text)
  }

  const handleExport = (kind: 'dimensions' | 'statistics' | 'zscores') => {
    setExportAnchorEl(null)
    if (kind === 'dimensions') exportDimensionsCsv(result, 'corpus')
    else if (kind === 'statistics') exportStatisticsCsv(result, 'corpus')
    else exportZscoresCsv(result, 'corpus')
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Single-row toolbar: chips grow/wrap on the left, controls pinned right */}
      <Stack
        direction="row"
        spacing={1}
        alignItems="center"
        sx={{ px: 2, py: 1, borderBottom: 1, borderColor: 'divider' }}
      >
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap sx={{ flex: '1 1 auto', minWidth: 0 }}>
          <Chip size="small" variant="outlined" label={`${t('mda.summary.texts')}: ${corpus.text_count}`} />
          <Chip size="small" variant="outlined" label={`${t('mda.summary.tokens')}: ${corpus.total_tokens.toLocaleString()}`} />
          <Tooltip title={t('mda.summary.closestTypeHint')}>
            <Chip size="small" color="primary" label={`${t('mda.summary.closestType')}: ${typeLabel}`} />
          </Tooltip>
          {corpus.overused_features.length > 0 && (
            <Tooltip title={corpus.overused_features.join(', ')}>
              <Chip size="small" color="error" variant="outlined"
                label={`${t('mda.summary.overused')}: ${corpus.overused_features.length}`} />
            </Tooltip>
          )}
          {corpus.underused_features.length > 0 && (
            <Tooltip title={corpus.underused_features.join(', ')}>
              <Chip size="small" color="info" variant="outlined"
                label={`${t('mda.summary.underused')}: ${corpus.underused_features.length}`} />
            </Tooltip>
          )}
          {selectedCount > 0 && (
            <Chip
              label={`${isZh ? '已选' : 'Selected'}: ${selectedCount}`}
              size="small"
              color="primary"
            />
          )}
        </Stack>

        {/* Right-aligned control cluster (matches Metaphor Analysis) */}
        <Stack direction="row" spacing={0.5} alignItems="center" sx={{ flexShrink: 0 }}>
          {view === 'features' && (
            <TextField
              size="small"
              placeholder={t('mda.features.filterPlaceholder')}
              value={featureFilter}
              onChange={(e) => setFeatureFilter(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment>
                )
              }}
              sx={{ width: 240, minWidth: 140, flexShrink: 1 }}
            />
          )}
          {/* explicit spacer between filter box and view toggle */}
          {view === 'features' && <Box sx={{ width: 10, flexShrink: 0 }} />}
          <ToggleButtonGroup
            value={view}
            exclusive
            size="small"
            onChange={(_, v) => v && setView(v)}
          >
            <ToggleButton value="dimensions" sx={{ textTransform: 'none', py: 0.25 }}>
              {t('mda.results.dimensionsView')}
            </ToggleButton>
            <ToggleButton value="features" sx={{ textTransform: 'none', py: 0.25 }}>
              {t('mda.results.featuresView')}
            </ToggleButton>
          </ToggleButtonGroup>

          <Tooltip title={isZh ? '全选' : 'Select All'}>
            <IconButton size="small" onClick={handleSelectAll}>
              {allSelected ? <DeselectIcon /> : <SelectAllIcon />}
            </IconButton>
          </Tooltip>
          <Tooltip title={isZh ? '复制选中' : 'Copy Selected'}>
            <IconButton size="small" onClick={handleCopySelected} disabled={selectedCount === 0}>
              <ContentCopyIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title={t('mda.results.exportCsv')}>
            <IconButton size="small" onClick={(e) => setExportAnchorEl(e.currentTarget)}>
              <FileDownloadIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Menu
            anchorEl={exportAnchorEl}
            open={Boolean(exportAnchorEl)}
            onClose={() => setExportAnchorEl(null)}
          >
            <MenuItem onClick={() => handleExport('dimensions')}>
              <ListItemIcon><GridOnIcon fontSize="small" /></ListItemIcon>
              <ListItemText primary={t('mda.results.exportDimensions')} secondary="Dimensions" />
            </MenuItem>
            <MenuItem onClick={() => handleExport('statistics')}>
              <ListItemIcon><BarChartIcon fontSize="small" /></ListItemIcon>
              <ListItemText primary={t('mda.results.exportStatistics')} secondary="Statistics" />
            </MenuItem>
            <MenuItem onClick={() => handleExport('zscores')}>
              <ListItemIcon><FunctionsIcon fontSize="small" /></ListItemIcon>
              <ListItemText primary={t('mda.results.exportZscores')} secondary="Z-scores" />
            </MenuItem>
          </Menu>
        </Stack>
      </Stack>

      {/* Tables — fill the remaining height; each table manages its own
          scroll area and bottom pagination (same structure as Metaphor Analysis) */}
      <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {view === 'dimensions' ? (
          <DimensionsTable
            texts={result.texts}
            corpus={corpus}
            selected={selectedTexts}
            onSelectionChange={setSelectedTexts}
          />
        ) : (
          <FeaturesTable
            features={result.features}
            corpusSelection={corpusSelection}
            filter={featureFilter}
            selected={selectedFeatures}
            onSelectionChange={setSelectedFeatures}
          />
        )}
      </Box>
    </Box>
  )
}
