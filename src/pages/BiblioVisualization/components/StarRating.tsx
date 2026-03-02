/**
 * StarRating - 0-5 star rating with hover preview and click to set (app-store style)
 */

import { useState } from 'react'
import { Box, IconButton } from '@mui/material'
import StarIcon from '@mui/icons-material/Star'
import StarBorderIcon from '@mui/icons-material/StarBorder'

interface StarRatingProps {
  value: number
  onChange?: (value: number) => void
  readOnly?: boolean
}

export default function StarRating({ value, onChange, readOnly = false }: StarRatingProps) {
  const [hover, setHover] = useState<number | null>(null)
  const display = hover !== null ? hover : (value ?? 0)

  const handleClick = (star: number) => {
    if (readOnly || !onChange) return
    onChange(star)
  }

  return (
    <Box
      component="span"
      sx={{ display: 'inline-flex', alignItems: 'center' }}
      onMouseLeave={() => !readOnly && setHover(null)}
    >
      {[1, 2, 3, 4, 5].map(star => (
        readOnly ? (
          <Box key={star} component="span" sx={{ lineHeight: 0 }}>
            {display >= star ? (
              <StarIcon sx={{ fontSize: 22, color: 'warning.main' }} />
            ) : (
              <StarBorderIcon sx={{ fontSize: 22, color: 'action.disabled' }} />
            )}
          </Box>
        ) : (
          <IconButton
            key={star}
            size="small"
            sx={{ p: 0.25 }}
            onMouseEnter={() => setHover(star)}
            onClick={() => handleClick(star)}
            aria-label={`${star} ${star === 1 ? 'star' : 'stars'}`}
          >
            {display >= star ? (
              <StarIcon sx={{ fontSize: 22, color: 'warning.main' }} />
            ) : (
              <StarBorderIcon sx={{ fontSize: 22, color: 'action.disabled' }} />
            )}
          </IconButton>
        )
      ))}
    </Box>
  )
}
