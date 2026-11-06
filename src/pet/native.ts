import type { DesktopPetAPI } from '../../shared/desktopPet.mjs'
/** Keep the desktop bridge optional so browser development uses the same UI. */
export function getNativePetAPI():DesktopPetAPI|undefined {
  return (window as unknown as {electronAPI?:{pet?:DesktopPetAPI}}).electronAPI?.pet
}
