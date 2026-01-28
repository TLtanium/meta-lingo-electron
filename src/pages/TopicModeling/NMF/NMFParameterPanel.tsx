/**
 * NMF Parameter Panel
 * Configuration for NMF topic modeling with sklearn
 */

import { useState } from 'react'
import {
  Box,
  Typography,
  Paper,
  Stack,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Button,
  CircularProgress,
  Alert,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Divider,
  Tooltip
} from '@mui/material'
import { NumberInput } from '../../../components/common'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import TuneIcon from '@mui/icons-material/Tune'
import AutoGraphIcon from '@mui/icons-material/AutoGraph'
import { useTranslation } from 'react-i18next'
import type { NMFPreprocessConfig, NMFConfig, NMFResult, NMFOptimizeResult } from '../../../types/topicModeling'
import { analyzeNMF, optimizeNMFTopics } from '../../../api/topicModeling'
import ReconstructionErrorDialog from './ReconstructionErrorDialog'

interface NMFParameterPanelProps {
  corpusId: string
  textIds: string[]
  language: string
  preprocessConfig: NMFPreprocessConfig
  config: NMFConfig
  onConfigChange: (config: NMFConfig) => void
  onAnalysisStart: () => void
  onAnalysisComplete: (result: NMFResult) => void
  onOptimizeComplete: (result: NMFOptimizeResult) => void
  disabled?: boolean
}

