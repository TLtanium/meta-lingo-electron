/**
 * Bibliographic Visualization Module Main Page
 * 
 * Provides library management and visualization features for WOS/CNKI data
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Box,
  Tabs,
  Tab,
  Typography,
  LinearProgress,
  Paper,
  TabsActions
} from '@mui/material'
import CloudUploadIcon from '@mui/icons-material/CloudUpload'
import ListIcon from '@mui/icons-material/List'
import BubbleChartIcon from '@mui/icons-material/BubbleChart'
import StorageIcon from '@mui/icons-material/Storage'
import { useTranslation } from 'react-i18next'
import type { BiblioLibrary } from '../../types/biblio'
import * as biblioApi from '../../api/biblio'
import UploadPanel from './UploadPanel'
import LibraryList from './LibraryList'
import LibraryDetail from './LibraryDetail'
import VisualizationPanel from './VisualizationPanel'

type TabValue = 'upload' | 'libraries' | 'detail' | 'visualization'

interface TabPanelProps {
  children?: React.ReactNode
  value: TabValue
  current: TabValue
}

function TabPanel({ children, value, current }: TabPanelProps) {
  return (
    <Box
      role="tabpanel"
      hidden={value !== current}
      sx={{ height: '100%', overflow: 'auto' }}
    >
      {value === current && children}
    </Box>
  )
}

export default function BiblioVisualization() {
  const { t } = useTranslation()
  const tabsActionRef = useRef<TabsActions>(null)
  
  const [currentTab, setCurrentTab] = useState<TabValue>('libraries')
  const [selectedLibrary, setSelectedLibrary] = useState<BiblioLibrary | null>(null)
  const [libraries, setLibraries] = useState<BiblioLibrary[]>([])
  const [loading, setLoading] = useState(true)

  // Force tabs indicator recalculation after mount
  useEffect(() => {
    const timer = setTimeout(() => {
      tabsActionRef.current?.updateIndicator()
    }, 100)
    return () => clearTimeout(timer)
  }, [])
  
  // Load libraries
  const loadLibraries = useCallback(async () => {
    setLoading(true)
    const response = await biblioApi.listLibraries()
    setLoading(false)
    
    if (response.success && response.data) {
      setLibraries(response.data.libraries)
    }
  }, [])
  
  useEffect(() => {
    loadLibraries()
  }, [loadLibraries])
  
  // Handle tab change
  const handleTabChange = (_: React.SyntheticEvent, newValue: TabValue) => {
    setCurrentTab(newValue)
  }
  
  // Handle library selection
  const handleSelectLibrary = (library: BiblioLibrary) => {
    setSelectedLibrary(library)
    setCurrentTab('detail')
  }
  
  // Handle library created
  const handleLibraryCreated = (library: BiblioLibrary) => {
    setSelectedLibrary(library)
    loadLibraries()
  }
  
  // Handle upload complete
  const handleUploadComplete = () => {
    loadLibraries()
    if (selectedLibrary) {
      // Refresh selected library
      biblioApi.getLibrary(selectedLibrary.id).then(response => {
        if (response.success && response.data) {
          setSelectedLibrary(response.data)
        }
      })
    }
  }
  
  // Handle back from detail
  const handleBackFromDetail = () => {
    setSelectedLibrary(null)
    setCurrentTab('libraries')
  }
  
  // Handle go to visualization
  const handleGoToVisualization = () => {
    if (selectedLibrary) {
      setCurrentTab('visualization')
    }
  }

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header with Tabs */}
      <Paper sx={{ borderRadius: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', px: 2, py: 1 }}>
          <StorageIcon sx={{ mr: 1, color: 'primary.main' }} />
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            {t('biblio.title')}
          </Typography>
        </Box>
        
        <Tabs 
          value={currentTab} 
          onChange={handleTabChange}
          action={tabsActionRef}
          sx={{ borderBottom: 1, borderColor: 'divider' }}
        >
          <Tab 
            icon={<CloudUploadIcon />} 
            iconPosition="start"
            label={t('biblio.upload')} 
            value="upload"
          />
          <Tab 
            icon={<ListIcon />} 
            iconPosition="start"
            label={t('biblio.libraries')} 
            value="libraries"
          />
          <Tab 
            icon={<ListIcon />} 
            iconPosition="start"
            label={t('biblio.libraryDetail')} 
            value="detail"
            disabled={!selectedLibrary}
          />
          <Tab 
            icon={<BubbleChartIcon />} 
            iconPosition="start"
            label={t('biblio.visualization')} 
            value="visualization"
            disabled={!selectedLibrary}
          />
        </Tabs>
      </Paper>
      
      {/* Loading indicator */}
      {loading && <LinearProgress />}
      
      {/* Tab Panels */}
      <Box sx={{ flex: 1, overflow: 'hidden' }}>
        <TabPanel value="upload" current={currentTab}>
          <UploadPanel
            selectedLibrary={selectedLibrary}
            onLibraryCreated={handleLibraryCreated}
            onUploadComplete={handleUploadComplete}
          />
        </TabPanel>
        
        <TabPanel value="libraries" current={currentTab}>
          <LibraryList
            onSelectLibrary={handleSelectLibrary}
            onCreateNew={() => setCurrentTab('upload')}
          />
        </TabPanel>
        
        <TabPanel value="detail" current={currentTab}>
          {selectedLibrary && (
            <LibraryDetail
              library={selectedLibrary}
              onBack={handleBackFromDetail}
              onUpload={() => setCurrentTab('upload')}
            />
          )}
        </TabPanel>
        
        <TabPanel value="visualization" current={currentTab}>
          {selectedLibrary && (
            <Box sx={{ height: '100%', p: 2 }}>
              <VisualizationPanel library={selectedLibrary} />
            </Box>
          )}
        </TabPanel>
      </Box>
    </Box>
  )
}
