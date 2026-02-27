/**
 * Keyword Extraction Page
 * Main page with tabs for single-document algorithms and keyness comparison.
 * Tabs are lazy-loaded so the first visit only mounts the active tab (reduces initial freeze).
 */

import { useState, lazy, Suspense } from 'react'
import {
  Box,
  Tabs,
  Tab,
  CircularProgress
} from '@mui/material'
import { useTranslation } from 'react-i18next'
import type { CrossLinkParams } from '../../types/crossLink'

const SingleDocTab = lazy(() => import('./SingleDoc'))
const KeynessTab = lazy(() => import('./Keyness'))

interface KeywordExtractionProps {
  crossLinkParams?: CrossLinkParams
}

function TabFallback() {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: 200 }}>
      <CircularProgress />
    </Box>
  )
}

export default function KeywordExtraction({ crossLinkParams }: KeywordExtractionProps = {}) {
  const { t } = useTranslation()
  const [mainTab, setMainTab] = useState(0)

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
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

      <Box sx={{ flex: 1, overflow: 'hidden' }}>
        <Suspense fallback={<TabFallback />}>
          {mainTab === 0 ? (
            <Box sx={{ display: 'flex', height: '100%' }}>
              <SingleDocTab crossLinkParams={crossLinkParams} />
            </Box>
          ) : (
            <Box sx={{ display: 'flex', height: '100%' }}>
              <KeynessTab crossLinkParams={crossLinkParams} />
            </Box>
          )}
        </Suspense>
      </Box>
    </Box>
  )
}
