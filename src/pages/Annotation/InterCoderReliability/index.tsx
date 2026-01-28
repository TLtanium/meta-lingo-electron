/**
 * InterCoderReliability - 编码者间信度分析主页面
 * 
 * 功能：
 * - 数据源选择（语料库/上传文件）
 * - 计算参数配置
 * - 结果展示和导出
 * - KWIC 索引和详情查看
 */

import { useState, useCallback } from 'react'
import {
  Box,
  Typography,
  Alert,
  Snackbar,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Grid
} from '@mui/material'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import CalculateIcon from '@mui/icons-material/Calculate'
import { useTranslation } from 'react-i18next'

import DataSourcePanel from './DataSourcePanel'
import CalculationPanel from './CalculationPanel'
import ResultsPanel from './ResultsPanel'
import KWICTable from './KWICTable'

import type { 
  ArchiveFile, 
  ValidationSummary,
  CoefficientResult
} from '../../../api/reliability'

export default function InterCoderReliability() {
  const { t } = useTranslation()
  
  // 数据状态
  const [validatedData, setValidatedData] = useState<any | null>(null)
  const [dataSummary, setDataSummary] = useState<ValidationSummary | null>(null)
  const [loadedFiles, setLoadedFiles] = useState<ArchiveFile[]>([])
  
  // 标准答案索引
  const [goldStandardIndex, setGoldStandardIndex] = useState<number | undefined>(undefined)
  
  // 计算结果
  const [results, setResults] = useState<Record<string, CoefficientResult> | null>(null)
  // 计算返回的数据摘要
  const [calculationSummary, setCalculationSummary] = useState<Record<string, any> | null>(null)
  
  // 错误提示
  const [error, setError] = useState<string | null>(null)
  
  // 处理数据验证完成
  const handleDataValidated = useCallback((
    data: any,
    summary: ValidationSummary,
    files: ArchiveFile[],
    goldIndex?: number
  ) => {
    setValidatedData(data)
    setDataSummary(summary)
    setLoadedFiles(files)
    setGoldStandardIndex(goldIndex)
    setResults(null) // 重置结果
  }, [])
  
  // 处理计算完成
  const handleCalculationComplete = useCallback((
    calculatedResults: Record<string, CoefficientResult>,
    summary?: Record<string, any>
  ) => {
    setResults(calculatedResults)
    setCalculationSummary(summary || null)
  }, [])
  
  // 处理错误
  const handleError = useCallback((errorMsg: string) => {
    setError(errorMsg)
  }, [])
  
  return (
    <Box sx={{ width: '100%', height: '100%', overflow: 'auto', p: 2, boxSizing: 'border-box' }}>
      {/* 页面标题 */}
      <Box sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
        <CalculateIcon color="primary" />
        <Typography variant="h5" fontWeight={600}>
          {t('reliability.title', '编码者间信度分析')}
        </Typography>
      </Box>
      
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        {t('reliability.description', '上传多个编码者的标注结果，计算编码者间信度系数，评估标注一致性。')}
      </Typography>
      
      <Grid container spacing={2}>
        {/* 左侧：数据源和计算配置 */}
        <Grid item xs={12} md={4} lg={3}>
          {/* 数据源选择 */}
          <Accordion defaultExpanded>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography fontWeight={600}>
                {t('reliability.step1', '步骤1：选择数据')}
              </Typography>
            </AccordionSummary>
            <AccordionDetails sx={{ pt: 0 }}>
              <DataSourcePanel
                onDataValidated={handleDataValidated}
                onError={handleError}
              />
            </AccordionDetails>
          </Accordion>
          
          {/* 计算配置 */}
          <Accordion defaultExpanded={!!validatedData}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography fontWeight={600}>
                {t('reliability.step2', '步骤2：配置计算')}
              </Typography>
            </AccordionSummary>
            <AccordionDetails sx={{ pt: 0 }}>
              <CalculationPanel
                validatedData={validatedData}
                dataSummary={dataSummary}
                goldStandardIndex={goldStandardIndex}
                onCalculationComplete={handleCalculationComplete}
                onError={handleError}
              />
            </AccordionDetails>
          </Accordion>
        </Grid>
        
        {/* 右侧：结果和标注详情 */}
        <Grid item xs={12} md={8} lg={9}>
          {/* 计算结果 */}
          <Box sx={{ mb: 2 }}>
            <ResultsPanel
              results={results}
              dataSummary={dataSummary}
              calculationSummary={calculationSummary}
            />
          </Box>
          
          {/* 标注详情 */}
          {loadedFiles.length >= 2 && (
            <Accordion defaultExpanded={!!results}>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography fontWeight={600}>
                  {t('reliability.annotationDetails', '标注详情')}
                </Typography>
              </AccordionSummary>
              <AccordionDetails sx={{ pt: 0 }}>
                <KWICTable files={loadedFiles} />
              </AccordionDetails>
            </Accordion>
          )}
        </Grid>
      </Grid>
      
      {/* 使用说明 */}
      <Accordion sx={{ mt: 2 }}>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography fontWeight={600}>
            {t('reliability.help', '使用说明')}
          </Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Grid container spacing={2}>
            {/* 文件要求 */}
            <Grid item xs={12} md={6} lg={3}>
              <Box sx={{ 
                p: 2, 
                bgcolor: (theme) => theme.palette.mode === 'dark' ? 'primary.900' : 'primary.50', 
                borderRadius: 2,
                border: '1px solid',
                borderColor: (theme) => theme.palette.mode === 'dark' ? 'primary.700' : 'primary.200',
                height: '100%'
              }}>
                <Typography variant="subtitle2" color="primary.main" fontWeight={600} gutterBottom>
                  {t('reliability.helpTitle1', '文件要求')}
                </Typography>
                <Typography variant="body2" color="text.secondary" component="div" sx={{ fontSize: '0.8rem' }}>
                  <Box component="ul" sx={{ pl: 2, m: 0, '& li': { mb: 0.5 } }}>
                    <li>{t('reliability.helpItem1', '上传至少2个标注存档')}</li>
                    <li>{t('reliability.helpItem2', '文件应包含相同文本内容')}</li>
                    <li>{t('reliability.helpItem3', '确保标注框架一致')}</li>
                  </Box>
                </Typography>
              </Box>
            </Grid>
            
            {/* 可靠性系数说明 */}
            <Grid item xs={12} md={6} lg={3}>
              <Box sx={{ 
                p: 2, 
                bgcolor: (theme) => theme.palette.mode === 'dark' ? 'success.900' : 'success.50', 
                borderRadius: 2,
                border: '1px solid',
                borderColor: (theme) => theme.palette.mode === 'dark' ? 'success.700' : 'success.200',
                height: '100%'
              }}>
                <Typography variant="subtitle2" color="success.main" fontWeight={600} gutterBottom>
                  {t('reliability.helpTitle2', '信度系数')}
                </Typography>
                <Typography variant="body2" color="text.secondary" component="div" sx={{ fontSize: '0.8rem' }}>
                  <Box component="ul" sx={{ pl: 2, m: 0, '& li': { mb: 0.5 } }}>
                    <li><strong>Percent Agreement</strong> - {t('reliability.paDesc', '简单一致性')}</li>
                    <li><strong>Cohen's Kappa</strong> - {t('reliability.ckDesc', '双编码者')}</li>
                    <li><strong>Fleiss' Kappa</strong> - {t('reliability.fkDesc', '多编码者')}</li>
                    <li><strong>Krippendorff's Alpha</strong> - {t('reliability.kaDesc', '通用指标')}</li>
                  </Box>
                </Typography>
              </Box>
            </Grid>
            
            {/* 标准答案功能 */}
            <Grid item xs={12} md={6} lg={3}>
              <Box sx={{ 
                p: 2, 
                bgcolor: (theme) => theme.palette.mode === 'dark' ? 'warning.900' : 'warning.50', 
                borderRadius: 2,
                border: '1px solid',
                borderColor: (theme) => theme.palette.mode === 'dark' ? 'warning.700' : 'warning.200',
                height: '100%'
              }}>
                <Typography variant="subtitle2" color="warning.main" fontWeight={600} gutterBottom>
                  {t('reliability.helpTitle4', '标准答案/召回率精确率')}
                </Typography>
                <Typography variant="body2" color="text.secondary" component="div" sx={{ fontSize: '0.8rem' }}>
                  <Box component="ul" sx={{ pl: 2, m: 0, '& li': { mb: 0.5 } }}>
                    <li>{t('reliability.goldStandardHelp1', '选择一个存档作为标准答案')}</li>
                    <li><strong>{t('reliability.recall', '召回率')}</strong> - {t('reliability.recallDesc', '找全了多少')}</li>
                    <li><strong>{t('reliability.precision', '精确率')}</strong> - {t('reliability.precisionDesc', '标对了多少')}</li>
                    <li><strong>F1</strong> - {t('reliability.f1Desc', '综合评估指标')}</li>
                  </Box>
                </Typography>
              </Box>
            </Grid>
            
            {/* 结果解释 */}
            <Grid item xs={12} md={6} lg={3}>
              <Box sx={{ 
                p: 2, 
                bgcolor: (theme) => theme.palette.mode === 'dark' ? 'info.900' : 'info.50', 
                borderRadius: 2,
                border: '1px solid',
                borderColor: (theme) => theme.palette.mode === 'dark' ? 'info.700' : 'info.200',
                height: '100%'
              }}>
                <Typography variant="subtitle2" color="info.main" fontWeight={600} gutterBottom>
                  {t('reliability.helpTitle3', '结果解释')}
                </Typography>
                <Typography variant="body2" color="text.secondary" component="div" sx={{ fontSize: '0.8rem' }}>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.3 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span><strong>0.8-1.0</strong></span>
                      <span>{t('reliability.interpAlmostPerfect', '几乎完美')}</span>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span><strong>0.6-0.8</strong></span>
                      <span>{t('reliability.interpSubstantial', '实质性一致')}</span>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span><strong>0.4-0.6</strong></span>
                      <span>{t('reliability.interpModerate', '中等一致')}</span>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span><strong>0.2-0.4</strong></span>
                      <span>{t('reliability.interpFair', '一般一致')}</span>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span><strong>&lt;0.2</strong></span>
                      <span>{t('reliability.interpSlight', '轻微/差')}</span>
                    </Box>
                  </Box>
                </Typography>
              </Box>
            </Grid>
          </Grid>
        </AccordionDetails>
      </Accordion>
      
      {/* 错误提示 */}
      <Snackbar
        open={!!error}
        autoHideDuration={6000}
        onClose={() => setError(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert 
          severity="error" 
          onClose={() => setError(null)}
          sx={{ width: '100%' }}
        >
          {error}
        </Alert>
      </Snackbar>
    </Box>
  )
}

