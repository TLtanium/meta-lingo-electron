import { useState, useCallback } from 'react'
import {
  Box,
  Tabs,
  Tab
} from '@mui/material'
import UploadFileIcon from '@mui/icons-material/UploadFile'
import ListIcon from '@mui/icons-material/List'
import InfoIcon from '@mui/icons-material/Info'
import { useTranslation } from 'react-i18next'
import UploadPanel from './UploadPanel'
import CorpusList from './CorpusList'
import CorpusDetail from './CorpusDetail'
import type { Corpus } from '../../types'

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
      sx={{ flex: 1, overflow: 'auto' }}
      {...other}
    >
      {value === index && children}
    </Box>
  )
}

export default function CorpusManagement() {
  const { t } = useTranslation()
  const [tabIndex, setTabIndex] = useState(1) // Start on list view
  const [selectedCorpus, setSelectedCorpus] = useState<Corpus | null>(null)

  const handleTabChange = (_: React.SyntheticEvent, newValue: number) => {
    setTabIndex(newValue)
  }

  const handleSelectCorpus = useCallback((corpus: Corpus) => {
    setSelectedCorpus(corpus)
    setTabIndex(2) // Switch to detail view
  }, [])

  const handleBack = useCallback(() => {
    setSelectedCorpus(null)
    setTabIndex(1) // Back to list
  }, [])

  const handleCorpusCreated = useCallback((corpus: Corpus) => {
    // Set the corpus and switch to detail view to show processing progress
    setSelectedCorpus(corpus)
    setTabIndex(2) // Go to detail view immediately
  }, [])

  const handleUploadComplete = useCallback(() => {
    // When uploads are submitted (not necessarily complete), switch to detail view
    if (selectedCorpus) {
      setTabIndex(2)
    }
  }, [selectedCorpus])

  const handleCreateNew = useCallback(() => {
    setTabIndex(0) // Go to upload panel
  }, [])

  const handleGoToUpload = useCallback(() => {
    setTabIndex(0)
  }, [])

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Tab navigation */}
      <Tabs
        value={tabIndex}
        onChange={handleTabChange}
        sx={{ borderBottom: 1, borderColor: 'divider', px: 2 }}
      >
        <Tab 
          icon={<UploadFileIcon />} 
          iconPosition="start" 
          label={t('corpus.upload')} 
        />
        <Tab 
          icon={<ListIcon />} 
          iconPosition="start" 
          label={t('corpus.list')} 
        />
        <Tab 
          icon={<InfoIcon />} 
          iconPosition="start" 
          label={t('corpus.detail')}
          disabled={!selectedCorpus}
        />
      </Tabs>

      {/* Tab panels */}
      <TabPanel value={tabIndex} index={0}>
        <UploadPanel 
          selectedCorpus={selectedCorpus}
          onCorpusCreated={handleCorpusCreated}
          onUploadComplete={handleUploadComplete}
        />
      </TabPanel>
      <TabPanel value={tabIndex} index={1}>
        <CorpusList 
          onSelectCorpus={handleSelectCorpus} 
          onCreateNew={handleCreateNew}
        />
      </TabPanel>
      <TabPanel value={tabIndex} index={2}>
        {selectedCorpus && (
          <CorpusDetail 
            corpus={selectedCorpus}
            onBack={handleBack}
            onUpload={handleGoToUpload}
          />
        )}
      </TabPanel>
    </Box>
  )
}
