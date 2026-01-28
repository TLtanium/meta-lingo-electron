/**
 * 专业配色方案 - 用于主题建模可视化
 * Professional Color Schemes for Topic Modeling Visualizations
 */

// Tableau 10 - 商业可视化标准配色
export const tableau10 = [
  '#4e79a7', '#f28e2c', '#e15759', '#76b7b2', '#59a14f',
  '#edc949', '#af7aa1', '#ff9da7', '#9c755f', '#bab0ab'
]

// Viridis - 科学可视化经典配色（色盲友好）
export const viridis = [
  '#440154', '#482878', '#3e4989', '#31688e', '#26828e',
  '#1f9e89', '#35b779', '#6ece58', '#b5de2b', '#fde725'
]

// Plasma - 渐变暖色系（色盲友好）
export const plasma = [
  '#0d0887', '#46039f', '#7201a8', '#9c179e', '#bd3786',
  '#d8576b', '#ed7953', '#fb9f3a', '#fdca26', '#f0f921'
]

// Inferno - 火焰色系
export const inferno = [
  '#000004', '#1b0c41', '#4a0c6b', '#781c6d', '#a52c60',
  '#cf4446', '#ed6925', '#fb9b06', '#f7d13d', '#fcffa4'
]

// 海洋蓝色系
export const ocean = [
  '#023858', '#045a8d', '#0570b0', '#3690c0', '#74a9cf',
  '#a6bddb', '#d0d1e6', '#67a9cf', '#02818a', '#016c59'
]

// 日落暖色系
export const sunset = [
  '#f3e79b', '#fac484', '#f8a07e', '#eb7f86', '#ce6693',
  '#a059a0', '#5c53a5', '#3c4d7e', '#2a3858', '#191d33'
]

// 森林绿色系
export const forest = [
  '#005824', '#238b45', '#41ab5d', '#74c476', '#a1d99b',
  '#c7e9c0', '#d4eac7', '#b5cf6b', '#6a994e', '#386641'
]

// 浆果紫红色系
export const berry = [
  '#7b2d8e', '#8e4585', '#a05c7b', '#b27371', '#c48b68',
  '#d6a35e', '#e8bc55', '#fad44b', '#f9dc5c', '#f9e289'
]

// 深色对比方案 (D3 Dark2)
export const dark2 = [
  '#1b9e77', '#d95f02', '#7570b3', '#e7298a', '#66a61e',
  '#e6ab02', '#a6761d', '#666666', '#377eb8', '#e41a1c'
]

// 强调色方案 (D3 Accent)
export const accent = [
  '#7fc97f', '#beaed4', '#fdc086', '#ffff99', '#386cb0',
  '#f0027f', '#bf5b17', '#666666', '#a6cee3', '#fb9a99'
]

// Spectral - 彩虹发散色
export const spectral = [
  '#9e0142', '#d53e4f', '#f46d43', '#fdae61', '#fee08b',
  '#e6f598', '#abdda4', '#66c2a5', '#3288bd', '#5e4fa2'
]

// 现代科技感
export const techno = [
  '#00d4ff', '#00a8e8', '#0077b6', '#023e8a', '#03045e',
  '#0466c8', '#0353a4', '#023e7d', '#002855', '#001845'
]

// 霓虹活力
export const neon = [
  '#ff006e', '#fb5607', '#ffbe0b', '#8338ec', '#3a86ff',
  '#06d6a0', '#118ab2', '#ef476f', '#ffd166', '#073b4c'
]

// 复古经典
export const retro = [
  '#264653', '#2a9d8f', '#e9c46a', '#f4a261', '#e76f51',
  '#606c38', '#283618', '#fefae0', '#dda15e', '#bc6c25'
]

// Material Design 配色
export const material = [
  '#f44336', '#e91e63', '#9c27b0', '#673ab7', '#3f51b5',
  '#2196f3', '#03a9f4', '#00bcd4', '#009688', '#4caf50'
]

// 配色方案集合
export const COLOR_SCHEMES = {
  // 基础方案
  tableau: tableau10,
  viridis: viridis,
  
  // 科学配色
  plasma: plasma,
  inferno: inferno,
  spectral: spectral,
  
  // 主题配色
  ocean: ocean,
  sunset: sunset,
  forest: forest,
  berry: berry,
  
  // 对比方案
  dark2: dark2,
  accent: accent,
  
  // 现代方案
  techno: techno,
  neon: neon,
  retro: retro,
  material: material
}

export type ColorSchemeName = keyof typeof COLOR_SCHEMES

// 配色方案显示名称（多语言支持）
export const COLOR_SCHEME_LABELS: Record<ColorSchemeName, { en: string; zh: string }> = {
  tableau: { en: 'Tableau', zh: '商业标准' },
  viridis: { en: 'Viridis', zh: '科学经典' },
  plasma: { en: 'Plasma', zh: '等离子' },
  inferno: { en: 'Inferno', zh: '烈焰' },
  spectral: { en: 'Spectral', zh: '光谱' },
  ocean: { en: 'Ocean', zh: '海洋' },
  sunset: { en: 'Sunset', zh: '日落' },
  forest: { en: 'Forest', zh: '森林' },
  berry: { en: 'Berry', zh: '浆果' },
  dark2: { en: 'Dark2', zh: '深色对比' },
  accent: { en: 'Accent', zh: '强调色' },
  techno: { en: 'Techno', zh: '科技感' },
  neon: { en: 'Neon', zh: '霓虹' },
  retro: { en: 'Retro', zh: '复古' },
  material: { en: 'Material', zh: '质感' }
}

// 默认配色
export const DEFAULT_COLOR_SCHEME: ColorSchemeName = 'tableau'

// 获取配色方案的颜色数组
export function getColors(schemeName: ColorSchemeName): readonly string[] {
  return COLOR_SCHEMES[schemeName] || COLOR_SCHEMES[DEFAULT_COLOR_SCHEME]
}

// 根据索引获取颜色（循环使用）
export function getColorByIndex(schemeName: ColorSchemeName, index: number): string {
  const colors = getColors(schemeName)
  return colors[index % colors.length]
}

// 生成渐变色
export function generateGradient(
  schemeName: ColorSchemeName, 
  count: number
): string[] {
  const baseColors = getColors(schemeName)
  if (count <= baseColors.length) {
    return baseColors.slice(0, count) as string[]
  }
  
  // 如果需要更多颜色，循环使用
  const result: string[] = []
  for (let i = 0; i < count; i++) {
    result.push(baseColors[i % baseColors.length])
  }
  return result
}
