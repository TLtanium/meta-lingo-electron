/**
 * Semantic Analysis Page
 * Container for Semantic Domain Analysis (USAS) and Metaphor Analysis (MIPVU)
 */

import { useState } from 'react'
import { Box, Tabs, Tab } from '@mui/material'
import CategoryIcon from '@mui/icons-material/Category'
import AutoGraphIcon from '@mui/icons-material/AutoGraph'
import { useTranslation } from 'react-i18next'
import SemanticDomainAnalysis from './SemanticDomainAnalysis'
import MetaphorAnalysis from './MetaphorAnalysis'

type AnalysisTab = 'semantic' | 'metaphor'

export default function SemanticAnalysis() {
  const { i18n } = useTranslation()
  const isZh = i18n.language === 'zh'
  
  const [activeTab, setActiveTab] = useState<AnalysisTab>('semantic')

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Top Navigation Tabs */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider', bgcolor: 'background.paper' }}>
        <Tabs 
          value={activeTab} 
          onChange={(_, v) => setActiveTab(v)}
        >
          <Tab
            value="semantic"
            icon={<CategoryIcon />}
            iconPosition="start"
            label={isZh ? '语义域分析' : 'Semantic Domain'}
            sx={{ textTransform: 'none' }}
          />
          <Tab
            value="metaphor"
            icon={<AutoGraphIcon />}
            iconPosition="start"
            label={isZh ? '隐喻分析' : 'Metaphor Analysis'}
            sx={{ textTransform: 'none' }}
          />
        </Tabs>
      </Box>

      {/* Tab Content - use display to preserve state when switching tabs */}
      <Box sx={{ flex: 1, overflow: 'hidden' }}>
        <Box sx={{ display: activeTab === 'semantic' ? 'block' : 'none', height: '100%', width: '100%' }}>
          <SemanticDomainAnalysis />
        </Box>
        <Box sx={{ display: activeTab === 'metaphor' ? 'block' : 'none', height: '100%', width: '100%' }}>
          <MetaphorAnalysis />
        </Box>
      </Box>
    </Box>
  )
}
