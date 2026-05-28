import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  DialogActions,
  Divider,
  Paper,
  Stack,
  TextField,
  Typography
} from '@mui/material'
import DownloadIcon from '@mui/icons-material/Download'
import DeleteIcon from '@mui/icons-material/Delete'
import StorageIcon from '@mui/icons-material/Storage'
import { useTranslation } from 'react-i18next'
import { modelManagementApi, type ModelInfo } from '../../api/model_management'
import { corpusApi } from '../../api'

type DownloadState = {
  taskId: string
  progress: number
}

export default function ModelManagement() {
  const { t } = useTranslation()

  const moduleKeyByModuleLabel: Record<string, string> = {
    'Speech-to-text': 'speechToText',
    'Video object detection': 'videoObjectDetection',
    'Semantic embeddings': 'semanticEmbeddings',
    'Alignment': 'alignment',
    'USAS (semantic tagging)': 'usasSemanticTagging',
    'MIPVU (metaphor detection)': 'mipvuMetaphorDetection'
  }

  const modelKeyByModelId: Record<string, string> = {
    'whisper-large-v3-turbo': 'whisper_large_v3_turbo',
    'yolov8-weights': 'yolov8_weights',
    'clip-vit-large-patch14': 'clip_vit_large_patch14',
    'wav2vec2-base-960h': 'wav2vec2_base_960h',
    'sbert-paraphrase-multilingual-minilm-l12-v2': 'sbert_paraphrase_multilingual_minilm_l12_v2',
    'pymusas-neural-multilingual-base-bem': 'pymusas_neural_multilingual_base_bem',
    'metalingo-deberta-metaphor': 'metalingo_deberta_metaphor'
  }

  const getModuleTitle = (moduleLabel: string) => {
    const key = moduleKeyByModuleLabel[moduleLabel]
    if (!key) return moduleLabel
    return t(`settings.modelManagement.modules.${key}`, moduleLabel)
  }

  const getModelName = (model: ModelInfo) => {
    const key = modelKeyByModelId[model.id]
    if (!key) return model.displayName
    return t(`settings.modelManagement.models.${key}.name`, model.displayName)
  }

  const [dialogOpen, setDialogOpen] = useState(false)
  const [downloadPathDialogOpen, setDownloadPathDialogOpen] = useState(false)
  const [manualDownloadRoot, setManualDownloadRoot] = useState('')
  const [manualPathSaving, setManualPathSaving] = useState(false)
  const [models, setModels] = useState<ModelInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [downloadRoot, setDownloadRoot] = useState<string>('')
  const [pathLoading, setPathLoading] = useState(false)

  const [activeDownloads, setActiveDownloads] = useState<Record<string, DownloadState>>({})
  const sseCleanupRef = useRef<Record<string, (() => void) | undefined>>({})
  const pollTimeoutRef = useRef<Record<string, number | undefined>>({})
  const loadModelsInFlightRef = useRef(false)
  const loadModelsQueuedRef = useRef(false)

  const startTaskPolling = (modelId: string, taskId: string) => {
    // Avoid duplicate poll loops.
    if (pollTimeoutRef.current[modelId]) return

    let delayMs = 1500
    const tick = async () => {
      try {
        const res = await corpusApi.getTaskStatus(taskId)
        const task = res.success ? res.data : undefined
        if (task) {
          const progress = typeof task.progress === 'number' ? task.progress : 0
          if (task.status === 'processing') {
            setActiveDownloads(prev => {
              const cur = prev[modelId]
              if (!cur) return { ...prev, [modelId]: { taskId, progress } }
              return prev
            })
          }
          setActiveDownloads(prev => {
            const cur = prev[modelId]
            if (!cur) return prev
            return { ...prev, [modelId]: { ...cur, progress } }
          })

          if (task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled') {
            if (task.status === 'failed') {
              setError(task.message || t('settings.modelManagement.downloadFailed', 'Download failed'))
            }
            if (task.status === 'cancelled') {
              // Cancellation should stop spinner and refresh final installed state.
              // We intentionally don't set an error.
            }
            void loadModels({ silent: true })
            setActiveDownloads(prev => {
              const next = { ...prev }
              delete next[modelId]
              return next
            })
            if (pollTimeoutRef.current[modelId]) window.clearTimeout(pollTimeoutRef.current[modelId])
            delete pollTimeoutRef.current[modelId]
            return
          }
        }
      } catch {
        // Ignore and continue polling with backoff.
      }

      delayMs = Math.min(Math.floor(delayMs * 1.4), 8000)
      pollTimeoutRef.current[modelId] = window.setTimeout(tick, delayMs)
    }

    pollTimeoutRef.current[modelId] = window.setTimeout(tick, delayMs)
  }

  const groupedModels = useMemo(() => {
    const groups: Record<string, ModelInfo[]> = {}
    for (const m of models) {
      const key = m.moduleLabel || 'Other'
      if (!groups[key]) groups[key] = []
      groups[key].push(m)
    }
    return groups
  }, [models])

  const loadModels = async (options?: { silent?: boolean }) => {
    // Coalesce concurrent refresh requests (many terminal events can fire together).
    // This mirrors upload/task pages that avoid repeatedly fetching heavy lists while jobs run.
    if (loadModelsInFlightRef.current) {
      loadModelsQueuedRef.current = true
      return
    }

    loadModelsInFlightRef.current = true
    const silent = options?.silent === true
    if (!silent) setLoading(true)
    // Silent refreshes must not clear errors — otherwise a failed download sets an error then
    // this immediately nulls it (same tick as SSE/poll handlers that call silent reload).
    if (!silent) setError(null)
    try {
      const res = await modelManagementApi.listModels()
      if (res.success && res.data) {
        const nextModels = Array.isArray(res.data) ? res.data : []
        setModels(nextModels)

        // Recover active download circles from backend truth.
        for (const m of nextModels) {
          if (m.downloading && m.activeTaskId) {
            setActiveDownloads(prev => {
              if (prev[m.id]?.taskId === m.activeTaskId) return prev
              return { ...prev, [m.id]: { taskId: m.activeTaskId!, progress: prev[m.id]?.progress ?? 0 } }
            })
            startTaskPolling(m.id, m.activeTaskId)
          }
        }
      } else {
        setModels([])
        setError(res.error || t('common.loadError', 'Failed to load'))
      }
    } catch (e: any) {
      setModels([])
      setError(String(e?.message || e))
    } finally {
      loadModelsInFlightRef.current = false
      if (!silent) setLoading(false)
      if (loadModelsQueuedRef.current) {
        loadModelsQueuedRef.current = false
        void loadModels({ silent: true })
      }
    }
  }

  useEffect(() => {
    loadModels()
  }, [])

  useEffect(() => {
    if (!dialogOpen) return
    // Refresh each time the dialog opens (factory reset / downloads may have changed state).
    void loadModels({ silent: true })
  }, [dialogOpen])

  const loadDownloadRoot = async () => {
    setPathLoading(true)
    setError(null)
    try {
      const res = await modelManagementApi.getDownloadPath()
      if (res.success && res.data?.downloadRoot) {
        setDownloadRoot(res.data.downloadRoot)
      }
    } catch (e: any) {
      setError(String(e?.message || e))
    } finally {
      setPathLoading(false)
    }
  }

  useEffect(() => {
    loadDownloadRoot()
  }, [])

  useEffect(() => {
    const onSettingsReset = () => {
      void loadModels({ silent: true })
      void loadDownloadRoot()
    }
    window.addEventListener('meta-lingo:settings-reset-completed', onSettingsReset as any)
    return () => {
      window.removeEventListener('meta-lingo:settings-reset-completed', onSettingsReset as any)
    }
  }, [])

  const handleChangeDownloadPath = async () => {
    try {
      const electronAPI = (window as any).electronAPI
      if (!electronAPI?.openFileDialog) {
        // Dev-mode/browser fallback: let user type the path.
        setManualDownloadRoot(downloadRoot || '')
        setDownloadPathDialogOpen(true)
        return
      }

      const res = await electronAPI.openFileDialog({
        title: t('settings.modelManagement.selectDownloadPathTitle', 'Select download folder'),
        properties: ['openDirectory']
      })
      if (res.canceled) return
      const nextRoot = res.filePaths?.[0]
      if (!nextRoot) return

      setError(null)
      const setRes = await modelManagementApi.setDownloadPath(nextRoot)
      if (!setRes.success || !setRes.data?.downloadRoot) {
        setError(setRes.error || t('settings.modelManagement.setDownloadPathFailed', 'Failed to set download path'))
        return
      }

      setDownloadRoot(setRes.data.downloadRoot)
      await loadModels()
    } catch (e: any) {
      setError(String(e?.message || e))
    }
  }

  const handleResetDownloadPath = async () => {
    try {
      setError(null)
      const res = await modelManagementApi.clearDownloadPathOverride()
      if (res.success && res.data?.downloadRoot) {
        setDownloadRoot(res.data.downloadRoot)
        await loadModels()
      } else {
        setError(res.error || t('settings.modelManagement.resetDownloadPathFailed', 'Failed to reset download path'))
      }
    } catch (e: any) {
      setError(String(e?.message || e))
    }
  }

  const handleApplyManualDownloadPath = async () => {
    const root = manualDownloadRoot.trim()
    if (!root) {
      setError(t('settings.modelManagement.manualPathInvalid', 'Please enter a valid directory path'))
      return
    }

    setManualPathSaving(true)
    setError(null)
    try {
      const res = await modelManagementApi.setDownloadPath(root)
      if (res.success && res.data?.downloadRoot) {
        setDownloadRoot(res.data.downloadRoot)
        await loadModels()
        setDownloadPathDialogOpen(false)
      } else {
        setError(res.error || t('settings.modelManagement.setDownloadPathFailed', 'Failed to set download path'))
      }
    } catch (e: any) {
      setError(String(e?.message || e))
    } finally {
      setManualPathSaving(false)
    }
  }

  useEffect(() => {
    return () => {
      Object.values(sseCleanupRef.current).forEach(cleanup => {
        try { cleanup?.() } catch {}
      })
      sseCleanupRef.current = {}
      Object.values(pollTimeoutRef.current).forEach(tid => {
        if (tid) window.clearTimeout(tid)
      })
      pollTimeoutRef.current = {}
    }
  }, [])

  const handleOpen = () => setDialogOpen(true)
  const handleClose = () => {
    setDialogOpen(false)
  }

  const handleDownload = async (model: ModelInfo) => {
    if (model.protected) return
    if (activeDownloads[model.id]) return

    setError(null)
    try {
      const res = await modelManagementApi.downloadModel(model.id)
      if (!res.success || !res.data?.task_id) {
        setError(res.error || t('settings.modelManagement.downloadFailed', 'Download failed'))
        return
      }

      const taskId = res.data.task_id
      const queued = res.data.queued === true

      if (queued) {
        // Queue mode: task may sit pending for a while; polling can still observe terminal state.
        startTaskPolling(model.id, taskId)
        void loadModels({ silent: true })
        return
      }

      setActiveDownloads(prev => ({ ...prev, [model.id]: { taskId, progress: 0 } }))

      const cleanup = corpusApi.subscribeToProgress(
        taskId,
        (event) => {
          setActiveDownloads(prev => {
            const current = prev[model.id]
            if (!current) return prev
            return { ...prev, [model.id]: { ...current, progress: event.progress ?? 0 } }
          })
        },
        (event) => {
          const status = event.status
          if (status === 'completed') {
            // Always reload from backend because dev mode may have bundled fallback,
            // and we need installedSource (downloaded/bundled) to be correct.
            void loadModels({ silent: true })
          } else if (status === 'failed') {
            setError(event.message || t('settings.modelManagement.downloadFailed', 'Download failed'))
            void loadModels({ silent: true })
          }
          setActiveDownloads(prev => {
            const next = { ...prev }
            delete next[model.id]
            return next
          })
          try { sseCleanupRef.current[model.id]?.() } catch {}
          delete sseCleanupRef.current[model.id]
        },
        (_err) => {
          // SSE can be flaky with multiple concurrent downloads; fall back to polling TaskDB.
          // Keep the spinner so the user doesn't see "Download" again while it's still running.
          startTaskPolling(model.id, taskId)
        }
      )

      sseCleanupRef.current[model.id] = cleanup
    } catch (e: any) {
      setError(String(e?.message || e))
    }
  }

  const handleDelete = async (model: ModelInfo) => {
    if (model.protected) return
    setError(null)

    try {
      const res = await modelManagementApi.deleteModel(model.id)
      if (res.success) {
        // Refresh from backend because in dev mode the model might still be available via bundled fallback.
        await loadModels()
      } else {
        setError(res.error || t('settings.modelManagement.deleteFailed', 'Delete failed'))
      }
    } catch (e: any) {
      setError(String(e?.message || e))
    }
  }

  const handleCancelDownload = async (modelId: string, explicitTaskId?: string | null) => {
    const taskId = explicitTaskId || activeDownloads[modelId]?.taskId
    if (!taskId) return
    try {
      setError(null)
      await modelManagementApi.cancelDownload(taskId)
      // Make UI responsive immediately; backend cancel/cleanup may finish slightly later.
      setActiveDownloads(prev => {
        const next = { ...prev }
        delete next[modelId]
        return next
      })
      try { sseCleanupRef.current[modelId]?.() } catch {}
      delete sseCleanupRef.current[modelId]
      void loadModels({ silent: true })
      // If SSE is disconnected, ensure we poll to observe terminal cancelled.
      startTaskPolling(modelId, taskId)
    } catch (e: any) {
      setError(String(e?.message || e))
    }
  }

  const renderAction = (model: ModelInfo) => {
    const downloading = activeDownloads[model.id]
    const isQueued = !!model.queued && !downloading
    const queuedTaskId = model.queuedTaskId || model.activeTaskId
    if (downloading) {
      return (
        <Box
          onClick={() => handleCancelDownload(model.id)}
          sx={{
            minWidth: 90,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            cursor: 'pointer',
            userSelect: 'none'
          }}
          title={t('settings.modelManagement.cancelDownload', 'Cancel download')}
        >
          <CircularProgress variant="determinate" value={downloading.progress} size={30} />
        </Box>
      )
    }
    if (isQueued) {
      return (
        <Button
          variant="outlined"
          size="small"
          onClick={() => handleCancelDownload(model.id, queuedTaskId)}
        >
          {t('settings.modelManagement.queued', 'Queued')} {model.queuePosition ? `#${model.queuePosition}` : ''}
        </Button>
      )
    }

    const installedSource = model.installedSource || (model.installed ? 'downloaded' : 'missing')
    const canDelete = model.installed && !model.protected && installedSource === 'downloaded'
    const canDownload = !model.protected && installedSource !== 'downloaded'

    // If the model is only available via bundled fallback (dev ./models or packaged resources),
    // still allow downloading so users can test download behavior and control their download dir.
    if (canDownload) {
      return (
        <Button
          variant="contained"
          size="small"
          startIcon={<DownloadIcon />}
          onClick={() => handleDownload(model)}
          disabled={!canDownload}
        >
          {t('settings.modelManagement.download', 'Download')}
        </Button>
      )
    }

    if (model.installed && canDelete) {
      return (
        <Button
          variant="outlined"
          size="small"
          color="error"
          startIcon={<DeleteIcon />}
          onClick={() => handleDelete(model)}
          disabled={model.protected}
        >
          {t('settings.modelManagement.delete', 'Delete')}
        </Button>
      )
    }

    // Fallback: should rarely happen, but keep UI safe.
    return null
  }

  return (
    <>
      <Paper sx={{ p: 3 }}>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
          <StorageIcon color="primary" />
          <Typography variant="h6" fontWeight={600}>
            {t('settings.modelManagement.title', 'Model Management')}
          </Typography>
        </Stack>

        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {t(
            'settings.modelManagement.description',
            'Download or delete optional ML models. Factory reset preserves built-in models.'
          )}
        </Typography>

        <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 2, mb: 2 }}>
          <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
            <Box>
              <Typography variant="subtitle2" fontWeight={600}>
                {t('settings.modelManagement.downloadPathTitle', 'Download path')}
              </Typography>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ display: 'block', mt: 0.5, wordBreak: 'break-all' }}
              >
                {downloadRoot || (pathLoading ? t('common.loading', 'Loading...') : '')}
              </Typography>
            </Box>

            <Stack direction="row" spacing={1}>
              <Button variant="outlined" size="small" onClick={handleChangeDownloadPath}>
                {t('settings.modelManagement.changeDownloadPath', 'Change')}
              </Button>
              <Button variant="text" size="small" onClick={handleResetDownloadPath}>
                {t('settings.modelManagement.resetDownloadPath', 'Reset')}
              </Button>
            </Stack>
          </Stack>
        </Box>

        <Button variant="outlined" onClick={handleOpen}>
          {t('settings.modelManagement.openDialog', 'Manage models')}
        </Button>

        {error && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error}
          </Alert>
        )}
      </Paper>

      <Dialog open={dialogOpen} onClose={handleClose} maxWidth="md" fullWidth>
        <DialogTitle>
          {t('settings.modelManagement.dialogTitle', 'Model Management')}
        </DialogTitle>

        <DialogContent dividers>
          {loading ? (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 2 }}>
              <CircularProgress size={16} />
              <Typography variant="body2" color="text.secondary">
                {t('common.loading', 'Loading...')}
              </Typography>
            </Box>
          ) : (
            <Box>
              {Object.entries(groupedModels).map(([moduleLabel, moduleModels], idx) => (
                <Box key={moduleLabel}>
                  {idx !== 0 && <Divider sx={{ my: 2 }} />}
                  <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1 }}>
                    {getModuleTitle(moduleLabel)}
                  </Typography>

                  <Stack spacing={1}>
                    {moduleModels.map((m) => {
                      const downloading = !!activeDownloads[m.id]
                      return (
                        <Paper
                          key={m.id}
                          variant="outlined"
                          sx={{
                            p: 1.5,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 2
                          }}
                        >
                          <Box sx={{ minWidth: 260 }}>
                            <Typography variant="body1" fontWeight={600}>
                              {getModelName(m)}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {m.storageRelativePath}
                            </Typography>
                          </Box>

                          <Stack direction="row" spacing={1} alignItems="center">
                            {m.protected && (
                              <Chip
                                size="small"
                                label={t('settings.modelManagement.builtIn', 'Built-in')}
                                color="primary"
                                variant="outlined"
                              />
                            )}
                            {!m.protected && (m.installedSource === 'bundled') && (
                              <Chip
                                size="small"
                                label={t('settings.modelManagement.bundledFallback', 'Bundled fallback')}
                                color="info"
                                variant="outlined"
                              />
                            )}
                            {!m.protected && (m.installedSource === 'downloaded') && (
                              <Chip size="small" label={t('settings.modelManagement.installed', 'Installed')} color="success" variant="outlined" />
                            )}
                            {!m.protected && (m.installedSource === 'missing') && (
                              <Chip size="small" label={t('settings.modelManagement.notInstalled', 'Not installed')} variant="outlined" />
                            )}

                            {downloading ? (
                              <Box sx={{ minWidth: 100 }} />
                            ) : null}

                            {renderAction(m)}
                          </Stack>
                        </Paper>
                      )
                    })}
                  </Stack>
                </Box>
              ))}
            </Box>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={downloadPathDialogOpen} onClose={() => setDownloadPathDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          {t('settings.modelManagement.manualDownloadPathTitle', 'Set download path')}
        </DialogTitle>
        <DialogContent>
          <Alert severity="info" sx={{ mb: 2 }}>
            {t(
              'settings.modelManagement.manualDownloadPathDesc',
              'Your environment does not support Electron directory selection. Please enter an absolute path manually.'
            )}
          </Alert>
          <TextField
            label={t('settings.modelManagement.manualDownloadPathLabel', 'Download directory (absolute path)')}
            value={manualDownloadRoot}
            onChange={(e) => setManualDownloadRoot(e.target.value)}
            placeholder={t('settings.modelManagement.manualDownloadPathPlaceholder', '/Users/you/Library/Application Support/Meta-Lingo/models')}
            fullWidth
            autoFocus
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDownloadPathDialogOpen(false)} disabled={manualPathSaving}>
            {t('settings.cancel', 'Cancel')}
          </Button>
          <Button variant="contained" onClick={handleApplyManualDownloadPath} disabled={manualPathSaving}>
            {manualPathSaving ? <CircularProgress size={18} color="inherit" /> : t('settings.apply', 'Apply')}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  )
}

