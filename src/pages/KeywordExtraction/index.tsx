/**
 * Keyword Extraction Page
 * Main page with tabs for single-document algorithms and keyness comparison
 */

import { useState } from 'react'
import {
  Box,
  Typography,
  Tabs,
  Tab,
  Stack,
  Chip
} from '@mui/material'
import { useTranslation } from 'react-i18next'

import SingleDocTab from './SingleDoc'
import KeynessTab from './Keyness'

export default function KeywordExtraction() {
  const { t } = useTranslation()
  
  // Main tab (Single Doc / Keyness)
  const [mainTab, setMainTab] = useState(0)

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Top-level Tabs */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider', px: 2 }}>
        <Tabs 
          value={mainTab} 
          onChange={(_, v) => setMainTab(v)}
          sx={{ minHeight: 48 }}
        >
          <Tab 
            label={t('keyword.tabs.singleDoc', 'Single Document')} 
            sx={{ minHeight: 48 }}
          />
          <Tab 
            label={t('keyword.tabs.keyness', 'Keyness Comparison')} 
            sx={{ minHeight: 48 }}
          />
        </Tabs>
      </Box>

      {/* Tab Content */}
      <Box sx={{ flex: 1, overflow: 'hidden' }}>
        {/* Single Document Tab - use display to preserve state */}
        <Box sx={{ display: mainTab === 0 ? 'flex' : 'none', height: '100%' }}>
          <SingleDocTab />
        </Box>

        {/* Keyness Comparison Tab - use display to preserve state */}
        <Box sx={{ display: mainTab === 1 ? 'flex' : 'none', height: '100%' }}>
          <KeynessTab />
        </Box>
      </Box>
    </Box>
  )
}
