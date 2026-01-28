/**
 * ResultsPanel - 结果展示组件（ReCal 样式重构版）
 * 
 * 参考 ReCal 0.1 Alpha 样式设计：
 * - 数据概览区（N coders, N cases, N decisions）
 * - Average Pairwise Percent Agreement（平均值 + 配对详情）
 * - Fleiss' Kappa（Kappa + Observed Agreement + Expected Agreement）
 * - Average Pairwise Cohen's Kappa（平均值 + 配对详情）
 * - Krippendorff's Alpha（Alpha + N Decisions + 统计量）
 */

import { useState } from 'react'
import {
  Box,
  Typography,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Button,
  Stack,
  Divider,
  CircularProgress,
  Alert,
  Grid
} from '@mui/material'
import DownloadIcon from '@mui/icons-material/Download'
import DescriptionIcon from '@mui/icons-material/Description'
import TableChartIcon from '@mui/icons-material/TableChart'
import { useTranslation } from 'react-i18next'
import type { 
  CoefficientResult, 
  ValidationSummary,
  DataSummary
} from '../../../api/reliability'
import { reliabilityApi } from '../../../api/reliability'

interface ResultsPanelProps {
  results: Record<string, CoefficientResult> | null
  dataSummary: ValidationSummary | null
  calculationSummary?: Record<string, any> | null
}

// 解释对应的颜色
const getInterpretationColor = (value: number): string => {
  if (value >= 0.8) return '#27ae60' // 几乎完美
  if (value >= 0.6) return '#2ecc71' // 实质性
  if (value >= 0.4) return '#f1c40f' // 中等
  if (value >= 0.2) return '#e67e22' // 一般
  if (value >= 0.0) return '#e74c3c' // 轻微
  return '#c0392b' // 差于偶然
}

// 格式化百分比
const formatPercent = (value: number): string => {
  return `${value.toFixed(3)}%`
}

// 格式化系数值
const formatCoefficient = (value: number): string => {
  return value.toFixed(4)
}

