import {
  Paper,
  Typography,
  FormControl,
  RadioGroup,
  FormControlLabel,
  Radio,
  Stack
} from '@mui/material'
import LanguageIcon from '@mui/icons-material/Language'
import { useTranslation } from 'react-i18next'
import { useSettingsStore } from '../../stores/settingsStore'
import type { Language } from '../../types'

export default function LanguageSettings() {
  const { t, i18n } = useTranslation()
  const { language, setLanguage } = useSettingsStore()

  const handleLanguageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newLanguage = event.target.value as Language
    setLanguage(newLanguage)
    i18n.changeLanguage(newLanguage)
  }

  return (
    <Paper sx={{ p: 3, height: '100%' }}>
      <Stack direction="row" spacing={1} alignItems="center" mb={2}>
        <LanguageIcon color="primary" />
        <Typography variant="h6">{t('settings.language')}</Typography>
      </Stack>

      <FormControl component="fieldset">
        <RadioGroup
          value={language}
          onChange={handleLanguageChange}
        >
          <FormControlLabel
            value="zh"
            control={<Radio />}
            label={
              <Stack direction="row" spacing={1} alignItems="center">
                <span>CN</span>
                <Typography>{t('settings.chinese')}</Typography>
              </Stack>
            }
          />
          <FormControlLabel
            value="en"
            control={<Radio />}
            label={
              <Stack direction="row" spacing={1} alignItems="center">
                <span>EN</span>
                <Typography>{t('settings.english')}</Typography>
              </Stack>
            }
          />
        </RadioGroup>
      </FormControl>
    </Paper>
  )
}

