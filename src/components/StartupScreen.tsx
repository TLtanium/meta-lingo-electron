import { useState, useEffect, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import StartupSplash from './Startup/StartupSplash'
import { getStartupBridge, type StartupStatus } from './Startup/bridge'

export const STARTUP_VERSION = 'v4.9.74'

interface StartupScreenProps {
  onReady: () => void
  leaving?: boolean
}

// 检查是否是开发模式
const isDevelopment = !getStartupBridge() || import.meta.env.DEV

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

export default function StartupScreen({ onReady, leaving = false }: StartupScreenProps) {
  const { t } = useTranslation()
  const [status, setStatus] = useState<StartupStatus>({
    stage: 'initializing',
    message: '',
    progress: 0,
    backendReady: false
  })
  const aliveRef = useRef(true)
  const readyTimerRef = useRef<ReturnType<typeof setTimeout>>()
  useEffect(() => {
    aliveRef.current = true
    return () => {
      aliveRef.current = false
      clearTimeout(readyTimerRef.current)
    }
  }, [])
  const checkCountRef = useRef(0)
  const maxChecks = isDevelopment ? 60 : 60
  // 防止 onReady 被重复调用（IPC 事件与 getStartupStatus 可能同时触发）
  const onReadyCalledRef = useRef(false)
  // IPC 状态可能乱序到达：用 seq 丢弃旧消息；用 attemptId 允许“重试”安全重置
  const lastSeqRef = useRef<number>(-1)
  const lastAttemptIdRef = useRef<number>(-1)
  const maxProgressRef = useRef<number>(0)
  const maxStepRef = useRef<number>(0)

  const stageRank: Record<StartupStatus['stage'], number> = {
    initializing: 0,
    starting_backend: 1,
    checking_health: 2,
    ready: 3,
    error: 3,
  }
  const maxStageRankRef = useRef<number>(0)

  const applyIpcStatus = useCallback((incoming: StartupStatus) => {
    const seq = incoming.seq ?? 0
    const attemptId = incoming.attemptId ?? 0

    // 新一轮启动（重试）允许重置 UI；同一轮内必须单调递增
    if (attemptId > lastAttemptIdRef.current) {
      lastAttemptIdRef.current = attemptId
      lastSeqRef.current = -1
      maxProgressRef.current = 0
      maxStepRef.current = 0
      maxStageRankRef.current = 0
      onReadyCalledRef.current = false
    }

    // 丢弃旧消息（乱序到达会导致回退闪烁）
    if (seq < lastSeqRef.current) return
    lastSeqRef.current = seq

    // 本地化 message（不要直接信任主进程的英文 message）
    let localizedMessage = incoming.message
    if (incoming.stage === 'initializing') localizedMessage = t('startup.initializing')
    else if (incoming.stage === 'starting_backend') localizedMessage = t('startup.startingBackend')
    else if (incoming.stage === 'checking_health') localizedMessage = t('startup.checkingHealth')
    else if (incoming.stage === 'ready') localizedMessage = t('startup.ready')
    else if (incoming.stage === 'error') localizedMessage = t('startup.error')

    const raw = incoming.progress ?? 0
    const mappedProgress = incoming.backendReady ? 100 : progressToStepDisplay(raw)
    const mappedStepIndex = incoming.backendReady ? startupSteps.length : progressToStepIndex(raw)

    // 单调递增：进度/步骤只增不减
    const nextProgress = Math.max(maxProgressRef.current, mappedProgress)
    const nextStep = Math.max(maxStepRef.current, mappedStepIndex)
    maxProgressRef.current = nextProgress
    maxStepRef.current = nextStep

    // 单调递增：stage 只升不降（避免 initializing 覆盖 checking_health）
    const nextRank = Math.max(maxStageRankRef.current, stageRank[incoming.stage])
    maxStageRankRef.current = nextRank
    const rankToStage = (rank: number): StartupStatus['stage'] => {
      if (rank >= stageRank.ready) return 'ready'
      if (rank >= stageRank.checking_health) return 'checking_health'
      if (rank >= stageRank.starting_backend) return 'starting_backend'
      return 'initializing'
    }

    const nextStage = incoming.stage === 'error' ? 'error' : rankToStage(nextRank)

    setStatus({
      ...incoming,
      stage: incoming.backendReady ? 'ready' : (incoming.stage === 'error' ? 'error' : nextStage),
      progress: incoming.backendReady ? 100 : nextProgress,
      message: localizedMessage,
      backendReady: incoming.backendReady,
    })

    if (incoming.backendReady && !onReadyCalledRef.current) {
      onReadyCalledRef.current = true
      readyTimerRef.current = setTimeout(() => { if (aliveRef.current) onReady() }, 500)
    }
  }, [onReady, t])

  const pollBackend = useCallback(async () => {
    if (!aliveRef.current) return false
    if (onReadyCalledRef.current) return true
    checkCountRef.current++
    const count = checkCountRef.current
    
    // 根据检查次数更新当前步骤
    const stepIndex = Math.min(Math.floor((count / maxChecks) * startupSteps.length), startupSteps.length - 1)
    
    const progress = startupSteps[stepIndex]?.progress || 0
    
    setStatus({
      stage: 'checking_health',
      message: t(startupSteps[stepIndex]?.textKey || 'startup.checkingHealth'),
      progress,
      backendReady: false
    })
    
    const isReady = await checkBackendDirectly()
    if (!aliveRef.current) return false
    if (onReadyCalledRef.current) return true

    if (isReady) {
      setStatus({
        stage: 'ready',
        message: t('startup.ready'),
        progress: 100,
        backendReady: true
      })
      if (!onReadyCalledRef.current) {
        onReadyCalledRef.current = true
        readyTimerRef.current = setTimeout(() => { if (aliveRef.current) onReady() }, 500)
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
    const hasIpc = !!getStartupBridge()?.onStartupStatusChange

    if (hasIpc) {
      // 打包模式：仅以主进程 IPC 为进度来源，不再跑轮询进度，避免与主进程进度互相覆盖导致闪烁
      // 先注册监听器（同步），再获取初始状态（异步），避免漏掉 ready 事件
      cleanup = getStartupBridge()!.onStartupStatusChange((newStatus) => {
        if (!mounted) return
        applyIpcStatus(newStatus as any)
      })

      // 获取初始状态（在监听器注册后异步查询，防止竞态）
      getStartupBridge()!.getStartupStatus().then((s) => {
        if (!mounted) return
        applyIpcStatus(s as any)
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
  }, [pollBackend, onReady, t, applyIpcStatus])

  return <StartupSplash version={STARTUP_VERSION} leaving={leaving}
    error={status.stage === 'error'} ready={status.backendReady} />
}
