import {
  Box,
  FormControl,
  FormControlLabel,
  Checkbox,
  Select,
  MenuItem,
  InputLabel,
  Typography,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Button,
  Stack
} from '@mui/material'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import { useTranslation } from 'react-i18next'
import { usePreprocessStore } from '../../stores/preprocessStore'
import type { PreprocessConfig } from '../../types'

interface PreprocessOptionsProps {
  config: PreprocessConfig
  onChange: (config: PreprocessConfig) => void
  compact?: boolean
}

export default function PreprocessOptions({ 
  config, 
  onChange,
  compact = false 
}: PreprocessOptionsProps) {
  const { t } = useTranslation()
  const { availableStopwordsLanguages, resetConfig } = usePreprocessStore()

  const handleChange = (key: keyof PreprocessConfig) => (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    onChange({
      ...config,
      [key]: event.target.checked
    })
  }

  const handleStopwordsLanguageChange = (event: any) => {
    onChange({
      ...config,
      stopwordsLanguage: event.target.value
    })
  }

  const handleReset = () => {
    onChange({
      entityExtraction: false,
      removePunctuation: true,
      textNormalization: true,
      toLowerCase: true,
      removeStopwords: true,
      stopwordsLanguage: 'english'
    })
  }

  const content = (
    <Stack spacing={1}>
      <FormControlLabel
        control={
          <Checkbox
            checked={config.entityExtraction}
            onChange={handleChange('entityExtraction')}
            size="small"
          />
        }
        label={t('preprocess.entityExtraction')}
      />

      <FormControlLabel
        control={
          <Checkbox
            checked={config.removePunctuation}
            onChange={handleChange('removePunctuation')}
            size="small"
          />
        }
        label={t('preprocess.removePunctuation')}
      />

      <FormControlLabel
        control={
          <Checkbox
            checked={config.textNormalization}
            onChange={handleChange('textNormalization')}
            size="small"
          />
        }
        label={t('preprocess.textNormalization')}
      />

      <FormControlLabel
        control={
          <Checkbox
            checked={config.toLowerCase}
            onChange={handleChange('toLowerCase')}
            size="small"
          />
        }
        label={t('preprocess.toLowerCase')}
      />

      <FormControlLabel
        control={
          <Checkbox
            checked={config.removeStopwords}
            onChange={handleChange('removeStopwords')}
            size="small"
          />
        }
        label={t('preprocess.removeStopwords')}
      />

      {config.removeStopwords && (
        <FormControl size="small" sx={{ ml: 4, maxWidth: 200 }}>
          <InputLabel>{t('preprocess.stopwordsLanguage')}</InputLabel>
          <Select
            value={config.stopwordsLanguage}
            onChange={handleStopwordsLanguageChange}
            label={t('preprocess.stopwordsLanguage')}
          >
            {availableStopwordsLanguages.map(lang => (
              <MenuItem key={lang} value={lang}>
                {lang.charAt(0).toUpperCase() + lang.slice(1)}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      )}

      <Box sx={{ pt: 1 }}>
        <Button size="small" onClick={handleReset}>
          {t('preprocess.reset')}
        </Button>
      </Box>
    </Stack>
  )

  if (compact) {
    return content
  }

  return (
    <Accordion defaultExpanded={false}>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Typography variant="subtitle2">{t('preprocess.title')}</Typography>
      </AccordionSummary>
      <AccordionDetails>
        {content}
      </AccordionDetails>
    </Accordion>
  )
}

