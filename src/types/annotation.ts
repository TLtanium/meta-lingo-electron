// Annotation and Framework related types

// ==================== Framework Types ====================

/**
 * 框架节点类型
 * tier: 层级节点(不可选中,用于组织结构)
 * label: 标签节点(可选中,用于标注)
 */
export type FrameworkNodeType = 'tier' | 'label'

/**
 * 框架节点
 */
export interface FrameworkNode {
  id: string
  name: string
  type: FrameworkNodeType
  color?: string           // 标签节点的颜色(基于路径哈希生成)
  definition?: string      // 标签定义说明
  children?: FrameworkNode[]
}

/**
 * 标注框架
 */
export interface Framework {
  id: string
  name: string
  category: string
  description?: string
  root: FrameworkNode
  createdAt: string
  updatedAt: string
}

/**
 * 框架类别(用于分组展示)
 */
export interface FrameworkCategory {
  name: string
  frameworks: Framework[]
}

/**
 * 框架列表项(用于列表展示,不含完整树结构)
 */
export interface FrameworkListItem {
  id: string
  name: string
  category: string
  description?: string
  createdAt: string
  updatedAt: string
  tierCount?: number
  labelCount?: number
}

// ==================== Annotation Types ====================

/**
 * 标注类型
 * text: 文本标注(纯文本划词)
 * video: 视频标注(框选)
 */
export type AnnotationType = 'text' | 'video'

/**
 * 单条标注
 */
export interface Annotation {
  id: string
  text: string              // 标注的文本内容
  startPosition: number     // 在原文中的起始位置
  endPosition: number       // 在原文中的结束位置
  label: string             // 标签名称
  labelPath: string         // 标签完整路径(用于层级显示)
  color: string             // 标签颜色
  remark?: string           // 备注
  
  // 多模态专用字段
  type?: AnnotationType
  bbox?: [number, number, number, number]  // 视频框选区域 [x1, y1, x2, y2]
  timestamp?: number        // 视频时间戳(秒)
  frameNumber?: number      // 视频帧号
  frameCount?: number       // 视频框选帧数(序列标注)
  
  // SpaCy分析结果
  pos?: string              // 词性标注
  entity?: string           // 命名实体
}

/**
 * 标注存档(保存到文件)
 */
export interface AnnotationArchive {
  id: string
  type: 'text' | 'multimodal'
  framework: string
  frameworkCategory: string
  corpusName: string
  textName?: string         // 纯文本模式
  resourceName?: string     // 多模态模式
  mediaType?: 'video' | 'audio'
  mediaPath?: string
  text: string              // 原文/转录文本
  annotations: Annotation[]
  timestamp: string
  annotator?: string
  
  // SpaCy 标注数据 (用于恢复词性/命名实体/句法信息)
  spacyAnnotation?: SpacyAnnotationData
  
  // 多模态专用
  yoloAnnotations?: YoloTrack[]
  transcriptSegments?: TranscriptSegment[]
  manualTracks?: VideoBox[]
  clipAnnotations?: ClipAnnotationData  // CLIP语义分类数据
}

/**
 * YOLO追踪数据
 */
export interface YoloTrack {
  trackId: number
  className: string
  startFrame: number
  endFrame: number
  startTime: number
  endTime: number
  color: string
  detections: YoloDetection[]
}

/**
 * YOLO单帧检测
 */
export interface YoloDetection {
  trackId: number
  classId: number
  className: string
  confidence: number
  bbox: [number, number, number, number]
  frameNumber: number
  timestamp: number
}

/**
 * 转录片段
 */
export interface TranscriptSegment {
  id: string
  start: number
  end: number
  text: string
}

/**
 * 手动视频框选
 */
export interface VideoBox {
  id: number
  label: string
  color: string
  startFrame: number
  endFrame: number
  frameCount: number
  startTime: number
  endTime: number
  keyframes: VideoKeyframe[]
  frames: VideoFrame[]
}

/**
 * 视频关键帧
 */
