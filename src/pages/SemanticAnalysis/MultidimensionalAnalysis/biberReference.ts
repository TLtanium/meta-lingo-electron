/**
 * Biber (1988/1989) reference data for MDA visualization.
 * Values mirror backend/services/mda/biber_norms.py (MAT v1.3.2).
 */

export interface GenreStat {
  mean: number
  low: number
  high: number
}

export const GENRES = [
  'Conversations',
  'Broadcasts',
  'Prepared speeches',
  'Personal letters',
  'General fiction',
  'Press reportage',
  'Academic prose',
  'Official documents'
] as const

export const GENRE_LABELS_ZH: Record<string, string> = {
  Conversations: '日常会话',
  Broadcasts: '广播',
  'Prepared speeches': '事先准备的演讲',
  'Personal letters': '私人信件',
  'General fiction': '一般小说',
  'Press reportage': '新闻报道',
  'Academic prose': '学术散文',
  'Official documents': '官方文件'
}

// Per dimension: stats for the 8 genres in GENRES order
export const GENRE_DIMENSION_STATS: Record<number, GenreStat[]> = {
  1: [
    { mean: 35.3, low: 17.7, high: 54.1 },
    { mean: -4.3, low: -19.6, high: 16.9 },
    { mean: 2.2, low: -7.3, high: 14.8 },
    { mean: 19.5, low: 13.8, high: 27.0 },
    { mean: -0.8, low: -19.6, high: 22.3 },
    { mean: -15.1, low: -24.1, high: -3.1 },
    { mean: -14.9, low: -26.5, high: 7.1 },
    { mean: -18.1, low: -26.3, high: -9.1 }
  ],
  2: [
    { mean: -0.6, low: -4.4, high: 4.0 },
    { mean: -3.3, low: -5.2, high: -0.6 },
    { mean: 0.7, low: -4.9, high: 6.1 },
    { mean: 0.3, low: -0.9, high: 1.7 },
    { mean: 5.9, low: 1.2, high: 15.6 },
    { mean: 0.4, low: -3.2, high: 7.7 },
    { mean: -2.6, low: -6.2, high: 5.3 },
    { mean: -2.9, low: -5.4, high: -1.5 }
  ],
  3: [
    { mean: -3.9, low: -10.5, high: 1.6 },
    { mean: -9.0, low: -15.8, high: -2.2 },
    { mean: 0.3, low: -5.6, high: 6.1 },
    { mean: -3.6, low: -6.6, high: -1.3 },
    { mean: -3.1, low: -8.2, high: 1.0 },
    { mean: -0.3, low: -6.2, high: 6.5 },
    { mean: 4.2, low: -5.8, high: 18.6 },
    { mean: 7.3, low: 2.1, high: 13.4 }
  ],
  4: [
    { mean: -0.3, low: -5.2, high: 6.5 },
    { mean: -4.4, low: -6.9, high: -0.3 },
    { mean: 0.4, low: -4.4, high: 11.2 },
    { mean: 1.5, low: -1.6, high: 6.4 },
    { mean: 0.9, low: -3.2, high: 7.2 },
    { mean: -0.7, low: -6.0, high: 5.7 },
    { mean: -0.5, low: -7.1, high: 17.5 },
    { mean: -0.2, low: -8.4, high: 8.7 }
  ],
  5: [
    { mean: -3.2, low: -4.5, high: 0.1 },
    { mean: -1.7, low: -4.7, high: 5.4 },
    { mean: -1.9, low: -3.9, high: 1.0 },
    { mean: -2.8, low: -4.8, high: 0.5 },
    { mean: -2.5, low: -4.8, high: 1.5 },
    { mean: 0.6, low: -4.4, high: 5.5 },
    { mean: 5.5, low: -2.4, high: 16.8 },
    { mean: 4.7, low: 0.6, high: 8.7 }
  ],
  6: [
    { mean: 0.3, low: -3.6, high: 6.5 },
    { mean: -1.3, low: -3.6, high: 1.7 },
    { mean: 3.4, low: -0.8, high: 7.5 },
    { mean: -1.4, low: -3.7, high: 0.3 },
    { mean: -1.6, low: -4.3, high: 2.7 },
    { mean: -0.9, low: -4.0, high: 3.9 },
    { mean: 0.5, low: -3.3, high: 9.2 },
    { mean: -0.9, low: -3.8, high: 2.7 }
  ]
}

// Text type centroids on Dimensions 1-5 (Biber 1989)
export const TEXT_TYPES: Record<string, [number, number, number, number, number]> = {
  'Intimate interpersonal interaction': [45, -1, -6, 1, -4],
  'Informational interaction': [30, -1, -4, 1, -3],
  'Scientific exposition': [-15, -2.5, 4, -2, 9],
  'Learned exposition': [-20, -2, 5, -3, 2],
  'Imaginative narrative': [5, 7, -4, 1, -2],
  'General narrative exposition': [-10, 2, 0, -1, 0],
  'Situated reportage': [0, -3, -13, -4.5, -3],
  'Involved persuasion': [5, -2, 2, 4, -1]
}

export const TEXT_TYPE_LABELS_ZH: Record<string, string> = {
  'Intimate interpersonal interaction': '亲密人际互动',
  'Informational interaction': '信息性互动',
  'Scientific exposition': '科学阐述',
  'Learned exposition': '学术阐述',
  'Imaginative narrative': '想象性叙事',
  'General narrative exposition': '一般叙事阐述',
  'Situated reportage': '现场报道',
  'Involved persuasion': '参与式劝说'
}

export const DIMENSION_LABELS: Record<number, { en: string; zh: string }> = {
  1: { en: 'Involved vs. Informational Production', zh: '参与性 vs 信息性表达' },
  2: { en: 'Narrative vs. Non-Narrative Concerns', zh: '叙事性 vs 非叙事性' },
  3: { en: 'Explicit vs. Situation-Dependent Reference', zh: '明晰指称 vs 情境依赖指称' },
  4: { en: 'Overt Expression of Persuasion', zh: '显性劝说表达' },
  5: { en: 'Abstract vs. Non-Abstract Information', zh: '抽象 vs 非抽象信息' },
  6: { en: 'On-Line Informational Elaboration', zh: '即时信息扩展' }
}

// MAT chart colors for the six dimensions
export const DIMENSION_COLORS: Record<number, string> = {
  1: '#00AAFF',
  2: '#999900',
  3: '#FFA07A',
  4: '#FF00FF',
  5: '#32CD32',
  6: '#9932CC'
}

// Dimension pole descriptions for interpretation hints
export const DIMENSION_POLES: Record<number, { en: [string, string]; zh: [string, string] }> = {
  1: { en: ['Involved', 'Informational'], zh: ['参与性', '信息性'] },
  2: { en: ['Narrative', 'Non-narrative'], zh: ['叙事性', '非叙事性'] },
  3: { en: ['Explicit', 'Situation-dependent'], zh: ['明晰指称', '情境依赖'] },
  4: { en: ['Overt persuasion', 'Non-persuasive'], zh: ['显性劝说', '非劝说'] },
  5: { en: ['Abstract', 'Non-abstract'], zh: ['抽象', '非抽象'] },
  6: { en: ['On-line elaboration', 'Edited/planned'], zh: ['即时扩展', '编辑/计划性'] }
}
