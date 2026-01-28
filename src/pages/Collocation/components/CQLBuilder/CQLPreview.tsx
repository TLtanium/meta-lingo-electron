/**
 * CQL Preview Component
 * Displays the generated CQL query with syntax highlighting
 */

import { Box, Typography, IconButton, Tooltip, Paper } from '@mui/material'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import CheckIcon from '@mui/icons-material/Check'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { CQLPreviewProps } from './types'

export default function CQLPreview({ cql, isValid, error, onCopy }: CQLPreviewProps) {
  const { i18n } = useTranslation()
  const isZh = i18n.language === 'zh'
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    onCopy()
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Simple syntax highlighting for CQL
  const highlightCQL = (query: string): JSX.Element[] => {
    if (!query) return []
    
    const parts: JSX.Element[] = []
    let key = 0
    
    // Split by brackets and highlight
    const regex = /(\[|\]|\{|\}|"|=|!=|==|!==|&|\|)/g
    const tokens = query.split(regex)
    
    tokens.forEach((token) => {
      if (!token) return
      
      if (token === '[' || token === ']') {
        parts.push(
          <span key={key++} style={{ color: '#0066cc', fontWeight: 'bold' }}>
            {token}
          </span>
        )
      } else if (token === '{' || token === '}') {
        parts.push(
          <span key={key++} style={{ color: '#9933cc', fontWeight: 'bold' }}>
            {token}
          </span>
        )
      } else if (token === '"') {
        parts.push(
          <span key={key++} style={{ color: '#cc6600' }}>
            {token}
          </span>
        )
      } else if (['=', '!=', '==', '!=='].includes(token)) {
        parts.push(
          <span key={key++} style={{ color: '#cc0066' }}>
            {token}
          </span>
        )
      } else if (token === '&' || token === '|') {
        parts.push(
          <span key={key++} style={{ color: '#009933', fontWeight: 'bold' }}>
            {token}
          </span>
        )
      } else {
        // Check for keywords
        const keywords = ['word', 'lemma', 'pos', 'tag', 'dep']
        let highlighted = token
        keywords.forEach(kw => {
          if (token.includes(kw)) {
            highlighted = token.replace(
              new RegExp(`\\b(${kw})\\b`, 'g'),
              `<kw>${kw}</kw>`
            )
          }
        })
        
        if (highlighted.includes('<kw>')) {
          const kwParts = highlighted.split(/(<kw>|<\/kw>)/)
          kwParts.forEach((part, idx) => {
            if (part === '<kw>' || part === '</kw>') return
            if (kwParts[idx - 1] === '<kw>') {
              parts.push(
                <span key={key++} style={{ color: '#0099cc' }}>
                  {part}
                </span>
              )
            } else {
              parts.push(<span key={key++}>{part}</span>)
            }
          })
        } else {
          parts.push(<span key={key++}>{token}</span>)
        }
      }
    })
    
    return parts
  }

  return (
    <Paper 
      sx={{ 
        p: 2, 
        bgcolor: 'grey.50',
        borderRadius: 1,
        border: '1px solid',
        borderColor: 'grey.300'
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
        <Typography variant="caption" color="text.secondary" fontWeight="medium">
          {isZh ? '生成的CQL语法' : 'Generated CQL'}
        </Typography>
        <Tooltip title={copied ? (isZh ? '已复制' : 'Copied') : (isZh ? '复制' : 'Copy')}>
          <IconButton size="small" onClick={handleCopy} disabled={!cql}>
            {copied ? <CheckIcon fontSize="small" color="success" /> : <ContentCopyIcon fontSize="small" />}
          </IconButton>
        </Tooltip>
      </Box>
      
      <Box
        sx={{
          fontFamily: 'monospace',
          fontSize: '0.95rem',
          p: 1.5,
          bgcolor: 'white',
          borderRadius: 0.5,
          border: '1px solid',
          borderColor: 'grey.200',
          minHeight: 40,
          wordBreak: 'break-all',
          whiteSpace: 'pre-wrap'
        }}
      >
        {cql ? highlightCQL(cql) : (
          <Typography variant="body2" color="text.disabled" sx={{ fontStyle: 'italic' }}>
            {isZh ? '请添加元素构建查询...' : 'Add elements to build query...'}
          </Typography>
        )}
      </Box>

      {/* Show hint only when there's an actual validation issue (not just empty) */}
      {cql && !isValid && error && (
        <Typography variant="caption" color="warning.main" sx={{ mt: 1, display: 'block' }}>
          💡 {error === 'Empty value in token' 
            ? (isZh ? '提示: 请填写 Token 的值' : 'Tip: Please fill in the token value')
            : (isZh ? '提示: ' + error : 'Tip: ' + error)
          }
        </Typography>
      )}
    </Paper>
  )
}