export default function ResultsPanel({
  results,
  dataSummary,
  calculationSummary
}: ResultsPanelProps) {
  const { t } = useTranslation()
  const [exporting, setExporting] = useState<'html' | 'csv' | null>(null)
  
  if (!results) {
    return (
      <Paper sx={{ p: 3, width: '100%', boxSizing: 'border-box' }}>
        <Typography variant="h6" gutterBottom>
          {t('reliability.results', '计算结果')}
        </Typography>
        <Box sx={{ 
          py: 6,
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          bgcolor: (theme) => theme.palette.mode === 'dark' ? 'grey.900' : 'grey.50',
          borderRadius: 1,
          border: '2px dashed',
          borderColor: (theme) => theme.palette.mode === 'dark' ? 'grey.700' : 'grey.300'
        }}>
          <Typography color="text.secondary" textAlign="center">
            {t('reliability.noResults', '暂无计算结果，请先配置参数并执行计算')}
          </Typography>
        </Box>
      </Paper>
    )
  }
  
  // 提取数据摘要 - 从 calculationSummary prop 获取
  const summaryData = calculationSummary as DataSummary | undefined
  
  // 提取各系数结果
  const percentAgreement = results['percent_agreement'] as CoefficientResult | undefined
  const fleissKappa = results['fleiss_kappa'] as CoefficientResult | undefined
  const cohensKappa = results['cohens_kappa'] as CoefficientResult | undefined
  const krippendorffAlpha = results['krippendorff_alpha'] as CoefficientResult | undefined
  const precisionRecall = results['precision_recall'] as CoefficientResult | undefined
  
  // 导出 HTML 报告
  const handleExportHtml = async () => {
    setExporting('html')
    try {
      const exportResults: Record<string, CoefficientResult> = {}
      Object.entries(results).forEach(([key, value]) => {
        if (key !== '_data_summary') {
          exportResults[key] = value as CoefficientResult
        }
      })
      const report = await reliabilityApi.generateReport(exportResults, dataSummary || undefined, 'html')
      const timestamp = new Date().toISOString().slice(0, 19).replace(/[:-]/g, '')
      reliabilityApi.downloadReport(report, `reliability_report_${timestamp}.html`, 'text/html')
    } catch (error) {
      console.error('Export HTML error:', error)
    } finally {
      setExporting(null)
    }
  }
  
  // 导出 CSV
  const handleExportCsv = async () => {
    setExporting('csv')
    try {
      const exportResults: Record<string, CoefficientResult> = {}
      Object.entries(results).forEach(([key, value]) => {
        if (key !== '_data_summary') {
          exportResults[key] = value as CoefficientResult
        }
      })
      const report = await reliabilityApi.generateReport(exportResults, dataSummary || undefined, 'csv')
      const timestamp = new Date().toISOString().slice(0, 19).replace(/[:-]/g, '')
      reliabilityApi.downloadReport(report, `reliability_results_${timestamp}.csv`, 'text/csv')
    } catch (error) {
      console.error('Export CSV error:', error)
    } finally {
      setExporting(null)
    }
  }
  
  // 计算成功的系数数量
  const successCount = [percentAgreement, fleissKappa, cohensKappa, krippendorffAlpha, precisionRecall]
    .filter(r => r?.calculated).length
  
  return (
    <Paper sx={{ p: 2, width: '100%', boxSizing: 'border-box' }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
        <Typography variant="h6">
          {t('reliability.results', '计算结果')}
        </Typography>
        <Stack direction="row" spacing={1}>
          <Button
            size="small"
            variant="outlined"
            startIcon={exporting === 'csv' ? <CircularProgress size={16} /> : <TableChartIcon />}
            onClick={handleExportCsv}
            disabled={exporting !== null}
          >
            CSV
          </Button>
          <Button
            size="small"
            variant="outlined"
            startIcon={exporting === 'html' ? <CircularProgress size={16} /> : <DescriptionIcon />}
            onClick={handleExportHtml}
            disabled={exporting !== null}
          >
            {t('reliability.htmlReport', 'HTML报告')}
          </Button>
        </Stack>
      </Stack>
      
      <Alert severity="success" sx={{ mb: 2 }}>
        {t('reliability.calculationComplete', '计算完成')}：
        {t('reliability.successCount', '成功计算 {{count}} 个系数', { count: successCount })}
      </Alert>
      
      {/* 数据概览区 - ReCal 样式 */}
      {summaryData && (
        <Box sx={{ 
          mb: 3, 
          p: 2, 
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 1,
          bgcolor: (theme) => theme.palette.mode === 'dark' ? 'grey.900' : 'grey.50'
        }}>
          <Typography variant="subtitle1" fontWeight={600} gutterBottom>
            {t('reliability.dataOverview', '数据概览')}
          </Typography>
          <Grid container spacing={3}>
            <Grid item xs={4}>
              <Typography variant="body2" color="text.secondary">
                N coders:
              </Typography>
              <Typography variant="h6" fontWeight={600}>
                {summaryData.n_coders}
              </Typography>
            </Grid>
            <Grid item xs={4}>
              <Typography variant="body2" color="text.secondary">
                N cases:
              </Typography>
              <Typography variant="h6" fontWeight={600}>
                {summaryData.n_cases?.toLocaleString() || '-'}
              </Typography>
            </Grid>
            <Grid item xs={4}>
              <Typography variant="body2" color="text.secondary">
                N decisions:
              </Typography>
              <Typography variant="h6" fontWeight={600}>
                {summaryData.n_decisions?.toLocaleString() || '-'}
              </Typography>
            </Grid>
          </Grid>
        </Box>
      )}
      
      {/* Average Pairwise Percent Agreement */}
      {percentAgreement && (
        <Box sx={{ mb: 3 }}>
          <Typography variant="subtitle1" fontWeight={600} sx={{ 
            bgcolor: 'primary.main', 
            color: 'white', 
            px: 2, 
            py: 1,
            borderRadius: '4px 4px 0 0'
          }}>
            {t('reliability.coefficientNamePA', 'Average Pairwise Percent Agreement')}
          </Typography>
          <TableContainer component={Paper} variant="outlined" sx={{ borderTop: 'none', borderRadius: '0 0 4px 4px' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600 }}>
                    {t('reliability.averagePairwisePA', 'Average pairwise percent agr.')}
                  </TableCell>
                  {percentAgreement.pairwise_details && 
                    Object.keys(percentAgreement.pairwise_details).map(key => (
                      <TableCell key={key} sx={{ fontWeight: 600 }}>
                        {t('reliability.pairwisePA', 'Pairwise pct. agr.')}
                        <br />
                        {key}
                      </TableCell>
                    ))
                  }
                </TableRow>
              </TableHead>
              <TableBody>
                <TableRow>
                  <TableCell sx={{ 
                    fontWeight: 600, 
                    color: percentAgreement.calculated && percentAgreement.value !== undefined 
                      ? getInterpretationColor(percentAgreement.value / 100) 
                      : 'inherit'
                  }}>
                    {percentAgreement.calculated && percentAgreement.value !== undefined
                      ? formatPercent(percentAgreement.value)
                      : percentAgreement.error || '-'
                    }
                  </TableCell>
                  {percentAgreement.pairwise_details &&
                    Object.values(percentAgreement.pairwise_details).map((value, idx) => (
                      <TableCell key={idx}>
                        {formatPercent(value as number)}
                      </TableCell>
                    ))
                  }
                </TableRow>
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      )}
      
      {/* Fleiss' Kappa */}
      {fleissKappa && (
        <Box sx={{ mb: 3 }}>
          <Typography variant="subtitle1" fontWeight={600} sx={{ 
            bgcolor: 'primary.main', 
            color: 'white', 
            px: 2, 
            py: 1,
            borderRadius: '4px 4px 0 0'
          }}>
            {t('reliability.coefficientNameFK', "Fleiss' Kappa")}
          </Typography>
          <TableContainer component={Paper} variant="outlined" sx={{ borderTop: 'none', borderRadius: '0 0 4px 4px' }}>
        <Table size="small">
          <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600 }}>
                    {t('reliability.fleissKappa', "Fleiss' Kappa")}
              </TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>
                    {t('reliability.observedAgreement', 'Observed Agreement')}
              </TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>
                    {t('reliability.expectedAgreement', 'Expected Agreement')}
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
                <TableRow>
                  <TableCell sx={{ 
                    fontWeight: 600,
                    color: fleissKappa.calculated && fleissKappa.value !== undefined
                      ? getInterpretationColor(fleissKappa.value)
                      : 'inherit'
                  }}>
                    {fleissKappa.calculated && fleissKappa.value !== undefined
                      ? formatCoefficient(fleissKappa.value)
                      : fleissKappa.error || '-'
                    }
                  </TableCell>
                <TableCell>
                    {fleissKappa.observed_agreement !== undefined
                      ? formatCoefficient(fleissKappa.observed_agreement)
                      : '-'
                    }
                </TableCell>
                <TableCell>
                    {fleissKappa.expected_agreement !== undefined
                      ? formatCoefficient(fleissKappa.expected_agreement)
                      : '-'
                    }
                </TableCell>
              </TableRow>
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      )}
      
      {/* Average Pairwise Cohen's Kappa */}
      {cohensKappa && (
        <Box sx={{ mb: 3 }}>
          <Typography variant="subtitle1" fontWeight={600} sx={{ 
            bgcolor: 'primary.main', 
            color: 'white', 
            px: 2, 
            py: 1,
            borderRadius: '4px 4px 0 0'
          }}>
            {t('reliability.coefficientNameCK', 'Average Pairwise Cohen\'s Kappa')}
          </Typography>
          <TableContainer component={Paper} variant="outlined" sx={{ borderTop: 'none', borderRadius: '0 0 4px 4px' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600 }}>
                    {t('reliability.averagePairwiseCK', 'Average pairwise CK')}
                  </TableCell>
                  {cohensKappa.pairwise_details &&
                    Object.keys(cohensKappa.pairwise_details).map(key => (
                      <TableCell key={key} sx={{ fontWeight: 600 }}>
                        {t('reliability.pairwiseCK', 'Pairwise CK')}
                        <br />
                        {key}
                      </TableCell>
                    ))
                  }
                </TableRow>
              </TableHead>
              <TableBody>
                <TableRow>
                  <TableCell sx={{ 
                    fontWeight: 600,
                    color: cohensKappa.calculated && cohensKappa.value !== undefined
                      ? getInterpretationColor(cohensKappa.value)
                      : 'inherit'
                  }}>
                    {cohensKappa.calculated && cohensKappa.value !== undefined
                      ? formatCoefficient(cohensKappa.value)
                      : cohensKappa.error || '-'
                    }
                  </TableCell>
                  {cohensKappa.pairwise_details &&
                    Object.values(cohensKappa.pairwise_details).map((value, idx) => (
                      <TableCell key={idx}>
                        {formatCoefficient(value as number)}
                      </TableCell>
                    ))
                  }
                </TableRow>
          </TableBody>
        </Table>
      </TableContainer>
        </Box>
      )}
      
      {/* Krippendorff's Alpha */}
      {krippendorffAlpha && (
        <Box sx={{ mb: 3 }}>
          <Typography variant="subtitle1" fontWeight={600} sx={{ 
            bgcolor: 'primary.main', 
            color: 'white', 
            px: 2, 
            py: 1,
            borderRadius: '4px 4px 0 0'
          }}>
            {t('reliability.coefficientNameKA', "Krippendorff's Alpha")} ({krippendorffAlpha.level_of_measurement || 'nominal'})
          </Typography>
          <TableContainer component={Paper} variant="outlined" sx={{ borderTop: 'none', borderRadius: '0 0 4px 4px' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600 }}>
                    {t('reliability.krippendorffAlpha', "Krippendorff's Alpha")}
                  </TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>
                    {t('reliability.nDecisions', 'N Decisions')}
                  </TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>
                    <span dangerouslySetInnerHTML={{ __html: '&Sigma;<sub>c</sub>o<sub>cc</sub>' }} />
                  </TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>
                    <span dangerouslySetInnerHTML={{ __html: '&Sigma;<sub>c</sub>n<sub>c</sub>(n<sub>c</sub> - 1)' }} />
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                <TableRow>
                  <TableCell sx={{ 
                    fontWeight: 600,
                    color: krippendorffAlpha.calculated && krippendorffAlpha.value !== undefined
                      ? getInterpretationColor(krippendorffAlpha.value)
                      : 'inherit'
                  }}>
                    {krippendorffAlpha.calculated && krippendorffAlpha.value !== undefined
                      ? formatCoefficient(krippendorffAlpha.value)
                      : krippendorffAlpha.error || '-'
                    }
                  </TableCell>
                  <TableCell>
                    {krippendorffAlpha.n_decisions?.toLocaleString() || '-'}
                  </TableCell>
                  <TableCell>
                    {krippendorffAlpha.sigma_c_o_cc !== undefined
                      ? krippendorffAlpha.sigma_c_o_cc.toFixed(6)
                      : '-'
                    }
                  </TableCell>
                  <TableCell>
                    {krippendorffAlpha.sigma_c_nc_nc_minus_1 !== undefined
                      ? krippendorffAlpha.sigma_c_nc_nc_minus_1.toFixed(6)
                      : '-'
                    }
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </TableContainer>
          <Typography 
            variant="caption" 
            color="text.secondary" 
            sx={{ 
              display: 'block', 
              mt: 1,
              fontStyle: 'italic',
              fontSize: '0.7rem',
              opacity: 0.7
                  }}
                >
            {t('reliability.krippendorffReference', '以上数据来自 Krippendorff (2007, case C.)')}
          </Typography>
          </Box>
      )}
      
      {/* 召回率/精确率 (Recall/Precision) - 当设置标准答案时显示 */}
      {precisionRecall && (
        <Box sx={{ mb: 3 }}>
          <Typography variant="subtitle1" fontWeight={600} sx={{ 
            bgcolor: 'warning.main', 
            color: 'white', 
            px: 2, 
            py: 1,
            borderRadius: '4px 4px 0 0'
          }}>
            {t('reliability.precisionRecall', '召回率/精确率 (Recall/Precision)')}
          </Typography>
          
          {precisionRecall.calculated ? (
            <>
              {/* 平均指标 */}
              <TableContainer component={Paper} variant="outlined" sx={{ borderTop: 'none', borderRadius: 0 }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 600 }}>
                        {t('reliability.avgRecall', '平均召回率 (Recall)')}
                      </TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>
                        {t('reliability.avgPrecision', '平均精确率 (Precision)')}
                      </TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>
                        {t('reliability.avgF1', '平均F1分数')}
                      </TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>
                        {t('reliability.interpretation', '解释')}
                      </TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    <TableRow>
                      <TableCell sx={{ 
                        fontWeight: 600,
                        color: precisionRecall.recall !== undefined
                          ? getInterpretationColor(precisionRecall.recall)
                          : 'inherit'
                      }}>
                        {precisionRecall.recall !== undefined
                          ? formatPercent(precisionRecall.recall * 100)
                          : '-'
                        }
                      </TableCell>
                      <TableCell sx={{ 
                        fontWeight: 600,
                        color: precisionRecall.precision !== undefined
                          ? getInterpretationColor(precisionRecall.precision)
                          : 'inherit'
                      }}>
                        {precisionRecall.precision !== undefined
                          ? formatPercent(precisionRecall.precision * 100)
                          : '-'
                        }
                      </TableCell>
                      <TableCell sx={{ 
                        fontWeight: 600,
                        color: precisionRecall.f1_score !== undefined
                          ? getInterpretationColor(precisionRecall.f1_score)
                          : 'inherit'
                      }}>
                        {precisionRecall.f1_score !== undefined
                          ? formatCoefficient(precisionRecall.f1_score)
                          : '-'
                        }
                      </TableCell>
                      <TableCell>
                        {precisionRecall.interpretation 
                          ? t(`reliability.${precisionRecall.interpretation}`, precisionRecall.interpretation)
                          : '-'}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </TableContainer>
              
              {/* 按编码者分类的指标 */}
              {precisionRecall.coder_details && Object.keys(precisionRecall.coder_details).length > 0 && (
                <Box sx={{ mt: 2 }}>
                  <Typography variant="body2" fontWeight={600} sx={{ 
                    px: 2, 
                    py: 1, 
                    bgcolor: 'warning.light',
                    color: 'warning.contrastText',
                    borderRadius: '4px 4px 0 0'
                  }}>
                    {t('reliability.byCoderMetrics', '按编码者分类的指标')}
                  </Typography>
                  <TableContainer component={Paper} variant="outlined" sx={{ borderTop: 'none', borderRadius: '0 0 4px 4px' }}>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell sx={{ fontWeight: 600 }}>
                            {t('reliability.coder', '编码者')}
                          </TableCell>
                          <TableCell sx={{ fontWeight: 600 }}>
                            {t('reliability.recall', '召回率')}
                          </TableCell>
                          <TableCell sx={{ fontWeight: 600 }}>
                            {t('reliability.precision', '精确率')}
                          </TableCell>
                          <TableCell sx={{ fontWeight: 600 }}>
                            {t('reliability.f1Score', 'F1分数')}
                          </TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {Object.entries(precisionRecall.coder_details).map(([coderId, metrics]) => (
                          <TableRow key={coderId}>
                            <TableCell>{coderId}</TableCell>
                            <TableCell sx={{ 
                              color: getInterpretationColor((metrics as any).recall)
                            }}>
                              {formatPercent((metrics as any).recall * 100)}
                            </TableCell>
                            <TableCell sx={{ 
                              color: getInterpretationColor((metrics as any).precision)
                            }}>
                              {formatPercent((metrics as any).precision * 100)}
                            </TableCell>
                            <TableCell sx={{ 
                              color: getInterpretationColor((metrics as any).f1_score)
                            }}>
                              {formatCoefficient((metrics as any).f1_score)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Box>
              )}
              
              {/* 按标签分类的指标 */}
              {precisionRecall.by_label && Object.keys(precisionRecall.by_label).length > 0 && (
                <Box sx={{ mt: 2 }}>
                  <Typography variant="body2" fontWeight={600} sx={{ 
                    px: 2, 
                    py: 1, 
                    bgcolor: 'warning.light',
                    color: 'warning.contrastText',
                    borderRadius: '4px 4px 0 0'
                  }}>
                    {t('reliability.byLabelMetrics', '按标签分类的指标')}
                  </Typography>
                  <TableContainer component={Paper} variant="outlined" sx={{ borderTop: 'none', borderRadius: '0 0 4px 4px' }}>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell sx={{ fontWeight: 600 }}>
                            {t('reliability.label', '标签')}
                          </TableCell>
                          <TableCell sx={{ fontWeight: 600 }}>
                            {t('reliability.recall', '召回率')}
                          </TableCell>
                          <TableCell sx={{ fontWeight: 600 }}>
                            {t('reliability.precision', '精确率')}
                          </TableCell>
                          <TableCell sx={{ fontWeight: 600 }}>
                            {t('reliability.f1Score', 'F1分数')}
                          </TableCell>
                          <TableCell sx={{ fontWeight: 600 }}>TP</TableCell>
                          <TableCell sx={{ fontWeight: 600 }}>FP</TableCell>
                          <TableCell sx={{ fontWeight: 600 }}>FN</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {Object.entries(precisionRecall.by_label).map(([label, metrics]) => (
                          <TableRow key={label}>
                            <TableCell>{label}</TableCell>
                            <TableCell sx={{ 
                              color: getInterpretationColor((metrics as any).recall)
                            }}>
                              {formatPercent((metrics as any).recall * 100)}
                            </TableCell>
                            <TableCell sx={{ 
                              color: getInterpretationColor((metrics as any).precision)
                            }}>
                              {formatPercent((metrics as any).precision * 100)}
                            </TableCell>
                            <TableCell sx={{ 
                              color: getInterpretationColor((metrics as any).f1_score)
                            }}>
                              {formatCoefficient((metrics as any).f1_score)}
                            </TableCell>
                            <TableCell>{(metrics as any).true_positives}</TableCell>
                            <TableCell>{(metrics as any).false_positives}</TableCell>
                            <TableCell>{(metrics as any).false_negatives}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Box>
              )}
            </>
          ) : (
            <Alert severity="warning" sx={{ borderRadius: '0 0 4px 4px' }}>
              {precisionRecall.error || t('reliability.precisionRecallError', '无法计算召回率/精确率')}
            </Alert>
          )}
        </Box>
      )}
          
          {/* 图例说明 */}
          <Box sx={{ mt: 2, p: 1, bgcolor: (theme) => theme.palette.mode === 'dark' ? 'grey.900' : 'grey.100', borderRadius: 1 }}>
            <Typography variant="caption" color="text.secondary">
              {t('reliability.legend', '图例说明')}：
              <Box component="span" sx={{ mx: 1 }}>
            <Box component="span" sx={{ color: '#27ae60' }}>0.8-1.0 {t('reliability.interpAlmostPerfect', '几乎完美')}</Box>
                {' | '}
            <Box component="span" sx={{ color: '#2ecc71' }}>0.6-0.8 {t('reliability.interpSubstantial', '实质性')}</Box>
                {' | '}
            <Box component="span" sx={{ color: '#f1c40f' }}>0.4-0.6 {t('reliability.interpModerate', '中等')}</Box>
                {' | '}
            <Box component="span" sx={{ color: '#e67e22' }}>0.2-0.4 {t('reliability.interpFair', '一般')}</Box>
                {' | '}
            <Box component="span" sx={{ color: '#e74c3c' }}>{'<'}0.2 {t('reliability.interpSlight', '轻微/差')}</Box>
              </Box>
            </Typography>
          </Box>
    </Paper>
  )
}
