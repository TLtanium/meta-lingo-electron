import { app, BrowserWindow, dialog, ipcMain, shell, screen } from 'electron'
import path from 'path'
import { spawn, ChildProcess, execSync } from 'child_process'
import fs from 'fs'

function debugLocalLog(_payload: {
  sessionId: string
  runId?: string
  hypothesisId: string
  location: string
  message: string
  data?: any
  timestamp?: number
}) {
  // Debug instrumentation removed.
}

// Chromium flags to fix Web Audio API crash when decoding large audio files in packaged app
// This increases memory limits and disables some security restrictions
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=4096')
app.commandLine.appendSwitch('disable-features', 'AudioServiceOutOfProcess')

let mainWindow: BrowserWindow | null = null
let backendProcess: ChildProcess | null = null

function killLeftoverMetaLingoProcesses(): void {
  if (process.platform !== 'win32') return
  try {
    const currentPid = process.pid
    debugLocalLog({
      sessionId: 'f069eb',
      runId: 'debug-killLeftover',
      hypothesisId: 'H7',
      location: 'electron/main.ts:killLeftoverMetaLingoProcesses',
      message: 'before taskkill Meta-Lingo.exe',
      data: {
        currentPid,
        metaLingoPidsBefore: listPidsByImageNameWindows('Meta-Lingo.exe').slice(0, 20),
      },
    })
    // Kill Electron main/renderer processes by image name, excluding current PID.
    execSync(`taskkill /F /IM "Meta-Lingo.exe" /T /FI "PID ne ${currentPid}" 2>nul`, { stdio: 'ignore' })

    debugLocalLog({
      sessionId: 'f069eb',
      runId: 'debug-killLeftover',
      hypothesisId: 'H7',
      location: 'electron/main.ts:killLeftoverMetaLingoProcesses',
      message: 'after taskkill Meta-Lingo.exe',
      data: {
        currentPid,
        metaLingoPidsAfter: listPidsByImageNameWindows('Meta-Lingo.exe').slice(0, 20),
      },
    })
  } catch {
    // best-effort only
    debugLocalLog({
      sessionId: 'f069eb',
      runId: 'debug-killLeftover',
      hypothesisId: 'H7',
      location: 'electron/main.ts:killLeftoverMetaLingoProcesses',
      message: 'taskkill Meta-Lingo.exe failed',
      data: { currentPid: process.pid },
    })
  }
}

function listPidsByImageNameWindows(imageName: string): number[] {
  try {
    const out = execSync(`tasklist /FI "IMAGENAME eq ${imageName}" /FO CSV /NH`, {
      stdio: ['ignore', 'pipe', 'ignore'],
      encoding: 'utf8',
    })

    // If no tasks match, tasklist prints an INFO line. The regex below will simply yield an empty list.
    const pids: number[] = []
    for (const line of out.split(/\r?\n/)) {
      const trimmed = line.trim()
      if (!trimmed) continue
      // CSV row:
      // "meta-lingo-backend.exe","12345","Console","1","12,345 K"
      const m = trimmed.match(/"([^"]+)",\s*"(\d+)"/)
      if (!m) continue
      const name = String(m[1]).toLowerCase()
      const pid = Number(m[2])
      if (name === imageName.toLowerCase() && Number.isFinite(pid) && pid > 0) {
        pids.push(pid)
      }
    }
    return pids
  } catch {
    return []
  }
}

function killProcessListeningOnPortWindows(port: number): void {
  if (process.platform !== 'win32') return
  try {
    debugLocalLog({
      sessionId: 'f069eb',
      runId: 'debug-portkill',
      hypothesisId: 'H4',
      location: 'electron/main.ts:killProcessListeningOnPortWindows',
      message: 'invoke port kill',
      data: { port },
    })
    // netstat output contains lines like:
    //   TCP    0.0.0.0:8000   0.0.0.0:0   LISTENING   12345
    // Note: avoid netstat "-p tcp" because it is not supported consistently across Windows versions.
    // Filter LISTENING + the target port, then kill by extracted PID.
    // `findstr` returns exit code 1 when there are no matches; treat that as "no listener".
    const out = execSync(`netstat -ano | findstr LISTENING | findstr ":${port}" 2>nul || echo ""`, {
      stdio: ['ignore', 'pipe', 'ignore'],
      encoding: 'utf8',
    })
    const pids = new Set<number>()
    const lines = out.split(/\r?\n/)
    for (const line of lines) {
      const m = line.match(/\s+(\d+)\s*$/)
      if (!m) continue
      const pid = Number(m[1])
      if (!Number.isFinite(pid) || pid <= 0) continue
      pids.add(pid)
    }

    debugLocalLog({
      sessionId: 'f069eb',
      runId: 'debug-portkill',
      hypothesisId: 'H4',
      location: 'electron/main.ts:killProcessListeningOnPortWindows',
      message: 'extracted PIDs for port kill',
      data: { port, pidCount: pids.size, pids: Array.from(pids).slice(0, 20) }
    })

    for (const pid of pids) {
      // /T kills the process tree; /F force kills.
      execSync(`taskkill /F /PID ${pid} /T 2>nul`, { stdio: 'ignore' })
    }
  } catch (err) {
    debugLocalLog({
      sessionId: 'f069eb',
      runId: 'debug-portkill',
      hypothesisId: 'H4',
      location: 'electron/main.ts:killProcessListeningOnPortWindows',
      message: 'netstat/findstr failed',
      data: { port, error: (err as any)?.message ?? String(err) },
    })
    // best-effort only
  }
}

