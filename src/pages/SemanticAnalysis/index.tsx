/**
 * Discourse Analysis Page
 * Container for Semantic Domain Analysis (USAS), Metaphor Analysis (MIPVU)
 * and Multidimensional Analysis (Biber 1988 / MAT)
 */

import { useState } from 'react'
import { Box, Tabs, Tab } from '@mui/material'
import CategoryIcon from '@mui/icons-material/Category'
import AutoGraphIcon from '@mui/icons-material/AutoGraph'
import ViewInArIcon from '@mui/icons-material/ViewInAr'
import { useTranslation } from 'react-i18next'
import type { CrossLinkParams } from '../../types'
import SemanticDomainAnalysis from './SemanticDomainAnalysis'
import MetaphorAnalysis from './MetaphorAnalysis'
import MultidimensionalAnalysis from './MultidimensionalAnalysis'

type AnalysisTab = 'semantic' | 'metaphor' | 'mda'

interface SemanticAnalysisProps {
  crossLinkParams?: CrossLinkParams
}

export default function SemanticAnalysis({ crossLinkParams }: SemanticAnalysisProps) {
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
          <Tab
            value="mda"
            icon={<ViewInArIcon />}
            iconPosition="start"
            label={isZh ? '多维分析' : 'Multidimensional Analysis'}
            sx={{ textTransform: 'none' }}
          />
        </Tabs>
      </Box>

      {/* Tab Content - use display to preserve state when switching tabs */}
      <Box sx={{ flex: 1, overflow: 'hidden' }}>
        <Box sx={{ display: activeTab === 'semantic' ? 'block' : 'none', height: '100%', width: '100%' }}>
          <SemanticDomainAnalysis crossLinkParams={crossLinkParams} />
        </Box>
        <Box sx={{ display: activeTab === 'metaphor' ? 'block' : 'none', height: '100%', width: '100%' }}>
          <MetaphorAnalysis crossLinkParams={crossLinkParams} />
        </Box>
        <Box sx={{ display: activeTab === 'mda' ? 'block' : 'none', height: '100%', width: '100%' }}>
          <MultidimensionalAnalysis crossLinkParams={crossLinkParams} />
        </Box>
      </Box>
    </Box>
  )
}
