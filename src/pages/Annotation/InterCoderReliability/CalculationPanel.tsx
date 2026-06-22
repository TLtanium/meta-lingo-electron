/**
 * CalculationPanel - 计算参数配置组件
 *
 * 集合-单位版：参数采用科学默认值（token 单位 / MASI 距离 / 多数覆盖 /
 * 仅候选单位 / 重叠匹配），不再暴露给用户选择，避免"该选哪个"的困惑。
 * 界面只保留"选择要计算的系数"。所用口径在结果面板只读展示。
 */

import { useState, useEffect } from 'react'
import {
  Box,
  Typography,
  Paper,
  FormControlLabel,
  Checkbox,
  Button,
  Stack,
  Divider,
  CircularProgress,
  Alert,
  Grid,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Chip
} from '@mui/material'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import HelpOutlineIcon from '@mui/icons-material/HelpOutline'
import FilterAltIcon from '@mui/icons-material/FilterAlt'
import { useTranslation } from 'react-i18next'
import type {
  ReliabilityParams,
  CoefficientOptions,
  ValidationSummary,
  CoefficientResult
} from '../../../api/reliability'
import { reliabilityApi } from '../../../api/reliability'

interface CalculationPanelProps {
  validatedData: any | null
  dataSummary: ValidationSummary | null
  goldStandardIndex?: number
  onIncludedLabelsChange?: (labels: string[] | null) => void
  onCalculationComplete: (results: Record<string, CoefficientResult>, calculationSummary?: Record<string, any>) => void
  onError: (error: string) => void
}