export default function NMFParameterPanel({
  corpusId,
  textIds,
  language,
  preprocessConfig,
  config,
  onConfigChange,
  onAnalysisStart,
  onAnalysisComplete,
  onOptimizeComplete,
  disabled = false
}: NMFParameterPanelProps) {
  const { t } = useTranslation()
  
  const [analyzing, setAnalyzing] = useState(false)
  const [optimizing, setOptimizing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [advancedExpanded, setAdvancedExpanded] = useState(false)
  
  // Topic optimization settings
  const [optimizeDialogOpen, setOptimizeDialogOpen] = useState(false)
  const [topicMin, setTopicMin] = useState(2)
  const [topicMax, setTopicMax] = useState(20)
  const [topicStep, setTopicStep] = useState(2)
  const [optimizeResult, setOptimizeResult] = useState<NMFOptimizeResult | null>(null)
  
  // Handle config change
  const handleConfigChange = (key: keyof NMFConfig, value: unknown) => {
    onConfigChange({ ...config, [key]: value })
  }
  
  // Run analysis
  const handleAnalyze = async () => {
    if (!corpusId || textIds.length === 0) {
      setError(t('topicModeling.nmf.selectTextsFirst', 'Please select texts first'))
      return
    }
    
    setAnalyzing(true)
    setError(null)
    onAnalysisStart()
    
    try {
      const response = await analyzeNMF(
        corpusId,
        textIds,
        language,
        preprocessConfig,
        config
      )
      
      if (response.success && response.data) {
        if (response.data.success) {
          onAnalysisComplete(response.data)
        } else {
          setError(response.data.error || 'Analysis failed')
        }
      } else {
        setError(response.error || 'Analysis failed')
      }
    } catch (err) {
      setError(String(err))
    } finally {
      setAnalyzing(false)
    }
  }
  
  // Run topic optimization
  const handleOptimize = async () => {
    if (!corpusId || textIds.length === 0) {
      setError(t('topicModeling.nmf.selectTextsFirst', 'Please select texts first'))
      return
    }
    
    setOptimizing(true)
    setOptimizeResult(null)
    setError(null)
    onAnalysisStart()
    
    try {
      const response = await optimizeNMFTopics(
        corpusId,
        textIds,
        language,
        preprocessConfig,
        config,
        topicMin,
        topicMax,
        topicStep
      )
      
      if (response.success && response.data) {
        if (response.data.success) {
          setOptimizeResult(response.data)
          onOptimizeComplete(response.data)
        } else {
          setError('Topic optimization failed')
        }
      } else {
        setError(response.error || 'Topic optimization failed')
      }
    } catch (err) {
      setError(String(err))
    } finally {
      setOptimizing(false)
    }
  }
  
  // Reset optimization when dialog closes
  const handleOptimizeDialogClose = () => {
    setOptimizeDialogOpen(false)
    setOptimizeResult(null)
    setError(null)
  }
  
  return (
    <Paper sx={{ p: 2 }}>
      <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 2 }}>
        {t('topicModeling.nmf.params.title', 'NMF Parameters')}
      </Typography>
      
      <Stack spacing={2}>
        {/* Init Method */}
        <FormControl size="small" fullWidth>
          <InputLabel>{t('topicModeling.nmf.params.init', 'Initialization')}</InputLabel>
          <Select
            value={config.init}
            label={t('topicModeling.nmf.params.init', 'Initialization')}
            onChange={(e) => handleConfigChange('init', e.target.value)}
          >
            <MenuItem value="nndsvd">NNDSVD</MenuItem>
            <MenuItem value="nndsvda">NNDSVDa</MenuItem>
            <MenuItem value="nndsvdar">NNDSVDar</MenuItem>
            <MenuItem value="random">Random</MenuItem>
          </Select>
        </FormControl>
        
        {/* Solver */}
        <FormControl size="small" fullWidth>
          <InputLabel>{t('topicModeling.nmf.params.solver', 'Solver')}</InputLabel>
          <Select
            value={config.solver}
            label={t('topicModeling.nmf.params.solver', 'Solver')}
            onChange={(e) => handleConfigChange('solver', e.target.value)}
          >
            <MenuItem value="cd">CD (Coordinate Descent)</MenuItem>
            <MenuItem value="mu">MU (Multiplicative Update)</MenuItem>
          </Select>
        </FormControl>
        
        {/* Basic Parameters */}
        <Stack direction="row" spacing={2}>
          <NumberInput
            label={t('topicModeling.nmf.params.numTopics', 'Topics')}
            size="small"
            value={config.num_topics}
            onChange={(val) => handleConfigChange('num_topics', val)}
            min={2}
            max={100}
            integer
            sx={{ flex: 1 }}
          />
          <NumberInput
            label={t('topicModeling.nmf.params.numKeywords', 'Keywords')}
            size="small"
            value={config.num_keywords}
            onChange={(val) => handleConfigChange('num_keywords', val)}
            min={5}
            max={50}
            integer
            sx={{ flex: 1 }}
          />
        </Stack>
        
        {/* Advanced Parameters */}
        <Accordion
          expanded={advancedExpanded}
          onChange={(_, isExpanded) => setAdvancedExpanded(isExpanded)}
          sx={{
            '&:before': { display: 'none' },
            boxShadow: 'none',
            border: 1,
            borderColor: 'divider',
            borderRadius: 1
          }}
        >
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Stack direction="row" alignItems="center" spacing={1}>
              <TuneIcon fontSize="small" color="action" />
              <Typography variant="subtitle2">
                {t('topicModeling.nmf.params.advanced', 'Advanced')}
              </Typography>
            </Stack>
          </AccordionSummary>
          
          <AccordionDetails>
            <Stack spacing={2}>
              {/* Max Iterations & Tolerance */}
              <Stack direction="row" spacing={2}>
                <NumberInput
                  label={t('topicModeling.nmf.params.maxIter', 'Max Iterations')}
                  size="small"
                  value={config.max_iter}
                  onChange={(val) => handleConfigChange('max_iter', val)}
                  min={10}
                  max={1000}
                  integer
                  sx={{ flex: 1 }}
                />
                <NumberInput
                  label={t('topicModeling.nmf.params.tol', 'Tolerance')}
                  size="small"
                  value={config.tol}
                  onChange={(val) => handleConfigChange('tol', val)}
                  min={1e-8}
                  max={1e-2}
                  step={1e-5}
                  sx={{ flex: 1 }}
                />
              </Stack>
              
              {/* Regularization: alpha_W & alpha_H */}
              <Typography variant="body2" color="text.secondary">
                {t('topicModeling.nmf.params.regularization', 'Regularization')}
              </Typography>
              <Stack direction="row" spacing={2}>
                <NumberInput
                  label={t('topicModeling.nmf.params.alphaW', 'Alpha W')}
                  size="small"
                  value={config.alpha_W}
                  onChange={(val) => handleConfigChange('alpha_W', val)}
                  min={0}
                  max={1}
                  step={0.1}
                  sx={{ flex: 1 }}
                  helperText={t('topicModeling.nmf.params.alphaWHelp', 'W matrix regularization')}
                />
                <NumberInput
                  label={t('topicModeling.nmf.params.alphaH', 'Alpha H')}
                  size="small"
                  value={config.alpha_H}
                  onChange={(val) => handleConfigChange('alpha_H', val)}
                  min={0}
                  max={1}
                  step={0.1}
                  sx={{ flex: 1 }}
                  helperText={t('topicModeling.nmf.params.alphaHHelp', 'H matrix regularization')}
                />
              </Stack>
              
              {/* L1 Ratio */}
              <NumberInput
                label={t('topicModeling.nmf.params.l1Ratio', 'L1 Ratio')}
                size="small"
                value={config.l1_ratio}
                onChange={(val) => handleConfigChange('l1_ratio', val)}
                min={0}
                max={1}
                step={0.1}
                sx={{ width: '50%' }}
                helperText={t('topicModeling.nmf.params.l1RatioHelp', '0=L2, 1=L1, between=mix')}
              />
              
              {/* Beta Loss - only for MU solver */}
              {config.solver === 'mu' && (
                <FormControl size="small" fullWidth>
                  <InputLabel>{t('topicModeling.nmf.params.betaLoss', 'Beta Loss')}</InputLabel>
                  <Select
                    value={config.beta_loss}
                    label={t('topicModeling.nmf.params.betaLoss', 'Beta Loss')}
                    onChange={(e) => handleConfigChange('beta_loss', e.target.value)}
                  >
                    <MenuItem value="frobenius">Frobenius</MenuItem>
                    <MenuItem value="kullback-leibler">Kullback-Leibler</MenuItem>
                    <MenuItem value="itakura-saito">Itakura-Saito</MenuItem>
                  </Select>
                </FormControl>
              )}
              
              <Divider />
              
              {/* Random seed */}
              <NumberInput
                label={t('topicModeling.nmf.params.randomSeed', 'Random Seed')}
                size="small"
                value={config.random_state}
                onChange={(val) => handleConfigChange('random_state', val)}
                min={0}
                max={99999}
                integer
                sx={{ width: '50%' }}
              />
            </Stack>
          </AccordionDetails>
        </Accordion>
        
        {/* Error */}
        {error && (
          <Alert severity="error" onClose={() => setError(null)}>
            {error}
          </Alert>
        )}
        
        {/* Action Buttons */}
        <Stack direction="row" spacing={1}>
          <Button
            variant="contained"
            color="primary"
            startIcon={analyzing ? <CircularProgress size={20} color="inherit" /> : <PlayArrowIcon />}
            onClick={handleAnalyze}
            disabled={analyzing || optimizing || disabled || textIds.length === 0}
            sx={{ flex: 1 }}
          >
            {analyzing
              ? t('topicModeling.nmf.analyzing', 'Analyzing...')
              : t('topicModeling.nmf.analyze', 'Run NMF')
            }
          </Button>
          <Tooltip title={t('topicModeling.nmf.optimizeTopics', 'Find Optimal Topic Number')}>
            <Button
              variant="outlined"
              color="primary"
              startIcon={optimizing ? <CircularProgress size={20} /> : <AutoGraphIcon />}
              onClick={() => setOptimizeDialogOpen(true)}
              disabled={analyzing || optimizing || disabled || textIds.length === 0}
            >
              {optimizing ? '...' : t('topicModeling.nmf.optimize', 'Optimize')}
            </Button>
          </Tooltip>
        </Stack>
        
        {/* Info text */}
        <Typography variant="caption" color="text.secondary">
          {t('topicModeling.nmf.info', 'NMF discovers non-negative topic components from document-term matrix.')}
        </Typography>
      </Stack>
      
      {/* Topic Optimization Dialog */}
      <ReconstructionErrorDialog
        open={optimizeDialogOpen}
        onClose={handleOptimizeDialogClose}
        optimizing={optimizing}
        optimizeResult={optimizeResult}
        topicMin={topicMin}
        topicMax={topicMax}
        topicStep={topicStep}
        onTopicMinChange={setTopicMin}
        onTopicMaxChange={setTopicMax}
        onTopicStepChange={setTopicStep}
        onRunOptimize={handleOptimize}
        error={error}
      />
    </Paper>
  )
}
