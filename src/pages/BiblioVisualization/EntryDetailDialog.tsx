/**
 * Entry Detail Dialog for Bibliographic Visualization
 *
 * Shows detailed information about a bibliographic entry; supports editing relevance (stars), tags, notes,
 * and 11 AI-generated sections (with visibility toggle and manual edit). AI Generate and Export PDF.
 *
 * PDF export: render styled HTML into an off-screen div, capture with html2canvas, then jsPDF with multi-page split.
 */

import { useState, useEffect, useCallback } from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  Chip,
  Divider,
  Link,
  IconButton,
  TextField,
  InputAdornment,
  Autocomplete,
  CircularProgress
} from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import LaunchIcon from '@mui/icons-material/Launch'
import AddIcon from '@mui/icons-material/Add'
import VisibilityIcon from '@mui/icons-material/Visibility'
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff'
import SmartToyIcon from '@mui/icons-material/SmartToy'
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf'
import { useTranslation } from 'react-i18next'
import type { BiblioEntry } from '../../types/biblio'
import { BIBLIO_AI_SECTION_KEYS } from '../../types/biblio'
import * as biblioApi from '../../api/biblio'
import { useSettingsStore } from '../../stores/settingsStore'
import StarRating from './components/StarRating'

interface EntryDetailDialogProps {
  entry: BiblioEntry | null
  open: boolean
  onClose: () => void
  /** Existing tags in the library (for suggestions when adding a tag) */
  existingTags?: string[]
  onEntryUpdated?: (updated: BiblioEntry) => void
}

const defaultAiSections = (): Record<string, { value: string; hidden: boolean }> =>
  Object.fromEntries(BIBLIO_AI_SECTION_KEYS.map(k => [k, { value: '', hidden: false }]))

/** Escape text for safe HTML embedding */
const escHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/**
 * Convert a simple Markdown string to HTML for PDF export.
 * Handles: headings, bold, italic, code, lists, horizontal rules, line breaks.
 */
const mdToHtml = (md: string): string => {
  const lines = md.split('\n')
  const out: string[] = []
  let inUl = false
  let inOl = false
  const closeList = () => {
    if (inUl) { out.push('</ul>'); inUl = false }
    if (inOl) { out.push('</ol>'); inOl = false }
  }
  const inline = (s: string) =>
    escHtml(s)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`(.+?)`/g, '<code>$1</code>')

  for (const raw of lines) {
    const line = raw.trimEnd()
    if (/^#{2,3}\s/.test(line)) {
      closeList()
      out.push(`<p style="font-weight:700;margin:8px 0 4px">${inline(line.replace(/^#{2,3}\s/, ''))}</p>`)
    } else if (/^#\s/.test(line)) {
      closeList()
      out.push(`<p style="font-weight:700;font-size:11pt;margin:10px 0 4px">${inline(line.replace(/^#\s/, ''))}</p>`)
    } else if (/^[-*]\s/.test(line)) {
      if (!inUl) { if (inOl) { out.push('</ol>'); inOl = false } out.push('<ul>'); inUl = true }
      out.push(`<li>${inline(line.replace(/^[-*]\s/, ''))}</li>`)
    } else if (/^\d+\.\s/.test(line)) {
      if (!inOl) { if (inUl) { out.push('</ul>'); inUl = false } out.push('<ol>'); inOl = true }
      out.push(`<li>${inline(line.replace(/^\d+\.\s/, ''))}</li>`)
    } else if (/^---+$/.test(line)) {
      closeList()
      out.push('<hr style="border:none;border-top:1px solid #ddd;margin:10px 0">')
    } else if (line === '') {
      closeList()
      out.push('<br>')
    } else {
      closeList()
      out.push(`<p style="margin:0 0 5px">${inline(line)}</p>`)
    }
  }
  closeList()
  return out.join('')
}

