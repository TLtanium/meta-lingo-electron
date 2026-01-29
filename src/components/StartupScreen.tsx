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

// 直接通过HTTP检查后端是否就绪
async function checkBackendDirectly(): Promise<boolean> {
  try {
    const response = await fetch('http://localhost:8000/api/corpus/services/status', {
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

// 启动步骤配置
const startupSteps = [
  { id: 1, textKey: 'startup.step1', progress: 15 },
  { id: 2, textKey: 'startup.step2', progress: 35 },
  { id: 3, textKey: 'startup.step3', progress: 55 },
  { id: 4, textKey: 'startup.step4', progress: 75 },
  { id: 5, textKey: 'startup.step5', progress: 95 },
]

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
      setTimeout(onReady, 500)
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
    if (window.electronAPI?.onStartupStatusChange) {
      cleanup = window.electronAPI.onStartupStatusChange((newStatus) => {
        if (newStatus.backendReady) {
          if (intervalId) clearInterval(intervalId)
          setCurrentStep(startupSteps.length)
          setStatus(newStatus)
          setTimeout(onReady, 500)
        }
      })
    }
    
    startPolling()
    
    return () => {
      mounted = false
      if (intervalId) clearInterval(intervalId)
      cleanup?.()
    }
  }, [pollBackend, onReady])

  const handleRetry = async () => {
    setRetrying(true)
    checkCountRef.current = 0
    setCurrentStep(0)
    
    if (window.electronAPI?.retryBackend) {
      await window.electronAPI.retryBackend()
    }
    
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
        v3.8.98
      </Typography>
    </Box>
  )
}

