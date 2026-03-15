import { useState, useEffect, useCallback, useRef } from 'react'
import { Box, Typography, Button, keyframes } from '@mui/material'
import { useTranslation } from 'react-i18next'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import RefreshIcon from '@mui/icons-material/Refresh'

// 启动状态类型
interface StartupStatus {
  stage: 'initializing' | 'starting_backend' | 'checking_health' | 'ready' | 'error'
  message: string
  progress: number
  backendReady: boolean
}

interface StartupScreenProps {
  onReady: () => void
}

// 检查是否是开发模式
const isDevelopment = !window.electronAPI || import.meta.env.DEV

// 直接通过HTTP检查后端是否就绪（用 127.0.0.1 与主进程一致，避免 localhost→IPv6 连接失败）
async function checkBackendDirectly(): Promise<boolean> {
  try {
    const response = await fetch('http://127.0.0.1:8000/health', {
      method: 'GET',
      signal: AbortSignal.timeout(2000)
    })
    return response.ok
  } catch {
    return false
  }
}

// 动画：shimmer效果
const shimmer = keyframes`
  0% { background-position: -200px 0; }
  100% { background-position: 200px 0; }
`

// 动画：spinner旋转
const spin = keyframes`
  to { transform: rotate(360deg); }
`

// 启动步骤配置（调试与打包共用：进度条按步骤离散推进，避免打包后一小格一小格动）
const startupSteps = [
  { id: 1, textKey: 'startup.step1', progress: 15 },
  { id: 2, textKey: 'startup.step2', progress: 35 },
  { id: 3, textKey: 'startup.step3', progress: 55 },
  { id: 4, textKey: 'startup.step4', progress: 75 },
  { id: 5, textKey: 'startup.step5', progress: 95 },
]

/** 将主进程的连续进度 (如 30,31,…,90) 映射为步骤离散值，与调试时一段一段的体验一致 */
const STEP_VALUES = [0, 15, 35, 55, 75, 95, 100]
function progressToStepDisplay(progress: number): number {
  if (progress >= 100) return 100
  for (let i = STEP_VALUES.length - 1; i >= 0; i--) {
    if (progress >= STEP_VALUES[i]) return STEP_VALUES[i]
  }
  return 0
}

function progressToStepIndex(progress: number): number {
  if (progress >= 100) return startupSteps.length
  for (let i = STEP_VALUES.length - 1; i >= 0; i--) {
    if (progress >= STEP_VALUES[i]) return i
  }
  return 0
}

