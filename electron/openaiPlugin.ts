import fs from 'node:fs/promises'
import path from 'node:path'

export interface OpenAIPluginPaths {
  templatePath: string
  binaryPath: string
  marketplaceRoot: string
  backendUrl: string
}

export interface OpenAIPluginInfo {
  ready: boolean
  reason?: 'missingBinary' | 'missingTemplate' | 'desktopRequired'
  development?: boolean
}

export interface OpenAIPluginResult {
  success: boolean
  errorCode?: 'missingBinary' | 'missingTemplate' | 'prepareFailed' | 'openFailed' | 'desktopRequired' | 'notEnabled'
  link?: string
  detail?: string
}

async function isFile(file: string): Promise<boolean> {
  return fs.stat(file).then(stat => stat.isFile()).catch(() => false)
}

export async function getOpenAIPluginInfo(paths: OpenAIPluginPaths): Promise<OpenAIPluginInfo> {
  if (!await isFile(paths.binaryPath)) return { ready: false, reason: 'missingBinary' }
  for (const relative of ['.codex-plugin/plugin.json', 'skills/meta-lingo/SKILL.md']) {
    if (!await isFile(path.join(paths.templatePath, relative))) {
      return { ready: false, reason: 'missingTemplate' }
    }
  }
  return { ready: true }
}

/** A self-contained private catalog; never edits the user's personal marketplace or config. */
export async function prepareOpenAIPlugin(paths: OpenAIPluginPaths): Promise<string> {
  const info = await getOpenAIPluginInfo(paths)
  if (!info.ready) throw new Error(info.reason)
  const pluginPath = path.join(paths.marketplaceRoot, 'plugins', 'meta-lingo')
  const marketplacePath = path.join(paths.marketplaceRoot, '.agents', 'plugins', 'marketplace.json')
  const staging = await fs.mkdtemp(path.join(await ensureDirectory(paths.marketplaceRoot), '.prepare-'))
  try {
    await fs.cp(paths.templatePath, staging, { recursive: true })
    // Absolute executable paths survive the host copying the plugin into its own cache.
    // Reuse the app's PyInstaller bundle: no user Python, Conda, Node or network dependency.
    await writeJson(path.join(staging, '.mcp.json'), {
      mcpServers: {
        'meta-lingo': {
          command: paths.binaryPath,
          args: ['--backend-url', paths.backendUrl, '--transport', 'stdio'],
          cwd: path.dirname(paths.binaryPath),
          env: { MCP_MODEL_NAME: 'OpenAI (MCP)' },
          startup_timeout_sec: 60,
          tool_timeout_sec: 900,
        },
      },
    })
    await fs.mkdir(path.dirname(pluginPath), { recursive: true })
    await fs.cp(staging, pluginPath, { recursive: true })
    await writeJson(marketplacePath, {
      name: 'meta-lingo-local',
      interface: { displayName: 'MetaLingo · Local' },
      plugins: [{
        name: 'meta-lingo',
        source: { source: 'local', path: './plugins/meta-lingo' },
        policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' },
        category: 'Education & Research',
      }],
    })
  } finally {
    await fs.rm(staging, { recursive: true, force: true })
  }
  const link = new URL('codex://plugins/meta-lingo')
  link.searchParams.set('marketplacePath', marketplacePath)
  return link.toString()
}

async function ensureDirectory(directory: string): Promise<string> {
  await fs.mkdir(directory, { recursive: true })
  return directory
}

async function writeJson(file: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true })
  const temporary = `${file}.tmp`
  await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  await fs.rename(temporary, file)
}

/** Opening the detail page is a handoff, not proof that the user installed the plugin. */
export async function openOpenAIPlugin(
  paths: OpenAIPluginPaths,
  openExternal: (url: string) => Promise<void>,
): Promise<OpenAIPluginResult> {
  const info = await getOpenAIPluginInfo(paths)
  if (!info.ready) return { success: false, errorCode: info.reason }
  let link: string
  try {
    link = await prepareOpenAIPlugin(paths)
  } catch (error) {
    return { success: false, errorCode: 'prepareFailed', detail: String(error) }
  }
  try {
    await openExternal(link)
    return { success: true }
  } catch (error) {
    return { success: false, errorCode: 'openFailed', detail: String(error) }
  }
}
