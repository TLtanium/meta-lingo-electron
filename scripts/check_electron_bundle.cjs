// Frontend packages live in Vite assets; Electron must need only built-ins.
// Fail before packaging if a later change introduces an unbundled dependency.
const fs = require('node:fs')
const path = require('node:path')
const { isBuiltin } = require('node:module')
const ts = require('typescript')

function checkElectronBundle(root) {
  const directory = path.resolve(root, 'dist-electron')
  const entries = ['main.js', 'preload.js', 'petPreload.js']
  const visited = new Set()
  function inspect(file) {
    if (visited.has(file)) return
    visited.add(file)
    const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
    function dependency(node, argument) {
      if (!argument || !ts.isStringLiteralLike(argument)) {
        throw new Error(`Dynamic module path in ${file}; runtime dependencies must be bundled.`)
      }
      const name = argument.text
      if (name === 'electron' || isBuiltin(name)) return
      if (!name.startsWith('./') && !name.startsWith('../')) {
        throw new Error(`Unbundled runtime dependency ${JSON.stringify(name)} in ${file}`)
      }
      const target = path.resolve(path.dirname(file), name)
      if (!target.startsWith(directory + path.sep)) throw new Error(`Module escapes dist-electron: ${name}`)
      const resolved = [target, target + '.js', target + '.cjs', path.join(target, 'index.js')]
        .find(candidate => fs.existsSync(candidate) && fs.statSync(candidate).isFile())
      if (!resolved) throw new Error(`Missing bundled module ${name} in ${file}`)
      inspect(resolved)
    }
    function visit(node) {
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) {
        dependency(node, node.moduleSpecifier)
      } else if (ts.isCallExpression(node) &&
        ((ts.isIdentifier(node.expression) && node.expression.text === 'require') ||
         node.expression.kind === ts.SyntaxKind.ImportKeyword)) {
        dependency(node, node.arguments[0])
      }
      ts.forEachChild(node, visit)
    }
    visit(source)
  }
  for (const entry of entries) inspect(path.join(directory, entry))
  return visited.size
}

if (require.main === module) {
  try {
    const count = checkElectronBundle(path.resolve(__dirname, '..'))
    console.log(`[OK] Electron bundle: ${count} files need only bundled files, Electron and Node built-ins.`)
  } catch (error) {
    console.error(`[ERROR] ${error.message}`)
    process.exitCode = 1
  }
}
module.exports = { checkElectronBundle }
