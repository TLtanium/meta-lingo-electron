/**
 * Reliability API Client
 * 编码者间信度分析 API 客户端
 */

import { api } from './client'

// ==================== 类型定义 ====================

export interface ArchiveFile {
  name: string
  content: string
}

export interface CoefficientOptions {
  percent_agreement: boolean
  scotts_pi: boolean
  cohens_kappa: boolean
  fleiss_kappa: boolean
  krippendorff_alpha: boolean
}

export interface ReliabilityParams {
  method: '完全匹配' | '位置容错' | '模糊匹配'
  tolerance: number
  coefficients: CoefficientOptions
  level_of_measurement: 'nominal' | 'ordinal' | 'interval' | 'ratio'
  gold_standard_index?: number  // 标准答案的索引（可选）
}

export interface CoefficientResult {
  calculated: boolean
  value?: number
  display_name: string
  interpretation?: string
  error?: string
  level_of_measurement?: string
  num_coders?: number
  num_items?: number
  // 新增字段 - 配对详情
  pairwise_details?: Record<string, number>
  unit?: string
  // Fleiss' Kappa 特有字段
  observed_agreement?: number
  expected_agreement?: number
  // Krippendorff's Alpha 特有字段
  n_decisions?: number
  sigma_c_o_cc?: number
  sigma_c_nc_nc_minus_1?: number
  // 召回率/精确率特有字段
  recall?: number
  precision?: number
  f1_score?: number
  by_label?: Record<string, {
    recall: number
    precision: number
    f1_score: number
    true_positives: number
    false_positives: number
    false_negatives: number
  }>
  coder_details?: Record<string, {
    recall: number
    precision: number
    f1_score: number
  }>
}

// 数据摘要类型
export interface DataSummary {
  n_coders: number
  n_cases: number
  n_decisions: number
  n_labels: number
  labels: string[]
}

export interface ValidationSummary {
  coder_count: number
  common_text_count: number
  total_annotations: number
  framework: string
  text_length: number
}

export interface KWICItem {
  row_number: number
  label: string
  left_context: string
  annotation_unit: string
  right_context: string
  start_position: number
  end_position: number
  color?: string
  // 新增字段
  annotation_rate: number
  label_agreement: boolean
  all_labels: string[]
}

export interface AnnotationDetail {
  filename: string
  coder_id: string
  annotated: boolean
  label?: string
  annotation_text?: string
  label_path?: string
  remark?: string
}

export interface PositionDetails {
  position_key: string
  annotation_unit: string
  start_position: number
  end_position: number
  left_context: string
  right_context: string
  details: AnnotationDetail[]
  agreement_rate: number
  label_agreement: boolean
}

export interface ArchiveInfo {
  id: string
  filename: string
  type: string
  framework: string
  textName?: string
  resourceName?: string
  annotationCount: number
  timestamp: string
}

// ==================== API 响应类型 ====================

interface ValidateResponse {
  success: boolean
  data?: {
    annotation_data: any[]
    common_text: string
    framework: string
    text_length: number
  }
  summary?: ValidationSummary
  error?: string
}

interface CalculateResponse {
  success: boolean
  data?: Record<string, CoefficientResult>
  summary?: Record<string, any>  // 计算返回的数据摘要
  error?: string
}

interface KWICResponse {
  success: boolean
  data?: KWICItem[]
  count?: number
}

interface DetailResponse {
  success: boolean
  data?: PositionDetails
}

interface ArchivesResponse {
  success: boolean
  data?: {
    archives: ArchiveInfo[]
  }
}

interface LoadArchivesResponse {
  success: boolean
  data?: {
    files: ArchiveFile[]
  }
}

// ==================== API 函数 ====================

/**
 * 验证上传的标注文件
 */
export async function validateFiles(files: ArchiveFile[]): Promise<ValidateResponse> {
  const response = await api.post<ValidateResponse>('/api/reliability/validate', { files })
  return response.data as ValidateResponse
}

/**
 * 计算编码者间信度系数
 */
export async function calculateReliability(
  data: any,
  params: ReliabilityParams
): Promise<CalculateResponse> {
  const response = await api.post<CalculateResponse>('/api/reliability/calculate', {
    data,
    params
  })
  return response.data as CalculateResponse
}

/**
 * 生成详细报告
 */
export async function generateReport(
  results: Record<string, CoefficientResult>,
  dataSummary?: ValidationSummary,
  format: 'html' | 'csv' = 'html'
): Promise<string> {
  const response = await api.post('/api/reliability/report', {
    results,
    data_summary: dataSummary,
    format
  }, {
    responseType: format === 'html' ? 'text' : 'blob'
  })
  return response.data as string
}

/**
 * 生成 KWIC 索引
 */
export async function generateKWIC(
  files: ArchiveFile[],
  contextLength: number = 30
): Promise<KWICResponse> {
  const response = await api.post<KWICResponse>('/api/reliability/kwic', {
    files,
    context_length: contextLength
  })
  return response.data as KWICResponse
}

/**
 * 获取特定位置的标注详情
 */
export async function getPositionDetails(
  files: ArchiveFile[],
  startPosition: number,
  endPosition: number
): Promise<DetailResponse> {
  const response = await api.post<DetailResponse>('/api/reliability/detail', {
    files,
    start_position: startPosition,
    end_position: endPosition
  })
  return response.data as DetailResponse
}

/**
 * 获取语料库的标注存档列表
 */
export async function listCorpusArchives(corpusName: string): Promise<ArchivesResponse> {
  const response = await api.get<ArchivesResponse>(
    `/api/reliability/archives/${encodeURIComponent(corpusName)}`
  )
  return response.data as ArchivesResponse
}

/**
 * 加载多个存档的完整内容
 */
export async function loadArchivesContent(
  archiveIds: string[],
  corpusName: string
): Promise<LoadArchivesResponse> {
  const response = await api.post<LoadArchivesResponse>('/api/reliability/load-archives', null, {
    params: {
      archive_ids: archiveIds,
      corpus_name: corpusName
    }
  })
  return response.data as LoadArchivesResponse
}

// ==================== 辅助函数 ====================

/**
 * 创建默认计算参数
 */
export function createDefaultParams(): ReliabilityParams {
  return {
    method: '完全匹配',
    tolerance: 0.8,
    coefficients: {
      percent_agreement: true,
      scotts_pi: true,
      cohens_kappa: true,
      fleiss_kappa: true,
      krippendorff_alpha: true
    },
    level_of_measurement: 'nominal'
  }
}

/**
 * 将文件读取为 ArchiveFile 格式
 */
export async function readFileAsArchive(file: File): Promise<ArchiveFile> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      resolve({
        name: file.name,
        content: e.target?.result as string
      })
    }
    reader.onerror = reject
    reader.readAsText(file, 'utf-8')
  })
}

/**
 * 下载报告文件
 */
export function downloadReport(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

// 导出所有
export const reliabilityApi = {
  validateFiles,
  calculateReliability,
  generateReport,
  generateKWIC,
  getPositionDetails,
  listCorpusArchives,
  loadArchivesContent,
  createDefaultParams,
  readFileAsArchive,
  downloadReport
}

