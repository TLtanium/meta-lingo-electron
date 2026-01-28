import { useState, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'
import {
  Typography,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Link,
  Box,
  Divider,
  Paper,
  styled
} from '@mui/material'

interface MarkdownRendererProps {
  content: string
}

// Image component that handles async path resolution
function MarkdownImage({ src, alt }: { src?: string; alt?: string }) {
  const [resolvedSrc, setResolvedSrc] = useState<string>('')
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!src) return

    // Reset error state when src changes
    setError(false)

    // If already absolute path or URL, use as is
    if (src.startsWith('http') || src.startsWith('file://') || src.startsWith('/')) {
      setResolvedSrc(src)
      return
    }

    // For relative paths like 'assets/xxx'
    if (src.startsWith('assets/')) {
      // In development mode, use HTTP path from public folder
      // In production Electron, use file:// path via Electron API
      const isDev = import.meta.env.DEV
      
      if (isDev) {
        // Dev mode - use relative path from public folder (served by Vite)
        setResolvedSrc(`/${src}`)
      } else if (window.electronAPI?.getResourcePath) {
        // Production mode - use Electron API to get file:// path
        window.electronAPI.getResourcePath(src)
          .then((path) => {
            setResolvedSrc(path)
          })
          .catch(() => {
            // Fallback to relative path
            setResolvedSrc(`/${src}`)
          })
      } else {
        // Fallback
        setResolvedSrc(`/${src}`)
      }
    } else {
      // Other relative paths
      setResolvedSrc(src)
    }
  }, [src])

  if (error || !resolvedSrc) return null

  return (
    <Box
      component="img"
      src={resolvedSrc}
      alt={alt}
      sx={{
        maxWidth: '100%',
        height: 'auto',
        borderRadius: 1,
        my: 2,
        display: 'block'
      }}
      onError={() => setError(true)}
    />
  )
}

const StyledPre = styled('pre')(({ theme }) => ({
  backgroundColor: theme.palette.mode === 'dark' ? theme.palette.grey[900] : theme.palette.grey[100],
  padding: theme.spacing(2),
  borderRadius: theme.shape.borderRadius,
  overflow: 'auto',
  '& code': {
    fontFamily: 'Consolas, Monaco, "Andale Mono", "Ubuntu Mono", monospace',
    color: theme.palette.text.primary
  }
}))

const StyledCode = styled('code')(({ theme }) => ({
  backgroundColor: theme.palette.mode === 'dark' ? theme.palette.grey[800] : theme.palette.grey[100],
  padding: '2px 6px',
  borderRadius: 4,
  fontFamily: 'Consolas, Monaco, "Andale Mono", "Ubuntu Mono", monospace',
  fontSize: '0.875em',
  color: theme.palette.text.primary
}))

const StyledBlockquote = styled('blockquote')(({ theme }) => ({
  borderLeft: `4px solid ${theme.palette.primary.main}`,
  margin: theme.spacing(2, 0),
  padding: theme.spacing(1, 2),
  backgroundColor: theme.palette.mode === 'dark' ? theme.palette.grey[900] : theme.palette.grey[50]
}))

export default function MarkdownRenderer({ content }: MarkdownRendererProps) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[rehypeKatex]}
      components={{
        h1: ({ children }) => (
          <Typography variant="h4" gutterBottom sx={{ mt: 3, mb: 2 }}>
            {children}
          </Typography>
        ),
        h2: ({ children }) => (
          <Typography variant="h5" gutterBottom sx={{ mt: 3, mb: 2 }}>
            {children}
          </Typography>
        ),
        h3: ({ children }) => (
          <Typography variant="h6" gutterBottom sx={{ mt: 2, mb: 1 }}>
            {children}
          </Typography>
        ),
        h4: ({ children }) => (
          <Typography variant="subtitle1" fontWeight={600} gutterBottom>
            {children}
          </Typography>
        ),
        p: ({ children }) => (
          <Typography variant="body1" paragraph>
            {children}
          </Typography>
        ),
        a: ({ href, children }) => (
          <Link href={href} target="_blank" rel="noopener noreferrer">
            {children}
          </Link>
        ),
        ul: ({ children }) => (
          <Box component="ul" sx={{ pl: 3, mb: 2 }}>
            {children}
          </Box>
        ),
        ol: ({ children }) => (
          <Box component="ol" sx={{ pl: 3, mb: 2 }}>
            {children}
          </Box>
        ),
        li: ({ children }) => (
          <Typography component="li" variant="body1" sx={{ mb: 0.5 }}>
            {children}
          </Typography>
        ),
        blockquote: ({ children }) => (
          <StyledBlockquote>{children}</StyledBlockquote>
        ),
        code: ({ className, children, ...props }) => {
          const isInline = !className
          if (isInline) {
            return <StyledCode {...props}>{children}</StyledCode>
          }
          return (
            <StyledPre>
              <code className={className} {...props}>
                {children}
              </code>
            </StyledPre>
          )
        },
        pre: ({ children }) => <>{children}</>,
        table: ({ children }) => (
          <Paper sx={{ mb: 2, overflow: 'hidden' }}>
            <Table size="small">{children}</Table>
          </Paper>
        ),
        thead: ({ children }) => <TableHead>{children}</TableHead>,
        tbody: ({ children }) => <TableBody>{children}</TableBody>,
        tr: ({ children }) => <TableRow>{children}</TableRow>,
        th: ({ children }) => (
          <TableCell sx={{ fontWeight: 600 }}>{children}</TableCell>
        ),
        td: ({ children }) => <TableCell>{children}</TableCell>,
        hr: () => <Divider sx={{ my: 3 }} />,
        img: ({ src, alt }) => <MarkdownImage src={src} alt={alt} />
      }}
    >
      {content}
    </ReactMarkdown>
  )
}

