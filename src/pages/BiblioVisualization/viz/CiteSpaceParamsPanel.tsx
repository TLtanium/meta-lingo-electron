/**
 * CiteSpaceParamsPanel — shared controls for cluster and timeline charts.
 *
 * Layout:
 *   Left label col (52 px, muted) + right content col (flex:1)
 *   • Algorithm selects  → 2 × 2 grid
 *   • Continuous params  → 2-column slider grid (label + live value above, track below)
 *   • Switches           → inline row
 */

import {
  Box, Stack, FormControl, InputLabel, Select, MenuItem, Typography,
  FormControlLabel, Switch,
} from '@mui/material'
import { useTranslation } from 'react-i18next'
import { NumberInput } from '../../../components/common'
import type { CiteSpaceParams } from '../../../types/biblio'
import { ParamRow, SliderParam } from './ParamComponents'

interface Props {
  params: CiteSpaceParams
  onChange: (patch: Partial<CiteSpaceParams>) => void
  labelMetric: 'frequency' | 'centrality' | 'degree'
  onLabelMetricChange: (v: 'frequency' | 'centrality' | 'degree') => void
  labelThreshold: number
  onLabelThresholdChange: (v: number) => void
  showFrequency: boolean
  onShowFrequencyChange: (v: boolean) => void
  clusterLabelFontSize: number
  onClusterLabelFontSizeChange: (v: number) => void
  clusterLabelMaxLength: number
  onClusterLabelMaxLengthChange: (v: number) => void
  showLinkLabels: boolean
  onShowLinkLabelsChange: (v: boolean) => void
  showLinkStrengths: boolean
  onShowLinkStrengthsChange: (v: boolean) => void
  /** Ranking metric for the term/diamond label layer */
  termLabelMetric: 'degree' | 'frequency' | 'centrality' | 'eigen' | 'sigma' | 'hide'
  onTermLabelMetricChange: (v: 'degree' | 'frequency' | 'centrality' | 'eigen' | 'sigma' | 'hide') => void
  /** Ranking metric for the reference/circle label layer */
  refLabelMetric: 'degree' | 'frequency' | 'centrality' | 'eigen' | 'sigma' | 'hide'
  onRefLabelMetricChange: (v: 'degree' | 'frequency' | 'centrality' | 'eigen' | 'sigma' | 'hide') => void
}

const METRIC_OPTIONS = ['degree', 'frequency', 'centrality', 'eigen', 'sigma', 'hide'] as const

const SWITCH_SX = { '& .MuiFormControlLabel-label': { fontSize: '0.75rem' } }

