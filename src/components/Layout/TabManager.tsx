import { useState, useEffect, useRef, lazy, Suspense } from 'react'
import {
  Box,
  Tabs,
  Tab,
  IconButton,
  Menu,
  MenuItem,
  CircularProgress,
  Typography,
  styled,
  TabsActions
} from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import MoreVertIcon from '@mui/icons-material/MoreVert'
import HomeIcon from '@mui/icons-material/Home'
import FolderIcon from '@mui/icons-material/Folder'
import BarChartIcon from '@mui/icons-material/BarChart'
import AccountTreeIcon from '@mui/icons-material/AccountTree'
import VpnKeyIcon from '@mui/icons-material/VpnKey'
import TextFieldsIcon from '@mui/icons-material/TextFields'
import LinkIcon from '@mui/icons-material/Link'
import SchemaIcon from '@mui/icons-material/Schema'
import HubIcon from '@mui/icons-material/Hub'
import AutoGraphIcon from '@mui/icons-material/AutoGraph'
import EditNoteIcon from '@mui/icons-material/EditNote'
import TopicIcon from '@mui/icons-material/Topic'
import SettingsIcon from '@mui/icons-material/Settings'
import HelpIcon from '@mui/icons-material/Help'
import { useTranslation } from 'react-i18next'
import { useTabStore } from '../../stores/tabStore'
import { useSettingsStore } from '../../stores/settingsStore'
import type { Tab as TabType, TabType as TabTypeEnum, CrossLinkParams } from '../../types'

// Lazy load page components
const HomePage = lazy(() => import('../../pages/Home/HomePage'))
const CorpusManagement = lazy(() => import('../../pages/CorpusManagement'))
const WordFrequency = lazy(() => import('../../pages/WordFrequency'))
const SynonymAnalysis = lazy(() => import('../../pages/WordFamily'))
const KeywordExtraction = lazy(() => import('../../pages/KeywordExtraction'))
const NGram = lazy(() => import('../../pages/NGram'))
const Collocation = lazy(() => import('../../pages/Collocation'))
const SemanticAnalysis = lazy(() => import('../../pages/SemanticAnalysis'))
const WordSketch = lazy(() => import('../../pages/WordSketch'))
const BiblioVisualization = lazy(() => import('../../pages/BiblioVisualization'))
const Annotation = lazy(() => import('../../pages/Annotation'))
const TopicModeling = lazy(() => import('../../pages/TopicModeling'))
const Settings = lazy(() => import('../../pages/Settings'))
const Help = lazy(() => import('../../pages/Help'))

const StyledTabs = styled(Tabs)(({ theme }) => ({
  minHeight: 36,
  backgroundColor: 'transparent',
  '& .MuiTabs-indicator': {
    height: 3,
    borderRadius: '3px 3px 0 0'
  }
}))

const StyledTab = styled(Tab)(({ theme }) => ({
  minHeight: 36,
  padding: '6px 12px',
  fontSize: '0.875rem',
  textTransform: 'none',
  '&.Mui-selected': {
    backgroundColor: theme.palette.mode === 'dark' 
      ? 'rgba(255, 255, 255, 0.08)' 
      : 'rgba(0, 0, 0, 0.04)'
  }
}))

// Tab icon mapping
const tabIcons: Record<TabTypeEnum, React.ReactNode> = {
  home: <HomeIcon fontSize="small" />,
  corpus: <FolderIcon fontSize="small" />,
  wordfreq: <BarChartIcon fontSize="small" />,
  synonym: <AccountTreeIcon fontSize="small" />,
  keyword: <VpnKeyIcon fontSize="small" />,
  ngram: <TextFieldsIcon fontSize="small" />,
  collocation: <LinkIcon fontSize="small" />,
  semantic: <SchemaIcon fontSize="small" />,
  wordsketch: <HubIcon fontSize="small" />,
  biblio: <AutoGraphIcon fontSize="small" />,
  annotation: <EditNoteIcon fontSize="small" />,
  topic: <TopicIcon fontSize="small" />,
  settings: <SettingsIcon fontSize="small" />,
  help: <HelpIcon fontSize="small" />
}

// Tab content renderer
function TabContent({ tab }: { tab: TabType }) {
  // Extract crossLinkParams from tab props if present
  const crossLinkParams = tab.props?.crossLinkParams as CrossLinkParams | undefined

  switch (tab.type) {
    case 'home':
      return <HomePage />
    case 'corpus':
      return <CorpusManagement />
    case 'wordfreq':
      return <WordFrequency />
    case 'synonym':
      return <SynonymAnalysis />
    case 'keyword':
      return <KeywordExtraction />
    case 'ngram':
      return <NGram />
    case 'collocation':
      return <Collocation crossLinkParams={crossLinkParams} />
    case 'semantic':
      return <SemanticAnalysis />
    case 'wordsketch':
      return <WordSketch crossLinkParams={crossLinkParams} />
    case 'biblio':
      return <BiblioVisualization />
    case 'annotation':
      return <Annotation />
    case 'topic':
      return <TopicModeling />
    case 'settings':
      return <Settings />
    case 'help':
      return <Help />
    default:
      return <Typography>Unknown tab type</Typography>
  }
}

