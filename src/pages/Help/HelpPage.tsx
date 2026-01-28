import { useState, useEffect, useCallback } from 'react'
import {
  Box,
  Typography,
  List,
  ListItemButton,
  ListItemText,
  Paper,
  Divider,
  CircularProgress,
  Stack
} from '@mui/material'
import MenuBookIcon from '@mui/icons-material/MenuBook'
import ArticleIcon from '@mui/icons-material/Article'
import { useTranslation } from 'react-i18next'
import { MarkdownRenderer } from '../../components/HelpViewer'
import apiClient from '../../api/client'

interface HelpModule {
  title: string
  sections: HelpSection[]
}

interface HelpSection {
  title: string
  content: string
}

// Parse markdown content into modules (h1) and sections (h2)
function parseMarkdownContent(content: string): HelpModule[] {
  const modules: HelpModule[] = []
  const lines = content.split('\n')
  let currentModule: HelpModule | null = null
  let currentSection: HelpSection | null = null
  let currentContent: string[] = []

  const saveCurrentSection = () => {
    if (currentSection && currentModule) {
      currentSection.content = currentContent.join('\n').trim()
      if (currentSection.content) {
        currentModule.sections.push(currentSection)
      }
    }
    currentContent = []
  }

  const saveCurrentModule = () => {
    saveCurrentSection()
    if (currentModule && currentModule.sections.length > 0) {
      modules.push(currentModule)
    }
  }

  lines.forEach(line => {
    if (line.startsWith('# ') && !line.startsWith('## ')) {
      // New module (h1)
      saveCurrentModule()
      currentModule = {
        title: line.replace('# ', '').trim(),
        sections: []
      }
      currentSection = null
    } else if (line.startsWith('## ')) {
      // New section (h2)
      saveCurrentSection()
      currentSection = {
        title: line.replace('## ', '').trim(),
        content: ''
      }
    } else {
      currentContent.push(line)
    }
  })

  // Save last section and module
  saveCurrentModule()

  return modules
}