export default function CalculationPanel({
  validatedData,
  dataSummary,
  goldStandardIndex,
  onIncludedLabelsChange,
  onCalculationComplete,
  onError
}: CalculationPanelProps) {
  const { t } = useTranslation()

  const [coefficients, setCoefficients] = useState<CoefficientOptions>({
    percent_agreement: true,
    scotts_pi: false,
    cohens_kappa: true,
    fleiss_kappa: true,
    krippendorff_alpha: true
  })
  const [calculating, setCalculating] = useState(false)
  const coderCount = dataSummary?.coder_count || 0

  // 标签筛选：检测到的全部标签 + 当前选中（默认全选）
  const allLabels = dataSummary?.labels || []
  const [selectedLabels, setSelectedLabels] = useState<string[]>([])
  const [labelDialogOpen, setLabelDialogOpen] = useState(false)

  // 数据变化时重置为全选
  useEffect(() => {
    setSelectedLabels(dataSummary?.labels || [])
  }, [dataSummary?.labels])

  // 把"实际生效的标签筛选"（null=全部）同步给父级，供 KWIC 等保持口径一致
  useEffect(() => {
    const derived =
      selectedLabels.length > 0 && selectedLabels.length < allLabels.length
        ? selectedLabels
        : null
    onIncludedLabelsChange?.(derived)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLabels, allLabels.length])

  const toggleLabel = (label: string) => {
    setSelectedLabels(prev =>
      prev.includes(label) ? prev.filter(l => l !== label) : [...prev, label]
    )
  }
  const allSelected = allLabels.length > 0 && selectedLabels.length === allLabels.length
  const ignoredCount = allLabels.length - selectedLabels.length

  const handleCoefficientChange = (key: keyof CoefficientOptions) => {
    setCoefficients(prev => ({ ...prev, [key]: !prev[key] }))
  }

  const handleCalculate = async () => {
    if (!validatedData) {
      onError(t('reliability.validateFirst', '请先验证数据'))
      return
    }
    setCalculating(true)
    try {
      // 标签筛选：全选或空选都视为"全部"（null）
      const includedLabels =
        selectedLabels.length > 0 && selectedLabels.length < allLabels.length
          ? selectedLabels
          : null
      // 科学默认口径，固定不暴露
      const params: ReliabilityParams = {
        unit: 'token',
        distance: 'masi',
        coverage: 'majority',
        include_empty: true,
        pr_matching: 'overlap',
        coefficients,
        gold_standard_index: goldStandardIndex,
        included_labels: includedLabels
      }
      const result = await reliabilityApi.calculateReliability(validatedData, params)
      if (result.success && result.data) {
        onCalculationComplete(result.data, result.summary)
      } else {
        onError(result.error || t('reliability.calcFailed', '计算失败'))
      }
    } catch (error) {
      console.error('Calculation error:', error)
      onError(t('reliability.calcError', '计算过程出错'))
    } finally {
      setCalculating(false)
    }
  }

  return (
    <Paper sx={{ p: 2 }}>
      <Typography variant="h6" gutterBottom>
        {t('reliability.calculationParams', '计算参数')}
      </Typography>

      {!validatedData ? (
        <Alert severity="info" sx={{ mb: 2 }}>
          {t('reliability.validateFirst', '请先验证数据后再配置计算参数')}
        </Alert>
      ) : (
        <Alert severity="success" sx={{ mb: 2 }}>
          {t('reliability.dataReady', '数据已就绪')}: {t('reliability.dataReadyDetail', '{{coders}} 个编码者，{{annotations}} 条标注', { coders: coderCount, annotations: dataSummary?.total_annotations })}
          {dataSummary?.token_source && (
            <> · {t('reliability.tokenSource', 'token 来源')}: {dataSummary.token_source} ({dataSummary.token_count})</>
          )}
        </Alert>
      )}

      <Stack spacing={3}>
        {/* 标签筛选 */}
        {allLabels.length > 0 && (
          <Box>
            <Stack direction="row" alignItems="center" justifyContent="space-between">
              <Stack direction="row" alignItems="center" spacing={0.5}>
                <Typography variant="subtitle2">{t('reliability.labelFilter', '标签筛选')}</Typography>
                <Tooltip title={t('reliability.labelFilterTip', '自动识别所有被标注过的标签；可只考虑部分标签（忽略其余）来分别计算信度')}>
                  <HelpOutlineIcon fontSize="small" color="action" />
                </Tooltip>
              </Stack>
              <Button
                size="small"
                variant="outlined"
                color={ignoredCount > 0 ? 'warning' : 'primary'}
                startIcon={<FilterAltIcon />}
                onClick={() => setLabelDialogOpen(true)}
              >
                {allSelected || ignoredCount === 0
                  ? t('reliability.allLabelsIncluded', '全部标签 ({{n}})', { n: allLabels.length })
                  : t('reliability.someLabelsSelected', '已选 {{n}}/{{m}}', { n: selectedLabels.length, m: allLabels.length })}
              </Button>
            </Stack>
          </Box>
        )}

        {/* 系数选择 */}
        <Box>
          <Typography variant="subtitle2" gutterBottom>
            {t('reliability.selectCoefficients', '选择要计算的系数')}
          </Typography>
          <Grid container spacing={1}>
            <Grid item xs={12}>
              <FormControlLabel
                control={<Checkbox checked={coefficients.percent_agreement} onChange={() => handleCoefficientChange('percent_agreement')} size="small" />}
                label={
                  <Stack direction="row" alignItems="center" spacing={0.5}>
                    <span>{t('reliability.checkboxPA', '平均配对百分比一致')}</span>
                    <Tooltip title={t('reliability.tooltipPA', '所有编码者配对的平均百分比一致性，按集合距离给渐进部分功劳')}>
                      <HelpOutlineIcon fontSize="small" color="action" />
                    </Tooltip>
                  </Stack>
                }
              />
            </Grid>
            <Grid item xs={12}>
              <FormControlLabel
                control={<Checkbox checked={coefficients.fleiss_kappa} onChange={() => handleCoefficientChange('fleiss_kappa')} size="small" />}
                label={
                  <Stack direction="row" alignItems="center" spacing={0.5}>
                    <span>{t('reliability.checkboxFK', "Fleiss' Kappa")}</span>
                    <Tooltip title={t('reliability.tooltipFK', '多编码者信度指标（二元集合相等）')}>
                      <HelpOutlineIcon fontSize="small" color="action" />
                    </Tooltip>
                  </Stack>
                }
              />
            </Grid>
            <Grid item xs={12}>
              <FormControlLabel
                control={<Checkbox checked={coefficients.cohens_kappa} onChange={() => handleCoefficientChange('cohens_kappa')} size="small" />}
                label={
                  <Stack direction="row" alignItems="center" spacing={0.5}>
                    <span>{t('reliability.checkboxCK', "平均配对Cohen's Kappa")}</span>
                    <Tooltip title={t('reliability.tooltipCK', '所有编码者配对的平均 Cohen Kappa（二元集合相等）')}>
                      <HelpOutlineIcon fontSize="small" color="action" />
                    </Tooltip>
                  </Stack>
                }
              />
            </Grid>
            <Grid item xs={12}>
              <FormControlLabel
                control={<Checkbox checked={coefficients.krippendorff_alpha} onChange={() => handleCoefficientChange('krippendorff_alpha')} size="small" />}
                label={
                  <Stack direction="row" alignItems="center" spacing={0.5}>
                    <span>{t('reliability.checkboxKA', "Krippendorff's Alpha")}</span>
                    <Tooltip title={t('reliability.tooltipKA', '最通用的信度指标，用 MASI 集合距离给渐进部分功劳')}>
                      <HelpOutlineIcon fontSize="small" color="action" />
                    </Tooltip>
                  </Stack>
                }
              />
            </Grid>
          </Grid>
        </Box>

        <Divider />

        <Button
          variant="contained"
          fullWidth
          size="large"
          onClick={handleCalculate}
          disabled={!validatedData || calculating}
          startIcon={calculating ? <CircularProgress size={20} /> : <PlayArrowIcon />}
        >
          {calculating ? t('reliability.calculating', '计算中...') : t('reliability.calculate', '开始计算')}
        </Button>
      </Stack>

      {/* 标签筛选弹窗 */}
      <Dialog open={labelDialogOpen} onClose={() => setLabelDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{t('reliability.labelFilterTitle', '选择要纳入计算的标签')}</DialogTitle>
        <DialogContent dividers sx={{ p: 0 }}>
          <Stack direction="row" spacing={1} sx={{ p: 1.5, pb: 0.5 }}>
            <Button size="small" onClick={() => setSelectedLabels([...allLabels])}>
              {t('reliability.selectAll', '全选')}
            </Button>
            <Button size="small" onClick={() => setSelectedLabels([])}>
              {t('reliability.clearAll', '清空')}
            </Button>
            <Box sx={{ flexGrow: 1 }} />
            <Typography variant="caption" color="text.secondary" sx={{ alignSelf: 'center' }}>
              {selectedLabels.length}/{allLabels.length}
            </Typography>
          </Stack>
          <List dense sx={{ maxHeight: 320, overflow: 'auto' }}>
            {allLabels.map(label => {
              const checked = selectedLabels.includes(label)
              return (
                <ListItem key={label} disablePadding>
                  <ListItemButton onClick={() => toggleLabel(label)} dense>
                    <ListItemIcon sx={{ minWidth: 36 }}>
                      <Checkbox edge="start" checked={checked} tabIndex={-1} disableRipple size="small" />
                    </ListItemIcon>
                    <ListItemText primary={<Chip label={label} size="small" sx={{ fontSize: '0.75rem', height: 22 }} />} />
                  </ListItemButton>
                </ListItem>
              )
            })}
          </List>
          {selectedLabels.length === 0 && (
            <Alert severity="info" sx={{ m: 1.5, mt: 0 }}>
              {t('reliability.noLabelSelectedHint', '未选择任何标签 = 默认纳入全部标签')}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setLabelDialogOpen(false)}>{t('common.close', '关闭')}</Button>
        </DialogActions>
      </Dialog>
    </Paper>
  )
}
