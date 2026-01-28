/**
 * Word Sketch Page
 * Two-tab layout: Word Sketch and Word Sketch Difference
 */

import { useState, useEffect, useRef } from 'react'
import {
  Box,
  Tabs,
  Tab,
  Paper,
  TabsActions
} from '@mui/material'
import BubbleChartIcon from '@mui/icons-material/BubbleChart'
import CompareArrowsIcon from '@mui/icons-material/CompareArrows'
import { useTranslation } from 'react-i18next'
import type { CrossLinkParams } from '../../types'
import WordSketchTab from './WordSketchTab'
import WordSketchDiffTab from './WordSketchDiffTab'

interface TabPanelProps {
  children?: React.ReactNode
  index: number
  value: number
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props
  return (
    <Box
      role="tabpanel"
      hidden={value !== index}
      sx={{ 
        flex: 1, 
        overflow: 'hidden', 
        display: value === index ? 'flex' : 'none',
        width: '100%',
        height: '100%',
        minWidth: 0,
        minHeight: 0
      }}
      {...other}
    >
      {children}
    </Box>
  )
}

interface WordSketchProps {
  crossLinkParams?: CrossLinkParams
}

export default function WordSketch({ crossLinkParams }: WordSketchProps) {
  const { t } = useTranslation()
  const [tabIndex, setTabIndex] = useState(0)
  const tabsActionRef = useRef<TabsActions>(null)

  // Force tabs indicator recalculation after mount (fixes positioning issue on cross-link navigation)
  useEffect(() => {
    const timer = setTimeout(() => {
      tabsActionRef.current?.updateIndicator()
    }, 100)
    return () => clearTimeout(timer)
  }, [])

  const handleTabChange = (_: React.SyntheticEvent, newValue: number) => {
    setTabIndex(newValue)
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', overflow: 'hidden' }}>
      {/* Mode tabs */}
      <Paper sx={{ borderRadius: 0, flexShrink: 0 }}>
        <Tabs
          value={tabIndex}
          onChange={handleTabChange}
          action={tabsActionRef}
          sx={{ borderBottom: 1, borderColor: 'divider' }}
        >
          <Tab 
            icon={<BubbleChartIcon />} 
            iconPosition="start" 
            label={t('wordsketch.wordSketchTab')} 
          />
          <Tab 
            icon={<CompareArrowsIcon />} 
            iconPosition="start" 
            label={t('wordsketch.sketchDifferenceTab')} 
          />
        </Tabs>
      </Paper>

      {/* Tab panels */}
      <Box sx={{ flex: 1, overflow: 'hidden', display: 'flex', minHeight: 0 }}>
        <TabPanel value={tabIndex} index={0}>
          <WordSketchTab crossLinkParams={crossLinkParams} />
        </TabPanel>
        <TabPanel value={tabIndex} index={1}>
          <WordSketchDiffTab />
        </TabPanel>
      </Box>
    </Box>
  )
}
