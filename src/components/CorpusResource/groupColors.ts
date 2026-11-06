import { lighten } from '@mui/material/styles'

/** Server assigns one collision-resolved base colour per exact group identifier. */
export function corpusGroupColor(color: string | undefined, dark: boolean): string {
  const base = color && /^#[0-9a-f]{6}$/i.test(color) ? color : '#2563eb'
  return dark ? lighten(base, 0.38) : base
}