export default function CiteSpaceParamsPanel({
  params, onChange,
  labelMetric, onLabelMetricChange,
  labelThreshold, onLabelThresholdChange,
  showFrequency, onShowFrequencyChange,
  clusterLabelFontSize, onClusterLabelFontSizeChange,
  clusterLabelMaxLength, onClusterLabelMaxLengthChange,
  showLinkLabels, onShowLinkLabelsChange,
  showLinkStrengths, onShowLinkStrengthsChange,
  termLabelMetric, onTermLabelMetricChange,
  refLabelMetric, onRefLabelMetricChange,
}: Props) {
  const { t } = useTranslation()
  const mode = params.selection_mode || 'top_n'

  return (
    <Box>
      <Typography variant="overline" color="text.secondary">{t('biblio.cs.section')}</Typography>
      <Stack spacing={3} sx={{ mt: 1 }}>

        {/* ── 时间：3个输入等宽一行，开关单独一行 ─────────────── */}
        <ParamRow label={t('biblio.cs.rowTime')}>
          <Stack spacing={1.25}>
            <Box sx={{ display: 'flex', gap: 0.75 }}>
              <NumberInput label={t('biblio.cs.yearFrom')} size="small" value={params.year_from ?? 0}
                onChange={(v) => onChange({ year_from: v || undefined })}
                min={0} max={2100} step={1} integer sx={{ flex: '1 1 0', minWidth: 72 }} />
              <NumberInput label={t('biblio.cs.yearTo')} size="small" value={params.year_to ?? 0}
                onChange={(v) => onChange({ year_to: v || undefined })}
                min={0} max={2100} step={1} integer sx={{ flex: '1 1 0', minWidth: 72 }} />
              <NumberInput label={t('biblio.cs.yearsPerSlice')} size="small" value={params.years_per_slice ?? 1}
                onChange={(v) => onChange({ years_per_slice: v })}
                min={1} max={20} step={1} integer defaultValue={1} sx={{ flex: '1 1 0', minWidth: 72 }} />
            </Box>
            <FormControlLabel
              control={<Switch size="small" checked={params.across_slices ?? false}
                onChange={(e) => onChange({ across_slices: e.target.checked })} />}
              label={t('biblio.cs.acrossSlices')}
              sx={{ ...SWITCH_SX, ml: 0.25 }} />
          </Stack>
        </ParamRow>

        {/* ── 节点选择：Select 弹性宽，参数跟随 ───────────────── */}
        <ParamRow label={t('biblio.cs.rowSelect')}>
          <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'flex-end' }}>
            <FormControl size="small" sx={{ flex: '1 1 0', minWidth: 0 }}>
              <InputLabel>{t('biblio.cs.selection')}</InputLabel>
              <Select value={mode} label={t('biblio.cs.selection')}
                onChange={(e) => onChange({ selection_mode: e.target.value as CiteSpaceParams['selection_mode'] })}>
                <MenuItem value="g_index">g-index</MenuItem>
                <MenuItem value="top_n">Top N</MenuItem>
                <MenuItem value="top_n_percent">Top N%</MenuItem>
                <MenuItem value="thresholds">Thresholds</MenuItem>
              </Select>
            </FormControl>
            {mode === 'g_index' && (
              <NumberInput label={t('biblio.cs.gIndexK')} size="small" value={params.g_index_k ?? 25}
                onChange={(v) => onChange({ g_index_k: v })} min={1} max={100} step={1} integer defaultValue={25}
                sx={{ flex: '1 1 0', minWidth: 72 }} />
            )}
            {mode === 'top_n' && (
              <NumberInput label="Top N" size="small" value={params.top_n ?? 50}
                onChange={(v) => onChange({ top_n: v })} min={5} max={500} step={5} integer defaultValue={50}
                sx={{ flex: '1 1 0', minWidth: 72 }} />
            )}
            {mode === 'top_n_percent' && (
              <NumberInput label="Top N%" size="small" value={params.top_n_percent ?? 10}
                onChange={(v) => onChange({ top_n_percent: v })} min={1} max={100} step={1} defaultValue={10}
                sx={{ flex: '1 1 0', minWidth: 72 }} />
            )}
            {mode === 'thresholds' && (
              <>
                <NumberInput label="c" size="small" value={params.threshold_c ?? 1}
                  onChange={(v) => onChange({ threshold_c: v })} min={1} max={100} step={1} integer defaultValue={1}
                  sx={{ flex: '1 1 0', minWidth: 60 }} />
                <NumberInput label="cc" size="small" value={params.threshold_cc ?? 1}
                  onChange={(v) => onChange({ threshold_cc: v })} min={1} max={100} step={1} integer defaultValue={1}
                  sx={{ flex: '1 1 0', minWidth: 60 }} />
                <NumberInput label="ccv" size="small" value={params.threshold_ccv ?? 0}
                  onChange={(v) => onChange({ threshold_ccv: v })} min={0} max={1} step={0.05} defaultValue={0}
                  sx={{ flex: '1 1 0', minWidth: 60 }} />
              </>
            )}
          </Box>
        </ParamRow>

        {/* ── 算法：4个下拉等宽一行 ─────────────────────────────── */}
        <ParamRow label={t('biblio.cs.rowNetwork')}>
          <Stack direction="row" spacing={0.75} sx={{ '& .MuiFormControl-root': { flex: '1 1 0', minWidth: 0 } }}>
            <FormControl size="small">
              <InputLabel>{t('biblio.cs.linkStrength')}</InputLabel>
              <Select value={params.link_strength || 'cosine'} label={t('biblio.cs.linkStrength')}
                onChange={(e) => onChange({ link_strength: e.target.value as CiteSpaceParams['link_strength'] })}>
                <MenuItem value="cosine">Cosine</MenuItem>
                <MenuItem value="dice">Dice</MenuItem>
                <MenuItem value="jaccard">Jaccard</MenuItem>
                <MenuItem value="cooccurrence">{t('biblio.cs.cooccurrence')}</MenuItem>
              </Select>
            </FormControl>
            <FormControl size="small">
              <InputLabel>{t('biblio.cs.pruning')}</InputLabel>
              <Select value={params.pruning || 'none'} label={t('biblio.cs.pruning')}
                onChange={(e) => onChange({ pruning: e.target.value as CiteSpaceParams['pruning'] })}>
                <MenuItem value="none">{t('biblio.cs.pruneNone')}</MenuItem>
                <MenuItem value="pathfinder">Pathfinder</MenuItem>
                <MenuItem value="mst">MST</MenuItem>
              </Select>
            </FormControl>
            <FormControl size="small">
              <InputLabel>{t('biblio.cs.clustering')}</InputLabel>
              <Select value={params.clustering_algorithm || 'louvain'} label={t('biblio.cs.clustering')}
                onChange={(e) => onChange({ clustering_algorithm: e.target.value as CiteSpaceParams['clustering_algorithm'] })}>
                <MenuItem value="louvain">Louvain</MenuItem>
                <MenuItem value="spectral">{t('biblio.cs.spectral')}</MenuItem>
              </Select>
            </FormControl>
            <FormControl size="small">
              <InputLabel>{t('biblio.cs.labelAlgo')}</InputLabel>
              <Select value={params.label_algorithm || 'llr'} label={t('biblio.cs.labelAlgo')}
                onChange={(e) => onChange({ label_algorithm: e.target.value as CiteSpaceParams['label_algorithm'] })}>
                <MenuItem value="llr">LLR</MenuItem>
                <MenuItem value="tfidf">TF-IDF</MenuItem>
                <MenuItem value="mi">MI</MenuItem>
              </Select>
            </FormControl>
          </Stack>
        </ParamRow>

        {/* ── 节点标签：Select + 2滑块同行3列 ─────────────────── */}
        <ParamRow label={t('biblio.cs.rowNodeLabel')}>
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0 12px', alignItems: 'center' }}>
            <FormControl size="small">
              <InputLabel>{t('biblio.cs.nodeLabels')}</InputLabel>
              <Select value={labelMetric} label={t('biblio.cs.nodeLabels')}
                onChange={(e) => onLabelMetricChange(e.target.value as 'frequency' | 'centrality' | 'degree')}>
                <MenuItem value="frequency">{t('biblio.cs.byFrequency')}</MenuItem>
                <MenuItem value="centrality">{t('biblio.cs.byCentrality')}</MenuItem>
                <MenuItem value="degree">{t('biblio.cs.byDegree')}</MenuItem>
              </Select>
            </FormControl>
            <SliderParam
              label={t('biblio.cs.labelThreshold')} value={labelThreshold}
              min={0} max={50} step={1} onChange={onLabelThresholdChange} />
            <SliderParam
              label={t('biblio.cs.maxNodes')} value={params.max_nodes ?? 200}
              min={20} max={500} step={10} onChange={(v) => onChange({ max_nodes: v })} />
          </Box>
        </ParamRow>

        {/* ── 双标签层：词项(菱形) / 引用(圆形) 指标选择 ───────── */}
        <ParamRow label={t('biblio.cs.rowLayers')}>
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
            <FormControl size="small">
              <InputLabel>{t('biblio.cs.termLayerMetric')}</InputLabel>
              <Select value={termLabelMetric} label={t('biblio.cs.termLayerMetric')}
                onChange={(e) => onTermLabelMetricChange(e.target.value as typeof termLabelMetric)}>
                {METRIC_OPTIONS.map(m => (
                  <MenuItem key={m} value={m}>{t(`biblio.cs.metric.${m}`)}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl size="small">
              <InputLabel>{t('biblio.cs.refLayerMetric')}</InputLabel>
              <Select value={refLabelMetric} label={t('biblio.cs.refLayerMetric')}
                onChange={(e) => onRefLabelMetricChange(e.target.value as typeof refLabelMetric)}>
                {METRIC_OPTIONS.map(m => (
                  <MenuItem key={m} value={m}>{t(`biblio.cs.metric.${m}`)}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>
        </ParamRow>

        {/* ── 簇标签 2-col sliders ─────────────────────────────── */}
        <ParamRow label={t('biblio.cs.rowCluster')}>
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
            <SliderParam
              label={t('biblio.cs.clusterLabelFontSize')} value={clusterLabelFontSize}
              min={6} max={28} step={1} onChange={onClusterLabelFontSizeChange} />
            <SliderParam
              label={t('biblio.cs.clusterLabelMaxLength')} value={clusterLabelMaxLength}
              min={10} max={80} step={5} onChange={onClusterLabelMaxLengthChange} />
          </Box>
        </ParamRow>

        {/* ── 显示开关 ─────────────────────────────────────────── */}
        <ParamRow label={t('biblio.cs.rowDisplay')}>
          <Stack direction="row" sx={{ gap: 2, flexWrap: 'wrap', pt: '2px' }}>
            <FormControlLabel
              control={<Switch size="small" checked={showFrequency}
                onChange={(e) => onShowFrequencyChange(e.target.checked)} />}
              label={t('biblio.cs.showFrequency')} sx={SWITCH_SX} />
            <FormControlLabel
              control={<Switch size="small" checked={showLinkLabels}
                onChange={(e) => onShowLinkLabelsChange(e.target.checked)} />}
              label={t('biblio.cs.showLinkLabels')} sx={SWITCH_SX} />
            <FormControlLabel
              control={<Switch size="small" checked={showLinkStrengths}
                onChange={(e) => onShowLinkStrengthsChange(e.target.checked)} />}
              label={t('biblio.cs.showLinkStrengths')} sx={SWITCH_SX} />
          </Stack>
        </ParamRow>

      </Stack>
    </Box>
  )
}