function getListeningPidsOnPortWindows(port: number): number[] {
  if (process.platform !== 'win32') return []
  try {
    // Always return a string (treat "no matches" as empty output).
    const out = execSync(`netstat -ano | findstr LISTENING | findstr ":${port}" 2>nul || echo ""`, {
      stdio: ['ignore', 'pipe', 'ignore'],
      encoding: 'utf8',
    })

    const pids = new Set<number>()
    const lines = out.split(/\r?\n/)
    for (const line of lines) {
      const m = line.match(/\s+(\d+)\s*$/)
      if (!m) continue
      const pid = Number(m[1])
      if (!Number.isFinite(pid) || pid <= 0) continue
      pids.add(pid)
    }
    return Array.from(pids)
  } catch {
    return []
  }
}

// Windows: if a previous instance didn't exit cleanly, kill leftovers before requesting the single-instance lock.
// Otherwise the new instance may fail to start (the old one still holds the lock) or create more zombies.
if (process.platform === 'win32') {
  try {
    const currentPid = process.pid
    debugLocalLog({
      sessionId: 'f069eb',
      runId: 'debug-prekill',
      hypothesisId: 'H2',
      location: 'electron/main.ts:preKillBeforeSingleInstanceLock',
      message: 'pre-kill leftovers before requestSingleInstanceLock',
      data: { pid: currentPid }
    })
    // Kill all previous GUI instances, but exclude current PID.
    execSync(`taskkill /F /IM "Meta-Lingo.exe" /T /FI "PID ne ${currentPid}" 2>nul`, { stdio: 'ignore' })
    // Kill backend/mcp helpers (names are different from main executable)
    execSync(`taskkill /F /IM "meta-lingo-backend.exe" /T 2>nul`, { stdio: 'ignore' })
    execSync(`taskkill /F /IM "meta-lingo-mcp.exe" /T 2>nul`, { stdio: 'ignore' })
  } catch {
    // best-effort only
  }
}

// Prevent zombie multi-instance accumulation on Windows when an old process is stuck.
const gotSingleInstanceLock = app.requestSingleInstanceLock()
debugLocalLog({
  sessionId: 'f069eb',
  runId: 'debug-singleinstance',
  hypothesisId: 'H1',
  location: 'electron/main.ts:singleInstanceLockResult',
  message: 'requestSingleInstanceLock result',
  data: { gotSingleInstanceLock, pid: process.pid }
})
if (!gotSingleInstanceLock) {
  app.exit(0)
}

// Windows: close/exit guard to prevent multiple exit attempts.
let isAppClosing = false

// 启动状态管理
interface StartupStatus {
  stage: 'initializing' | 'starting_backend' | 'checking_health' | 'ready' | 'error'
  message: string
  progress: number  // 0-100
  backendReady: boolean
  /** Monotonic sequence number for ordering. */
  seq: number
  /** Startup attempt id. Increases on retry. */
  attemptId: number
}

let startupStatus: StartupStatus = {
  stage: 'initializing',
  message: 'Initializing...',
  progress: 0,
  backendReady: false,
  seq: 0,
  attemptId: 1,
}

const _dbg = (_hypothesisId: string, _location: string, _message: string, _data: any) => {}

function updateStartupStatus(update: Partial<StartupStatus>) {
  const nextAttemptId = update.attemptId ?? startupStatus.attemptId
  const isSameAttempt = nextAttemptId === startupStatus.attemptId

  // Progress should never go backwards within the same attempt.
  const requestedProgress = update.progress ?? startupStatus.progress
  const nextProgress = isSameAttempt ? Math.max(startupStatus.progress, requestedProgress) : requestedProgress

  startupStatus = {
    ...startupStatus,
    ...update,
    attemptId: nextAttemptId,
    progress: nextProgress,
    seq: startupStatus.seq + 1,
  }
  // 发送状态更新到渲染进程
  // 加载中发送的消息会被 Electron 丢弃，但 did-finish-load 事件会补发最新状态
  if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents) {
    mainWindow.webContents.send('startup-status-changed', startupStatus)
  }
}

/**
 * 终止所有旧的后端进程（防止端口占用）
 */
