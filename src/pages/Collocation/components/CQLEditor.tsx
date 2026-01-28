/**
 * CQL Editor Component
 * Editor for Corpus Query Language with syntax validation and help
 */

import { useState, useEffect, useCallback } from 'react'
import {
  Box,
  TextField,
  Typography,
  Paper,
  Collapse,
  IconButton,
  Alert,
  Chip,
  Stack,
  Tooltip
} from '@mui/material'
import HelpOutlineIcon from '@mui/icons-material/HelpOutline'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import ErrorIcon from '@mui/icons-material/Error'
import BuildIcon from '@mui/icons-material/Build'
import { useTranslation } from 'react-i18next'
import { collocationApi } from '../../../api'
import { CQLBuilderDialog } from './CQLBuilder'

interface CQLEditorProps {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}

// Example CQL queries
const CQL_EXAMPLES = [
  { query: '[word="test"]', desc: { zh: '匹配词形 "test"', en: 'Match word "test"' } },
  { query: '[lemma="go"]', desc: { zh: '匹配词元 "go"', en: 'Match lemma "go"' } },
  { query: '[pos="NOUN"]', desc: { zh: '匹配所有名词', en: 'Match all nouns' } },
  { query: '[pos="NOUN" & lemma="test"]', desc: { zh: '名词且词元为test', en: 'Noun with lemma "test"' } },
  { query: '[pos="NOUN" | pos="VERB"]', desc: { zh: '名词或动词', en: 'Noun or verb' } },
  { query: '[lemma="make"] [] [pos="NOUN"]', desc: { zh: 'make + 任意词 + 名词', en: 'make + any + noun' } },
  { query: '[word=".*ing"]', desc: { zh: '以ing结尾的词', en: 'Words ending in -ing' } }
]

