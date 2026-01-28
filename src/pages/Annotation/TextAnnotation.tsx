/**
 * TextAnnotation Page
 * 纯文本标注页面
 * 
 * 布局:
 * - 左侧: 框架选择 + 框架树可视化
 * - 右侧: 语料库选择 + 文本标注区 + 标注表格
 * 
 * 功能:
 * - 分句显示文本
 * - PNG/SVG 导出
 * - 预处理选项
 * - POS/NER 显示
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Box,
  Typography,
  Paper,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Button,
  Stack,
  Chip,
  IconButton,
  Tooltip,
  Divider,
  Alert,
  CircularProgress,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  List,
  ListItemText,
  ListItemButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField
} from '@mui/material'
import SaveIcon from '@mui/icons-material/Save'
import FolderOpenIcon from '@mui/icons-material/FolderOpen'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import RefreshIcon from '@mui/icons-material/Refresh'
import ImageIcon from '@mui/icons-material/Image'
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile'
import EditIcon from '@mui/icons-material/Edit'
import DeleteIcon from '@mui/icons-material/Delete'
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh'
import html2canvas from 'html2canvas'
import { useTranslation } from 'react-i18next'
import { useCorpusStore } from '../../stores/corpusStore'
import { frameworkApi, annotationApi, createTextAnnotationRequest, corpusApi } from '../../api'
import { FrameworkTree, TextAnnotator, AnnotationTable, SyntaxVisualization, SearchAnnotateBox, BatchAnnotateDialog } from '../../components/Annotation'
import AccountTreeIcon from '@mui/icons-material/AccountTree'
import {
  isAutoAnnotationSupported,
  getAutoAnnotationType,
  createMipvuAnnotations,
  createThemeRhemeAnnotations,
  mergeAnnotations,
  AUTO_ANNOTATION_FRAMEWORKS
} from '../../utils/autoAnnotation'
import type { TextAnnotatorRef, SentenceInfo, SearchMatch } from '../../components/Annotation'
import type { 
  Framework, 
  FrameworkCategory, 
  Annotation, 
  SelectedLabel,
  AnnotationArchiveListItem,
  CorpusText,
  Corpus
} from '../../types'

// SpaCy 标注接口
interface SpacyToken {
  text: string
  start: number
  end: number
  pos: string
  tag: string
  lemma: string
  dep: string
  morph: string
}

interface SpacyEntity {
  text: string
  start: number
  end: number
  label: string
  description: string
}

interface SpacySentence {
  text: string
  start: number
  end: number
}

interface SpacyAnnotation {
  success: boolean
  tokens: SpacyToken[]
  entities: SpacyEntity[]
  sentences: SpacySentence[]
}

export default function TextAnnotation() {
  const { t } = useTranslation()
  const { corpora, currentCorpus, setCurrentCorpus, setCorpora } = useCorpusStore()

  // 框架状态
  const [frameworks, setFrameworks] = useState<FrameworkCategory[]>([])
  const [selectedFrameworkId, setSelectedFrameworkId] = useState<string>('')
  const [currentFramework, setCurrentFramework] = useState<Framework | null>(null)
  const [selectedLabel, setSelectedLabel] = useState<SelectedLabel | null>(null)
  const [frameworkLoading, setFrameworkLoading] = useState(false)

  // 语料库和文本状态
  const [selectedText, setSelectedText] = useState<CorpusText | null>(null)
  const [textContent, setTextContent] = useState('')
  const [textLoading, setTextLoading] = useState(false)
  
  // Key to force TextAnnotator remount when selecting same text
  const [annotatorKey, setAnnotatorKey] = useState(0)

  // 左侧面板宽度
  const [leftPanelWidth, setLeftPanelWidth] = useState(400)
  const dividerRef = useRef<HTMLDivElement>(null)
  const textAnnotatorRef = useRef<TextAnnotatorRef>(null)

  // SpaCy 标注状态
  const [spacyAnnotation, setSpacyAnnotation] = useState<SpacyAnnotation | null>(null)

  // 存档管理状态
  const [renameDialogOpen, setRenameDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [editingArchive, setEditingArchive] = useState<AnnotationArchiveListItem | null>(null)
  const [newArchiveName, setNewArchiveName] = useState('')
  const [archiveOperating, setArchiveOperating] = useState(false)
  
  // 保存对话框状态
  const [saveDialogOpen, setSaveDialogOpen] = useState(false)
  const [coderName, setCoderName] = useState('')

  // 标注状态
  const [annotations, setAnnotations] = useState<Annotation[]>([])
  const [highlightedAnnotationId, setHighlightedAnnotationId] = useState<string | null>(null)
  const [currentArchiveId, setCurrentArchiveId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // 存档状态
  const [archives, setArchives] = useState<AnnotationArchiveListItem[]>([])
  const [loadingArchives, setLoadingArchives] = useState(false)

  // 导出状态
  const [exporting, setExporting] = useState<'png' | 'svg' | null>(null)
  
  // 句法可视化状态
  const [showSyntax, setShowSyntax] = useState(false)
  const [selectedSentenceIndex, setSelectedSentenceIndex] = useState(0)
  
  // 搜索标注状态
  const [searchTerm, setSearchTerm] = useState('')
  const [searchMatches, setSearchMatches] = useState<SearchMatch[]>([])
  const [batchAnnotateDialogOpen, setBatchAnnotateDialogOpen] = useState(false)
  
  // 自动标注状态
  const [autoAnnotating, setAutoAnnotating] = useState(false)

  // 加载框架、语料库和所有存档
  // Load frameworks and corpora on mount
  useEffect(() => {
    loadFrameworks()
    loadCorpora()
  }, [])
  
  // Load archives after corpora are loaded (to filter out non-existent corpora)
  useEffect(() => {
    if (corpora.length > 0) {
      loadAllArchives()
    }
  }, [corpora])
  
  const loadCorpora = async () => {
    try {
      const response = await corpusApi.listCorpora()
      if (response.success && response.data) {
        const corporaWithTexts = await Promise.all(
          response.data.map(async (corpus: Corpus) => {
            try {
              const textsResponse = await corpusApi.getTexts(corpus.id)
              return {
                ...corpus,
                texts: textsResponse.success ? textsResponse.data : [],
                textCount: textsResponse.success ? textsResponse.data.length : 0
              }
            } catch {
              return { ...corpus, texts: [], textCount: 0 }
            }
          })
        )
        setCorpora(corporaWithTexts)
      }
    } catch (error) {
      console.error('Failed to load corpora:', error)
    }
  }

  // 存档列表不再依赖语料库选择，始终显示所有存档

  const loadFrameworks = async () => {
    setFrameworkLoading(true)
    try {
      const response = await frameworkApi.list()
      if (response.success && response.data) {
        const backendResponse = response.data as any
        const categories = backendResponse.data?.categories || backendResponse.categories || []
        setFrameworks(categories)
      }
    } catch (error) {
      console.error('Failed to load frameworks:', error)
    } finally {
      setFrameworkLoading(false)
    }
  }

  const loadFramework = async (frameworkId: string) => {
    if (!frameworkId) return
    
    setFrameworkLoading(true)
    try {
      const response = await frameworkApi.get(frameworkId)
      if (response.success && response.data) {
        const data = response.data as any
        const framework = data.data || data
        setCurrentFramework(framework)
        setSelectedLabel(null)
      }
    } catch (error) {
      console.error('Failed to load framework:', error)
    } finally {
      setFrameworkLoading(false)
    }
  }

  // 加载所有纯文本存档（不限于特定语料库）
  const loadAllArchives = async () => {
    setLoadingArchives(true)
    try {
      const response = await annotationApi.listAll('text')
      if (response.success && response.data?.data?.archives) {
        // Filter out archives whose corpus no longer exists
        const allArchives = response.data.data.archives as AnnotationArchiveListItem[]
        const validArchives = allArchives.filter(archive => {
          if (!archive.corpusName) return true // Keep archives without corpusName
          // Check if corpus exists in our loaded corpora list
          return corpora.some(c => c.name === archive.corpusName)
        })
        setArchives(validArchives)
      }
    } catch (error) {
      console.error('Failed to load all archives:', error)
    } finally {
      setLoadingArchives(false)
    }
  }

  const handleFrameworkChange = (frameworkId: string) => {
    setSelectedFrameworkId(frameworkId)
    loadFramework(frameworkId)
  }

  const handleCorpusChange = (corpusId: string) => {
    const corpus = corpora.find(c => c.id === corpusId)
    setCurrentCorpus(corpus || null)
    setSelectedText(null)
    setTextContent('')
    setAnnotations([])
    setCurrentArchiveId(null)
    setSpacyAnnotation(null)
  }

  // 刷新存档列表
  const refreshArchives = async () => {
    await loadAllArchives()
  }

  // 选择文本并直接加载内容
  const handleTextSelect = async (text: CorpusText) => {
    if (!currentCorpus) return
    
    // 每次选择文本都完全重置状态，准备新的标注
    // 即使是同一篇文本也重置，让用户可以开始新的标注存档
    
    // 增加 annotatorKey 强制 TextAnnotator 重新挂载
    setAnnotatorKey(prev => prev + 1)
    
    // 先清空文本内容，确保重新加载
    setTextContent('')
    
    setSelectedText(text)
    setAnnotations([])
    setCurrentArchiveId(null)
    setCoderName('')
    setSpacyAnnotation(null)
    setTextLoading(true)
    
    try {
      // 加载最新的文本内容
      const response = await corpusApi.getText(currentCorpus.id, text.id)
      if (response.success) {
        let content = ''
        if (response.content) {
          content = response.content
        } else if (response.transcript?.text) {
          content = response.transcript.text
        }
        
        setTextContent(content)
        await loadSpacyAnnotations(currentCorpus.id, text)
      } else {
        setTextContent('')
      }
      
      // 不再根据文本筛选存档，存档列表显示所有存档
    } catch (error) {
      console.error('Failed to load text content:', error)
      setTextContent('')
    } finally {
      setTextLoading(false)
    }
  }

  const loadSpacyAnnotations = async (corpusId: string, text: CorpusText) => {
    try {
      const response = await corpusApi.getSpacyAnnotation(corpusId, text.id)
      if (response.success && response.data) {
        setSpacyAnnotation(response.data)
      }
    } catch (error) {
      console.log('No SpaCy annotations found for text')
    }
  }

  const handleLoadArchive = async (archive: AnnotationArchiveListItem) => {
    // 使用存档中的语料库名称（如果当前没有选择语料库或存档属于其他语料库）
    const corpusName = archive.corpusName
    if (!corpusName) {
      console.error('Archive has no corpus name')
      return
    }
    
    // 如果存档属于不同的语料库，自动切换
    let targetCorpus = currentCorpus
    if (!currentCorpus || currentCorpus.name !== corpusName) {
      targetCorpus = corpora.find(c => c.name === corpusName) || null
      if (targetCorpus) {
        setCurrentCorpus(targetCorpus)
      } else {
        console.error(`Corpus ${corpusName} not found`)
        return
      }
    }
    
    setTextLoading(true)
    try {
      const response = await annotationApi.load(corpusName, archive.id)
      if (response.success && response.data?.data) {
        const data = response.data.data
        setTextContent(data.text)
        setAnnotations(data.annotations)
        setCurrentArchiveId(data.id)
        
        // 优先从存档恢复 SpaCy 数据
        if (data.spacyAnnotation && data.spacyAnnotation.success) {
          setSpacyAnnotation(data.spacyAnnotation)
          console.log('SpaCy data restored from archive')
        } else {
          // 如果存档中没有 SpaCy 数据，尝试从语料库加载
          setSpacyAnnotation(null)
        }
        
        // Find the corresponding text by textId or textName
        if (targetCorpus) {
          let matchingText = null
          if (data.textId) {
            matchingText = targetCorpus.texts.find(t => t.id === data.textId)
          }
          if (!matchingText && data.textName) {
            matchingText = targetCorpus.texts.find(t => t.filename === data.textName)
          }
          
          if (matchingText) {
            setSelectedText(matchingText)
            // 只有当存档中没有 SpaCy 数据时才从语料库加载
            if (!data.spacyAnnotation || !data.spacyAnnotation.success) {
              await loadSpacyAnnotations(targetCorpus.id, matchingText)
            }
          } else {
            setSelectedText(null)
          }
        } else {
          setSelectedText(null)
        }
        
        if (data.framework) {
          for (const category of frameworks) {
            const fw = category.frameworks.find(f => f.name === data.framework)
            if (fw) {
              setSelectedFrameworkId(fw.id)
              loadFramework(fw.id)
              break
            }
          }
        }
      }
    } catch (error) {
      console.error('Failed to load archive:', error)
    } finally {
      setTextLoading(false)
    }
  }

  const handleLabelSelect = useCallback((label: SelectedLabel | null) => {
    setSelectedLabel(label)
  }, [])

  const handleAnnotationAdd = useCallback((newAnn: Omit<Annotation, 'id'>) => {
    const annotation: Annotation = {
      ...newAnn,
      id: `ann-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    }
    setAnnotations(prev => [...prev, annotation])
  }, [])

  const handleAnnotationRemove = useCallback((id: string) => {
    setAnnotations(prev => prev.filter(a => a.id !== id))
  }, [])

  const handleAnnotationUpdate = useCallback((id: string, updates: Partial<Annotation>) => {
    setAnnotations(prev => prev.map(a => a.id === id ? { ...a, ...updates } : a))
  }, [])

  // 打开保存对话框
  const handleSaveClick = () => {
    // 如果已有存档，使用已保存的编码者名称
    if (currentArchiveId) {
      const currentArchive = archives.find(a => a.id === currentArchiveId)
      setCoderName(currentArchive?.coderName || '')
    }
    setSaveDialogOpen(true)
  }
  
  // 执行保存
  const handleSave = async () => {
    if (!currentCorpus || !currentFramework || !textContent) return

    setSaving(true)
    setSaveMessage(null)
    setSaveDialogOpen(false)
    
    // Helper functions to find POS and Entity for annotation range
    const findPosForRange = (start: number, end: number): string => {
      if (!spacyAnnotation?.tokens) return '-'
      const matching = spacyAnnotation.tokens.filter(t => t.start >= start && t.end <= end)
      if (matching.length === 0) return '-'
      const uniquePos = [...new Set(matching.map(t => t.pos))]
      return uniquePos.length > 1 ? 'Mul' : uniquePos[0]
    }
    
    const findEntityForRange = (start: number, end: number): string => {
      if (!spacyAnnotation?.entities) return '-'
      const matching = spacyAnnotation.entities.filter(e =>
        (e.start >= start && e.start < end) ||
        (e.end > start && e.end <= end) ||
        (e.start <= start && e.end >= end)
      )
      if (matching.length === 0) return '-'
      const uniqueLabels = [...new Set(matching.map(e => e.label))]
      return uniqueLabels.length > 1 ? 'Mul' : uniqueLabels[0]
    }
    
    // Enrich annotations with POS and Entity data before saving
    const enrichedAnnotations = annotations
      .filter(a => !a.id.startsWith('spacy-'))
      .map(ann => ({
        ...ann,
        pos: ann.pos || findPosForRange(ann.startPosition, ann.endPosition),
        entity: ann.entity || findEntityForRange(ann.startPosition, ann.endPosition)
      }))
    
    try {
      const request = createTextAnnotationRequest(
        currentCorpus.name,
        selectedText?.filename || 'Untitled',
        currentFramework.name,
        currentFramework.category,
        textContent,
        enrichedAnnotations,
        currentArchiveId || undefined,
        coderName || undefined,
        spacyAnnotation || undefined,  // 保存 SpaCy 标注数据
        selectedText?.id || undefined   // 传递 textId 用于精确关联
      )

      const response = await annotationApi.save(request)
      
      if (response.success && response.data?.data) {
        setCurrentArchiveId(response.data.data.id)
        setSaveMessage({ type: 'success', text: `已保存 ${enrichedAnnotations.length} 条标注` })
        // 保存后刷新存档列表
        await refreshArchives()
      } else {
        setSaveMessage({ type: 'error', text: '保存失败' })
      }
    } catch (error) {
      console.error('Save error:', error)
      setSaveMessage({ type: 'error', text: '保存失败' })
    } finally {
      setSaving(false)
      setTimeout(() => setSaveMessage(null), 3000)
    }
  }

  // PNG 导出
  const handleExportPng = async () => {
    const container = textAnnotatorRef.current?.getContainer()
    if (!container) return

    setExporting('png')
    try {
      const originalStyle = {
        maxHeight: container.style.maxHeight,
        overflow: container.style.overflow,
        height: container.style.height,
        width: container.style.width,
        padding: container.style.padding
      }
      
      // 展开容器以显示所有内容
      container.style.maxHeight = 'none'
      container.style.overflow = 'visible'
      container.style.height = 'auto'
      container.style.width = 'fit-content'
      container.style.minWidth = '100%'

      await new Promise(resolve => setTimeout(resolve, 150))

      // 添加 padding 确保边缘不被裁剪
      const padding = 20
      const contentWidth = Math.max(container.scrollWidth, container.offsetWidth)
      const contentHeight = Math.max(container.scrollHeight, container.offsetHeight)

      const canvas = await html2canvas(container, {
        scale: 3,
        useCORS: true,
        backgroundColor: '#ffffff',
        width: contentWidth + padding * 2,
        height: contentHeight + padding * 2,
        x: -padding,
        y: -padding,
        windowWidth: contentWidth + padding * 2 + 100,
        windowHeight: contentHeight + padding * 2 + 100,
        scrollX: 0,
        scrollY: 0
      })

      // 恢复原始样式
      container.style.maxHeight = originalStyle.maxHeight
      container.style.overflow = originalStyle.overflow
      container.style.height = originalStyle.height
      container.style.width = originalStyle.width
      container.style.padding = originalStyle.padding

      const link = document.createElement('a')
      link.download = `annotation_${selectedText?.filename || 'export'}_${Date.now()}.png`
      link.href = canvas.toDataURL('image/png', 1.0)
      link.click()
    } catch (error) {
      console.error('PNG export error:', error)
      alert('PNG导出失败: ' + (error as Error).message)
    } finally {
      setExporting(null)
    }
  }

  // SVG 导出
  const handleExportSvg = async () => {
    const container = textAnnotatorRef.current?.getContainer()
    if (!container) return

    setExporting('svg')
    try {
      const originalStyle = {
        maxHeight: container.style.maxHeight,
        overflow: container.style.overflow,
        height: container.style.height,
        width: container.style.width
      }
      
      // 展开容器以显示所有内容
      container.style.maxHeight = 'none'
      container.style.overflow = 'visible'
      container.style.height = 'auto'
      container.style.width = 'fit-content'
      container.style.minWidth = '100%'

      await new Promise(resolve => setTimeout(resolve, 150))

      // 添加 padding 确保边缘不被裁剪
      const padding = 20
      const contentWidth = Math.max(container.scrollWidth, container.offsetWidth)
      const contentHeight = Math.max(container.scrollHeight, container.offsetHeight)
      const fullWidth = contentWidth + padding * 2
      const fullHeight = contentHeight + padding * 2

      const clone = container.cloneNode(true) as HTMLElement
      
      // 递归内联所有样式
      const inlineStyles = (source: Element, target: Element) => {
        const computed = window.getComputedStyle(source)
        for (let i = 0; i < computed.length; i++) {
          const prop = computed[i]
          ;(target as HTMLElement).style.setProperty(prop, computed.getPropertyValue(prop))
        }
        const srcChildren = source.children
        const tgtChildren = target.children
        for (let i = 0; i < srcChildren.length; i++) {
          if (tgtChildren[i]) {
            inlineStyles(srcChildren[i], tgtChildren[i])
          }
        }
      }
      inlineStyles(container, clone)

      // 创建 SVG 元素
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
      svg.setAttribute('width', String(fullWidth))
      svg.setAttribute('height', String(fullHeight))
      svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
      svg.setAttribute('viewBox', `0 0 ${fullWidth} ${fullHeight}`)

      // 添加白色背景矩形
      const bgRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
      bgRect.setAttribute('width', '100%')
      bgRect.setAttribute('height', '100%')
      bgRect.setAttribute('fill', '#ffffff')
      svg.appendChild(bgRect)

      // 创建 foreignObject 用于嵌入 HTML
      const foreignObject = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject')
      foreignObject.setAttribute('x', String(padding))
      foreignObject.setAttribute('y', String(padding))
      foreignObject.setAttribute('width', String(contentWidth))
      foreignObject.setAttribute('height', String(contentHeight))

      // 创建包装器
      const wrapper = document.createElement('div')
      wrapper.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml')
      wrapper.style.width = contentWidth + 'px'
      wrapper.style.height = contentHeight + 'px'
      wrapper.style.backgroundColor = '#fafafa'
      wrapper.style.overflow = 'visible'
      wrapper.appendChild(clone)

      foreignObject.appendChild(wrapper)
      svg.appendChild(foreignObject)

      // 恢复原始样式
      container.style.maxHeight = originalStyle.maxHeight
      container.style.overflow = originalStyle.overflow
      container.style.height = originalStyle.height
      container.style.width = originalStyle.width

      const svgData = new XMLSerializer().serializeToString(svg)
      const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' })
      const url = URL.createObjectURL(blob)

      const link = document.createElement('a')
      link.download = `annotation_${selectedText?.filename || 'export'}_${Date.now()}.svg`
      link.href = url
      link.click()

      URL.revokeObjectURL(url)
    } catch (error) {
      console.error('SVG export error:', error)
      alert('SVG导出失败: ' + (error as Error).message)
    } finally {
      setExporting(null)
    }
  }

  // 存档重命名
  const handleRenameArchive = async () => {
    if (!currentCorpus || !editingArchive || !newArchiveName.trim()) return
    
    setArchiveOperating(true)
    try {
      const corpusName = editingArchive.corpusName || currentCorpus?.name
      if (!corpusName) return
      const response = await annotationApi.rename(corpusName, editingArchive.id, newArchiveName.trim())
      if (response.success) {
        await refreshArchives()
        setRenameDialogOpen(false)
        setEditingArchive(null)
        setNewArchiveName('')
      }
    } catch (error) {
      console.error('Rename archive error:', error)
    } finally {
      setArchiveOperating(false)
    }
  }

  // 存档删除
  const handleDeleteArchive = async () => {
    if (!currentCorpus || !editingArchive) return
    
    setArchiveOperating(true)
    try {
      const corpusName = editingArchive.corpusName || currentCorpus?.name
      if (!corpusName) return
      const response = await annotationApi.delete(corpusName, editingArchive.id)
      if (response.success) {
        await refreshArchives()
        setDeleteDialogOpen(false)
        setEditingArchive(null)
        // 如果删除的是当前存档，清空当前状态
        if (currentArchiveId === editingArchive.id) {
          setCurrentArchiveId(null)
          setTextContent('')
          setAnnotations([])
        }
      }
    } catch (error) {
      console.error('Delete archive error:', error)
    } finally {
      setArchiveOperating(false)
    }
  }

  // 处理搜索词变化
  const handleSearchChange = useCallback((term: string, matches: SearchMatch[]) => {
    setSearchTerm(term)
    setSearchMatches(matches)
  }, [])
  
  // 处理搜索确认（按回车）
  const handleSearchConfirm = useCallback((matches: SearchMatch[]) => {
    if (matches.length > 0 && selectedLabel) {
      setBatchAnnotateDialogOpen(true)
    }
  }, [selectedLabel])
  
  // 执行批量标注
  const handleBatchAnnotateConfirm = useCallback(() => {
    if (!selectedLabel || searchMatches.length === 0) return
    
    // 为每个匹配位置创建标注
    searchMatches.forEach((match, index) => {
      const annotation: Annotation = {
        id: `ann-${Date.now()}-${index}-${Math.random().toString(36).substr(2, 9)}`,
        text: match.text,
        startPosition: match.start,
        endPosition: match.end,
        label: selectedLabel.node.name,
        labelPath: selectedLabel.path,
        color: selectedLabel.color
      }
      setAnnotations(prev => [...prev, annotation])
    })
    
    // 清除搜索状态
    setSearchTerm('')
    setSearchMatches([])
    setBatchAnnotateDialogOpen(false)
  }, [selectedLabel, searchMatches])

  // 检查当前框架是否支持自动标注
  const isAutoAnnotateEnabled = useCallback(() => {
    if (!currentFramework?.id) return false
    return isAutoAnnotationSupported(currentFramework.id)
  }, [currentFramework])

  // 获取自动标注按钮的提示文本
  const getAutoAnnotateTooltip = useCallback(() => {
    if (!currentFramework?.id) {
      return t('annotation.autoAnnotateDisabled', '当前框架不支持自动标注')
    }
    const annotationType = getAutoAnnotationType(currentFramework.id)
    if (annotationType === 'mipvu') {
      return t('annotation.autoAnnotateMipvu', '自动标注隐喻词')
    }
    if (annotationType === 'theme-rheme') {
      return t('annotation.autoAnnotateTheme', '自动标注主题/述题')
    }
    return t('annotation.autoAnnotateDisabled', '当前框架不支持自动标注')
  }, [currentFramework, t])

  // 执行自动标注
  const handleAutoAnnotate = async () => {
    if (!currentFramework?.id || !currentCorpus || !selectedText) return
    
    const annotationType = getAutoAnnotationType(currentFramework.id)
    if (!annotationType) return
    
    setAutoAnnotating(true)
    try {
      if (annotationType === 'mipvu') {
        // MIPVU 自动标注：获取 MIPVU 标注数据并创建 indirect 标签
        const response = await corpusApi.getMipvuAnnotation(currentCorpus.id, selectedText.id)
        if (response.success && response.data) {
          const newAnnotations = createMipvuAnnotations(response.data, textContent)
          if (newAnnotations.length > 0) {
            const merged = mergeAnnotations(annotations, newAnnotations)
            setAnnotations(merged)
            setSaveMessage({
              type: 'success',
              text: t('annotation.autoAnnotateSuccess', '已自动添加 {{count}} 条标注', { count: newAnnotations.length })
            })
          } else {
            setSaveMessage({
              type: 'success',
              text: t('annotation.noMetaphorFound', '未找到隐喻词')
            })
          }
        } else {
          setSaveMessage({
            type: 'error',
            text: t('annotation.mipvuDataNotFound', 'MIPVU 标注数据不存在，请先上传或重新标注')
          })
        }
      } else if (annotationType === 'theme-rheme') {
        // Theme/Rheme 自动标注：调用后端 API 分析并创建标注
        const response = await annotationApi.analyzeThemeRheme(currentCorpus.id, selectedText.id)
        // response.success 是 API client 层的成功标志
        // response.data?.success 是后端返回的成功标志
        // response.data?.data?.results 是实际的结果数据
        if (response.success && response.data?.success && response.data?.data?.results) {
          const frameworkId = currentFramework.id as 'Halliday-Theme' | 'Berry-Theme'
          const newAnnotations = createThemeRhemeAnnotations(
            response.data.data.results,
            frameworkId,
            textContent
          )
          if (newAnnotations.length > 0) {
            const merged = mergeAnnotations(annotations, newAnnotations)
            setAnnotations(merged)
            setSaveMessage({
              type: 'success',
              text: t('annotation.autoAnnotateSuccess', '已自动添加 {{count}} 条标注', { count: newAnnotations.length })
            })
          } else {
            setSaveMessage({
              type: 'success',
              text: t('annotation.noThemeRhemeFound', '未识别到主题/述题')
            })
          }
        } else {
          // 显示更详细的错误信息
          const errorMsg = response.error || response.data?.message || t('annotation.spacyDataNotFound', 'SpaCy 标注数据不存在，请先上传或重新标注')
          setSaveMessage({
            type: 'error',
            text: errorMsg
          })
        }
      }
    } catch (error) {
      console.error('Auto-annotate error:', error)
      setSaveMessage({
        type: 'error',
        text: t('annotation.autoAnnotateError', '自动标注失败')
      })
    } finally {
      setAutoAnnotating(false)
      setTimeout(() => setSaveMessage(null), 3000)
    }
  }

  const availableTexts = currentCorpus?.texts?.filter(
    t => t.mediaType === 'text' || t.transcriptPath
  ) || []

  const allFrameworks = frameworks.flatMap(cat => 
    cat.frameworks.map(fw => ({ ...fw, categoryName: cat.name }))
  )

  const handleDividerMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    
    const startX = e.clientX
    const startWidth = leftPanelWidth
    
    const handleMouseMove = (moveEvent: MouseEvent) => {
      moveEvent.preventDefault()
      moveEvent.stopPropagation()
      const delta = moveEvent.clientX - startX
      const newWidth = Math.max(250, Math.min(800, startWidth + delta))
      setLeftPanelWidth(newWidth)
    }

    const handleMouseUp = (upEvent: MouseEvent) => {
      upEvent.preventDefault()
      upEvent.stopPropagation()
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }, [leftPanelWidth])

  // 用户标注数量
  const userAnnotationCount = annotations.filter(a => !a.id.startsWith('spacy-')).length

  return (
    <Box sx={{ display: 'flex', height: '100%', width: '100%', overflow: 'hidden' }}>
      {/* 左侧面板 */}
      <Box 
        sx={{ 
          width: leftPanelWidth,
          minWidth: 250,
          maxWidth: '50%',
          display: 'flex',
          flexDirection: 'column',
          flexShrink: 0,
          borderRight: 1,
          borderColor: 'divider',
          overflow: 'hidden'
        }}
      >
        {/* 上半部分：框架设置和框架树 - 使用 flex: 1 让框架树有足够空间 */}
        <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* 框架设置 */}
          <Accordion defaultExpanded sx={{ flexShrink: 0 }}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography fontWeight={600}>{t('annotation.frameworkSettings', '框架设置')}</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Stack spacing={2}>
                <FormControl fullWidth size="small">
                  <InputLabel>{t('annotation.selectFramework', '选择框架')}</InputLabel>
                  <Select
                    value={selectedFrameworkId}
                    onChange={(e) => handleFrameworkChange(e.target.value)}
                    label={t('annotation.selectFramework', '选择框架')}
                    MenuProps={{
                      PaperProps: {
                        sx: { maxWidth: 400 }
                      }
                    }}
                  >
                    {allFrameworks.map(fw => (
                      <MenuItem key={fw.id} value={fw.id} sx={{ maxWidth: 400 }}>
                        <Stack direction="column" spacing={0.5} sx={{ width: '100%' }}>
                          <Typography 
                            variant="body2" 
                            sx={{ 
                              wordBreak: 'break-word',
                              whiteSpace: 'normal',
                              lineHeight: 1.3
                            }}
                          >
                            {fw.name}
                          </Typography>
                          <Chip 
                            label={fw.categoryName} 
                            size="small" 
                            variant="outlined" 
                            sx={{ alignSelf: 'flex-start', fontSize: '10px', height: 20 }}
                          />
                        </Stack>
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>

                <Button
                  startIcon={<RefreshIcon />}
                  onClick={loadFrameworks}
                  disabled={frameworkLoading}
                  size="small"
                >
                  {t('annotation.refreshFrameworks', '刷新框架')}
                </Button>
              </Stack>
            </AccordionDetails>
          </Accordion>

          {/* 框架树 - 占据剩余空间 */}
          {currentFramework && (
            <Box sx={{ flex: 1, minHeight: 250, p: 1, display: 'flex', flexDirection: 'column' }}>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom sx={{ flexShrink: 0 }}>
                {t('annotation.clickLabelToSelect', '点击标签选中用于标注')}
              </Typography>
              <Box sx={{ flex: 1, minHeight: 200 }}>
                <FrameworkTree
                  root={currentFramework.root}
                  selectedLabel={selectedLabel}
                  onLabelSelect={handleLabelSelect}
                />
              </Box>
            </Box>
          )}
        </Box>

        {/* 选中的标签显示 - 固定在中间 */}
        {selectedLabel && (
          <Paper sx={{ mx: 1, p: 1, bgcolor: `${selectedLabel.color}20`, flexShrink: 0 }}>
            <Typography variant="body2" fontWeight={600}>
              {t('annotation.selected', '已选择')}: {selectedLabel.node.name}
            </Typography>
            {selectedLabel.node.definition && (
              <Typography variant="caption" color="text.secondary">
                {selectedLabel.node.definition}
              </Typography>
            )}
          </Paper>
        )}

        <Divider sx={{ my: 0.5, flexShrink: 0 }} />

        {/* 下半部分：语料库选择和存档 - 固定高度，可滚动 */}
        <Box sx={{ flex: '0 0 auto', maxHeight: '40%', overflow: 'auto' }}>
          {/* 语料库选择 */}
        <Accordion defaultExpanded>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography fontWeight={600}>{t('annotation.corpusSelection', '语料库选择')}</Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Stack spacing={2}>
              <FormControl fullWidth size="small">
                <InputLabel>{t('corpus.selectCorpus', '选择语料库')}</InputLabel>
                <Select
                  value={currentCorpus?.id || ''}
                  onChange={(e) => handleCorpusChange(e.target.value)}
                  label={t('corpus.selectCorpus', '选择语料库')}
                >
                  {corpora.map(corpus => (
                    <MenuItem key={corpus.id} value={corpus.id}>
                      {corpus.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              {currentCorpus && availableTexts.length > 0 && (
                <Paper variant="outlined" sx={{ maxHeight: 150, overflow: 'auto' }}>
                  <List dense disablePadding>
                    {availableTexts.map(text => (
                      <ListItemButton
                        key={text.id}
                        selected={selectedText?.id === text.id}
                        onClick={() => handleTextSelect(text)}
                      >
                        <ListItemText
                          primary={text.filename}
                          secondary={text.mediaType}
                        />
                      </ListItemButton>
                    ))}
                  </List>
                </Paper>
              )}
            </Stack>
          </AccordionDetails>
        </Accordion>

        {/* 存档 - 显示所有存档 */}
        {archives.length > 0 && (
          <Accordion>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography fontWeight={600}>
                {t('annotation.archives')} ({archives.length})
              </Typography>
            </AccordionSummary>
            <AccordionDetails>
              <List dense disablePadding>
                {archives.map(archive => (
                  <ListItemButton
                    key={archive.id}
                    onClick={() => handleLoadArchive(archive)}
                    selected={currentArchiveId === archive.id}
                    sx={{ pr: 0.5 }}
                  >
                    <ListItemText
                      primary={archive.textName || archive.filename}
                      secondary={`${archive.corpusName || ''} | ${archive.annotationCount} ${t('annotation.annotationCount', '条标注')} - ${archive.timestamp}`}
                      sx={{ mr: 1 }}
                    />
                    <Stack direction="row" spacing={0}>
                      <IconButton
                        size="small"
                        onClick={(e) => {
                          e.stopPropagation()
                          setEditingArchive(archive)
                          setNewArchiveName(archive.textName || archive.filename)
                          setRenameDialogOpen(true)
                        }}
                      >
                        <EditIcon fontSize="small" />
                      </IconButton>
                      <IconButton
                        size="small"
                        color="error"
                        onClick={(e) => {
                          e.stopPropagation()
                          setEditingArchive(archive)
                          setDeleteDialogOpen(true)
                        }}
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Stack>
                  </ListItemButton>
                ))}
              </List>
            </AccordionDetails>
          </Accordion>
        )}
        </Box>
      </Box>

      {/* 可调整分隔线 */}
      <Box
        ref={dividerRef}
        onMouseDown={handleDividerMouseDown}
        sx={{
          width: 8,
          cursor: 'col-resize',
          bgcolor: 'divider',
          '&:hover': { bgcolor: 'primary.light' },
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          '&::after': {
            content: '""',
            width: 2,
            height: 40,
            bgcolor: 'grey.400',
            borderRadius: 1
          }
        }}
      />

      {/* 右侧面板 - 标注区域 */}
      <Box sx={{ 
        flex: 1, 
        display: 'flex', 
        flexDirection: 'column', 
        overflow: 'hidden',
        minWidth: 0
      }}>
        {textContent ? (
          <>
            {/* 工具栏 */}
            <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1}>
                <Box>
                  <Typography variant="subtitle1" fontWeight={600}>
                    {selectedText?.filename || t('annotation.textMode', '纯文本标注')}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {userAnnotationCount} {t('annotation.annotationCount', '条标注')}
                    {selectedLabel && ` | ${t('annotation.selectedLabel', '已选标签')}: ${selectedLabel.node.name}`}
                  </Typography>
                </Box>
                
                {/* 搜索框 */}
                <SearchAnnotateBox
                  text={textContent}
                  onSearchChange={handleSearchChange}
                  onConfirmAnnotate={handleSearchConfirm}
                  disabled={!selectedLabel}
                  placeholder={selectedLabel 
                    ? t('annotation.searchToAnnotate', '搜索并标注为 "{{label}}"...', { label: selectedLabel.node.name })
                    : t('annotation.selectLabelFirstToSearch', '请先选择标签再搜索')
                  }
                />
                
                <Stack direction="row" spacing={1} alignItems="center">
                  {/* 导出按钮 */}
                  <Tooltip title={t('annotation.exportPng', '导出PNG')}>
                    <IconButton
                      size="small"
                      onClick={handleExportPng}
                      disabled={exporting !== null}
                      sx={{ 
                        bgcolor: '#FF9800', 
                        color: 'white',
                        '&:hover': { bgcolor: '#F57C00' }
                      }}
                    >
                      {exporting === 'png' ? <CircularProgress size={18} color="inherit" /> : <ImageIcon fontSize="small" />}
                    </IconButton>
                  </Tooltip>
                  <Tooltip title={t('annotation.exportSvg', '导出SVG')}>
                    <IconButton
                      size="small"
                      onClick={handleExportSvg}
                      disabled={exporting !== null}
                      sx={{ 
                        bgcolor: '#9C27B0', 
                        color: 'white',
                        '&:hover': { bgcolor: '#7B1FA2' }
                      }}
                    >
                      {exporting === 'svg' ? <CircularProgress size={18} color="inherit" /> : <InsertDriveFileIcon fontSize="small" />}
                    </IconButton>
                  </Tooltip>
                  
                  {/* 句法可视化按钮 */}
                  <Tooltip title={t('syntax.viewSyntax', '查看句法结构')}>
                    <IconButton
                      size="small"
                      onClick={() => setShowSyntax(!showSyntax)}
                      disabled={!spacyAnnotation?.sentences?.length}
                      sx={{ 
                        bgcolor: showSyntax ? '#2196F3' : '#607D8B', 
                        color: 'white',
                        '&:hover': { bgcolor: showSyntax ? '#1976D2' : '#455A64' }
                      }}
                    >
                      <AccountTreeIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  
                  {/* 自动标注按钮 */}
                  <Tooltip title={getAutoAnnotateTooltip()}>
                    <span>
                      <IconButton
                        size="small"
                        onClick={handleAutoAnnotate}
                        disabled={!isAutoAnnotateEnabled() || autoAnnotating || !spacyAnnotation?.sentences?.length}
                        sx={{ 
                          bgcolor: isAutoAnnotateEnabled() ? '#4CAF50' : '#9E9E9E', 
                          color: 'white',
                          '&:hover': { bgcolor: isAutoAnnotateEnabled() ? '#388E3C' : '#757575' },
                          '&.Mui-disabled': { bgcolor: '#9E9E9E', color: 'rgba(255,255,255,0.5)' }
                        }}
                      >
                        {autoAnnotating ? <CircularProgress size={18} color="inherit" /> : <AutoFixHighIcon fontSize="small" />}
                      </IconButton>
                    </span>
                  </Tooltip>
                  
                  <Divider orientation="vertical" flexItem />
                  
                  {saveMessage && (
                    <Alert severity={saveMessage.type} sx={{ py: 0 }}>
                      {saveMessage.text}
                    </Alert>
                  )}
                  <Button
                    startIcon={saving ? <CircularProgress size={16} /> : <SaveIcon />}
                    variant="contained"
                    size="small"
                    onClick={handleSaveClick}
                    disabled={saving || !currentFramework || userAnnotationCount === 0}
                  >
                    {t('common.save', '保存')}
                  </Button>
                </Stack>
              </Stack>
            </Box>

            {/* 文本内容和标注 */}
            <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
              <TextAnnotator
                key={annotatorKey}
                ref={textAnnotatorRef}
                text={textContent}
                annotations={annotations}
                selectedLabel={selectedLabel}
                onAnnotationAdd={handleAnnotationAdd}
                onAnnotationRemove={handleAnnotationRemove}
                sentences={spacyAnnotation?.sentences}
                searchHighlights={searchMatches.map(m => ({ start: m.start, end: m.end }))}
              />

              {/* 标注表格 */}
              <Box sx={{ mt: 2 }}>
                <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                  {t('annotation.annotationTable', '标注表格')} ({userAnnotationCount})
                </Typography>
                <AnnotationTable
                  annotations={annotations}
                  onDelete={handleAnnotationRemove}
                  onUpdate={handleAnnotationUpdate}
                  onHighlight={setHighlightedAnnotationId}
                  highlightedId={highlightedAnnotationId}
                  spacyTokens={spacyAnnotation?.tokens}
                  spacyEntities={spacyAnnotation?.entities}
                />
              </Box>
            </Box>
          </>
        ) : (
          <Box
            sx={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'column',
              gap: 2
            }}
          >
            {textLoading ? (
              <CircularProgress />
            ) : (
              <>
                <FolderOpenIcon sx={{ fontSize: 64, color: 'grey.400' }} />
                <Typography variant="h6" color="text.secondary">
                  {t('annotation.textMode', '纯文本标注')}
                </Typography>
                <Typography color="text.secondary">
                  {t('annotation.selectTextOrArchive', '选择文本文件或加载存档开始标注')}
                </Typography>
              </>
            )}
          </Box>
        )}
      </Box>

      {/* 重命名存档对话框 */}
      <Dialog open={renameDialogOpen} onClose={() => setRenameDialogOpen(false)}>
        <DialogTitle>{t('annotation.renameArchive', '重命名存档')}</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            value={newArchiveName}
            onChange={(e) => setNewArchiveName(e.target.value)}
            label={t('annotation.archiveName', '存档名称')}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRenameDialogOpen(false)} disabled={archiveOperating}>
            {t('common.cancel', '取消')}
          </Button>
          <Button 
            onClick={handleRenameArchive} 
            variant="contained"
            disabled={archiveOperating || !newArchiveName.trim()}
          >
            {archiveOperating ? <CircularProgress size={16} /> : t('common.save', '保存')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* 删除存档确认对话框 */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>{t('annotation.deleteArchive', '删除存档')}</DialogTitle>
        <DialogContent>
          <Typography>
            {t('annotation.deleteArchiveConfirm', { name: editingArchive?.textName || editingArchive?.filename || '' })}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)} disabled={archiveOperating}>
            {t('common.cancel', '取消')}
          </Button>
          <Button 
            onClick={handleDeleteArchive}
            color="error"
            variant="contained"
            disabled={archiveOperating}
          >
            {archiveOperating ? <CircularProgress size={16} /> : t('common.delete', '删除')}
          </Button>
        </DialogActions>
      </Dialog>
      
      {/* 保存对话框 */}
      <Dialog open={saveDialogOpen} onClose={() => setSaveDialogOpen(false)}>
        <DialogTitle>{t('annotation.saveArchive', '保存标注存档')}</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            value={coderName}
            onChange={(e) => setCoderName(e.target.value)}
            label={t('annotation.coderName', '编码者名称')}
            placeholder={t('annotation.coderNamePlaceholder', '输入编码者名称（可选）')}
            sx={{ mt: 1 }}
            helperText={t('annotation.coderNameHelper', '用于编码者间信度分析时识别不同编码者')}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSaveDialogOpen(false)} disabled={saving}>
            {t('common.cancel', '取消')}
          </Button>
          <Button 
            onClick={handleSave}
            variant="contained"
            disabled={saving}
          >
            {saving ? <CircularProgress size={16} /> : t('common.save', '保存')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* 句法可视化弹窗 */}
      {spacyAnnotation?.sentences && spacyAnnotation.sentences.length > 0 && (
        <SyntaxVisualization
          open={showSyntax}
          onClose={() => setShowSyntax(false)}
          sentences={spacyAnnotation.sentences.map((s, i) => ({
            id: i,
            text: s.text,
            start: s.start,
            end: s.end
          } as SentenceInfo))}
          initialSentenceIndex={selectedSentenceIndex}
          language={currentCorpus?.language === 'chinese' ? 'chinese' : 'english'}
        />
      )}
      
      {/* 批量标注确认对话框 */}
      {selectedLabel && (
        <BatchAnnotateDialog
          open={batchAnnotateDialogOpen}
          onClose={() => setBatchAnnotateDialogOpen(false)}
          onConfirm={handleBatchAnnotateConfirm}
          matches={searchMatches}
          labelName={selectedLabel.node.name}
          labelColor={selectedLabel.color}
        />
      )}
    </Box>
  )
}