function killOldBackendProcesses(): void {
  const platform = process.platform
  debugLocalLog({
    sessionId: 'f069eb',
    runId: 'debug-killOldBackend',
    hypothesisId: 'H3',
    location: 'electron/main.ts:killOldBackendProcesses',
    message: 'killOldBackendProcesses start',
    data: { platform },
  })
  try {
    if (platform === 'darwin' || platform === 'linux') {
      // macOS/Linux: 使用 pkill 终止所有 meta-lingo-backend 进程
      execSync('pkill -9 -f "meta-lingo-backend" 2>/dev/null || true', { stdio: 'ignore' })
    } else if (platform === 'win32') {
      // Windows: 使用 taskkill 终止进程
      execSync('taskkill /F /IM meta-lingo-backend.exe 2>nul || echo.', { stdio: 'ignore' })

      // Port-level fallback: if a worker/child keeps the port, kill by listening PID.
      // backend port is 8000 by default (METALINGO_PORT).
      killProcessListeningOnPortWindows(8000)
    }
    console.log('[Backend] Killed any old backend processes')
  } catch (err) {
    // 忽略错误（可能没有旧进程需要终止）
    console.log('[Backend] No old backend processes to kill')
    debugLocalLog({
      sessionId: 'f069eb',
      runId: 'debug-killOldBackend',
      hypothesisId: 'H3',
      location: 'electron/main.ts:killOldBackendProcesses',
      message: 'killOldBackendProcesses no-op/failed',
      data: { platform, error: (err as any)?.message ?? String(err) },
    })
  }
}

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged

// 后端配置（用 127.0.0.1 避免 localhost 解析到 IPv6 ::1 导致连接失败）
const BACKEND_PORT = 8000
const BACKEND_URL = `http://127.0.0.1:${BACKEND_PORT}`

/**
 * 获取后端可执行文件路径
 */
function getBackendPath(): string {
  if (isDev) {
    // 开发模式：使用 Python 直接运行
    return ''
  }
  
  // 生产模式：使用打包后的可执行文件
  const resourcesPath = process.resourcesPath
  const platform = process.platform
  
  let backendExe: string
  if (platform === 'win32') {
    backendExe = path.join(resourcesPath, 'backend', 'meta-lingo-backend.exe')
  } else {
    backendExe = path.join(resourcesPath, 'backend', 'meta-lingo-backend')
  }
  return backendExe
}

/**
 * 获取数据目录路径
 */
function getDataPath(): string {
  if (isDev) {
    return path.join(__dirname, '..', 'data')
  }
  // 生产模式：使用用户数据目录
  return path.join(app.getPath('userData'), 'data')
}

/**
 * 启动后端服务（非阻塞）
 * 返回一个Promise用于等待后端启动完成
 * @param extendedTimeout 为 true 时使用更长等待（如重试场景），给冷启动更多时间
 */
