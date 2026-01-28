import { useState } from 'react'
import {
  Box,
  Tabs,
  Tab,
  Paper
} from '@mui/material'
import TextSnippetIcon from '@mui/icons-material/TextSnippet'
import VideoLibraryIcon from '@mui/icons-material/VideoLibrary'
import HistoryIcon from '@mui/icons-material/History'
import AccountTreeIcon from '@mui/icons-material/AccountTree'
import CalculateIcon from '@mui/icons-material/Calculate'
import { useTranslation } from 'react-i18next'
import TextAnnotation from './TextAnnotation'
import MultimodalAnnotation from './MultimodalAnnotation'
import AnnotationHistory from './AnnotationHistory'
import FrameworkManager from './FrameworkManager'
import InterCoderReliability from './InterCoderReliability'

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
        display: value === index ? 'block' : 'none',
        width: '100%',
        height: '100%'
      }}
      {...other}
    >
      {children}
    </Box>
  )
}

export default function Annotation() {
  const { t } = useTranslation()
  const [tabIndex, setTabIndex] = useState(0)

  const handleTabChange = (_: React.SyntheticEvent, newValue: number) => {
    setTabIndex(newValue)
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Mode tabs */}
      <Paper sx={{ borderRadius: 0 }}>
        <Tabs
          value={tabIndex}
          onChange={handleTabChange}
          sx={{ borderBottom: 1, borderColor: 'divider' }}
          variant="scrollable"
          scrollButtons="auto"
        >
          <Tab 
            icon={<TextSnippetIcon />} 
            iconPosition="start" 
            label={t('annotation.textMode')} 
          />
          <Tab 
            icon={<VideoLibraryIcon />} 
            iconPosition="start" 
            label={t('annotation.multimodalMode')} 
          />
          <Tab 
            icon={<HistoryIcon />} 
            iconPosition="start" 
            label={t('annotation.history')} 
          />
          <Tab 
            icon={<AccountTreeIcon />} 
            iconPosition="start" 
            label={t('annotation.frameworkManager')} 
          />
          <Tab 
            icon={<CalculateIcon />} 
            iconPosition="start" 
            label={t('annotation.interCoderReliability')} 
          />
        </Tabs>
      </Paper>

      {/* Tab panels */}
      <TabPanel value={tabIndex} index={0}>
        <TextAnnotation />
      </TabPanel>
      <TabPanel value={tabIndex} index={1}>
        <MultimodalAnnotation />
      </TabPanel>
      <TabPanel value={tabIndex} index={2}>
        <AnnotationHistory />
      </TabPanel>
      <TabPanel value={tabIndex} index={3}>
        <FrameworkManager />
      </TabPanel>
      <TabPanel value={tabIndex} index={4}>
        <InterCoderReliability />
      </TabPanel>
    </Box>
  )
}

