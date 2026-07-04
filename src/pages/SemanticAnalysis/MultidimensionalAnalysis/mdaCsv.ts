/**
 * CSV export helpers for Multidimensional Analysis
 * Produces the same three files as MAT: Dimensions / Statistics / Zscores
 */

import type { MDAResponse } from '../../../types/mdaAnalysis'

// Canonical feature order (matches backend BIBER_FEATURES minus AWL/TTR for tag stats)
export const FEATURE_CODES = [
  'AWL', 'TTR', 'AMP', 'ANDC', '[BEMA]', '[BYPA]', 'CAUS', 'CONC', 'COND',
  'CONJ', '[CONT]', 'DEMO', 'DEMP', 'DPAR', 'DWNT', 'EMPH', 'EX', 'FPP1',
  'GER', 'HDG', 'INPR', 'JJ', 'NEMD', 'NN', 'NOMZ', 'OSUB', '[PASS]',
  '[PASTP]', '[PEAS]', 'PHC', 'PIN', '[PIRE]', 'PIT', 'PLACE', 'POMD',
  'PRED', '[PRESP]', '[PRIV]', 'PRMD', '[PROD]', '[PUBV]', 'RB', '[SERE]',
  '[SMP]', '[SPAU]', '[SPIN]', 'SPP2', '[STPR]', '[SUAV]', 'SYNE', 'THAC',
  '[THATD]', 'THVC', 'TIME', 'TO', 'TOBJ', 'TPP3', 'TSUB', 'VBD', 'VPRT',
  '[WHCL]', '[WHOBJ]', '[WHQU]', '[WHSUB]', '[WZPAST]', '[WZPRES]', 'XX0'
]

export const TAG_FEATURE_CODES = FEATURE_CODES.filter(f => f !== 'AWL' && f !== 'TTR')

function downloadCsv(rows: (string | number)[][], filename: string) {
  const escape = (v: string | number) => {
    const s = String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const csv = '﻿' + rows.map(r => r.map(escape).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

export function exportDimensionsCsv(result: MDAResponse, corpusName: string) {
  if (!result.texts || !result.corpus) return
  const header = ['Filename', 'Dimension1', 'Dimension2', 'Dimension3', 'Dimension4', 'Dimension5', 'Dimension6', 'Closest Text Type']
  const rows: (string | number)[][] = [header]
  for (const t of result.texts) {
    rows.push([
      t.filename,
      ...[1, 2, 3, 4, 5, 6].map(d => t.dimensions[String(d)] ?? 0),
      t.closest_text_type
    ])
  }
  const c = result.corpus
  rows.push([
    corpusName || 'Corpus',
    ...[1, 2, 3, 4, 5, 6].map(d => c.dimensions[String(d)] ?? 0),
    c.closest_text_type
  ])
  downloadCsv(rows, `mda_dimensions_${corpusName || 'corpus'}.csv`)
}

export function exportStatisticsCsv(result: MDAResponse, corpusName: string) {
  if (!result.texts) return
  const header = ['Filename', 'Tokens', 'AWL', 'TTR', ...TAG_FEATURE_CODES]
  const rows: (string | number)[][] = [header]
  for (const t of result.texts) {
    rows.push([
      t.filename, t.tokens, t.awl, t.ttr,
      ...TAG_FEATURE_CODES.map(f => Number((t.normalized[f] ?? 0).toFixed(2)))
    ])
  }
  downloadCsv(rows, `mda_statistics_${corpusName || 'corpus'}.csv`)
}

export function exportZscoresCsv(result: MDAResponse, corpusName: string) {
  if (!result.texts || !result.corpus) return
  const header = ['Filename', ...FEATURE_CODES, 'Underused_variables', 'Overused_variables']
  const rows: (string | number)[][] = [header]
  for (const t of result.texts) {
    const under = FEATURE_CODES.filter(f => (t.zscores[f] ?? 0) < -2).join(' ')
    const over = FEATURE_CODES.filter(f => (t.zscores[f] ?? 0) > 2).join(' ')
    rows.push([t.filename, ...FEATURE_CODES.map(f => t.zscores[f] ?? 0), under, over])
  }
  const c = result.corpus
  rows.push([
    corpusName || 'Corpus',
    ...FEATURE_CODES.map(f => c.zscores[f] ?? 0),
    c.underused_features.join(' '),
    c.overused_features.join(' ')
  ])
  downloadCsv(rows, `mda_zscores_${corpusName || 'corpus'}.csv`)
}