async function startBackend(extendedTimeout = false): Promise<boolean> {
  debugLocalLog({
    sessionId: 'f069eb',
    runId: 'debug-startBackend',
    hypothesisId: 'H3',
    location: 'electron/main.ts:startBackend',
    message: 'startBackend invoked',
    data: { extendedTimeout, pid: process.pid, isDev }
  })

  if (isDev) {
    // 开发模式：不启动后端，让前端自己检测后端状态
    console.log('[Backend] Development mode - backend should be started manually')
    // 不设置 backendReady，让前端通过HTTP轮询检测
    return true
  }
  
  updateStartupStatus({ 
    stage: 'starting_backend', 
    message: 'Terminating old processes...', 
    progress: 10 
  })
  
  // 先终止所有旧的后端进程，防止端口占用
  killOldBackendProcesses()
  
  // 等待一小段时间确保旧进程完全终止
  await new Promise(resolve => setTimeout(resolve, 300))
  
  const backendPath = getBackendPath()
  const dataPath = getDataPath()
  const resourcesPath = process.resourcesPath
  // #region agent log
  _dbg('H2', 'electron/main.ts:startBackend', 'start backend invoked', {
    extendedTimeout,
    isDev,
    backendPath,
    dataPath,
    resourcesPath
  })
  // #endregion
  
  if (!fs.existsSync(backendPath)) {
    console.error('[Backend] Backend executable not found:', backendPath)
    debugLocalLog({
      sessionId: 'f069eb',
      runId: 'debug-startBackend',
      hypothesisId: 'H3',
      location: 'electron/main.ts:startBackend',
      message: 'backend executable not found',
      data: { backendPath, exists: false },
    })
    updateStartupStatus({ 
      stage: 'error', 
      message: 'Backend executable not found', 
      progress: 0 
    })
    return false
  }
  
  updateStartupStatus({ 
    stage: 'starting_backend', 
    message: 'Starting backend service...', 
    progress: 20 
  })
  
  console.log('[Backend] Starting backend from:', backendPath)
  
  // 设置环境变量 - 传递 resources 路径给后端
  const env = {
    ...process.env,
    METALINGO_DATA_PATH: dataPath,
    METALINGO_PORT: String(BACKEND_PORT),
    METALINGO_RESOURCES_PATH: resourcesPath,
  }
  
  return new Promise((resolve) => {
    try {
      backendProcess = spawn(backendPath, [], {
        env,
        cwd: path.dirname(backendPath),
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: false,
      })
      // #region agent log
      _dbg('H2', 'electron/main.ts:startBackend', 'backend process spawned', { pid: backendProcess?.pid ?? null })
      debugLocalLog({
        sessionId: 'f069eb',
        runId: 'debug-startBackend',
        hypothesisId: 'H3',
        location: 'electron/main.ts:startBackend',
        message: 'backend process spawned',
        data: { pid: backendProcess?.pid ?? null },
      })
      // #endregion
      const logPath = !isDev ? path.join(app.getPath('userData'), 'backend.log') : null
      const appendLine = (line: string) => {
        if (logPath) {
          try {
            fs.appendFileSync(logPath, `${new Date().toISOString()} ${line}\n`, 'utf-8')
          } catch {}
        }
      }
      backendProcess.stdout?.on('data', (data) => {
        const output = data.toString().trim()
        console.log('[Backend]', output)
        appendLine(`[stdout] ${output}`)
        if (output.includes('Application startup complete') || output.includes('Uvicorn running')) {
          updateStartupStatus({ stage: 'checking_health', message: 'Backend started, checking health...', progress: 70 })
        }
      })
      
      backendProcess.stderr?.on('data', (data) => {
        const output = data.toString().trim()
        console.error('[Backend Error]', output)
        appendLine(`[stderr] ${output}`)
        if (output.includes('Application startup complete') || output.includes('Uvicorn running')) {
          updateStartupStatus({ stage: 'checking_health', message: 'Backend started, checking health...', progress: 70 })
        }
      })
      
      backendProcess.on('error', (err) => {
        console.error('[Backend] Failed to start:', err)
        // #region agent log
        _dbg('H3', 'electron/main.ts:startBackend', 'backend process error event', { message: err.message })
        // #endregion
        debugLocalLog({
          sessionId: 'f069eb',
          runId: 'debug-startBackend',
          hypothesisId: 'H3',
          location: 'electron/main.ts:startBackend',
          message: 'backend process error event',
          data: { message: err.message },
        })
        updateStartupStatus({ 
          stage: 'error', 
          message: `Failed to start backend: ${err.message}`, 
          progress: 0 
        })
        resolve(false)
      })
      
      backendProcess.on('close', (code, signal) => {
        console.log('[Backend] Process exited with code:', code, 'signal:', signal)
        // #region agent log
        _dbg('H3', 'electron/main.ts:startBackend', 'backend process close event', {
          code,
          signal: signal ?? null,
          attemptId: startupStatus.attemptId,
          stage: startupStatus.stage
        })
        // #endregion
        debugLocalLog({
          sessionId: 'f069eb',
          runId: 'debug-startBackend',
          hypothesisId: 'H3',
          location: 'electron/main.ts:startBackend',
          message: 'backend process close event',
          data: { code, signal: signal ?? null },
        })
        // 如果进程在健康检查完成前退出，标记为失败
        if (code !== null && code !== 0) {
          updateStartupStatus({ 
            stage: 'error', 
            message: `Backend process exited with code ${code}`, 
            progress: 0 
          })
          resolve(false)
        }
        backendProcess = null
      })
      
      // 每500ms检查一次；首次 20 秒，重试 30 秒
      const maxAttempts = extendedTimeout ? 60 : 40
      const checkInterval = 500
      let attempts = 0

      const checkLoop = async () => {
        attempts++
        const progress = Math.min(30 + Math.floor((attempts / maxAttempts) * 60), 90)
        // 只允许进度递增，避免从 70 回落到 30 导致进度条闪烁
        const nextProgress = Math.max(startupStatus.progress, progress)

        updateStartupStatus({
          stage: 'checking_health',
          message: `Checking backend health (${attempts}/${maxAttempts})...`,
          progress: nextProgress
        })

        const isRunning = await checkBackendHealth()

        if (isRunning) {
          updateStartupStatus({
            stage: 'ready',
            message: 'Backend ready!',
            progress: 100,
            backendReady: true
          })
          debugLocalLog({
            sessionId: 'f069eb',
            runId: 'debug-startBackend',
            hypothesisId: 'H3',
            location: 'electron/main.ts:checkBackendHealth',
            message: 'backend health ok',
            data: { attempts, maxAttempts },
          })
          resolve(true)
        } else if (attempts < maxAttempts) {
          setTimeout(checkLoop, checkInterval)
        } else {
          console.error('[Backend] Health check failed after', maxAttempts, 'attempts')
          updateStartupStatus({
            stage: 'error',
            message: 'Backend health check timeout',
            progress: 0
          })
          debugLocalLog({
            sessionId: 'f069eb',
            runId: 'debug-startBackend',
            hypothesisId: 'H3',
            location: 'electron/main.ts:checkBackendHealth',
            message: 'backend health timeout',
            data: { attempts, maxAttempts },
          })
          resolve(false)
        }
      }

      // 首次检查前等待500ms
      setTimeout(checkLoop, 500)
      
    } catch (err) {
      console.error('[Backend] Error starting backend:', err)
      updateStartupStatus({ 
        stage: 'error', 
        message: `Error: ${err}`, 
        progress: 0 
      })
      resolve(false)
    }
  })
}

/**
 * 检查后端健康状态（轻量 /health，短超时便于快速轮询）
 */
async function checkBackendHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${BACKEND_URL}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(3000),
    })
    return response.ok
  } catch {
    return false
  }
}

/**
 * 停止后端服务
 */
