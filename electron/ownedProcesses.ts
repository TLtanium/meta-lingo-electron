import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const run = promisify(execFile)
export interface ProcessInfo { pid: number; parent: number; command: string; executable?: string; zombie?: boolean }

export async function processSnapshot(platform = process.platform): Promise<ProcessInfo[]> {
  if (platform === 'win32') {
    const { stdout } = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
      'Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,ExecutablePath | ConvertTo-Json -Compress'], { timeout: 5000, windowsHide: true })
    const data = JSON.parse(stdout || '[]')
    return (Array.isArray(data) ? data : [data]).map(p => ({ pid: Number(p.ProcessId), parent: Number(p.ParentProcessId), command: p.ExecutablePath || '', executable: p.ExecutablePath || '' }))
  }
  const { stdout } = await run('/bin/ps', ['-axo', 'pid=,ppid=,stat=,command='], { timeout: 5000 })
  return stdout.split('\n').flatMap(line => {
    const m = line.match(/^\s*(\d+)\s+(\d+)\s+(\S+)\s+(.+)$/)
    return m ? [{ pid: Number(m[1]), parent: Number(m[2]), zombie: m[3].startsWith('Z'), command: m[4] }] : []
  })
}

/** Match this installation's complete executable path, never a process name or port. */
export function ownedProcessTree(snapshot: ProcessInfo[], rootPid: number | undefined, executables: string[], selfPid = process.pid, platform = process.platform): ProcessInfo[] {
  const matches = (p: ProcessInfo) => executables.some(file => platform === 'win32'
    ? p.executable?.toLowerCase() === file.toLowerCase()
    : p.command === file || p.command.startsWith(file + ' ') || p.command.startsWith(`"${file}" `))
  const selected = new Set(snapshot.filter(p => p.pid !== selfPid && (p.pid === rootPid || matches(p))).map(p => p.pid))
  let changed = true
  while (changed) {
    changed = false
    for (const p of snapshot) if (p.pid !== selfPid && !selected.has(p.pid) && selected.has(p.parent)) { selected.add(p.pid); changed = true }
  }
  // Descendants first; the parent's process table entry survives until its children are signalled.
  const depth = (p: ProcessInfo) => { let n = 0, parent = p.parent; const seen = new Set<number>(); while (selected.has(parent) && !seen.has(parent)) { seen.add(parent); n++; parent = snapshot.find(x => x.pid === parent)?.parent ?? 0 } return n }
  return snapshot.filter(p => selected.has(p.pid)).sort((a, b) => depth(b) - depth(a))
}

export async function terminateOwnedProcesses(options: { rootPid?: number; executables: string[]; platform?: NodeJS.Platform }): Promise<void> {
  const platform = options.platform ?? process.platform
  const targets = ownedProcessTree(await processSnapshot(platform), options.rootPid, options.executables, process.pid, platform)
  for (const p of targets) {
    if (p.zombie) continue
    if (platform === 'win32') {
      try { await run('taskkill', ['/PID', String(p.pid), '/T', '/F'], { timeout: 5000, windowsHide: true }) } catch { /* verify below: a descendant may have already exited */ }
    } else {
      try { process.kill(p.pid, 'SIGKILL') } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error }
    }
  }
  // Verify completion before scheduling the fresh application instance.
  for (let attempt = 0; attempt < 20; attempt++) {
    const current = await processSnapshot(platform)
    const survivors = targets.filter(p => current.some(now => now.pid === p.pid && now.command === p.command && !now.zombie))
    if (!survivors.length) return
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  throw new Error('Application helper processes did not exit')
}