export default function CQLEditor({
  value,
  onChange,
  disabled = false
}: CQLEditorProps) {
  const { i18n } = useTranslation()
  const isZh = i18n.language === 'zh'

  const [showHelp, setShowHelp] = useState(false)
  const [showBuilder, setShowBuilder] = useState(false)
  const [validation, setValidation] = useState<{ valid: boolean; error?: string } | null>(null)
  const [validating, setValidating] = useState(false)

  // Debounced validation
  const validateQuery = useCallback(async (query: string) => {
    if (!query.trim()) {
      setValidation(null)
      return
    }

    setValidating(true)
    try {
      const response = await collocationApi.parseCQL(query)
      if (response.success && response.data) {
        setValidation(response.data)
      }
    } catch (err) {
      // Ignore errors
    } finally {
      setValidating(false)
    }
  }, [])

  // Validate on value change with debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      validateQuery(value)
    }, 500)
    return () => clearTimeout(timer)
  }, [value, validateQuery])

  // Insert example
  const handleExampleClick = (query: string) => {
    onChange(query)
  }

  return (
    <Box>
      {/* Editor */}
      <TextField
        multiline
        rows={3}
        fullWidth
        size="small"
        placeholder={isZh ? '输入CQL查询表达式...' : 'Enter CQL query expression...'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        sx={{
          fontFamily: 'monospace',
          '& .MuiInputBase-input': {
            fontFamily: 'monospace'
          }
        }}
        InputProps={{
          endAdornment: (
            <Box sx={{ display: 'flex', alignItems: 'center', ml: 1, gap: 0.5 }}>
              {validating ? null : validation ? (
                validation.valid ? (
                  <Tooltip title={isZh ? '语法正确' : 'Valid syntax'}>
                    <CheckCircleIcon color="success" fontSize="small" />
                  </Tooltip>
                ) : (
                  <Tooltip title={validation.error || (isZh ? '语法错误' : 'Syntax error')}>
                    <ErrorIcon color="error" fontSize="small" />
                  </Tooltip>
                )
              ) : null}
              <Tooltip title={isZh ? 'CQL 构建器' : 'CQL Builder'}>
                <IconButton 
                  size="small" 
                  onClick={() => setShowBuilder(true)}
                  disabled={disabled}
                  sx={{ 
                    bgcolor: 'primary.50',
                    '&:hover': { bgcolor: 'primary.100' }
                  }}
                >
                  <BuildIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <IconButton size="small" onClick={() => setShowHelp(!showHelp)}>
                <HelpOutlineIcon fontSize="small" />
              </IconButton>
            </Box>
          )
        }}
      />

      {/* Validation error */}
      {validation && !validation.valid && validation.error && (
        <Alert severity="error" sx={{ mt: 1 }} icon={false}>
          <Typography variant="body2">{validation.error}</Typography>
        </Alert>
      )}

      {/* Help panel */}
      <Collapse in={showHelp}>
        <Paper sx={{ mt: 1, p: 1.5, bgcolor: 'action.hover' }}>
          <Typography variant="subtitle2" gutterBottom>
            {isZh ? 'CQL语法帮助' : 'CQL Syntax Help'}
          </Typography>

          {/* Syntax reference */}
          <Box sx={{ mb: 2 }}>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              {isZh ? '基本语法' : 'Basic Syntax'}:
            </Typography>
            <Stack spacing={0.5}>
              <Typography variant="body2" fontFamily="monospace" fontSize="0.8rem">
                [word="text"] - {isZh ? '词形匹配' : 'Word match'}
              </Typography>
              <Typography variant="body2" fontFamily="monospace" fontSize="0.8rem">
                [lemma="go"] - {isZh ? '词元匹配' : 'Lemma match'}
              </Typography>
              <Typography variant="body2" fontFamily="monospace" fontSize="0.8rem">
                [pos="NOUN"] - {isZh ? '词性匹配 (Universal POS)' : 'POS match (Universal POS)'}
              </Typography>
              <Typography variant="body2" fontFamily="monospace" fontSize="0.8rem">
                [tag="NN"] - {isZh ? '细粒度词性 (Penn Treebank)' : 'Fine-grained POS (Penn Treebank)'}
              </Typography>
              <Typography variant="body2" fontFamily="monospace" fontSize="0.8rem">
                [dep="nsubj"] - {isZh ? '依存关系匹配' : 'Dependency match'}
              </Typography>
            </Stack>
          </Box>

          {/* Operators */}
          <Box sx={{ mb: 2 }}>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              {isZh ? '运算符' : 'Operators'}:
            </Typography>
            <Stack spacing={0.5}>
              <Typography variant="body2" fontFamily="monospace" fontSize="0.8rem">
                & - AND | | - OR | ! - NOT
              </Typography>
              <Typography variant="body2" fontFamily="monospace" fontSize="0.8rem">
                [] - {isZh ? '任意token' : 'Any token'} | []{'{2}'} - {isZh ? '2个任意token' : '2 any tokens'}
              </Typography>
              <Typography variant="body2" fontFamily="monospace" fontSize="0.8rem">
                []{'{1,3}'} - {isZh ? '1-3个任意token' : '1-3 any tokens'}
              </Typography>
            </Stack>
          </Box>

          {/* Examples */}
          <Box>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              {isZh ? '示例' : 'Examples'}:
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
              {CQL_EXAMPLES.map((example, idx) => (
                <Tooltip key={idx} title={isZh ? example.desc.zh : example.desc.en}>
                  <Chip
                    label={example.query}
                    size="small"
                    variant="outlined"
                    onClick={() => handleExampleClick(example.query)}
                    sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}
                  />
                </Tooltip>
              ))}
            </Box>
          </Box>
        </Paper>
      </Collapse>

      {/* CQL Builder Dialog */}
      <CQLBuilderDialog
        open={showBuilder}
        onClose={() => setShowBuilder(false)}
        onApply={(cql) => {
          onChange(cql)
          setShowBuilder(false)
        }}
        initialCQL={value}
      />
    </Box>
  )
}