function stopBackend(): void {
  console.log('[Backend] Stopping backend process...')

  debugLocalLog({
    sessionId: 'f069eb',
    runId: 'debug-stopBackend',
    hypothesisId: 'H5',
    location: 'electron/main.ts:stopBackend',
    message: 'stopBackend invoked',
    data: { pid: process.pid, platform: process.platform }
  })

  
  if (process.platform === 'win32') {
    // Best-effort: destroy stdio pipes so Node/Electron doesn't keep references alive
    try {
      backendProcess?.stdout?.destroy()
      backendProcess?.stderr?.destroy()
    } catch {
      // ignore
    }

    debugLocalLog({
      sessionId: 'f069eb',
      runId: 'debug-stopBackend',
      hypothesisId: 'H6',
      location: 'electron/main.ts:stopBackend',
      message: 'before killing backend/mcp (tasklist snapshot)',
      data: {
        metaLingoPids: listPidsByImageNameWindows('Meta-Lingo.exe').slice(0, 20),
        backendPids: listPidsByImageNameWindows('meta-lingo-backend.exe').slice(0, 20),
        mcpPids: listPidsByImageNameWindows('meta-lingo-mcp.exe').slice(0, 20),
      },
    })

    // Windows: 强制终止所有 meta-lingo-backend 进程
    // 首先尝试终止我们启动的进程
    if (backendProcess && !backendProcess.killed) {
      try {
        backendProcess.kill()
      } catch {
        // 忽略错误
      }
    }
    
    // 然后使用 taskkill 确保所有相关进程都被终止
    try {
      // 使用 /T 终止进程树，/F 强制终止
      execSync('taskkill /F /IM meta-lingo-backend.exe /T 2>nul', { 
        stdio: 'ignore',
        timeout: 5000  // 5秒超时
      })
      console.log('[Backend] Killed all meta-lingo-backend processes via taskkill')
    } catch {
      // 忽略错误
    }

    // MCP server can be started independently (and may be left running if the app is force-closed)
    try {
      execSync('taskkill /F /IM meta-lingo-mcp.exe /T 2>nul', {
        stdio: 'ignore',
        timeout: 5000
      })
      console.log('[Backend] Killed all meta-lingo-mcp processes via taskkill')
    } catch {
      // 忽略错误
    }

    // Port-level fallback (most robust): kill anything still listening on backend port.
    killProcessListeningOnPortWindows(8000)

    debugLocalLog({
      sessionId: 'f069eb',
      runId: 'debug-portcheck-after-stop',
      hypothesisId: 'H8',
      location: 'electron/main.ts:stopBackend',
      message: 'listening PIDs on 8000 after stopBackend kill attempts',
      data: { port: 8000, pids: getListeningPidsOnPortWindows(8000).slice(0, 20) },
    })
    
    // 备用方案：使用 WMIC 终止进程
    try {
      execSync('wmic process where "name=\'meta-lingo-backend.exe\'" call terminate 2>nul', { 
        stdio: 'ignore',
        timeout: 5000
      })
      console.log('[Backend] Killed processes via WMIC')
    } catch {
      // 忽略错误
    }

    debugLocalLog({
      sessionId: 'f069eb',
      runId: 'debug-stopBackend',
      hypothesisId: 'H6',
      location: 'electron/main.ts:stopBackend',
      message: 'after killing backend/mcp (tasklist snapshot)',
      data: {
        metaLingoPids: listPidsByImageNameWindows('Meta-Lingo.exe').slice(0, 20),
        backendPids: listPidsByImageNameWindows('meta-lingo-backend.exe').slice(0, 20),
        mcpPids: listPidsByImageNameWindows('meta-lingo-mcp.exe').slice(0, 20),
      },
    })
  } else {
    // macOS/Linux
    if (backendProcess) {
      backendProcess.kill('SIGTERM')
      
      // 如果 3 秒后还没结束，强制 kill
      setTimeout(() => {
        if (backendProcess && !backendProcess.killed) {
          backendProcess.kill('SIGKILL')
        }
      }, 3000)
    }
    
    // 同时使用 pkill 确保所有相关进程都被终止
    try {
      execSync('pkill -9 -f "meta-lingo-backend" 2>/dev/null || true', { stdio: 'ignore' })
    } catch {
      // 忽略错误
    }
  }
  
  backendProcess = null
}

/**
 * 初始化数据目录
 */
function initDataDirectories(): void {
  const dataPath = getDataPath()
  const dirs = [
    dataPath,
    path.join(dataPath, 'corpora'),
    path.join(dataPath, 'annotations'),
    path.join(dataPath, 'frameworks'),
    path.join(dataPath, 'topic_modeling'),
    path.join(dataPath, 'topic_modeling', 'embeddings'),
    path.join(dataPath, 'topic_modeling', 'results'),
  ]
  
  dirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
      console.log('[Init] Created directory:', dir)
    }
  })
}

