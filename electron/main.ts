import { app, BrowserWindow, ipcMain, shell, screen } from 'electron'
import path from 'path'
import { spawn, ChildProcess, execSync } from 'child_process'
import fs from 'fs'

// Chromium flags to fix Web Audio API crash when decoding large audio files in packaged app
// This increases memory limits and disables some security restrictions
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=4096')
app.commandLine.appendSwitch('disable-features', 'AudioServiceOutOfProcess')

let mainWindow: BrowserWindow | null = null
let backendProcess: ChildProcess | null = null

// 启动状态管理
interface StartupStatus {
  stage: 'initializing' | 'starting_backend' | 'checking_health' | 'ready' | 'error'
  message: string
  progress: number  // 0-100
  backendReady: boolean
}

let startupStatus: StartupStatus = {
  stage: 'initializing',
  message: 'Initializing...',
  progress: 0,
  backendReady: false
}

function updateStartupStatus(update: Partial<StartupStatus>) {
  startupStatus = { ...startupStatus, ...update }
  // 发送状态更新到渲染进程（确保webContents已准备好）
  if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents) {
    // 使用 whenReady 确保渲染进程已准备好接收消息
    if (!mainWindow.webContents.isLoading()) {
      mainWindow.webContents.send('startup-status-changed', startupStatus)
    }
  }
}

/**
 * 终止所有旧的后端进程（防止端口占用）
 */
function killOldBackendProcesses(): void {
  const platform = process.platform
  try {
    if (platform === 'darwin' || platform === 'linux') {
      // macOS/Linux: 使用 pkill 终止所有 meta-lingo-backend 进程
      execSync('pkill -9 -f "meta-lingo-backend" 2>/dev/null || true', { stdio: 'ignore' })
    } else if (platform === 'win32') {
      // Windows: 使用 taskkill 终止进程
      execSync('taskkill /F /IM meta-lingo-backend.exe 2>nul || echo.', { stdio: 'ignore' })
    }
    console.log('[Backend] Killed any old backend processes')
  } catch (err) {
    // 忽略错误（可能没有旧进程需要终止）
    console.log('[Backend] No old backend processes to kill')
  }
}

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged

// 后端配置
const BACKEND_PORT = 8000
const BACKEND_URL = `http://localhost:${BACKEND_PORT}`

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
 */
async function startBackend(): Promise<boolean> {
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
  
  if (!fs.existsSync(backendPath)) {
    console.error('[Backend] Backend executable not found:', backendPath)
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
    METALINGO_RESOURCES_PATH: resourcesPath,  // 新增：传递 resources 路径
  }
  
  return new Promise((resolve) => {
    try {
      backendProcess = spawn(backendPath, [], {
        env,
        cwd: path.dirname(backendPath),
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: false,
      })
      
      backendProcess.stdout?.on('data', (data) => {
        const output = data.toString().trim()
        console.log('[Backend]', output)
        // 检测uvicorn启动完成的标志
        if (output.includes('Application startup complete') || output.includes('Uvicorn running')) {
          updateStartupStatus({ 
            stage: 'checking_health', 
            message: 'Backend started, checking health...', 
            progress: 70 
          })
        }
      })
      
      backendProcess.stderr?.on('data', (data) => {
        const output = data.toString().trim()
        console.error('[Backend Error]', output)
      })
      
      backendProcess.on('error', (err) => {
        console.error('[Backend] Failed to start:', err)
        updateStartupStatus({ 
          stage: 'error', 
          message: `Failed to start backend: ${err.message}`, 
          progress: 0 
        })
        resolve(false)
      })
      
      backendProcess.on('close', (code, signal) => {
        console.log('[Backend] Process exited with code:', code, 'signal:', signal)
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
      
      // 加快健康检查频率：最多等待20秒，每500ms检查一次
      const maxAttempts = 40
      const checkInterval = 500
      let attempts = 0
      
      const checkLoop = async () => {
        attempts++
        const progress = Math.min(30 + Math.floor((attempts / maxAttempts) * 60), 90)
        
        updateStartupStatus({ 
          stage: 'checking_health', 
          message: `Checking backend health (${attempts}/${maxAttempts})...`, 
          progress 
        })
        
        const isRunning = await checkBackendHealth()
        
        if (isRunning) {
          updateStartupStatus({ 
            stage: 'ready', 
            message: 'Backend ready!', 
            progress: 100,
            backendReady: true 
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
 * 检查后端健康状态
 */
async function checkBackendHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${BACKEND_URL}/api/corpus/services/status`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
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
  
  if (process.platform === 'win32') {
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
  
  // Windows 标题栏占用额外高度，需要补偿
  const windowHeight = isMac ? 930 : 965
  const minWindowHeight = isMac ? 930 : 965
  
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
    maxWidth: availableWidth,
    maxHeight: availableHeight,
    icon: path.join(__dirname, '../assets/icons/icon_256x256.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // Allow Web Audio API to work properly in packaged app
      webSecurity: false,  // Allow file:// to access http://localhost
      allowRunningInsecureContent: true,  // Allow mixed content
    },
    frame: true,
    titleBarStyle: isMac ? 'hiddenInset' : 'default',
    trafficLightPosition: isMac ? { x: 16, y: 14 } : undefined,
    center: true,
    show: false
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  // Track fullscreen state changes and notify renderer
  mainWindow.on('enter-full-screen', () => {
    mainWindow?.webContents.send('fullscreen-changed', true)
  })
  
  mainWindow.on('leave-full-screen', () => {
    mainWindow?.webContents.send('fullscreen-changed', false)
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
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

app.on('window-all-closed', () => {
  // 在 Windows 上，关闭所有窗口时先停止后端再退出
  if (process.platform !== 'darwin') {
    stopBackend()
    app.quit()
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

// 启动状态相关IPC
ipcMain.handle('get-startup-status', () => {
  return startupStatus
})

ipcMain.handle('retry-backend', async () => {
  if (startupStatus.stage === 'error') {
    updateStartupStatus({
      stage: 'initializing',
      message: 'Retrying...',
      progress: 0,
      backendReady: false
    })
    return await startBackend()
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