export default function HelpPage() {
  const { t, i18n } = useTranslation()
  const [modules, setModules] = useState<HelpModule[]>([])
  const [selectedModuleIndex, setSelectedModuleIndex] = useState(0)
  const [selectedSectionIndex, setSelectedSectionIndex] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Load help content based on current language
  const loadHelpContent = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    
    // Determine which file to load based on language
    const lang = i18n.language === 'zh' ? 'zh' : 'en'
    
    try {
      const response = await apiClient.get(`/api/help/${lang}`)
      const content = response.data
      
      if (typeof content === 'string' && content.length > 0) {
        const parsedModules = parseMarkdownContent(content)
        setModules(parsedModules)
        
        // Reset selection
        setSelectedModuleIndex(0)
        setSelectedSectionIndex(0)
      } else {
        setError(t('help.noHelp'))
      }
    } catch (err) {
      console.error('Failed to load help content:', err)
      setError(t('help.noHelp'))
    }
    
    setIsLoading(false)
  }, [i18n.language, t])

  // Load content when language changes
  useEffect(() => {
    loadHelpContent()
  }, [loadHelpContent])

  const handleModuleClick = (index: number) => {
    setSelectedModuleIndex(index)
    setSelectedSectionIndex(0)
  }

  const handleSectionClick = (sectionIndex: number) => {
    setSelectedSectionIndex(sectionIndex)
  }

  // Get current content to display
  const getCurrentContent = () => {
    const module = modules[selectedModuleIndex]
    if (!module) return ''
    
    const section = module.sections[selectedSectionIndex]
    if (!section) return ''
    
    // Build content with section title as h2
    return `## ${section.title}\n\n${section.content}`
  }

  // Get current module's sections
  const getCurrentSections = () => {
    const module = modules[selectedModuleIndex]
    return module?.sections || []
  }

  if (isLoading) {
    return (
      <Box sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        flexDirection: 'column',
        gap: 2
      }}>
        <CircularProgress />
        <Typography color="text.secondary">{t('help.loading')}</Typography>
      </Box>
    )
  }

  if (error || modules.length === 0) {
    return (
      <Box sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        flexDirection: 'column',
        gap: 2
      }}>
        <MenuBookIcon sx={{ fontSize: 64, color: 'text.disabled' }} />
        <Typography variant="h6" color="text.secondary">
          {error || t('help.noHelp')}
        </Typography>
      </Box>
    )
  }

  return (
    <Box sx={{ display: 'flex', height: '100%' }}>
      {/* Left column - Module list (h1) */}
      <Box sx={{
        width: 200,
        borderRight: 1,
        borderColor: 'divider',
        overflow: 'auto',
        bgcolor: 'background.paper',
        flexShrink: 0
      }}>
        {/* Header */}
        <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
          <Stack direction="row" spacing={1} alignItems="center">
            <MenuBookIcon color="primary" />
            <Typography variant="subtitle1" fontWeight={600}>{t('help.title')}</Typography>
          </Stack>
        </Box>
        
        {/* Module list */}
        <List component="nav" dense sx={{ py: 0 }}>
          {modules.map((module, moduleIndex) => (
            <ListItemButton
              key={moduleIndex}
              selected={selectedModuleIndex === moduleIndex}
              onClick={() => handleModuleClick(moduleIndex)}
              sx={{
                borderBottom: 1,
                borderColor: 'divider',
                '&.Mui-selected': {
                  bgcolor: 'primary.main',
                  color: 'primary.contrastText',
                  '&:hover': {
                    bgcolor: 'primary.dark'
                  }
                }
              }}
            >
              <ListItemText 
                primary={module.title}
                primaryTypographyProps={{
                  fontWeight: selectedModuleIndex === moduleIndex ? 600 : 500,
                  fontSize: '0.9rem'
                }}
              />
            </ListItemButton>
          ))}
        </List>
      </Box>

      {/* Middle column - Section list (h2) */}
      <Box sx={{
        width: 220,
        borderRight: 1,
        borderColor: 'divider',
        overflow: 'auto',
        bgcolor: 'background.default',
        flexShrink: 0
      }}>
        {/* Section header */}
        <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider', bgcolor: 'background.paper' }}>
          <Stack direction="row" spacing={1} alignItems="center">
            <ArticleIcon color="action" fontSize="small" />
            <Typography variant="subtitle2" color="text.secondary">
              {modules[selectedModuleIndex]?.title}
            </Typography>
          </Stack>
        </Box>
        
        {/* Section list */}
        <List component="nav" dense sx={{ py: 0 }}>
          {getCurrentSections().map((section, sectionIndex) => (
            <ListItemButton
              key={sectionIndex}
              selected={selectedSectionIndex === sectionIndex}
              onClick={() => handleSectionClick(sectionIndex)}
              sx={{
                borderBottom: 1,
                borderColor: 'divider',
                py: 1.5,
                '&.Mui-selected': {
                  bgcolor: 'action.selected',
                  borderLeft: 3,
                  borderLeftColor: 'primary.main',
                  '&:hover': {
                    bgcolor: 'action.hover'
                  }
                }
              }}
            >
              <ListItemText 
                primary={section.title}
                primaryTypographyProps={{
                  variant: 'body2',
                  fontWeight: selectedSectionIndex === sectionIndex ? 600 : 400,
                  color: selectedSectionIndex === sectionIndex ? 'primary.main' : 'text.primary'
                }}
              />
            </ListItemButton>
          ))}
        </List>
      </Box>

      {/* Right column - Content */}
      <Box sx={{ flex: 1, overflow: 'auto', p: 3, bgcolor: 'background.default' }}>
        <Paper sx={{ p: 4, maxWidth: 900, mx: 'auto' }}>
          {/* Module title */}
          {modules[selectedModuleIndex] && (
            <Typography variant="h4" fontWeight={600} gutterBottom color="primary">
              {modules[selectedModuleIndex].title}
            </Typography>
          )}
          <Divider sx={{ mb: 3 }} />
          
          {/* Section content */}
          <MarkdownRenderer content={getCurrentContent()} />
        </Paper>
      </Box>
    </Box>
  )
}
