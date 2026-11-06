const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { checkElectronBundle } = require('./check_electron_bundle.cjs')
const { getNodeModuleFileMatcher } = require('app-builder-lib/out/fileMatcher')
const { NodeModuleCopyHelper } = require('app-builder-lib/out/util/NodeModuleCopyHelper')
const configuration = require('../electron-builder.json')

function fixture(run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'metalingo-bundle-'))
  fs.mkdirSync(path.join(root, 'dist-electron'))
  for (const name of ['main.js', 'preload.js', 'petPreload.js']) {
    fs.writeFileSync(path.join(root, 'dist-electron', name), 'require("electron"); require("node:fs");')
  }
  return Promise.resolve().then(() => run(root)).finally(() => fs.rmSync(root, { recursive: true, force: true }))
}

test('Electron entries accept only built-ins and existing bundled modules', () => fixture(root => {
  fs.writeFileSync(path.join(root, 'dist-electron/helper.js'), 'require("path")')
  fs.appendFileSync(path.join(root, 'dist-electron/main.js'), 'require("./helper");')
  assert.equal(checkElectronBundle(root), 4)
}))

for (const code of ['require("maplibre-gl")', 'import("maplibre-gl")',
  'import map from "maplibre-gl"', 'require(variable)', 'require("../outside.js")', 'require("./missing.js")']) {
  test('Reject unbundled runtime: ' + code, () => fixture(root => {
    fs.writeFileSync(path.join(root, 'dist-electron/main.js'), code)
    assert.throws(() => checkElectronBundle(root))
  }))
}

test('Real electron-builder module collector excludes duplicate dependencies on both platforms', () => fixture(async root => {
  const modules = path.join(root, 'node_modules')
  const dependency = path.join(modules, 'maplibre-gl')
  fs.mkdirSync(path.join(dependency, 'dist'), { recursive: true })
  for (const name of ['package.json', 'LICENSE.txt', 'dist/maplibre-gl.js']) {
    fs.writeFileSync(path.join(dependency, name), name === 'package.json' ? '{"name":"maplibre-gl","version":"1.0.0"}' : 'fixture')
  }
  for (const platform of ['win', 'mac']) {
    for (const excluded of [false, true]) {
      const config = { ...configuration,
        files: configuration.files.filter(pattern => excluded || pattern !== '!**/node_modules{,/**/*}') }
      const packager = { config, appInfo: { type: 'commonjs' }, debugLogger: { isEnabled: false } }
      const matcher = getNodeModuleFileMatcher(root, path.join(root, 'output'), x => x, config[platform], packager)
      const collector = new NodeModuleCopyHelper(matcher, packager)
      const files = await collector.collectNodeModules(modules, ['maplibre-gl'], [])
      if (excluded) assert.deepEqual(files, [])
      else {
        assert(files.includes(path.join(dependency, 'package.json')))
        assert(files.includes(path.join(dependency, 'LICENSE.txt')))
      }
    }
  }
  for (const resource of ['dist/**/*', 'dist-electron/**/*', 'LICENSE', 'third-party-licenses/**/*']) {
    assert(configuration.files.includes(resource), resource + ' must remain included')
  }
}))

test('Both build scripts enforce the runtime bundle guard before packaging', () => {
  for (const name of ['build.bat', 'build.sh']) {
    const code = fs.readFileSync(path.join(__dirname, '..', name), 'utf8').replaceAll('\\', '/')
    const check = code.indexOf('node scripts/check_electron_bundle.cjs')
    const packaging = code.indexOf('npx electron-builder --')
    assert(check > 0 && check < packaging)
  }
})
