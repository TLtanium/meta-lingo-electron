import {
  Box,
  Typography,
  Grid,
  Card,
  CardContent,
  CardActionArea,
  alpha
} from '@mui/material'
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
import { useTranslation } from 'react-i18next'
import { useTabStore } from '../../stores/tabStore'
import { useSettingsStore } from '../../stores/settingsStore'
import type { TabType } from '../../types'

interface FeatureCard {
  type: TabType
  titleKey: string
  descriptionKey: string
  icon: React.ReactNode
  color: string
}

const features: FeatureCard[] = [
  {
    type: 'corpus',
    titleKey: 'corpus.title',
    descriptionKey: 'corpus.description',
    icon: <FolderIcon sx={{ fontSize: 52 }} />,
    color: '#1976d2'
  },
  {
    type: 'wordfreq',
    titleKey: 'wordFrequency.title',
    descriptionKey: 'wordFrequency.description',
    icon: <BarChartIcon sx={{ fontSize: 52 }} />,
    color: '#2e7d32'
  },
  {
    type: 'synonym',
    titleKey: 'synonym.title',
    descriptionKey: 'synonym.homeDescription',
    icon: <AccountTreeIcon sx={{ fontSize: 52 }} />,
    color: '#ed6c02'
  },
  {
    type: 'keyword',
    titleKey: 'keyword.title',
    descriptionKey: 'keyword.description',
    icon: <VpnKeyIcon sx={{ fontSize: 52 }} />,
    color: '#9c27b0'
  },
  {
    type: 'ngram',
    titleKey: 'ngram.title',
    descriptionKey: 'ngram.description',
    icon: <TextFieldsIcon sx={{ fontSize: 52 }} />,
    color: '#0288d1'
  },
  {
    type: 'collocation',
    titleKey: 'collocation.title',
    descriptionKey: 'collocation.description',
    icon: <LinkIcon sx={{ fontSize: 52 }} />,
    color: '#d32f2f'
  },
  {
    type: 'semantic',
    titleKey: 'semantic.title',
    descriptionKey: 'semantic.description',
    icon: <SchemaIcon sx={{ fontSize: 52 }} />,
    color: '#00897b'
  },
  {
    type: 'wordsketch',
    titleKey: 'wordsketch.title',
    descriptionKey: 'wordsketch.description',
    icon: <HubIcon sx={{ fontSize: 52 }} />,
    color: '#ef5350'
  },
  {
    type: 'biblio',
    titleKey: 'biblio.title',
    descriptionKey: 'biblio.description',
    icon: <AutoGraphIcon sx={{ fontSize: 52 }} />,
    color: '#5c6bc0'
  },
  {
    type: 'annotation',
    titleKey: 'annotation.title',
    descriptionKey: 'annotation.description',
    icon: <EditNoteIcon sx={{ fontSize: 52 }} />,
    color: '#7b1fa2'
  },
  {
    type: 'topic',
    titleKey: 'topicModeling.title',
    descriptionKey: 'topicModeling.description',
    icon: <TopicIcon sx={{ fontSize: 52 }} />,
    color: '#00796b'
  },
  {
    type: 'settings',
    titleKey: 'settings.title',
    descriptionKey: 'settings.description',
    icon: <SettingsIcon sx={{ fontSize: 52 }} />,
    color: '#455a64'
  }
]

export default function HomePage() {
  const { t } = useTranslation()
  const { openTab } = useTabStore()
  const { darkMode } = useSettingsStore()

  const handleCardClick = (feature: FeatureCard) => {
    openTab({
      type: feature.type,
      title: feature.titleKey
    })
  }

  // 卡片样式 - 正常不透明背景
  const cardStyle = {}

  return (
    <Box
      sx={{
        height: '100%',
        overflow: 'auto',
        display: 'flex',
        flexDirection: 'column',
        p: 3
      }}
    >
      {/* Feature Grid - 4x3 布局，自适应填满屏幕 */}
      <Grid 
        container 
        spacing={3}
        sx={{
          flex: 1,
          alignContent: 'stretch',
          '& .MuiGrid-item': {
            display: 'flex'
          }
        }}
      >
        {features.map((feature) => (
          <Grid item xs={12} sm={6} md={3} key={feature.type}>
            <Card
              sx={{
                width: '100%',
                minHeight: 180,
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                transition: 'all 0.25s ease-in-out',
                borderRadius: 2,
                border: '1px solid',
                borderColor: 'divider',
                ...cardStyle,
                '&:hover': {
                  transform: 'translateY(-4px)',
                  boxShadow: (theme) => theme.palette.mode === 'dark'
                    ? `0 4px 16px ${alpha(feature.color, 0.2)}`
                    : `0 4px 16px ${alpha(feature.color, 0.15)}`,
                  borderColor: alpha(feature.color, 0.4)
                }
              }}
            >
              <CardActionArea
                onClick={() => handleCardClick(feature)}
                sx={{ height: '100%', flex: 1, display: 'flex', flexDirection: 'column' }}
              >
                <CardContent
                  sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    textAlign: 'center',
                    py: 3,
                    px: 2,
                    flex: 1,
                    justifyContent: 'center'
                  }}
                >
                  <Box
                    sx={{
                      width: 96,
                      height: 96,
                      borderRadius: '18px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      bgcolor: (theme) => theme.palette.mode === 'dark'
                        ? alpha(feature.color, 0.15)
                        : alpha(feature.color, 0.08),
                      color: feature.color,
                      mb: 3,
                      transition: 'all 0.25s ease-in-out',
                      border: '1px solid',
                      borderColor: (theme) => theme.palette.mode === 'dark'
                        ? alpha(feature.color, 0.2)
                        : alpha(feature.color, 0.12),
                      '.MuiCardActionArea-root:hover &': {
                        bgcolor: (theme) => theme.palette.mode === 'dark'
                          ? alpha(feature.color, 0.22)
                          : alpha(feature.color, 0.15),
                        transform: 'scale(1.05)',
                        borderColor: alpha(feature.color, 0.35)
                      }
                    }}
                  >
                    {feature.icon}
                  </Box>
                  <Typography
                    variant="h6"
                    component="h2"
                    fontWeight={600}
                    gutterBottom
                    sx={{ fontSize: '1.15rem' }}
                  >
                    {t(feature.titleKey)}
                  </Typography>
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ 
                      opacity: 0.8,
                      fontSize: '0.9rem',
                      lineHeight: 1.5
                    }}
                  >
                    {t(feature.descriptionKey)}
                  </Typography>
                </CardContent>
              </CardActionArea>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Box>
  )
}

