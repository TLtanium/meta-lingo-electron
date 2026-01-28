/**
 * LSA Parameter Panel
 * Configuration for LSA topic modeling with TruncatedSVD
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
  Tooltip
} from '@mui/material'
import { NumberInput } from '../../../components/common'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import TuneIcon from '@mui/icons-material/Tune'
import AutoGraphIcon from '@mui/icons-material/AutoGraph'
import { useTranslation } from 'react-i18next'
import type { LSAPreprocessConfig, LSAConfig, LSAResult, LSAOptimizeResult } from '../../../types/topicModeling'
import { topicModelingApi } from '../../../api'
import VarianceDialog from './VarianceDialog'

interface LSAParameterPanelProps {
  corpusId: string
  textIds: string[]
  language: string
  preprocessConfig: LSAPreprocessConfig
  config: LSAConfig
  onConfigChange: (config: LSAConfig) => void
  onAnalysisStart: () => void
  onAnalysisComplete: (result: LSAResult) => void
  onOptimizeComplete: (result: LSAOptimizeResult) => void
  disabled?: boolean
}

export default function LSAParameterPanel({
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
}: LSAParameterPanelProps) {
  const { t } = useTranslation()
  
  const [analyzing, setAnalyzing] = useState(false)
  const [optimizing, setOptimizing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [advancedExpanded, setAdvancedExpanded] = useState(false)
  
  // Optimization dialog
  const [optimizeDialogOpen, setOptimizeDialogOpen] = useState(false)
  
  // Handle config change
  const handleConfigChange = (key: keyof LSAConfig, value: unknown) => {
    onConfigChange({ ...config, [key]: value })
  }
  
  // Run analysis
  const handleAnalyze = async () => {
    if (!corpusId || textIds.length === 0) {
      setError(t('topicModeling.lsa.selectTextsFirst', 'Please select texts first'))
      return
    }
    
    setAnalyzing(true)
    setError(null)
    onAnalysisStart()
    
    try {
      const response = await topicModelingApi.analyzeLSA(
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
  
  // Handle optimize complete
  const handleOptimizeComplete = (result: LSAOptimizeResult) => {
    onOptimizeComplete(result)
  }
  
  return (
    <Paper sx={{ p: 2 }}>
      <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 2 }}>
        {t('topicModeling.lsa.params.title', 'LSA Parameters')}
      </Typography>
      
      <Stack spacing={2}>
        {/* Basic Parameters */}
        <Stack direction="row" spacing={2}>
          <NumberInput
            label={t('topicModeling.lsa.params.numTopics', 'Topics')}
            size="small"
            value={config.num_topics}
            onChange={(val) => handleConfigChange('num_topics', val)}
            min={2}
            max={100}
            integer
            sx={{ flex: 1 }}
          />
          <NumberInput
            label={t('topicModeling.lsa.params.numKeywords', 'Keywords')}
            size="small"
            value={config.num_keywords}
            onChange={(val) => handleConfigChange('num_keywords', val)}
            min={5}
            max={50}
            integer
            sx={{ flex: 1 }}
          />
        </Stack>
        
        {/* SVD Algorithm */}
        <FormControl size="small" fullWidth>
          <InputLabel>{t('topicModeling.lsa.params.svdAlgorithm', 'SVD Algorithm')}</InputLabel>
          <Select
            value={config.svd_algorithm}
            label={t('topicModeling.lsa.params.svdAlgorithm', 'SVD Algorithm')}
            onChange={(e) => handleConfigChange('svd_algorithm', e.target.value)}
          >
            <MenuItem value="randomized">Randomized</MenuItem>
            <MenuItem value="arpack">ARPACK</MenuItem>
          </Select>
        </FormControl>
        
        {/* Max Features */}
        <NumberInput
          label={t('topicModeling.lsa.params.maxFeatures', 'Max Features')}
          size="small"
          value={config.max_features}
          onChange={(val) => handleConfigChange('max_features', val)}
          min={1000}
          max={50000}
          step={1000}
          integer
          fullWidth
          helperText={t('topicModeling.lsa.params.maxFeaturesHelp', 'Maximum vocabulary size')}
        />
        
        {/* Tolerance */}
        <FormControl size="small" fullWidth>
          <InputLabel>{t('topicModeling.lsa.params.tolerance', 'Tolerance')}</InputLabel>
          <Select
            value={config.tol}
            label={t('topicModeling.lsa.params.tolerance', 'Tolerance')}
            onChange={(e) => handleConfigChange('tol', e.target.value)}
          >
            <MenuItem value={0.0}>0 (Default)</MenuItem>
            <MenuItem value={1e-3}>1e-3</MenuItem>
            <MenuItem value={1e-4}>1e-4</MenuItem>
            <MenuItem value={1e-5}>1e-5</MenuItem>
          </Select>
        </FormControl>
        
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
                {t('topicModeling.lsa.params.advanced', 'Advanced')}
              </Typography>
            </Stack>
          </AccordionSummary>
          
          <AccordionDetails>
            <Stack spacing={2}>
              {/* Randomized SVD specific parameters */}
              {config.svd_algorithm === 'randomized' && (
                <>
                  <Stack direction="row" spacing={2}>
                    <NumberInput
                      label={t('topicModeling.lsa.params.nIter', 'Power Iterations')}
                      size="small"
                      value={config.n_iter}
                      onChange={(val) => handleConfigChange('n_iter', val)}
                      min={1}
                      max={20}
                      integer
                      sx={{ flex: 1 }}
                    />
                    <NumberInput
                      label={t('topicModeling.lsa.params.nOversamples', 'Oversamples')}
                      size="small"
                      value={config.n_oversamples}
                      onChange={(val) => handleConfigChange('n_oversamples', val)}
                      min={1}
                      max={50}
                      integer
                      sx={{ flex: 1 }}
                    />
                  </Stack>
                  
                  <FormControl size="small" fullWidth>
                    <InputLabel>{t('topicModeling.lsa.params.normalizer', 'Normalizer')}</InputLabel>
                    <Select
                      value={config.power_iteration_normalizer}
                      label={t('topicModeling.lsa.params.normalizer', 'Normalizer')}
                      onChange={(e) => handleConfigChange('power_iteration_normalizer', e.target.value)}
                    >
                      <MenuItem value="auto">Auto</MenuItem>
                      <MenuItem value="QR">QR</MenuItem>
                      <MenuItem value="LU">LU</MenuItem>
                      <MenuItem value="none">None</MenuItem>
                    </Select>
                  </FormControl>
                </>
              )}
              
              {/* Random seed */}
              <NumberInput
                label={t('topicModeling.lsa.params.randomSeed', 'Random Seed')}
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
              ? t('topicModeling.lsa.analyzing', 'Analyzing...')
              : t('topicModeling.lsa.analyze', 'Run LSA')
            }
          </Button>
          <Tooltip title={t('topicModeling.lsa.optimizeTopics', 'Find Optimal Topic Number')}>
            <Button
              variant="outlined"
              color="primary"
              startIcon={optimizing ? <CircularProgress size={20} /> : <AutoGraphIcon />}
              onClick={() => setOptimizeDialogOpen(true)}
              disabled={analyzing || optimizing || disabled || textIds.length === 0}
            >
              {optimizing ? '...' : t('topicModeling.lsa.optimize', 'Optimize')}
            </Button>
          </Tooltip>
        </Stack>
        
        {/* Info text */}
        <Typography variant="caption" color="text.secondary">
          {t('topicModeling.lsa.info', 'LSA uses Singular Value Decomposition to discover latent semantic structure.')}
        </Typography>
      </Stack>
      
      {/* Variance Optimization Dialog */}
      <VarianceDialog
        open={optimizeDialogOpen}
        onClose={() => setOptimizeDialogOpen(false)}
        corpusId={corpusId}
        textIds={textIds}
        language={language}
        preprocessConfig={preprocessConfig}
        lsaConfig={config}
        onOptimizeComplete={handleOptimizeComplete}
      />
    </Paper>
  )
}
