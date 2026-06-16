/**
 * Conversation export utility for Agent Chat mode.
 * Supports JSON, Markdown, and TXT formats with full tool call details.
 */
import type { Conversation } from '../stores/chatStore'

export type ExportFormat = 'json' | 'markdown' | 'txt'

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTimestamp(ts: number): string {
  return new Date(ts).toISOString().replace('T', ' ').slice(0, 19)
}

function safeJsonString(obj: unknown): string {
  try {
    return JSON.stringify(obj, null, 2)
  } catch {
    return String(obj)
  }
}

function roleLabelEn(role: string): string {
  switch (role) {
    case 'user': return 'User'
    case 'assistant': return 'Assistant'
    case 'tool_call': return 'Tool Call'
    case 'tool_result': return 'Tool Result'
    default: return role
  }
}

// ── Exporters ─────────────────────────────────────────────────────────────────

function exportJson(conv: Conversation): string {
  const messages = conv.messages
    .filter((m) => !m.hidden && !m.isCompactIndicator)
    .map((m) => {
      const base: Record<string, unknown> = {
        role: m.role,
        timestamp: formatTimestamp(m.timestamp),
        ...(m.archived ? { archived: true } : {}),
      }
      if (m.role === 'tool_call') {
        base.tool_name = m.toolName ?? ''
        base.arguments = m.toolArgs ?? {}
      } else if (m.role === 'tool_result') {
        base.tool_name = m.toolName ?? ''
        base.content = m.content
        if (m.isError) base.is_error = true
      } else {
        base.content = m.content
        if (m.isError) base.is_error = true
        if (m.errorDetail) base.error_detail = m.errorDetail
      }
      return base
    })

  return JSON.stringify(
    {
      title: conv.title || 'Untitled Conversation',
      created_at: formatTimestamp(conv.createdAt),
      exported_at: formatTimestamp(Date.now()),
      message_count: messages.length,
      messages,
    },
    null,
    2
  )
}

function exportMarkdown(conv: Conversation): string {
  const lines: string[] = []
  lines.push(`# ${conv.title || 'Untitled Conversation'}`)
  lines.push('')
  lines.push(`*Created: ${formatTimestamp(conv.createdAt)}*`)
  lines.push(`*Exported: ${formatTimestamp(Date.now())}*`)
  lines.push('')
  lines.push('---')
  lines.push('')

  const visible = conv.messages.filter((m) => !m.hidden && !m.isCompactIndicator)

  // Insert a visual break at the first non-archived message if archived ones exist
  let archiveSectionPrinted = !visible.some((m) => m.archived)

  for (const msg of visible) {
    if (!archiveSectionPrinted && !msg.archived) {
      archiveSectionPrinted = true
      lines.push('---')
      lines.push('')
      lines.push('> *⬆ Earlier context (archived before compaction)*')
      lines.push('')
      lines.push('---')
      lines.push('')
    }

    if (msg.role === 'user') {
      lines.push(`## 👤 User`)
      lines.push('')
      lines.push(msg.content)
      lines.push('')
      lines.push('---')
      lines.push('')
    } else if (msg.role === 'assistant') {
      if (msg.isError) {
        lines.push(`## ⚠️ Error`)
        lines.push('')
        lines.push(`\`${msg.content}\``)
        if (msg.errorDetail) {
          lines.push('')
          lines.push('```')
          lines.push(msg.errorDetail)
          lines.push('```')
        }
      } else {
        lines.push(`## 🤖 Assistant`)
        lines.push('')
        lines.push(msg.content)
      }
      lines.push('')
      lines.push('---')
      lines.push('')
    } else if (msg.role === 'tool_call') {
      lines.push(`### 🔧 Tool Call: \`${msg.toolName ?? 'unknown'}\``)
      lines.push('')
      if (msg.toolArgs && Object.keys(msg.toolArgs).length > 0) {
        lines.push('**Arguments:**')
        lines.push('```json')
        lines.push(safeJsonString(msg.toolArgs))
        lines.push('```')
      } else {
        lines.push('*(no arguments)*')
      }
      lines.push('')
    } else if (msg.role === 'tool_result') {
      lines.push(`### 📦 Tool Result: \`${msg.toolName ?? 'unknown'}\``)
      lines.push('')
      if (msg.isError) {
        lines.push('> ⚠️ *Tool returned an error*')
        lines.push('')
      }
      const content = msg.content || '*(empty result)*'
      lines.push('```')
      lines.push(content)
      lines.push('```')
      lines.push('')
    }
  }

  return lines.join('\n')
}

function exportTxt(conv: Conversation): string {
  const lines: string[] = []
  const sep = '='.repeat(60)
  const thin = '-'.repeat(60)

  lines.push(sep)
  lines.push(`CONVERSATION: ${conv.title || 'Untitled'}`)
  lines.push(`Created:  ${formatTimestamp(conv.createdAt)}`)
  lines.push(`Exported: ${formatTimestamp(Date.now())}`)
  lines.push(sep)
  lines.push('')

  const visible = conv.messages.filter((m) => !m.hidden && !m.isCompactIndicator)

  for (const msg of visible) {
    const label = `[${roleLabelEn(msg.role).toUpperCase()}]`

    if (msg.role === 'tool_call') {
      lines.push(`${label} ${msg.toolName ?? 'unknown'}`)
      if (msg.toolArgs && Object.keys(msg.toolArgs).length > 0) {
        lines.push('Arguments:')
        lines.push(safeJsonString(msg.toolArgs))
      }
    } else if (msg.role === 'tool_result') {
      lines.push(`${label} ${msg.toolName ?? 'unknown'}`)
      if (msg.isError) lines.push('(error)')
      lines.push(msg.content || '(empty)')
    } else {
      lines.push(label)
      lines.push(msg.content || '')
      if (msg.isError && msg.errorDetail) {
        lines.push('Error detail:')
        lines.push(msg.errorDetail)
      }
    }

    lines.push(thin)
    lines.push('')
  }

  return lines.join('\n')
}

// ── Public API ────────────────────────────────────────────────────────────────

export function buildExportContent(conv: Conversation, format: ExportFormat): string {
  switch (format) {
    case 'json':     return exportJson(conv)
    case 'markdown': return exportMarkdown(conv)
    case 'txt':      return exportTxt(conv)
  }
}

export function getExportFilename(conv: Conversation, format: ExportFormat): string {
  const base = (conv.title || 'conversation')
    .slice(0, 40)
    .replace(/[/\\:*?"<>|]/g, '_')
    .replace(/\s+/g, '_')
    .trim()
  const ext = format === 'markdown' ? 'md' : format
  const ts = new Date(conv.createdAt).toISOString().slice(0, 10)
  return `${base}_${ts}.${ext}`
}

export function downloadConversation(conv: Conversation, format: ExportFormat): void {
  const content = buildExportContent(conv, format)
  const mimeTypes: Record<ExportFormat, string> = {
    json:     'application/json',
    markdown: 'text/markdown',
    txt:      'text/plain',
  }
  const blob = new Blob([content], { type: `${mimeTypes[format]};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = getExportFilename(conv, format)
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
