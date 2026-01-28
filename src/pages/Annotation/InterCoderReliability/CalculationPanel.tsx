/**
 * CalculationPanel - 计算参数配置组件
 * 
 * 配置信度计算的各种参数：
 * - 计算方法（完全匹配/位置容错/模糊匹配）
 * - 容错阈值
 * - 要计算的系数
 * - Krippendorff's Alpha 测量层次
 */

import { useState } from 'react'
import {
  Box,
  Typography,
  Paper,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Slider,
  FormControlLabel,
  Checkbox,
  Button,
  Stack,
  Divider,
  CircularProgress,
  Alert,
  Grid,
  Tooltip,
  IconButton
} from '@mui/material'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import HelpOutlineIcon from '@mui/icons-material/HelpOutline'
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
  onCalculationComplete: (results: Record<string, CoefficientResult>, calculationSummary?: Record<string, any>) => void
  onError: (error: string) => void
}

export default function CalculationPanel({
  validatedData,
  dataSummary,
  goldStandardIndex,
  onCalculationComplete,
  onError
}: CalculationPanelProps) {
  const { t } = useTranslation()
  
  // 计算参数
  const [method, setMethod] = useState<ReliabilityParams['method']>('完全匹配')
  const [tolerance, setTolerance] = useState(0.8)
  const [coefficients, setCoefficients] = useState<CoefficientOptions>({
    percent_agreement: true,
    scotts_pi: false,  // 已被 Average Pairwise Percent Agreement 替代
    cohens_kappa: true,
    fleiss_kappa: true,
    krippendorff_alpha: true
  })
  const [levelOfMeasurement, setLevelOfMeasurement] = useState<
    ReliabilityParams['level_of_measurement']
  >('ordinal')
  
  // 计算状态
  const [calculating, setCalculating] = useState(false)
  
  // 编码者数量（用于显示提示）
  const coderCount = dataSummary?.coder_count || 0
  
  // 处理系数选择变化
  const handleCoefficientChange = (key: keyof CoefficientOptions) => {
    setCoefficients(prev => ({
      ...prev,
      [key]: !prev[key]
    }))
  }
  
  // 执行计算
  const handleCalculate = async () => {
    if (!validatedData) {
      onError('请先验证数据')
      return
    }
    
    setCalculating(true)
    
    try {
      const params: ReliabilityParams = {
        method,
        tolerance,
        coefficients,
        level_of_measurement: levelOfMeasurement,
        gold_standard_index: goldStandardIndex
      }
      
      const result = await reliabilityApi.calculateReliability(validatedData, params)
      
      if (result.success && result.data) {
        onCalculationComplete(result.data, result.summary)
      } else {
        onError(result.error || '计算失败')
      }
    } catch (error) {
      console.error('Calculation error:', error)
      onError('计算过程出错')
    } finally {
      setCalculating(false)
    }
  }
  
  // 测量层次选项说明
  const measurementLevels = [
    { value: 'nominal', labelKey: 'measurementNominal', descKey: 'measurementNominalDesc' },
    { value: 'ordinal', labelKey: 'measurementOrdinal', descKey: 'measurementOrdinalDesc' },
    { value: 'interval', labelKey: 'measurementInterval', descKey: 'measurementIntervalDesc' },
    { value: 'ratio', labelKey: 'measurementRatio', descKey: 'measurementRatioDesc' }
  ]
  
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
        </Alert>
      )}
      
      <Stack spacing={3}>
        {/* 计算方法 */}
        <FormControl fullWidth size="small">
          <InputLabel>{t('reliability.method', '计算方法')}</InputLabel>
          <Select
            value={method}
            onChange={(e) => setMethod(e.target.value as ReliabilityParams['method'])}
            label={t('reliability.method', '计算方法')}
          >
            <MenuItem value="完全匹配">
              {t('reliability.exactMatch', '完全匹配')} - {t('reliability.exactMatchDesc', '标注必须完全相同')}
            </MenuItem>
            <MenuItem value="位置容错">
              {t('reliability.positionTolerance', '位置容错')} - {t('reliability.positionToleranceDesc', '允许位置有小幅偏差')}
            </MenuItem>
            <MenuItem value="模糊匹配">
              {t('reliability.fuzzyMatch', '模糊匹配')} - {t('reliability.fuzzyMatchDesc', '基于文本相似度匹配')}
            </MenuItem>
          </Select>
        </FormControl>
        
        {/* 容错阈值（仅在非完全匹配时显示） */}
        {method !== '完全匹配' && (
          <Box>
            <Typography gutterBottom>
              {t('reliability.tolerance', '容错阈值')}: {tolerance.toFixed(1)}
            </Typography>
            <Slider
              value={tolerance}
              onChange={(_, value) => setTolerance(value as number)}
              min={0.1}
              max={1.0}
              step={0.1}
              marks={[
                { value: 0.1, label: '0.1' },
                { value: 0.5, label: '0.5' },
                { value: 1.0, label: '1.0' }
              ]}
            />
          </Box>
        )}
        
        <Divider />
        
        {/* 系数选择 */}
        <Box>
          <Typography variant="subtitle2" gutterBottom>
            {t('reliability.selectCoefficients', '选择要计算的系数')}
          </Typography>
          
          <Grid container spacing={1}>
            <Grid item xs={12}>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={coefficients.percent_agreement}
                    onChange={() => handleCoefficientChange('percent_agreement')}
                    size="small"
                  />
                }
                label={
                  <Stack direction="row" alignItems="center" spacing={0.5}>
                    <span>{t('reliability.checkboxPA', '平均配对百分比一致')}</span>
                    <Tooltip title={t('reliability.tooltipPA', '所有编码者配对的平均百分比一致性，显示每对详细数值')}>
                      <HelpOutlineIcon fontSize="small" color="action" />
                    </Tooltip>
                  </Stack>
                }
              />
            </Grid>
            
            <Grid item xs={12}>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={coefficients.fleiss_kappa}
                    onChange={() => handleCoefficientChange('fleiss_kappa')}
                    size="small"
                  />
                }
                label={
                  <Stack direction="row" alignItems="center" spacing={0.5}>
                    <span>{t('reliability.checkboxFK', "Fleiss' Kappa")}</span>
                    <Tooltip title={t('reliability.tooltipFK', '多编码者信度指标，显示观察一致性和期望一致性')}>
                      <HelpOutlineIcon fontSize="small" color="action" />
                    </Tooltip>
                  </Stack>
                }
              />
            </Grid>
            
            <Grid item xs={12}>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={coefficients.cohens_kappa}
                    onChange={() => handleCoefficientChange('cohens_kappa')}
                    size="small"
                  />
                }
                label={
                  <Stack direction="row" alignItems="center" spacing={0.5}>
                    <span>{t('reliability.checkboxCK', "平均配对Cohen's Kappa")}</span>
                    <Tooltip title={t('reliability.tooltipCK', '所有编码者配对的平均Cohen Kappa值，显示每对详细数值')}>
                      <HelpOutlineIcon fontSize="small" color="action" />
                    </Tooltip>
                  </Stack>
                }
              />
            </Grid>
            
            <Grid item xs={12}>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={coefficients.krippendorff_alpha}
                    onChange={() => handleCoefficientChange('krippendorff_alpha')}
                    size="small"
                  />
                }
                label={
                  <Stack direction="row" alignItems="center" spacing={0.5}>
                    <span>{t('reliability.checkboxKA', "Krippendorff's Alpha")}</span>
                    <Tooltip title={t('reliability.tooltipKA', '最通用的信度指标，适用于各种数据类型和编码者数量')}>
                      <HelpOutlineIcon fontSize="small" color="action" />
                    </Tooltip>
                  </Stack>
                }
              />
            </Grid>
          </Grid>
        </Box>
        
        {/* Krippendorff's Alpha 测量层次 */}
        {coefficients.krippendorff_alpha && (
          <FormControl fullWidth size="small">
            <InputLabel>
              {t('reliability.measurementLevel', 'Krippendorff Alpha 测量层次')}
            </InputLabel>
            <Select
              value={levelOfMeasurement}
              onChange={(e) => setLevelOfMeasurement(
                e.target.value as ReliabilityParams['level_of_measurement']
              )}
              label={t('reliability.measurementLevel', 'Krippendorff Alpha 测量层次')}
            >
              {measurementLevels.map(level => (
                <MenuItem key={level.value} value={level.value}>
                  {t(`reliability.${level.labelKey}`)} - {t(`reliability.${level.descKey}`)}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        )}
        
        <Divider />
        
        {/* 计算按钮 */}
        <Button
          variant="contained"
          fullWidth
          size="large"
          onClick={handleCalculate}
          disabled={!validatedData || calculating}
          startIcon={calculating ? <CircularProgress size={20} /> : <PlayArrowIcon />}
        >
          {calculating 
            ? t('reliability.calculating', '计算中...')
            : t('reliability.calculate', '开始计算')
          }
        </Button>
      </Stack>
    </Paper>
  )
}

