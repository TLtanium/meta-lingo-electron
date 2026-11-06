const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')

async function loadInstaller() {
  const file = path.resolve('electron/openaiPlugin.ts')
  const instance = new Module(file, module)
  instance.filename = file
  instance.paths = module.paths
  instance._compile(ts.transpileModule(await fs.readFile(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true, target: ts.ScriptTarget.ES2022 },
  }).outputText, file)
  return instance.exports
}

async function fixture(t, executable = 'meta-lingo-mcp') {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'metalingo-plugin-test-'))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  const binaryPath = path.join(root, 'Meta Lingo 中文', 'mcp-server', executable)
  await fs.mkdir(path.dirname(binaryPath), { recursive: true })
  await fs.writeFile(binaryPath, 'test executable')
  return {
    templatePath: path.resolve('openai-plugin'), binaryPath,
    marketplaceRoot: path.join(root, '应用数据', 'private-marketplace'),
    backendUrl: 'http://127.0.0.1:8000',
  }
}

test('private catalog resolves the plugin and retains executable arguments after host caching', async t => {
  const installer = await loadInstaller()
  for (const executable of ['meta-lingo-mcp', 'meta-lingo-mcp.exe']) {
    const paths = await fixture(t, executable)
    const link = new URL(await installer.prepareOpenAIPlugin(paths))
    assert.equal(link.protocol, 'codex:')
    assert.equal(link.host, 'plugins')
    assert.equal(link.pathname, '/meta-lingo')
    const catalogFile = link.searchParams.get('marketplacePath')
    const catalog = JSON.parse(await fs.readFile(catalogFile, 'utf8'))
    const plugin = path.resolve(paths.marketplaceRoot, catalog.plugins[0].source.path)
    const cached = path.join(paths.marketplaceRoot, 'host-cache')
    await fs.cp(plugin, cached, { recursive: true })
    const manifest = JSON.parse(await fs.readFile(path.join(cached, '.codex-plugin/plugin.json'), 'utf8'))
    const config = JSON.parse(await fs.readFile(path.join(cached, manifest.mcpServers), 'utf8'))
    assert.equal(manifest.name, 'meta-lingo')
    assert.match(await fs.readFile(path.join(cached, manifest.skills, 'meta-lingo/SKILL.md'), 'utf8'), /name: meta-lingo/)
    const server = config.mcpServers['meta-lingo']
    assert.equal(server.command, paths.binaryPath)
    assert.deepEqual(server.args, ['--backend-url', paths.backendUrl, '--transport', 'stdio'])
    assert.equal(server.cwd, path.dirname(paths.binaryPath))
    assert.equal(server.env.MCP_MODEL_NAME, 'OpenAI (MCP)')
    assert.equal((await fs.stat(server.command)).isFile(), true)
  }
})

test('missing packaged resources prevent handoff; never substitutes developer Python', async t => {
  const installer = await loadInstaller()
  const paths = await fixture(t)
  await fs.unlink(paths.binaryPath)
  const mustNotOpen = () => assert.fail('should not open an unusable plugin')
  assert.deepEqual(await installer.openOpenAIPlugin(paths, mustNotOpen), { success: false, errorCode: 'missingBinary' })
  await fs.writeFile(paths.binaryPath, '')
  paths.templatePath = path.join(paths.marketplaceRoot, 'missing-template')
  assert.deepEqual(await installer.openOpenAIPlugin(paths, mustNotOpen), { success: false, errorCode: 'missingTemplate' })
})

test('repeated preparation refreshes this catalog and preserves neighboring user data', async t => {
  const installer = await loadInstaller()
  const paths = await fixture(t)
  await fs.mkdir(paths.marketplaceRoot, { recursive: true })
  const unrelated = path.join(paths.marketplaceRoot, 'user-notes.txt')
  await fs.writeFile(unrelated, 'keep')
  const first = await installer.prepareOpenAIPlugin(paths)
  paths.backendUrl = 'http://127.0.0.1:8111'
  const second = await installer.prepareOpenAIPlugin(paths)
  assert.equal(first, second)
  assert.equal(await fs.readFile(unrelated, 'utf8'), 'keep')
  const config = JSON.parse(await fs.readFile(path.join(paths.marketplaceRoot, 'plugins/meta-lingo/.mcp.json'), 'utf8'))
  assert.ok(config.mcpServers['meta-lingo'].args.includes(paths.backendUrl))
  assert.ok(!(await fs.readdir(paths.marketplaceRoot)).some(name => name.startsWith('.prepare-')))
})

test('handoff failures and filesystem failures are distinct', async t => {
  const installer = await loadInstaller()
  const paths = await fixture(t)
  let opened
  assert.deepEqual(await installer.openOpenAIPlugin(paths, async url => { opened = url }), { success: true })
  assert.ok(new URL(opened).searchParams.get('marketplacePath'))
  const rejected = await installer.openOpenAIPlugin(paths, async () => { throw new Error('no handler') })
  assert.equal(rejected.errorCode, 'openFailed')
  paths.marketplaceRoot = paths.binaryPath // File is not a writable directory.
  const failed = await installer.openOpenAIPlugin(paths, async () => assert.fail('must not launch'))
  assert.equal(failed.errorCode, 'prepareFailed')
})

test('electron-builder includes hidden manifest and all bundled skill files', async () => {
  const { FileMatcher } = require('app-builder-lib/out/fileMatcher')
  const { copyDir } = require('builder-util/out/fs')
  const config = JSON.parse(await fs.readFile('electron-builder.json', 'utf8'))
  const entry = config.extraResources.find(item => item.to === 'openai-plugin')
  assert.ok(entry, 'packaged application must include plugin resources')
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'metalingo-resource-test-'))
  try {
    const matcher = new FileMatcher(path.resolve(entry.from), temporary, value => value, entry.filter)
    await copyDir(matcher.from, matcher.to, { filter: matcher.createFilter() })
    assert.equal((await fs.stat(path.join(temporary, '.codex-plugin/plugin.json'))).isFile(), true)
    assert.equal((await fs.stat(path.join(temporary, 'skills/meta-lingo/SKILL.md'))).isFile(), true)
    assert.equal((await fs.stat(path.join(temporary, 'skills/meta-lingo/agents/openai.yaml'))).isFile(), true)
  } finally {
    await fs.rm(temporary, { recursive: true, force: true })
  }
})
