/**
 * Topic Information Table Component
 * Displays topic information in a table format
 */

import { useMemo } from 'react'
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Typography,
  Box
} from '@mui/material'
import { useTranslation } from 'react-i18next'

interface TopicInfoTableProps {
  data: Array<{
    topic_id: number
    topic_name: string
    count: number
    words: string
  }>
  totalTopics?: number
}

export default function TopicInfoTable({ data, totalTopics }: TopicInfoTableProps) {
  const { t } = useTranslation()

  const sortedData = useMemo(() => {
    return [...data].sort((a, b) => b.count - a.count)
  }, [data])

  if (!data || data.length === 0) {
    return (
      <Box sx={{ p: 4, textAlign: 'center' }}>
        <Typography variant="body2" color="text.secondary">
          {t('common.noData')}
        </Typography>
      </Box>
    )
  }

  return (
    <TableContainer component={Paper} sx={{ maxHeight: 600 }}>
      <Table stickyHeader size="small">
        <TableHead>
          <TableRow>
            <TableCell>
              <Typography variant="subtitle2" fontWeight="bold">
                {t('topicModeling.visualization.topicId')}
              </Typography>
            </TableCell>
            <TableCell>
              <Typography variant="subtitle2" fontWeight="bold">
                {t('topicModeling.visualization.topicName')}
              </Typography>
            </TableCell>
            <TableCell align="right">
              <Typography variant="subtitle2" fontWeight="bold">
                {t('topicModeling.visualization.documentCount')}
              </Typography>
            </TableCell>
            <TableCell>
              <Typography variant="subtitle2" fontWeight="bold">
                {t('topicModeling.visualization.keywords')}
              </Typography>
            </TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {sortedData.map((row) => (
            <TableRow key={row.topic_id} hover>
              <TableCell>{row.topic_id}</TableCell>
              <TableCell>
                <Typography variant="body2" fontWeight="medium">
                  {row.topic_name}
                </Typography>
              </TableCell>
              <TableCell align="right">{row.count}</TableCell>
              <TableCell>
                <Typography variant="body2" color="text.secondary">
                  {row.words}
                </Typography>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {totalTopics !== undefined && (
        <Box sx={{ p: 2, borderTop: 1, borderColor: 'divider' }}>
          <Typography variant="body2" color="text.secondary">
            {t('topicModeling.visualization.totalTopics', { count: totalTopics })}
          </Typography>
        </Box>
      )}
    </TableContainer>
  )
}