export default function StartupScreen({ onReady }: StartupScreenProps) {
  const { t } = useTranslation()
  const [status, setStatus] = useState<StartupStatus>({
    stage: 'initializing',
    message: '',
    progress: 0,
    backendReady: false
  })
  const [currentStep, setCurrentStep] = useState(0)
  const [retrying, setRetrying] = useState(false)
  const checkCountRef = useRef(0)
  const maxChecks = isDevelopment ? 20 : 60
  // 防止 onReady 被重复调用（IPC 事件与 getStartupStatus 可能同时触发）
  const onReadyCalledRef = useRef(false)

  const pollBackend = useCallback(async () => {
    checkCountRef.current++
    const count = checkCountRef.current
    
    // 根据检查次数更新当前步骤
    const stepIndex = Math.min(Math.floor((count / maxChecks) * startupSteps.length), startupSteps.length - 1)
    setCurrentStep(stepIndex)
    
    const progress = startupSteps[stepIndex]?.progress || 0
    
    setStatus({
      stage: 'checking_health',
      message: t(startupSteps[stepIndex]?.textKey || 'startup.checkingHealth'),
      progress,
      backendReady: false
    })
    
    const isReady = await checkBackendDirectly()

    if (isReady) {
      setCurrentStep(startupSteps.length) // 所有步骤完成
      setStatus({
        stage: 'ready',
        message: t('startup.ready'),
        progress: 100,
        backendReady: true
      })
      if (!onReadyCalledRef.current) {
        onReadyCalledRef.current = true
        setTimeout(onReady, 500)
      }
      return true
    }
    
    if (count >= maxChecks) {
      setStatus({
        stage: 'error',
        message: t('startup.error'),
        progress: 0,
        backendReady: false
      })
      return false
    }
    
    return null
  }, [onReady, t, maxChecks])

  useEffect(() => {
    let intervalId: NodeJS.Timeout | null = null
    let mounted = true

    const startPolling = async () => {
      const result = await pollBackend()
      if (result !== null || !mounted) return

      intervalId = setInterval(async () => {
        if (!mounted) {
          if (intervalId) clearInterval(intervalId)
          return
        }
        const result = await pollBackend()
        if (result !== null && intervalId) {
          clearInterval(intervalId)
        }
      }, 500)
    }

    let cleanup: (() => void) | undefined
    const hasIpc = !!window.electronAPI?.onStartupStatusChange

    if (hasIpc) {
      // 打包模式：仅以主进程 IPC 为进度来源，不再跑轮询进度，避免与主进程进度互相覆盖导致闪烁
      // 先注册监听器（同步），再获取初始状态（异步），避免漏掉 ready 事件
      cleanup = window.electronAPI.onStartupStatusChange((newStatus) => {
        if (!mounted) return
        let localizedMessage = newStatus.message
        if (newStatus.stage === 'initializing') {
          localizedMessage = t('startup.initializing')
        } else if (newStatus.stage === 'starting_backend') {
          localizedMessage = t('startup.startingBackend')
        } else if (newStatus.stage === 'checking_health') {
          localizedMessage = t('startup.checkingHealth')
        } else if (newStatus.stage === 'ready') {
          localizedMessage = t('startup.ready')
        } else if (newStatus.stage === 'error') {
          localizedMessage = t('startup.error')
        }

        if (newStatus.backendReady) {
          setCurrentStep(startupSteps.length)
          setStatus({
            ...newStatus,
            progress: 100,
            message: localizedMessage
          })
          if (!onReadyCalledRef.current) {
            onReadyCalledRef.current = true
            setTimeout(onReady, 500)
          }
        } else {
          const raw = newStatus.progress ?? 0
          const progress = progressToStepDisplay(raw)
          const stepIndex = progressToStepIndex(raw)
          setCurrentStep(stepIndex)
          setStatus({
            ...newStatus,
            progress,
            message: localizedMessage
          })
        }
      })

      // 获取初始状态（在监听器注册后异步查询，防止竞态）
      window.electronAPI.getStartupStatus().then((s) => {
        if (!mounted) return
        let localizedMessage = s.message
        if (s.stage === 'initializing') localizedMessage = t('startup.initializing')
        else if (s.stage === 'starting_backend') localizedMessage = t('startup.startingBackend')
        else if (s.stage === 'checking_health') localizedMessage = t('startup.checkingHealth')
        else if (s.stage === 'ready') localizedMessage = t('startup.ready')
        else if (s.stage === 'error') localizedMessage = t('startup.error')

        const raw = s.progress ?? 0
        const progress = progressToStepDisplay(raw)
        const stepIndex = s.backendReady ? startupSteps.length : progressToStepIndex(raw)
        setCurrentStep(stepIndex)
        setStatus({
          stage: s.stage,
          message: localizedMessage,
          progress,
          backendReady: s.backendReady
        })
        if (s.backendReady && !onReadyCalledRef.current) {
          onReadyCalledRef.current = true
          setTimeout(onReady, 500)
        }
      })
    } else {
      // 开发模式：无 IPC，仅靠前端轮询后端健康
      startPolling()
    }

    return () => {
      mounted = false
      if (intervalId) clearInterval(intervalId)
      cleanup?.()
    }
  }, [pollBackend, onReady, t])

  const handleRetry = async () => {
    setRetrying(true)
    onReadyCalledRef.current = false  // 重置 onReady 守卫，允许重试后再次触发
    checkCountRef.current = 0
    setCurrentStep(0)

    if (window.electronAPI?.retryBackend) {
      // 打包模式：先调主进程重试（完整重启），再补一层前端 HTTP 轮询兜底
      // 原先“重试后能打开”依赖前端也能轮询到 /health；v3.9.69 去掉重试时轮询后仅靠 IPC，主进程超时即永远失败
      setStatus({
        stage: 'checking_health',
        message: t('startup.retrying'),
        progress: 10,
        backendReady: false
      })
      await window.electronAPI.retryBackend()
      // 若 IPC 已返回 ready 则 onReady 会在监听器里触发，这里只需兜底：若仍未就绪则前端继续轮询 /health 一段时间
      const pollUntilReady = async (attempt: number, maxAttempts: number) => {
        if (onReadyCalledRef.current) {
          setRetrying(false)
          return
        }
        const ok = await checkBackendDirectly()
        if (ok) {
          setCurrentStep(startupSteps.length)
          setStatus({ stage: 'ready', message: t('startup.ready'), progress: 100, backendReady: true })
          if (!onReadyCalledRef.current) {
            onReadyCalledRef.current = true
            setTimeout(onReady, 500)
          }
          setRetrying(false)
          return
        }
        if (attempt < maxAttempts) {
          setStatus((prev) => ({ ...prev, message: t('startup.retrying') }))
          setTimeout(() => pollUntilReady(attempt + 1, maxAttempts), 500)
        } else {
          setRetrying(false)
        }
      }
      pollUntilReady(0, 60)
    } else {
      // 开发模式（无 IPC）：使用 HTTP 轮询
      const poll = async () => {
        const result = await pollBackend()
        if (result === null) {
          setTimeout(poll, 500)
        } else {
          setRetrying(false)
        }
      }
      poll()
    }
  }

  const isError = status.stage === 'error'

  return (
    <Box
      sx={{
        width: '100vw',
        height: '100vh',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        background: 'linear-gradient(135deg, #0047AB 0%, #007FFF 100%)',
        color: 'white',
        overflow: 'hidden',
        position: 'relative',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
      }}
    >
      <Box
        sx={{
          textAlign: 'center',
          maxWidth: 500,
          px: 5,
          py: 4
        }}
      >
        {/* Logo */}
        <Typography
          sx={{
            fontSize: '3rem',
            fontWeight: 700,
            mb: 2.5,
            background: 'linear-gradient(45deg, #fff, #f0f0f0)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text'
          }}
        >
          Meta-Lingo
        </Typography>

        {/* 副标题 */}
        <Typography
          sx={{
            fontSize: '1.2rem',
            mb: 5,
            opacity: 0.9
          }}
        >
          {t('app.description')}
        </Typography>

        {/* 进度条区域 */}
        <Box sx={{ mb: 3.5 }}>
          {/* 进度条 */}
          <Box
            sx={{
              width: '100%',
              height: 6,
              bgcolor: 'rgba(255, 255, 255, 0.2)',
              borderRadius: 3,
              overflow: 'hidden',
              mb: 2
            }}
          >
            <Box
              sx={{
                height: '100%',
                background: 'linear-gradient(90deg, #00BFFF, #1E90FF)',
                borderRadius: 3,
                width: `${status.progress}%`,
                transition: 'width 0.5s ease',
                animation: `${shimmer} 2s infinite`,
                backgroundSize: '400px 100%'
              }}
            />
          </Box>

          {/* 状态文本 */}
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 1.5,
              fontSize: '1rem',
              opacity: 0.8,
              minHeight: 24
            }}
          >
            {!isError && (
              <Box
                sx={{
                  width: 20,
                  height: 20,
                  border: '2px solid rgba(255, 255, 255, 0.3)',
                  borderRadius: '50%',
                  borderTopColor: 'white',
                  animation: `${spin} 1s ease-in-out infinite`
                }}
              />
            )}
            <span>{status.message || t('startup.initializing')}</span>
          </Box>
        </Box>

        {/* 步骤列表 */}
        <Box
          sx={{
            textAlign: 'left',
            mt: 4,
            p: 2.5,
            bgcolor: 'rgba(255, 255, 255, 0.1)',
            borderRadius: 2,
            backdropFilter: 'blur(10px)'
          }}
        >
          {startupSteps.map((step, index) => {
            const isCompleted = index < currentStep
            const isActive = index === currentStep && !isError
            
            return (
              <Box
                key={step.id}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  mb: index < startupSteps.length - 1 ? 1.5 : 0,
                  fontSize: '0.9rem',
                  opacity: isActive ? 1 : isCompleted ? 0.8 : 0.5,
                  color: isActive ? '#FFFF00' : isCompleted ? '#00FFFF' : 'inherit',
                  transition: 'all 0.3s ease'
                }}
              >
                <Box
                  sx={{
                    width: 20,
                    height: 20,
                    mr: 1.5,
                    borderRadius: '50%',
                    bgcolor: isActive ? '#FFFF00' : isCompleted ? '#00FFFF' : 'rgba(255, 255, 255, 0.3)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 11,
                    color: (isActive || isCompleted) ? '#0047AB' : 'inherit',
                    fontWeight: 600
                  }}
                >
                  {isCompleted ? <CheckCircleIcon sx={{ fontSize: 14, color: '#0047AB' }} /> : step.id}
                </Box>
                <span>{t(step.textKey)}</span>
              </Box>
            )
          })}
        </Box>

        {/* 错误时显示重试按钮 */}
        {isError && (
          <Box sx={{ mt: 3 }}>
            {isDevelopment && (
              <Typography
                sx={{
                  fontSize: '0.85rem',
                  opacity: 0.7,
                  mb: 2
                }}
              >
                {t('startup.devModeHint')}
              </Typography>
            )}
            <Button
              variant="contained"
              onClick={handleRetry}
              disabled={retrying}
              startIcon={<RefreshIcon />}
              sx={{
                bgcolor: 'rgba(255, 255, 255, 0.2)',
                color: 'white',
                '&:hover': {
                  bgcolor: 'rgba(255, 255, 255, 0.3)'
                },
                '&:disabled': {
                  bgcolor: 'rgba(255, 255, 255, 0.1)',
                  color: 'rgba(255, 255, 255, 0.5)'
                }
              }}
            >
              {retrying ? t('startup.retrying') : t('startup.retry')}
            </Button>
          </Box>
        )}
      </Box>

      {/* 版本号 */}
      <Typography
        sx={{
          position: 'absolute',
          bottom: 20,
          right: 20,
          fontSize: '0.8rem',
          opacity: 0.5
        }}
      >
        v3.9.79
      </Typography>
    </Box>
  )
}

