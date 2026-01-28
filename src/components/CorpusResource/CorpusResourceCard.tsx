/**
 * Corpus Resource Card Component
 * Displays a corpus resource's information in a card format
 */

import React from 'react'
import {
  Card,
  CardContent,
  CardActionArea,
  Typography,
  Box,
  Chip,
  Stack,
  Tooltip,
  LinearProgress
} from '@mui/material'
import {
  Storage as StorageIcon,
  TextSnippet as TextIcon,
  Category as CategoryIcon
} from '@mui/icons-material'
import { useTranslation } from 'react-i18next'
import type { CorpusResource } from '../../types/keyword'

interface CorpusResourceCardProps {
  resource: CorpusResource
  selected?: boolean
  onClick?: () => void
  compact?: boolean
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

function formatWordCount(count: number): string {
  if (count < 1000) return count.toString()
  if (count < 1000000) return `${(count / 1000).toFixed(1)}K`
  return `${(count / 1000000).toFixed(2)}M`
}

// Color mapping for different corpus types
const CORPUS_COLORS: Record<string, string> = {
  bnc: '#1976d2',    // Blue
  brown: '#7b1fa2',  // Purple
  now: '#388e3c',    // Green
  oanc: '#f57c00'    // Orange
}

export const CorpusResourceCard: React.FC<CorpusResourceCardProps> = ({
  resource,
  selected = false,
  onClick,
  compact = false
}) => {
  const { t, i18n } = useTranslation()
  const isZh = i18n.language === 'zh'

  const displayName = isZh ? resource.name_zh : resource.name_en
  const description = isZh ? resource.description_zh : resource.description_en
  const corpusColor = CORPUS_COLORS[resource.prefix] || '#757575'

  if (compact) {
    return (
      <Card
        variant="outlined"
        sx={{
          cursor: onClick ? 'pointer' : 'default',
          borderColor: selected ? 'primary.main' : 'divider',
          borderWidth: selected ? 2 : 1,
          bgcolor: selected ? 'action.selected' : 'background.paper',
          transition: 'all 0.2s',
          '&:hover': onClick ? {
            borderColor: 'primary.light',
            bgcolor: 'action.hover',
            transform: 'translateY(-1px)',
            boxShadow: 1
          } : {}
        }}
        onClick={onClick}
      >
        <CardContent sx={{ py: 1.5, px: 2, '&:last-child': { pb: 1.5 } }}>
          <Stack direction="row" alignItems="center" spacing={1.5}>
            {/* Corpus type indicator */}
            <Box
              sx={{
                width: 4,
                height: 36,
                borderRadius: 1,
                bgcolor: corpusColor,
                flexShrink: 0
              }}
            />
            
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="subtitle2" fontWeight="bold" noWrap>
                {displayName}
              </Typography>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.5 }}>
                <Chip
                  size="small"
                  label={resource.prefix.toUpperCase()}
                  sx={{
                    height: 18,
                    bgcolor: `${corpusColor}15`,
                    color: corpusColor,
                    fontWeight: 'bold',
                    '& .MuiChip-label': { px: 0.8, fontSize: 10 }
                  }}
                />
                <Typography variant="caption" color="text.secondary">
                  {formatWordCount(resource.word_count)} {isZh ? '词' : 'words'}
                </Typography>
              </Stack>
            </Box>
          </Stack>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card
      variant="outlined"
      sx={{
        height: '100%',
        cursor: onClick ? 'pointer' : 'default',
        borderColor: selected ? 'primary.main' : 'divider',
        borderWidth: selected ? 2 : 1,
        bgcolor: selected ? 'action.selected' : 'background.paper',
        transition: 'all 0.2s',
        '&:hover': onClick ? {
          borderColor: 'primary.light',
          bgcolor: 'action.hover',
          transform: 'translateY(-2px)',
          boxShadow: 2
        } : {}
      }}
    >
      <CardActionArea 
        onClick={onClick} 
        disabled={!onClick}
        sx={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'stretch' }}
      >
        {/* Top color bar */}
        <Box sx={{ height: 4, bgcolor: corpusColor }} />
        
        <CardContent sx={{ py: 2, flex: 1, display: 'flex', flexDirection: 'column' }}>
          {/* Corpus type badge */}
          <Chip
            size="small"
            label={resource.prefix.toUpperCase()}
            sx={{
              alignSelf: 'flex-start',
              mb: 1,
              height: 22,
              bgcolor: `${corpusColor}15`,
              color: corpusColor,
              fontWeight: 'bold',
              '& .MuiChip-label': { px: 1, fontSize: 11 }
            }}
          />
          
          {/* Title */}
          <Typography variant="subtitle1" fontWeight="bold" sx={{ mb: 0.5, lineHeight: 1.3 }}>
            {displayName}
          </Typography>

          {/* Description */}
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{
              mb: 1.5,
              flex: 1,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              fontSize: '0.8rem',
              lineHeight: 1.4
            }}
          >
            {description}
          </Typography>

          {/* Stats */}
          <Stack direction="row" spacing={2} sx={{ mt: 'auto' }}>
            <Tooltip title={isZh ? '词汇数' : 'Word Count'}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <TextIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
                <Typography variant="body2" color="text.secondary" fontWeight="medium">
                  {formatWordCount(resource.word_count)}
                </Typography>
              </Box>
            </Tooltip>
            <Tooltip title={isZh ? '文件大小' : 'File Size'}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <StorageIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
                <Typography variant="body2" color="text.secondary">
                  {formatFileSize(resource.file_size)}
                </Typography>
              </Box>
            </Tooltip>
          </Stack>
        </CardContent>
      </CardActionArea>
    </Card>
  )
}

export default CorpusResourceCard
