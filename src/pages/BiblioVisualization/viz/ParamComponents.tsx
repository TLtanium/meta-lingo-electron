/**
 * Shared param UI primitives for the bibliographic visualization drawer.
 */

import { Box, Slider, Stack, Typography, type SxProps, type Theme } from '@mui/material'

/** Two-column form row: muted category label (52 px) on the left, content on the right. */
export function ParamRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
      <Typography sx={{
        width: 52, flexShrink: 0, textAlign: 'right', pt: '10px',
        fontSize: '0.6875rem', lineHeight: 1.3, color: 'text.disabled',
        userSelect: 'none',
      }}>
        {label}
      </Typography>
      <Box sx={{ flex: 1, minWidth: 0 }}>{children}</Box>
    </Box>
  )
}

/** Single slider cell: label + live value on top, track below. */
export function SliderParam({
  label, value, min, max, step, format, onChange, sx,
}: {
  label: string; value: number; min: number; max: number; step: number;
  format?: (v: number) => string;
  onChange: (v: number) => void;
  sx?: SxProps<Theme>;
}) {
  return (
    <Box sx={sx}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
        <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.72rem' }}>
          {label}
        </Typography>
        <Typography variant="caption" color="text.secondary"
          sx={{ fontSize: '0.72rem', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
          {format ? format(value) : value}
        </Typography>
      </Box>
      <Slider size="small" value={value} min={min} max={max} step={step}
        onChange={(_, v) => onChange(v as number)} sx={{ py: 0.5, display: 'block' }} />
    </Box>
  )
}

/** 2-column slider grid. */
export function SliderGrid({ children, columns = 2 }: { children: React.ReactNode; columns?: number }) {
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: `repeat(${columns}, 1fr)`, gap: 1.5 }}>
      {children}
    </Box>
  )
}

/** Sub-section label inside a drawer (smaller than overline, more visual weight than caption). */
export function DrawerSubLabel({ children }: { children: React.ReactNode }) {
  return (
    <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
      <Typography variant="overline" color="text.secondary" sx={{ lineHeight: 1.4 }}>
        {children}
      </Typography>
    </Stack>
  )
}