function createWindow() {
  // Mac 使用 hiddenInset 实现标题栏与页面融合
  const isMac = process.platform === 'darwin'
  const isWin = process.platform === 'win32'
  
  // Mac 使用 hiddenInset 实现标题栏与页面融合；Windows 通过 hidden + titleBarOverlay 融合后不再需要额外高度补偿
  const windowHeight = isMac ? 930 : 930
  const minWindowHeight = isMac ? 930 : 930
  
  // 获取主显示器信息，用于设置最大尺寸限制
  const primaryDisplay = screen.getPrimaryDisplay()
  const { width: availableWidth, height: availableHeight } = primaryDisplay.workAreaSize
  
  // 理想窗口大小
  const idealWidth = 1458
  const idealHeight = windowHeight
  
  // 计算实际窗口大小（不超过屏幕可用空间）
  const actualWidth = Math.min(idealWidth, availableWidth)
  const actualHeight = Math.min(idealHeight, availableHeight)
  
  // 计算最小尺寸（也不能超过屏幕可用空间）
  const actualMinWidth = Math.min(1458, availableWidth)
  const actualMinHeight = Math.min(minWindowHeight, availableHeight)
  
  mainWindow = new BrowserWindow({
    width: actualWidth,
    height: actualHeight,
    minWidth: actualMinWidth,
    minHeight: actualMinHeight,
    // Avoid constraining fullscreen size on macOS. Using workArea-based max size
    // can leave a black strip after Space swipe / return in fullscreen.
    ...(isMac ? {} : { maxWidth: availableWidth, maxHeight: availableHeight }),
    // Windows taskbar/alt-tab icon:
    // Use multi-resolution ICO for Windows taskbar/alt-tab to avoid scaling/cropping issues.
    icon: isWin
      ? path.join(__dirname, '../assets/icons/icon.ico')
      : path.join(__dirname, '../assets/icons/icon_256x256.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // Allow Web Audio API to work properly in packaged app
      webSecurity: false,  // Allow file:// to access http://localhost
      allowRunningInsecureContent: true,  // Allow mixed content
    },
    frame: true,
    titleBarStyle: isMac ? 'hiddenInset' : 'hidden',
    ...(isMac ? {} : { titleBarOverlay: { height: 48, color: 'transparent', symbolColor: '#fff' } }),
    trafficLightPosition: isMac ? { x: 16, y: 14 } : undefined,
    center: true,
    show: false
  })

  debugLocalLog({
    sessionId: 'f069eb',
    runId: 'debug-ui',
    hypothesisId: 'H10',
    location: 'electron/main.ts:createWindow',
    message: 'BrowserWindow created (initial hidden)',
    data: {
      winId: mainWindow.id,
      isVisible: mainWindow.isVisible(),
      isDestroyed: mainWindow.isDestroyed(),
      showFlag: false,
    },
  })

  mainWindow.once('ready-to-show', () => {
    const win = mainWindow
    const before = win?.isVisible()
    win?.show()
    debugLocalLog({
      sessionId: 'f069eb',
      runId: 'debug-ui',
      hypothesisId: 'H10',
      location: 'electron/main.ts:createWindow:ready-to-show',
      message: 'ready-to-show fired (show executed)',
      data: {
        winId: win?.id,
        isVisibleBefore: before,
        isVisibleAfter: win?.isVisible(),
      },
    })
  })

  // 页面加载完成后，立即推送最新启动状态（覆盖 loading 阶段的丢失事件）
  mainWindow.webContents.on('did-finish-load', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      // Windows packaged flow can occasionally miss `ready-to-show`;
      // ensure the window is visible once content has finished loading.
      if (!mainWindow.isVisible()) {
        mainWindow.show()
        debugLocalLog({
          sessionId: 'f069eb',
          runId: 'debug-ui',
          hypothesisId: 'H10',
          location: 'electron/main.ts:createWindow:did-finish-load',
          message: 'fallback show in did-finish-load',
          data: { winId: mainWindow.id, isVisibleAfter: mainWindow.isVisible() },
        })
      }
      mainWindow.webContents.send('startup-status-changed', startupStatus)
      debugLocalLog({
        sessionId: 'f069eb',
        runId: 'debug-ui',
        hypothesisId: 'H10',
        location: 'electron/main.ts:createWindow:did-finish-load',
        message: 'did-finish-load fired',
        data: { winId: mainWindow.id, url: mainWindow.webContents.getURL() },
      })
    }
  })

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    debugLocalLog({
      sessionId: 'f069eb',
      runId: 'debug-ui',
      hypothesisId: 'H10',
      location: 'electron/main.ts:createWindow:did-fail-load',
      message: 'did-fail-load fired',
      data: { errorCode, errorDescription, validatedURL, winId: mainWindow?.id ?? null },
    })
  })

  // Track fullscreen state changes and notify renderer
  mainWindow.on('enter-full-screen', () => {
    // macOS: force window to match display bounds to avoid bottom black area
    // after switching Spaces and returning.
    if (isMac && mainWindow && !mainWindow.isDestroyed()) {
      const display = screen.getDisplayMatching(mainWindow.getBounds())
      mainWindow.setBounds(display.bounds, false)
    }
    mainWindow?.webContents.send('fullscreen-changed', true)
  })
  
  mainWindow.on('leave-full-screen', () => {
    mainWindow?.webContents.send('fullscreen-changed', false)
  })

  mainWindow.on('focus', () => {
    if (!isMac || !mainWindow || mainWindow.isDestroyed()) return
    if (!mainWindow.isFullScreen()) return
    // Re-apply fullscreen bounds when app regains focus from another Space.
    const display = screen.getDisplayMatching(mainWindow.getBounds())
    mainWindow.setBounds(display.bounds, false)
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null

    // Windows 专用：确保窗口关闭后主进程一定退出
    if (process.platform === 'win32' && !isAppClosing) {
      isAppClosing = true
      try {
        stopBackend()
      } catch {
        // ignore
      }
      try {
        killLeftoverMetaLingoProcesses()
      } catch {
        // ignore
      }
      try {
        app.exit(0)
      } catch {
        // ignore
      }
    }
  })

  // Windows: when user clicks the native close button,
  // make sure we stop backend + exit even if window-all-closed/before-quit chain is skipped.
  mainWindow.on('close', () => {
    if (process.platform !== 'win32' || isAppClosing) return
    isAppClosing = true


    try {
      stopBackend()
    } catch {
      // ignore
    }
    try {
      killLeftoverMetaLingoProcesses()
    } catch {
      // ignore
    }
    try {
      app.exit(0)
    } catch {
      // ignore
    }
  })

  // Handle external links
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
}