// Loading fallback
function LoadingFallback() {
  return (
    <Box 
      sx={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center',
        height: '100%',
        flexDirection: 'column',
        gap: 2
      }}
    >
      <CircularProgress />
      <Typography color="text.secondary">Loading...</Typography>
    </Box>
  )
}

export default function TabManager() {
  const { t } = useTranslation()
  const { tabs, activeTabId, setActiveTab, closeTab, closeAllTabs, closeOtherTabs } = useTabStore()
  const { darkMode, customWallpaper, wallpaperOpacity } = useSettingsStore()
  const tabsActionRef = useRef<TabsActions>(null)
  
  const [contextMenu, setContextMenu] = useState<{
    mouseX: number
    mouseY: number
    tabId: string
  } | null>(null)

  // Force tabs indicator recalculation after tabs change (fixes positioning issue on cross-link navigation)
  useEffect(() => {
    const timer = setTimeout(() => {
      tabsActionRef.current?.updateIndicator()
      tabsActionRef.current?.updateScrollButtons()
    }, 50)
    return () => clearTimeout(timer)
  }, [tabs.length, activeTabId])
  

  const handleTabChange = (_: React.SyntheticEvent, newValue: string) => {
    setActiveTab(newValue)
  }

  const handleCloseTab = (e: React.MouseEvent, tabId: string) => {
    e.stopPropagation()
    closeTab(tabId)
  }

  const handleContextMenu = (e: React.MouseEvent, tabId: string) => {
    e.preventDefault()
    setContextMenu({
      mouseX: e.clientX,
      mouseY: e.clientY,
      tabId
    })
  }

  const handleCloseContextMenu = () => {
    setContextMenu(null)
  }

  const handleCloseOthers = () => {
    if (contextMenu) {
      closeOtherTabs(contextMenu.tabId)
    }
    handleCloseContextMenu()
  }

  const handleCloseAll = () => {
    closeAllTabs()
    handleCloseContextMenu()
  }

  const activeTab = tabs.find(tab => tab.id === activeTabId)

  // 标签栏样式，添加底部边框
  const tabBarStyle = {
    bgcolor: darkMode ? 'background.paper' : 'grey.100',
    borderBottom: 1,
    borderColor: 'divider'
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      {/* Tab bar */}
      <Box sx={{ ...tabBarStyle }}>
        <StyledTabs
          value={activeTabId}
          onChange={handleTabChange}
          variant="scrollable"
          scrollButtons="auto"
          action={tabsActionRef}
        >
          {tabs.map((tab) => (
            <StyledTab
              key={tab.id}
              value={tab.id}
              onContextMenu={(e) => handleContextMenu(e, tab.id)}
              icon={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  {tabIcons[tab.type]}
                  <Typography variant="body2" sx={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {t(tab.title)}
                  </Typography>
                  {tab.closable !== false && (
                    <IconButton
                      size="small"
                      onClick={(e) => handleCloseTab(e, tab.id)}
                      sx={{ 
                        ml: 0.5, 
                        p: 0.25,
                        '&:hover': { bgcolor: 'action.hover' }
                      }}
                    >
                      <CloseIcon sx={{ fontSize: 14 }} />
                    </IconButton>
                  )}
                </Box>
              }
              iconPosition="start"
              sx={{ minWidth: 'auto' }}
            />
          ))}
        </StyledTabs>
      </Box>

      {/* Tab content */}
      <Box sx={{ 
        flex: 1, 
        overflow: 'hidden',
        position: 'relative',
        bgcolor: darkMode ? 'background.default' : '#ffffff'
      }}>
        {/* Custom wallpaper background */}
        {customWallpaper && (
          <Box
            component="img"
            src={customWallpaper}
            alt=""
            sx={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              opacity: wallpaperOpacity,
              zIndex: 0,
              pointerEvents: 'none'
            }}
          />
        )}
        
        <Suspense fallback={<LoadingFallback />}>
          {tabs.map((tab) => (
            <Box
              key={tab.id}
              sx={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                overflow: 'auto',
                display: tab.id === activeTabId ? 'block' : 'none',
                zIndex: 1
              }}
            >
              <TabContent tab={tab} />
            </Box>
          ))}
        </Suspense>
      </Box>

      {/* Context menu */}
      <Menu
        open={contextMenu !== null}
        onClose={handleCloseContextMenu}
        anchorReference="anchorPosition"
        anchorPosition={
          contextMenu !== null
            ? { top: contextMenu.mouseY, left: contextMenu.mouseX }
            : undefined
        }
      >
        <MenuItem onClick={handleCloseContextMenu}>
          {t('tabs.closeTab')}
        </MenuItem>
        <MenuItem onClick={handleCloseOthers}>
          {t('tabs.closeOthers')}
        </MenuItem>
        <MenuItem onClick={handleCloseAll}>
          {t('tabs.closeAll')}
        </MenuItem>
      </Menu>
    </Box>
  )
}

