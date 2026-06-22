/**
 * LabelStatChips - 标签统计彩色小标签列表（可展开）
 *
 * 默认折叠显示前 N 个标签，点击「+M more」展开显示全部，再点击「收起」折叠。
 * 用于标注历史可视化底部的统计摘要，替代原先固定 +num more 截断（无法查看全部标签）。
 */

import { useState } from 'react'
import { Box, Stack, Typography } from '@mui/material'
import { useTranslation } from 'react-i18next'

export interface LabelStat {
  name: string
  value: number
  color: string
}

interface LabelStatChipsProps {
  stats: LabelStat[]
  /** 折叠时显示的数量，默认 10 */
  collapsedCount?: number
}

export default function LabelStatChips({ stats, collapsedCount = 10 }: LabelStatChipsProps) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)

  if (stats.length === 0) return null

  const visible = expanded ? stats : stats.slice(0, collapsedCount)
  const hiddenCount = stats.length - collapsedCount

  return (
    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap alignItems="center">
      {visible.map((stat) => (
        <Box
          key={stat.name}
          sx={{
            display: 'inline-flex',
            alignItems: 'center',
            px: 1,
            py: 0.5,
            borderRadius: 1,
            bgcolor: `${stat.color}15`,
            border: `1px solid ${stat.color}30`
          }}
        >
          <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: stat.color, mr: 0.5 }} />
          <Typography variant="caption" sx={{ color: stat.color, fontWeight: 500 }}>
            {stat.name}: {stat.value}
          </Typography>
        </Box>
      ))}
      {hiddenCount > 0 && (
        <Typography
          variant="caption"
          color="primary"
          onClick={() => setExpanded(e => !e)}
          sx={{ cursor: 'pointer', fontWeight: 600, userSelect: 'none', '&:hover': { textDecoration: 'underline' } }}
        >
          {expanded
            ? t('common.collapse', '收起')
            : t('annotation.showAllLabels', '展开全部 ({{count}})', { count: stats.length })}
        </Typography>
      )}
    </Stack>
  )
}