app.whenReady().then(async () => {
  // 初始化数据目录
  initDataDirectories()
  
  // 先创建窗口（立即显示启动画面）
  createWindow()
  
  // 并行启动后端（窗口已经显示，用户可以看到启动进度）
  startBackend().then((backendStarted) => {
    if (!backendStarted && !isDev) {
      console.error('[App] Failed to start backend')
      updateStartupStatus({
        stage: 'error',
        message: 'Failed to start backend service',
        progress: 0
      })
    }
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('second-instance', () => {
  // If the second click happens while the first instance is closing,
  // `mainWindow` may be null/destroyed/hidden, resulting in "process starts but no UI".
  debugLocalLog({
    sessionId: 'f069eb',
    runId: 'debug-second-instance',
    hypothesisId: 'H9',
    location: 'electron/main.ts:second-instance',
    message: 'second-instance handler snapshot',
    data: {
      pid: process.pid,
      isAppClosing,
      mainWindowExists: !!mainWindow,
      mainWindowDestroyed: mainWindow ? mainWindow.isDestroyed() : null,
      mainWindowVisible: mainWindow ? mainWindow.isVisible() : null,
      mainWindowMinimized: mainWindow ? mainWindow.isMinimized() : null,
      windowsCount: BrowserWindow.getAllWindows().length,
    },
  })

  // Prefer the current `mainWindow`, but fall back to any existing BrowserWindow.
  const candidateWindow =
    mainWindow && !mainWindow.isDestroyed()
      ? mainWindow
      : BrowserWindow.getAllWindows()[0] ?? null

  if (!candidateWindow) {
    if (process.platform === 'win32') {
      // Recreate UI if the app is still alive but no window exists.
      isAppClosing = false
      createWindow()
    }
    return
  }

  if (candidateWindow.isMinimized()) candidateWindow.restore()
  if (!candidateWindow.isVisible()) candidateWindow.show()
  candidateWindow.focus()
})

app.on('window-all-closed', () => {
  // 在 Windows 上，关闭所有窗口时先停止后端再退出
  if (process.platform !== 'darwin') {
    stopBackend()
    // app.quit() can hang when hidden windows/handles remain.
    // Use app.exit(0) on Windows to guarantee full process termination.
    if (process.platform === 'win32') {
      app.exit(0)
    } else {
      app.quit()
    }
  }
})

app.on('before-quit', () => {
  stopBackend()
})

app.on('quit', () => {
  stopBackend()
})

// Windows 专用：确保进程完全退出
app.on('will-quit', () => {
  stopBackend()
})

// IPC handlers
ipcMain.handle('get-app-path', () => {
  return app.getAppPath()
})

ipcMain.handle('get-user-data-path', () => {
  return app.getPath('userData')
})

ipcMain.handle('set-title-bar-overlay', (_event, options: { color?: string; symbolColor?: string; height?: number }) => {
  if (!mainWindow) return false
  try {
    mainWindow.setTitleBarOverlay(options)
    return true
  } catch {
    return false
  }
})

ipcMain.handle('get-backend-url', () => {
  return BACKEND_URL
})

ipcMain.handle('check-backend-health', async () => {
  return await checkBackendHealth()
})

ipcMain.handle('get-platform', () => {
  return process.platform
})

ipcMain.handle('is-fullscreen', () => {
  return mainWindow?.isFullScreen() ?? false
})

ipcMain.handle('get-mcp-path', () => {
  const isDev = !app.isPackaged
  if (isDev) {
    return { command: 'python', args: ['-m', 'mcp_server'], cwd: path.join(__dirname, '..', 'backend') }
  }
  const mcpPath = path.join(process.resourcesPath, 'mcp-server', 'meta-lingo-mcp')
  return { command: mcpPath, args: [], cwd: '' }
})

/**
 * 继续轮询健康检查（后端进程仍在运行，只是尚未就绪）
 * 不杀死后端，给它额外 20 秒时间，避免杀掉快好了的进程再从零重启
 */
async function resumeHealthCheck(): Promise<boolean> {
  return new Promise((resolve) => {
    const maxAttempts = 40   // 20 秒，和首次启动保持一致
    const checkInterval = 500
    let attempts = 0

    const checkLoop = async () => {
      attempts++
      updateStartupStatus({
        stage: 'checking_health',
        message: `Checking backend health (${attempts}/${maxAttempts})...`,
        progress: Math.min(30 + Math.floor((attempts / maxAttempts) * 60), 90)
      })

      const isRunning = await checkBackendHealth()

      if (isRunning) {
        updateStartupStatus({ stage: 'ready', message: 'Backend ready!', progress: 100, backendReady: true })
        resolve(true)
      } else if (attempts < maxAttempts) {
        setTimeout(checkLoop, checkInterval)
      } else {
        updateStartupStatus({ stage: 'error', message: 'Backend health check timeout', progress: 0 })
        resolve(false)
      }
    }

    setTimeout(checkLoop, checkInterval)
  })
}

// 启动状态相关IPC
ipcMain.handle('get-startup-status', () => {
  return startupStatus
})

ipcMain.handle('retry-backend', async () => {
  if (startupStatus.stage === 'error') {
    // 始终完整重启：先终止当前进程，再重新 startBackend，并给重试更长等待
    console.log('[Retry] Full restart (kill + startBackend with extended timeout)')
    updateStartupStatus({
      stage: 'initializing',
      message: 'Restarting...',
      progress: 0,
      backendReady: false,
      attemptId: startupStatus.attemptId + 1,
    })
    stopBackend()
    await new Promise(resolve => setTimeout(resolve, 2000))
    // #region agent log
    _dbg('H3', 'electron/main.ts:retry-backend', 'manual retry requested', { attemptId: startupStatus.attemptId })
    // #endregion
    const restarted = await startBackend(true)
    return restarted
  }
  return startupStatus.backendReady
})

// Read help files from help directory
ipcMain.handle('read-help-files', async () => {
  const helpDir = isDev 
    ? path.join(app.getAppPath(), 'help')
    : path.join(process.resourcesPath, 'help')
  
  try {
    const files = await fs.promises.readdir(helpDir)
    const mdFiles = files.filter(f => f.endsWith('.md'))
    
    const helpFiles = await Promise.all(
      mdFiles.map(async (filename) => {
        const content = await fs.promises.readFile(path.join(helpDir, filename), 'utf-8')
        return {
          filename: filename.replace('.md', ''),
          content
        }
      })
    )
    
    return helpFiles
  } catch {
    return []
  }
})

// Get resource path for assets
ipcMain.handle('get-resource-path', async (_event, relativePath: string) => {
  const basePath = isDev 
    ? app.getAppPath()
    : process.resourcesPath
  
  const fullPath = path.join(basePath, relativePath)
  // Return file:// URL for use in img src
  return `file://${fullPath}`
})

// Open file dialog
ipcMain.handle('open-file-dialog', async (_event, options) => {
  const { dialog } = await import('electron')
  const result = await dialog.showOpenDialog(mainWindow!, options)
  return result
})

// Save file dialog
ipcMain.handle('save-file-dialog', async (_event, options) => {
  const { dialog } = await import('electron')
  const result = await dialog.showSaveDialog(mainWindow!, options)
  return result
})

// Export HTML content to PDF using Electron's printToPDF (native quality, CJK support)
ipcMain.handle('export-to-pdf', async (_event, htmlContent: string, defaultFilename: string) => {
  // Ask user where to save
  const saveResult = await dialog.showSaveDialog(mainWindow!, {
    defaultPath: defaultFilename,
    filters: [{ name: 'PDF', extensions: ['pdf'] }]
  })
  if (saveResult.canceled || !saveResult.filePath) return { success: false, canceled: true }

  // Create a hidden off-screen window to render the HTML
  const printWin = new BrowserWindow({
    show: false,
    width: 900,
    height: 1200,
    webPreferences: { nodeIntegration: false, contextIsolation: true }
  })
  // Write HTML to a temp file — data: URLs are limited to ~2 MB in Chromium
  // and silently produce a blank page for larger documents.
  const tmpHtmlPath = path.join(app.getPath('temp'), `ml-pdf-${Date.now()}.html`)
  fs.writeFileSync(tmpHtmlPath, htmlContent, 'utf-8')
  try {
    // loadFile() bypasses the data-URL size limit
    await printWin.loadFile(tmpHtmlPath)
    // Give CSS/fonts time to settle before printing
    await new Promise(resolve => setTimeout(resolve, 500))
    const pdfBuffer = await printWin.webContents.printToPDF({
      pageSize: 'A4',
      printBackground: true,
      margins: { marginType: 'custom', top: 0.5, bottom: 0.5, left: 0.5, right: 0.5 }
    })
    fs.writeFileSync(saveResult.filePath, pdfBuffer)
    return { success: true, filePath: saveResult.filePath }
  } catch (err: any) {
    return { success: false, error: err?.message || String(err) }
  } finally {
    printWin.destroy()
    // Clean up the temp HTML file (best-effort)
    try { fs.unlinkSync(tmpHtmlPath) } catch {}
  }
})
