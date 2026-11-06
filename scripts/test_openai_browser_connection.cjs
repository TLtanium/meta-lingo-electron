const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')

function harness(api, bridge, navigate = () => {}) {
  const js = ts.transpileModule(fs.readFileSync('src/api/openaiPlugin.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText
  const context = vm.createContext({ exports: {}, URL, window: { electronAPI: bridge, location: { assign: navigate } },
    require(name) { assert.equal(name, './client'); return { __esModule: true, default: api } } })
  vm.runInContext(js, context)
  return context.exports
}

test('browser development uses backend readiness and hands the generated private link to the client', async () => {
  const link = 'codex://plugins/meta-lingo?marketplacePath=%2Ftmp%2Fprivate%2Fmarketplace.json'
  let navigated
  const actions = []
  const api = harness({
    get: async route => { actions.push(route); return { data: { data: { ready: true, development: true } } } },
    post: async route => { actions.push(route); return { data: { success: true, link } } },
  }, undefined, url => { navigated = url })
  assert.equal((await api.getOpenAIConnectionInfo()).ready, true)
  const result = await api.connectOpenAIPlugin()
  assert.equal(result.success, true)
  assert.equal(result.link, link)
  assert.equal(navigated, link)
  assert.deepEqual(actions, ['/api/mcp/openai-plugin/info', '/api/mcp/openai-plugin/prepare'])
})

test('packaged native bridge remains preferred and does not call developer routes', async () => {
  const api = harness({}, {
    getOpenAIPluginInfo: async () => ({ ready: true }),
    openOpenAIPlugin: async () => ({ success: true }),
  }, () => assert.fail('native flow must use Electron shell'))
  assert.equal((await api.getOpenAIConnectionInfo()).ready, true)
  assert.equal((await api.connectOpenAIPlugin()).success, true)
})

test('blocked browser navigation preserves an explicit retry link and rejects other protocols', async () => {
  const link = 'codex://plugins/meta-lingo?marketplacePath=%2Ftmp%2Fmarketplace.json'
  let result = await harness({ post: async () => ({ data: { success: true, link } }) }, undefined,
    () => { throw new Error('browser blocked') }).connectOpenAIPlugin()
  assert.equal(result.errorCode, 'openFailed')
  assert.equal(result.link, link)
  result = await harness({ post: async () => ({ data: { success: true, link: 'https://example.com' } }) }, undefined,
    () => assert.fail('must not open unrelated URL')).connectOpenAIPlugin()
  assert.equal(result.errorCode, 'prepareFailed')
})

test('disabled MCP does not navigate', async () => {
  const result = await harness({ post: async () => ({ data: { success: false, errorCode: 'notEnabled' } }) }, undefined,
    () => assert.fail('MCP must be enabled first')).connectOpenAIPlugin()
  assert.equal(result.errorCode, 'notEnabled')
})

function nativeHarness(packaged) {
  const handlers = new Map()
  const events = []
  const js = ts.transpileModule(fs.readFileSync('electron/openaiPluginIPC.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText
  const context = vm.createContext({
    exports: {}, URL, __dirname: '/project/dist-electron', process: { platform: 'darwin', resourcesPath: '/app/resources' },
    fetch: async (url, options) => {
      events.push({ url, method: options.method })
      return { ok: true, json: async () => options.method === 'GET'
        ? { success: true, data: { ready: true, development: true } }
        : { success: true, link: 'codex://plugins/meta-lingo?marketplacePath=%2Fproject%2Fmarketplace.json' } }
    },
    require(name) {
      if (name === 'node:path') return require(name)
      if (name === 'electron') return {
        app: { isPackaged: packaged, getPath: () => '/app/user-data' },
        ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
        shell: { openExternal: async url => events.push({ opened: url }) },
      }
      assert.equal(name, './openaiPlugin')
      return {
        getOpenAIPluginInfo: async paths => { events.push({ binary: paths.binaryPath }); return { ready: true } },
        openOpenAIPlugin: async paths => { events.push({ binary: paths.binaryPath }); return { success: true } },
      }
    },
  })
  vm.runInContext(js, context)
  context.exports.registerOpenAIPluginHandlers('http://127.0.0.1:8000')
  return { handlers, events }
}

test('Electron development uses source backend preparation and native app handoff', async () => {
  const { handlers, events } = nativeHarness(false)
  assert.equal((await handlers.get('get-openai-plugin-info')()).development, true)
  assert.equal((await handlers.get('open-openai-plugin')()).success, true)
  assert.deepEqual(events.slice(0, 2).map(x => x.method), ['GET', 'POST'])
  assert.ok(events[0].url.endsWith('/openai-plugin/info'))
  assert.ok(events[1].url.endsWith('/openai-plugin/prepare'))
  assert.ok(events[2].opened.startsWith('codex://plugins/meta-lingo?'))
  assert.ok(!events.some(event => event.binary), 'development must not require a prebuilt binary')
})

test('packaged Electron keeps its standalone MCP executable and never requests source preparation', async () => {
  const { handlers, events } = nativeHarness(true)
  assert.equal((await handlers.get('get-openai-plugin-info')()).ready, true)
  assert.equal((await handlers.get('open-openai-plugin')()).success, true)
  assert.ok(events.every(event => event.binary === '/app/resources/mcp-server/meta-lingo-mcp'))
})
