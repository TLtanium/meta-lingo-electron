export type PetAnimation = 'idle' | 'right' | 'left' | 'wave' | 'jump' | 'failed' | 'waiting' | 'work' | 'review'
export const CELL = { width: 192, height: 208, columns: 8, rows: 11 }
export const ANIMATIONS: Record<PetAnimation, { row: number; durations: number[] }> = {
  idle: { row: 0, durations: [280,110,110,140,140,320] },
  right: { row: 1, durations: [120,120,120,120,120,120,120,220] },
  left: { row: 2, durations: [120,120,120,120,120,120,120,220] },
  wave: { row: 3, durations: [140,140,140,280] },
  jump: { row: 4, durations: [140,140,140,140,280] },
  failed: { row: 5, durations: [140,140,140,140,140,140,140,240] },
  waiting: { row: 6, durations: [150,150,150,150,150,280] },
  work: { row: 7, durations: [120,120,120,120,120,220] },
  review: { row: 8, durations: [150,150,150,150,150,280] },
}
export function animationCell(animation: PetAnimation, elapsed: number, reduced = false): { row: number; column: number } {
  const { row, durations } = ANIMATIONS[animation]
  if (reduced) return { row, column: 0 }
  let cursor = elapsed % durations.reduce((a,b) => a+b, 0)
  for (let column=0; column<durations.length; column++) {
    cursor-=durations[column]
    if (cursor<0) return { row, column }
  }
  return { row, column: 0 }
}
export function lookCell(dx: number, dy: number) {
  const angle = (Math.atan2(dx, -dy)*180/Math.PI+360)%360
  const direction = Math.round(angle/22.5)%16
  return { row: 9+Math.floor(direction/8), column: direction%8 }
}