export default function EntryDetailDialog({ entry, open, onClose, existingTags = [], onEntryUpdated }: EntryDetailDialogProps) {
  const { t } = useTranslation()
  const settings = useSettingsStore()
  const [localEntry, setLocalEntry] = useState<BiblioEntry | null>(entry)
  const [newTag, setNewTag] = useState('')
  const [saving, setSaving] = useState(false)
  const [languageDialogOpen, setLanguageDialogOpen] = useState(false)
  const [aiGenerating, setAiGenerating] = useState(false)
  const [exportingPdf, setExportingPdf] = useState(false)

  useEffect(() => {
    if (open && entry) setLocalEntry(entry)
  }, [open, entry])

  const updateField = async (payload: { relevance?: number; tags?: string[]; notes?: string; ai_sections?: Record<string, { value: string; hidden: boolean }> }) => {
    if (!localEntry) return
    setSaving(true)
    const response = await biblioApi.updateEntry(localEntry.id, payload)
    setSaving(false)
    if (response.success && response.data) {
      setLocalEntry(response.data)
      onEntryUpdated?.(response.data)
    }
  }

  const getAiSections = useCallback(() => {
    const base = defaultAiSections()
    const from = localEntry?.ai_sections ?? entry?.ai_sections ?? {}
    BIBLIO_AI_SECTION_KEYS.forEach(key => {
      const s = from[key]
      if (s && typeof s === 'object') {
        base[key] = { value: s.value ?? '', hidden: !!s.hidden }
      }
    })
    return base
  }, [localEntry?.ai_sections, entry?.ai_sections])

  const handleSectionValueChange = (key: string, value: string) => {
    if (!localEntry) return
    const next = { ...getAiSections(), [key]: { ...getAiSections()[key], value } }
    setLocalEntry({ ...localEntry, ai_sections: next })
  }

  const handleSectionValueBlur = (key: string) => {
    const sections = getAiSections()
    const prev = (entry?.ai_sections ?? {})[key]?.value ?? ''
    if (sections[key].value !== prev) updateField({ ai_sections: sections })
  }

  const handleSectionVisibilityToggle = (key: string) => {
    const sections = getAiSections()
    const next = { ...sections, [key]: { ...sections[key], hidden: !sections[key].hidden } }
    setLocalEntry(prev => prev ? { ...prev, ai_sections: next } : null)
    updateField({ ai_sections: next })
  }

  const handleAiGenerate = async (language: 'zh' | 'en') => {
    setLanguageDialogOpen(false)
    if (!localEntry) return
    setAiGenerating(true)
    const res = await biblioApi.generateEntryAiSections({
      entryIds: [localEntry.id],
      language,
      ollama_url: settings.ollamaUrl || undefined,
      ollama_model: settings.ollamaModel || undefined,
      openai_base_url: settings.openaiApiEnabled ? settings.openaiApiBaseUrl : undefined,
      openai_api_key: settings.openaiApiEnabled ? settings.openaiApiKey : undefined,
      openai_model: settings.openaiApiEnabled ? settings.openaiApiModel : undefined,
      use_openai_first: settings.openaiApiEnabled
    })
    setAiGenerating(false)
    if (res.success && res.data?.results?.[0]?.success && res.data.results[0].ai_sections) {
      const merged = { ...getAiSections() }
      BIBLIO_AI_SECTION_KEYS.forEach(k => {
        const v = res.data!.results[0].ai_sections![k]
        if (v) merged[k] = { ...merged[k], value: v.value }
      })
      const updated = { ...localEntry!, ai_sections: merged }
      setLocalEntry(updated)
      onEntryUpdated?.(updated as BiblioEntry)
    }
  }

  /** Build the full HTML document string for the PDF export */
  const buildPdfHtml = useCallback((): string => {
    const ent = localEntry ?? entry
    if (!ent) return ''
    const sections = getAiSections()
    const stars = '★'.repeat(Math.min(5, ent.relevance ?? 0)) + '☆'.repeat(5 - Math.min(5, ent.relevance ?? 0))
    const metaBadges = [
      ent.year ? `<span class="badge">${escHtml(String(ent.year))}</span>` : '',
      ent.journal ? `<span class="badge">${escHtml(ent.journal)}</span>` : '',
      ent.doc_type ? `<span class="badge">${escHtml(ent.doc_type)}</span>` : '',
      ent.doi ? `<span class="badge">DOI: ${escHtml(ent.doi)}</span>` : '',
    ].filter(Boolean).join('')

    const authorHtml = ent.authors?.length
      ? `<p class="authors">${escHtml(ent.authors.join(' · '))}</p>` : ''

    const institutionHtml = ent.institutions?.length
      ? `<p class="institutions">${escHtml(ent.institutions.slice(0, 3).join('; '))}${ent.institutions.length > 3 ? ' …' : ''}</p>` : ''

    const abstractHtml = ent.abstract
      ? `<div class="section">
           <div class="section-label">${escHtml(t('biblio.abstract'))}</div>
           <div class="section-body">${escHtml(ent.abstract)}</div>
         </div>` : ''

    const keywordsHtml = ent.keywords?.length
      ? `<div class="section">
           <div class="section-label">${escHtml(t('biblio.keywords'))}</div>
           <div class="keywords">${ent.keywords.map(k => `<span class="kw-badge">${escHtml(k)}</span>`).join('')}</div>
         </div>` : ''

    const notesHtml = ent.notes?.trim()
      ? `<div class="section">
           <div class="section-label">${escHtml(t('biblio.notes'))}</div>
           <div class="section-body">${escHtml(ent.notes)}</div>
         </div>` : ''

    const tagsHtml = ent.tags?.length
      ? `<div class="section">
           <div class="section-label">${escHtml(t('biblio.tags'))}</div>
           <div class="keywords">${ent.tags.map(g => `<span class="tag-badge">${escHtml(g)}</span>`).join('')}</div>
         </div>` : ''

    const aiSectionsHtml = BIBLIO_AI_SECTION_KEYS
      .filter(key => !sections[key]?.hidden && sections[key]?.value?.trim())
      .map(key =>
        `<div class="ai-section">
           <div class="ai-section-label">${escHtml(t(`biblio.section.${key}`))}</div>
           <div class="ai-section-body">${mdToHtml(sections[key].value)}</div>
         </div>`
      ).join('')

    const hasMeta = ent.year || ent.journal || ent.language || ent.citation_count
    const metaTableHtml = hasMeta ? `
      <div class="meta-table">
        ${ent.year ? `<div class="meta-item"><span class="meta-key">${escHtml(t('biblio.year'))}</span><span class="meta-val">${ent.year}</span></div>` : ''}
        ${ent.journal ? `<div class="meta-item"><span class="meta-key">${escHtml(t('biblio.journal'))}</span><span class="meta-val">${escHtml(ent.journal)}</span></div>` : ''}
        ${ent.volume ? `<div class="meta-item"><span class="meta-key">${escHtml(t('biblio.volume'))}</span><span class="meta-val">${escHtml(ent.volume)}</span></div>` : ''}
        ${ent.issue ? `<div class="meta-item"><span class="meta-key">${escHtml(t('biblio.issue'))}</span><span class="meta-val">${escHtml(ent.issue)}</span></div>` : ''}
        ${ent.pages ? `<div class="meta-item"><span class="meta-key">${escHtml(t('biblio.pages'))}</span><span class="meta-val">${escHtml(ent.pages)}</span></div>` : ''}
        ${ent.citation_count != null ? `<div class="meta-item"><span class="meta-key">${escHtml(t('biblio.citations'))}</span><span class="meta-val">${ent.citation_count}</span></div>` : ''}
        ${ent.language ? `<div class="meta-item"><span class="meta-key">${escHtml(t('biblio.language'))}</span><span class="meta-val">${escHtml(ent.language)}</span></div>` : ''}
      </div>` : ''

    const now = new Date().toLocaleDateString()
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  *, *::before, *::after { box-sizing: border-box; }
  body {
    font-family: -apple-system, 'Helvetica Neue', Arial,
      'PingFang SC', 'Noto Sans CJK SC', 'Source Han Sans SC',
      'Microsoft YaHei', 'SimHei', sans-serif;
    font-size: 10.5pt;
    line-height: 1.65;
    color: #1a1a1a;
    background: #fff;
    margin: 0;
    padding: 0;
  }
  /* ── Header band ── */
  .header-band {
    background: linear-gradient(135deg, #1565c0 0%, #1976d2 60%, #42a5f5 100%);
    padding: 36px 56px 30px;
    color: #fff;
  }
  .relevance { font-size: 14pt; color: #ffd740; margin-bottom: 10px; letter-spacing: 2px; }
  .title {
    font-size: 16pt;
    font-weight: 700;
    line-height: 1.3;
    margin: 0 0 14px;
    color: #fff;
  }
  .authors { font-size: 10.5pt; color: rgba(255,255,255,0.92); margin: 0 0 4px; }
  .institutions { font-size: 9pt; color: rgba(255,255,255,0.72); margin: 0 0 12px; font-style: italic; }
  .meta-badges { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px; }
  .badge {
    background: rgba(255,255,255,0.2);
    border: 1px solid rgba(255,255,255,0.3);
    border-radius: 4px;
    padding: 2px 10px;
    font-size: 8.5pt;
    color: rgba(255,255,255,0.95);
  }
  /* ── Content ── */
  .content { padding: 28px 56px 48px; }
  /* Meta table */
  .meta-table {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 4px 24px;
    background: #f8f9fa;
    border-radius: 8px;
    padding: 14px 18px;
    margin-bottom: 22px;
  }
  .meta-item { display: flex; gap: 8px; align-items: baseline; font-size: 9pt; }
  .meta-key { color: #888; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; white-space: nowrap; min-width: 52px; }
  .meta-val { color: #333; }
  /* Generic section */
  .section { margin-bottom: 22px; }
  .section-label {
    font-size: 8pt;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: #1976d2;
    border-bottom: 2px solid #1976d2;
    padding-bottom: 4px;
    margin-bottom: 9px;
  }
  .section-body { font-size: 10pt; color: #333; line-height: 1.7; }
  /* Keywords / Tags */
  .keywords { display: flex; flex-wrap: wrap; gap: 6px; }
  .kw-badge {
    background: #e3f2fd;
    color: #1565c0;
    border-radius: 4px;
    padding: 2px 10px;
    font-size: 9pt;
    font-weight: 500;
  }
  .tag-badge {
    background: #f3e5f5;
    color: #6a1b9a;
    border-radius: 4px;
    padding: 2px 10px;
    font-size: 9pt;
    font-weight: 500;
  }
  /* AI sections */
  .ai-sections-title {
    font-size: 8pt;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: #555;
    border-bottom: 1px solid #ddd;
    padding-bottom: 4px;
    margin: 24px 0 16px;
  }
  .ai-section { margin-bottom: 18px; break-inside: avoid; }
  .ai-section-label {
    font-size: 8.5pt;
    font-weight: 700;
    color: #444;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    margin-bottom: 5px;
    padding: 2px 8px;
    background: #f5f5f5;
    border-left: 3px solid #1976d2;
    border-radius: 0 3px 3px 0;
  }
  .ai-section-body { font-size: 10pt; color: #333; line-height: 1.7; }
  .ai-section-body p { margin: 0 0 5px; }
  .ai-section-body ul { margin: 4px 0 4px 20px; padding: 0; }
  .ai-section-body ol { margin: 4px 0 4px 20px; padding: 0; }
  .ai-section-body li { margin-bottom: 3px; }
  .ai-section-body strong { color: #111; }
  .ai-section-body code { background: #f0f0f0; padding: 1px 4px; border-radius: 3px; font-size: 9pt; }
  hr.divider { border: none; border-top: 1px solid #e8e8e8; margin: 20px 0; }
  /* Footer */
  .footer {
    text-align: center;
    font-size: 8pt;
    color: #aaa;
    border-top: 1px solid #eee;
    padding-top: 12px;
    margin-top: 32px;
  }
  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .header-band { padding: 28px 40px 24px; }
    .content { padding: 20px 40px 36px; }
  }
</style>
</head>
<body>
  <div class="header-band">
    <div class="relevance">${stars}</div>
    <div class="title">${escHtml(ent.title ?? '')}</div>
    ${authorHtml}
    ${institutionHtml}
    ${metaBadges ? `<div class="meta-badges">${metaBadges}</div>` : ''}
  </div>
  <div class="content">
    ${metaTableHtml}
    ${abstractHtml}
    ${keywordsHtml}
    ${notesHtml}
    ${tagsHtml}
    ${aiSectionsHtml ? `<div class="ai-sections-title">AI ${escHtml(t('biblio.aiGenerate'))}</div>${aiSectionsHtml}` : ''}
    <div class="footer">
      Meta-Lingo · ${escHtml(now)}
    </div>
  </div>
</body>
</html>`
  }, [localEntry, entry, getAiSections, t])

  const handleExportPdf = useCallback(async () => {
    const ent = localEntry ?? entry
    if (!ent) return
    setExportingPdf(true)
    try {
      const htmlContent = buildPdfHtml()
      if (!htmlContent) return
      const safeName = (ent.title ?? 'entry').replace(/[<>:"/\\|?*]/g, '_').slice(0, 60)
      const defaultFilename = `biblio-${safeName}.pdf`

      const wrap = document.createElement('div')
      const width = 794
      const scale = 3
      wrap.style.cssText = `position:fixed;left:-9999px;top:0;width:${width}px;min-height:100px;background:#fff;overflow:visible`
      wrap.innerHTML = htmlContent
      document.body.appendChild(wrap)
      const bodyEl = (wrap.querySelector('body') ?? wrap.querySelector('html') ?? wrap) as HTMLElement
      await new Promise(r => requestAnimationFrame(() => setTimeout(r, 150)))
      const fullHeight = Math.max(bodyEl.scrollHeight, bodyEl.offsetHeight, 800)

      // Measure breakable block boundaries (in CSS px, relative to the captured root) so page
      // breaks land between blocks instead of slicing through a line of text.
      const rootTop = bodyEl.getBoundingClientRect().top
      const blocks = Array.from(bodyEl.querySelectorAll('.header-band, .content > *'))
        .map(el => {
          const r = (el as HTMLElement).getBoundingClientRect()
          return { top: r.top - rootTop, bottom: r.bottom - rootTop }
        })
        .filter(b => b.bottom > b.top)
        .sort((a, b) => a.top - b.top)

      const html2canvas = (await import('html2canvas')).default
      const canvas = await html2canvas(bodyEl, {
        scale,
        useCORS: true,
        logging: false,
        width,
        height: fullHeight,
        windowWidth: width,
        windowHeight: fullHeight,
        backgroundColor: '#ffffff',
        imageTimeout: 0
      })
      document.body.removeChild(wrap)

      const jsPDF = (await import('jspdf')).default
      const pdf = new jsPDF('p', 'mm', 'a4')
      const pageW = pdf.internal.pageSize.getWidth()
      const pageH = pdf.internal.pageSize.getHeight()
      // Vertical margins (mm). Page 1 keeps its full-bleed blue header (no top margin); every
      // later page gets a top margin, and all pages keep a bottom margin.
      const marginTop = 12
      const marginBottom = 12
      const topMarginFor = (idx: number) => (idx === 0 ? 0 : marginTop)
      // Usable content height of a page, in the CSS-px units used to measure blocks.
      const usableCssFor = (idx: number) =>
        ((pageH - topMarginFor(idx) - marginBottom) * width) / pageW

      // Build [startCss, endCss] page ranges, breaking before any block that would overflow
      // the current page. A block taller than a full page is split (unavoidable fallback).
      const pages: { start: number; end: number }[] = []
      let curStart = 0
      let pageIdx = 0
      let cap = usableCssFor(0)
      for (const b of blocks) {
        if (b.bottom - curStart > cap + 1) {
          if (b.top > curStart + 1) {
            pages.push({ start: curStart, end: b.top })
            curStart = b.top
            pageIdx++
            cap = usableCssFor(pageIdx)
          }
          while (b.bottom - curStart > cap + 1) {
            pages.push({ start: curStart, end: curStart + cap })
            curStart += cap
            pageIdx++
            cap = usableCssFor(pageIdx)
          }
        }
      }
      pages.push({ start: curStart, end: fullHeight })

      const effectivePages = pages.length > 0
        ? pages
        : [{ start: 0, end: fullHeight }]

      for (let p = 0; p < effectivePages.length; p++) {
        const { start, end } = effectivePages[p]
        const sliceTop = Math.max(0, Math.round(start * scale))
        const sliceBottom = Math.min(canvas.height, Math.round(end * scale))
        const sliceH = sliceBottom - sliceTop
        if (sliceH <= 0) continue

        const tmp = document.createElement('canvas')
        tmp.width = canvas.width
        tmp.height = sliceH
        const ctx = tmp.getContext('2d')
        if (!ctx) continue
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, tmp.width, tmp.height)
        ctx.drawImage(canvas, 0, sliceTop, canvas.width, sliceH, 0, 0, canvas.width, sliceH)

        const imgData = tmp.toDataURL('image/png')
        const sliceHmm = (sliceH * pageW) / canvas.width
        if (p > 0) pdf.addPage()
        // Page 1: y=0 (full-bleed header). Later pages: start below the top margin.
        pdf.addImage(imgData, 'PNG', 0, topMarginFor(p), pageW, sliceHmm, undefined, 'FAST')
      }
      pdf.save(defaultFilename)
    } catch (e) {
      console.error('[PDF export]', e)
    } finally {
      setExportingPdf(false)
    }
  }, [localEntry, entry, buildPdfHtml])

  const handleRelevanceChange = (value: number) => updateField({ relevance: value })
  const handleAddTag = () => {
    const tag = newTag.trim()
    if (!tag || !localEntry) return
    const tags = [...(localEntry.tags || []), tag]
    if (tags.length === (localEntry.tags || []).length) return
    setNewTag('')
    updateField({ tags })
  }
  const handleRemoveTag = (tag: string) => {
    if (!localEntry) return
    const tags = (localEntry.tags || []).filter(t => t !== tag)
    updateField({ tags })
  }
  const handleNotesBlur = () => {
    if (!localEntry) return
    const notes = (localEntry.notes ?? '').trim()
    const initial = (entry?.notes ?? '').trim()
    if (notes !== initial) updateField({ notes })
  }
  const handleNotesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!localEntry) return
    setLocalEntry({ ...localEntry, notes: e.target.value })
  }

  const displayEntry = localEntry ?? entry
  if (!displayEntry) return null

  const DetailRow = ({ label, value }: { label: string; value?: string | number | null }) => {
    if (!value) return null
    return (
      <Box sx={{ mb: 1.5 }}>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
          {label}
        </Typography>
        <Typography variant="body2">{value}</Typography>
      </Box>
    )
  }
  
  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
    >
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Box sx={{ flex: 1, pr: 2 }}>
          <Typography variant="h6" component="div">
            {displayEntry.title}
          </Typography>
          {displayEntry.doc_type && (
            <Chip
              label={displayEntry.doc_type}
              size="small"
              variant="outlined"
              sx={{ mt: 1 }}
            />
          )}
        </Box>
        <IconButton onClick={onClose} size="small">
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers>
        {/* Relevance (stars) */}
        <Box sx={{ mb: 2 }}>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
            {t('biblio.relevance')}
          </Typography>
          <StarRating
            value={displayEntry.relevance ?? 0}
            onChange={handleRelevanceChange}
            readOnly={false}
          />
        </Box>

        <Divider sx={{ my: 2 }} />

        {/* Authors */}
        {displayEntry.authors.length > 0 && (
          <Box sx={{ mb: 2 }}>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
              {t('biblio.authors')}
            </Typography>
            <Typography variant="body2">
              {displayEntry.authors.join('; ')}
            </Typography>
          </Box>
        )}

        {/* Institutions */}
        {displayEntry.institutions.length > 0 && (
          <Box sx={{ mb: 2 }}>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
              {t('biblio.institutions')}
            </Typography>
            <Typography variant="body2">
              {displayEntry.institutions.join('; ')}
            </Typography>
          </Box>
        )}

        <Divider sx={{ my: 2 }} />

        {/* Publication info */}
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 2 }}>
          <DetailRow label={t('biblio.journal')} value={displayEntry.journal} />
          <DetailRow label={t('biblio.year')} value={displayEntry.year} />
          <DetailRow label={t('biblio.volume')} value={displayEntry.volume} />
          <DetailRow label={t('biblio.issue')} value={displayEntry.issue} />
          <DetailRow label={t('biblio.pages')} value={displayEntry.pages} />
          <DetailRow label={t('biblio.language')} value={displayEntry.language} />
          <DetailRow label={t('biblio.citations')} value={displayEntry.citation_count} />
        </Box>

        {/* DOI */}
        {displayEntry.doi && (
          <Box sx={{ mb: 2 }}>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
              DOI
            </Typography>
            <Link
              href={`https://doi.org/${displayEntry.doi}`}
              target="_blank"
              rel="noopener noreferrer"
              sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}
            >
              {displayEntry.doi}
              <LaunchIcon fontSize="small" />
            </Link>
          </Box>
        )}

        {/* Source URL */}
        {displayEntry.source_url && (
          <Box sx={{ mb: 2 }}>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
              {t('biblio.sourceUrl')}
            </Typography>
            <Link
              href={displayEntry.source_url}
              target="_blank"
              rel="noopener noreferrer"
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 0.5,
                wordBreak: 'break-all'
              }}
            >
              {displayEntry.source_url.length > 60
                ? displayEntry.source_url.substring(0, 60) + '...'
                : displayEntry.source_url}
              <LaunchIcon fontSize="small" />
            </Link>
          </Box>
        )}

        <Divider sx={{ my: 2 }} />

        {/* Tags (editable) */}
        <Box sx={{ mb: 2 }}>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
            {t('biblio.tags')}
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, alignItems: 'center' }}>
            {(displayEntry.tags || []).map(tag => (
              <Chip
                key={tag}
                label={tag}
                size="small"
                onDelete={saving ? undefined : () => handleRemoveTag(tag)}
              />
            ))}
            <Autocomplete
              freeSolo
              size="small"
              value={null}
              options={existingTags.filter(t => !(displayEntry.tags || []).includes(t))}
              inputValue={newTag}
              onInputChange={(_, v) => setNewTag(v ?? '')}
              onChange={(_, v) => {
                const tag = (typeof v === 'string' ? v : v ?? '').trim()
                if (tag) {
                  setNewTag('')
                  if (!(displayEntry.tags || []).includes(tag)) {
                    updateField({ tags: [...(displayEntry.tags || []), tag] })
                  }
                }
              }}
              renderInput={(params) => (
                <TextField
                  {...params}
                  placeholder={t('biblio.addTag')}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      handleAddTag()
                    }
                  }}
                  InputProps={{
                    ...params.InputProps,
                    endAdornment: (
                      <>
                        {params.InputProps.endAdornment}
                        <InputAdornment position="end">
                          <IconButton size="small" onClick={handleAddTag} disabled={saving || !newTag.trim()}>
                            <AddIcon fontSize="small" />
                          </IconButton>
                        </InputAdornment>
                      </>
                    )
                  }}
                />
              )}
              sx={{ minWidth: 180, maxWidth: 240 }}
            />
          </Box>
        </Box>

        {/* Notes (editable) */}
        <Box sx={{ mb: 2 }}>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
            {t('biblio.notes')}
          </Typography>
          <TextField
            fullWidth
            multiline
            minRows={2}
            maxRows={6}
            value={displayEntry.notes ?? ''}
            onChange={handleNotesChange}
            onBlur={handleNotesBlur}
            placeholder={t('biblio.notesPlaceholder')}
            disabled={saving}
            size="small"
          />
        </Box>

        <Divider sx={{ my: 2 }} />

        {/* Keywords */}
        {displayEntry.keywords.length > 0 && (
          <Box sx={{ mb: 2 }}>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
              {t('biblio.keywords')}
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
              {displayEntry.keywords.map((kw, i) => (
                <Chip key={i} label={kw} size="small" variant="outlined" />
              ))}
            </Box>
          </Box>
        )}

        {/* Abstract */}
        {displayEntry.abstract && (
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
              {t('biblio.abstract')}
            </Typography>
            <Typography variant="body2" sx={{ textAlign: 'justify' }}>
              {displayEntry.abstract}
            </Typography>
          </Box>
        )}

        <Divider sx={{ my: 2 }} />

        {/* 11 AI sections */}
        {BIBLIO_AI_SECTION_KEYS.map(key => {
          const sections = getAiSections()
          const section = sections[key] ?? { value: '', hidden: false }
          return (
            <Box key={key} sx={{ mb: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                  {t(`biblio.section.${key}`)}
                </Typography>
                <IconButton size="small" onClick={() => handleSectionVisibilityToggle(key)} title={section.hidden ? t('common.showMore') : t('common.close')}>
                  {section.hidden ? <VisibilityOffIcon fontSize="small" /> : <VisibilityIcon fontSize="small" />}
                </IconButton>
              </Box>
              <TextField
                fullWidth
                multiline
                minRows={2}
                maxRows={6}
                size="small"
                value={section.value}
                onChange={e => handleSectionValueChange(key, e.target.value)}
                onBlur={() => handleSectionValueBlur(key)}
                disabled={saving}
                placeholder={t('biblio.notesPlaceholder')}
                sx={{ display: section.hidden ? 'none' : 'block' }}
              />
            </Box>
          )
        })}
      </DialogContent>

      {/* Language choice for AI generate */}
      <Dialog open={languageDialogOpen} onClose={() => setLanguageDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{t('biblio.generateLanguage')}</DialogTitle>
        <DialogContent><Typography variant="body2" color="text.secondary">{t('biblio.generateLanguage')}</Typography></DialogContent>
        <DialogActions>
          <Button onClick={() => handleAiGenerate('zh')}>{t('biblio.generateLanguageZh')}</Button>
          <Button onClick={() => handleAiGenerate('en')}>{t('biblio.generateLanguageEn')}</Button>
          <Button onClick={() => setLanguageDialogOpen(false)}>{t('common.cancel')}</Button>
        </DialogActions>
      </Dialog>
      
      <DialogActions sx={{ justifyContent: 'space-between' }}>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button startIcon={exportingPdf ? <CircularProgress size={16} /> : <PictureAsPdfIcon />} onClick={handleExportPdf} disabled={exportingPdf}>
            {exportingPdf ? t('common.saving') : t('biblio.exportPdf')}
          </Button>
          <Button
            startIcon={aiGenerating ? <CircularProgress size={16} /> : <SmartToyIcon />}
            onClick={() => setLanguageDialogOpen(true)}
            disabled={aiGenerating}
          >
            {aiGenerating ? t('common.generating') : t('biblio.aiGenerate')}
          </Button>
        </Box>
        <Button onClick={onClose}>{t('common.close')}</Button>
      </DialogActions>
    </Dialog>
  )
}