export interface VideoKeyframe {
  frameNumber: number
  bbox: [number, number, number, number]
  time: number
  label: string
  color?: string
}

/**
 * 视频帧数据
 */
export interface VideoFrame {
  frameNumber: number
  bbox: [number, number, number, number]
  time: number
  label: string
}

// ==================== SpaCy Types ====================

/**
 * SpaCy Token 信息
 */
export interface SpacyToken {
  text: string
  start: number
  end: number
  pos: string
  tag: string
  lemma: string
  dep: string
  morph: string
}

/**
 * SpaCy 命名实体
 */
export interface SpacyEntity {
  text: string
  start: number
  end: number
  label: string
  description: string
}

/**
 * SpaCy 句子信息
 */
export interface SpacySentence {
  text: string
  start: number
  end: number
}

/**
 * SpaCy 标注数据
 */
export interface SpacyAnnotationData {
  success: boolean
  tokens: SpacyToken[]
  entities: SpacyEntity[]
  sentences: SpacySentence[]
  error?: string
}

// ==================== CLIP Types ====================

/**
 * CLIP单帧分类结果
 */
export interface ClipFrameResult {
  frame_number: number
  timestamp_seconds: number
  classifications: Record<string, number>  // 标签 -> 置信度
  top_label: string
  confidence: number
}

/**
 * CLIP完整标注数据
 */
export interface ClipAnnotationData {
  video_path?: string
  video_name?: string
  fps?: number
  total_frames?: number
  width?: number
  height?: number
  duration?: number
  frame_interval?: number
  labels: string[]
  frame_results: ClipFrameResult[]
}

// ==================== Selection State ====================

/**
 * 当前选中的标签
 */
export interface SelectedLabel {
  node: FrameworkNode
  path: string              // 完整路径
  color: string
}

/**
 * 文本选区
 */
export interface TextSelection {
  text: string
  start: number
  end: number
}

// ==================== API Response Types ====================

/**
 * 框架列表响应
 */
export interface FrameworkListResponse {
  success: boolean
  data: {
    categories: FrameworkCategory[]
  }
  message?: string
}

/**
 * 框架详情响应
 */
export interface FrameworkDetailResponse {
  success: boolean
  data: Framework
  message?: string
}

/**
 * 标注存档列表响应
 */
export interface AnnotationListResponse {
  success: boolean
  data: {
    archives: AnnotationArchiveListItem[]
  }
  message?: string
}

/**
 * 标注存档列表项
 */
export interface AnnotationArchiveListItem {
  id: string
  filename: string
  type: 'text' | 'multimodal'
  textId?: string  // 关联的文本ID
  corpusName?: string  // 所属语料库名称
  framework: string
  textName?: string
  resourceName?: string
  annotationCount: number
  timestamp: string
  coderName?: string  // 编码者名称
}

/**
 * 标注保存请求
 */
export interface SaveAnnotationRequest {
  corpusName: string
  textId?: string           // 文本ID，用于精确关联文本
  textName?: string
  resourceName?: string
  framework: string
  frameworkCategory: string
  type: 'text' | 'multimodal'
  text: string
  annotations: Annotation[]
  mediaType?: 'video' | 'audio'
  mediaPath?: string
  yoloAnnotations?: YoloTrack[]
  transcriptSegments?: TranscriptSegment[]
  manualTracks?: VideoBox[]
  clipAnnotations?: ClipAnnotationData  // CLIP语义分类数据
  spacyAnnotation?: SpacyAnnotationData  // SpaCy标注数据 (用于恢复)
  archiveId?: string        // 如果提供则覆盖保存
  coderName?: string        // 编码者名称
}

// ==================== Utility Types ====================

/**
 * 颜色映射(路径 -> 颜色)
 */
export type ColorMap = Record<string, string>

/**
 * 框架导入选项
 */
export interface FrameworkImportOptions {
  sourcePath: string
  targetCategory?: string
}

/**
 * 框架导入结果
 */
export interface FrameworkImportResult {
  success: boolean
  imported: number
  failed: number
  errors?: string[]
}
