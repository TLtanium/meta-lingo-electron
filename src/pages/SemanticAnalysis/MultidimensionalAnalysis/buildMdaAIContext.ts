/**
 * Builds the AI assistant context string for Multidimensional Analysis
 */

import type { TFunction } from 'i18next'
import type { CorpusOrLibrarySelection } from '../../../components/Corpus/CorpusOrLibrarySelector'
import type { MDAResponse, MDAVisualizationConfig } from '../../../types/mdaAnalysis'
import { DIMENSION_LABELS, TEXT_TYPE_LABELS_ZH } from './biberReference'

interface BuildMdaAIContextArgs {
  t: TFunction
  isZh: boolean
  corpusSelection: CorpusOrLibrarySelection | null
  ttrTokens: number
  zCorrection: boolean
  excludedFeatures: string[]
  result: MDAResponse | null
  rightTab: number
  vizConfig: MDAVisualizationConfig
}

export function buildMdaAIContext({
  isZh,
  corpusSelection,
  ttrTokens,
  zCorrection,
  excludedFeatures,
  result,
  rightTab,
  vizConfig
}: BuildMdaAIContextArgs): string {
  const lines: string[] = []
  lines.push(isZh
    ? '【多维分析 MDA】基于 Biber (1988) 的多维功能分析（MAT 算法）：67 项语言特征 → 相对 Biber 常模的 z 分数 → 6 个维度得分 → 最近体裁与最近文本类型（Biber 1989，欧氏距离）。'
    : '[Multidimensional Analysis] Biber (1988) multidimensional functional analysis (MAT algorithm): 67 linguistic features → z-scores against Biber norms → 6 dimension scores → closest genre and closest text type (Biber 1989, Euclidean distance).')

  lines.push(isZh
    ? `参数：TTR 窗口=${ttrTokens}${ttrTokens !== 400 ? '（非 400，TTR 不参与 z 分数）' : ''}，z 分数修正=${zCorrection ? '开' : '关'}，排除特征=[${excludedFeatures.join(', ') || '无'}]`
    : `Parameters: TTR window=${ttrTokens}${ttrTokens !== 400 ? ' (not 400, TTR excluded from z-scores)' : ''}, z-score correction=${zCorrection ? 'on' : 'off'}, excluded features=[${excludedFeatures.join(', ') || 'none'}]`)

  if (corpusSelection) {
    lines.push(isZh
      ? `语料：corpus_id=${corpusSelection.corpusId}，选中文本=${corpusSelection.textIds === 'all' ? '全部' : corpusSelection.textIds.length}`
      : `Corpus: corpus_id=${corpusSelection.corpusId}, selected texts=${corpusSelection.textIds === 'all' ? 'all' : corpusSelection.textIds.length}`)
  }

  if (result?.success && result.corpus) {
    const c = result.corpus
    const dims = [1, 2, 3, 4, 5, 6]
      .map(d => `D${d}(${isZh ? DIMENSION_LABELS[d].zh : DIMENSION_LABELS[d].en})=${c.dimensions[String(d)]}`)
      .join('; ')
    const typeName = isZh ? (TEXT_TYPE_LABELS_ZH[c.closest_text_type] || c.closest_text_type) : c.closest_text_type
    lines.push(isZh
      ? `结果：${c.text_count} 篇文本，${c.total_tokens} 形符。维度得分：${dims}。最近文本类型：${typeName}。`
      : `Results: ${c.text_count} texts, ${c.total_tokens} tokens. Dimension scores: ${dims}. Closest text type: ${typeName}.`)
    lines.push(isZh
      ? `各维度最近体裁：${Object.entries(c.closest_genres).map(([d, g]) => `D${d}→${g}`).join('; ')}`
      : `Closest genre per dimension: ${Object.entries(c.closest_genres).map(([d, g]) => `D${d}→${g}`).join('; ')}`)
    if (c.overused_features.length) {
      lines.push(isZh
        ? `显著高于常模 (z>2)：${c.overused_features.join(', ')}`
        : `Overused vs. norms (z>2): ${c.overused_features.join(', ')}`)
    }
    if (c.underused_features.length) {
      lines.push(isZh
        ? `显著低于常模 (z<-2)：${c.underused_features.join(', ')}`
        : `Underused vs. norms (z<-2): ${c.underused_features.join(', ')}`)
    }
    if (result.features) {
      const salient = result.features
        .filter(f => Math.abs(f.zscore) > 1)
        .sort((a, b) => Math.abs(b.zscore) - Math.abs(a.zscore))
        .slice(0, 15)
        .map(f => `${f.code}(${isZh ? f.name_zh : f.name_en}): z=${f.zscore}, ${f.mean}/100tok`)
      if (salient.length) {
        lines.push(isZh ? `突出特征（|z|>1，按幅度排序）：\n${salient.join('\n')}` : `Salient features (|z|>1, by magnitude):\n${salient.join('\n')}`)
      }
    }
  } else {
    lines.push(isZh ? '尚未运行分析。' : 'Analysis has not been run yet.')
  }

  lines.push(isZh
    ? `当前视图：${rightTab === 0 ? '结果表' : `可视化(${vizConfig.chartType}${vizConfig.chartType === 'dimension' ? ` D${vizConfig.dimension}` : ''})`}`
    : `Current view: ${rightTab === 0 ? 'results table' : `visualization (${vizConfig.chartType}${vizConfig.chartType === 'dimension' ? ` D${vizConfig.dimension}` : ''})`}`)

  lines.push(isZh
    ? '请从维度得分的功能解释（口语性/书面性、叙事性、指称明晰度、劝说性、抽象性、即时性）、与最近体裁/文本类型的对比、以及显著偏离常模的特征入手解读。'
    : 'Interpret via the functional meaning of dimension scores (involvement, narrativity, referential explicitness, persuasion, abstractness, on-line elaboration), the closest genre/text type comparison, and features deviating strongly from the norms.')

  return lines.join('\n\n')
}
