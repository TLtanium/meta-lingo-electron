// Shared harness for the audio and video annotation regression suites.
// Exercise the real event/save/load handlers without starting Electron or loading ML models.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const root = path.resolve(__dirname, '..')
const source = relative => ts.createSourceFile(relative, fs.readFileSync(path.join(root, relative), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
const workspace = source('src/components/Annotation/MultimodalWorkspace.tsx')
const page = source('src/pages/Annotation/MultimodalAnnotation.tsx')
const api = source('src/api/annotation.ts')
const waveform = source('src/components/Annotation/WavesurferWaveform.tsx')

function extract(file, name, callback = false) {
  let found
  function visit(node) {
    if (callback && ts.isVariableDeclaration(node) && node.name.getText(file) === name) {
      found = (ts.isCallExpression(node.initializer) ? node.initializer.arguments[0] : node.initializer).getText(file)
    }
    if (!callback && ts.isFunctionDeclaration(node) && node.name?.text === name) found = node.getText(file).replace(/^export /, '')
    ts.forEachChild(node, visit)
  }
  visit(file)
  assert.ok(found, `Missing real handler: ${name}`)
  return found
}

function run(context, text) {
  const js = ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS } }).outputText
  return vm.runInContext(js, context)
}

function harness(t = key => key) {
  const context = vm.createContext({ console, Date, Math, t, exports: {}, messages: [], annotations: [], manualTracks: [],
    keyframeSequence: [], currentFrame: 100, currentTime: 4, frameInterval: 10, fps: 25, totalFrames: 1000,
    currentBox: { x1: 100.4, y1: 100, x2: 200.4, y2: 200, label: '鼓', color: '#123456', frame: 100, time: 4 },
    selectedLabel: { node: { name: '鼓' }, path: '非遗/器物/鼓', color: '#123456' }, mediaRef: { current: { pause() {} } },
    canvasRef: { current: { getBoundingClientRect: () => ({ left: 0, top: 0 }) } }, videoScale: 1,
    isDragging: true, isDrawing: false, drawStart: null, dragStart: { x: 0, y: 0 },
    currentCorpus: { id: 'corpus-id', name: '回归测试', texts: [{ id: 'media-id', filename: 'sample.mp4' }] },
    currentFramework: { name: '自建框架', category: 'Custom' }, selectedMedia: { id: 'media-id', filename: 'sample.mp4' },
    transcriptText: '样例唱词', transcriptSegments: [{ id: '0', start: 0, end: 10, text: '样例唱词' }],
    mediaType: 'video', mediaPath: '/api/corpus/corpus-id/texts/media-id/media', yoloTracks: [], clipAnnotation: null,
    currentArchiveId: null, coderName: 'Tester', savedAudioBoxes: [], relations: [], groups: [],
    spacyTokens: [], spacyEntities: [], pitchData: null, acousticData: null, waveformData: null, waveformExportFn: null, alignmentData: null,
    frameworks: [], corpora: [], workspaceKey: 0, setTimeout() {}, loadFramework() {},
    loadSpacyAnnotations: async () => {}, loadClipAnnotations: async () => {}
  })
  for (const [setter, state] of Object.entries({
    setAnnotations: 'annotations', setManualTracks: 'manualTracks', setKeyframeSequence: 'keyframeSequence',
    setCurrentBox: 'currentBox', setDragStart: 'dragStart', setRelations: 'relations', setGroups: 'groups',
    setTranscriptText: 'transcriptText', setTranscriptSegments: 'transcriptSegments', setYoloTracks: 'yoloTracks',
    setCurrentArchiveId: 'currentArchiveId', setSavedAudioBoxes: 'savedAudioBoxes', setSelectedMedia: 'selectedMedia',
    setMediaPath: 'mediaPath', setMediaType: 'mediaType', setWorkspaceKey: 'workspaceKey',
    setPitchData: 'pitchData', setAcousticData: 'acousticData', setWaveformData: 'waveformData',
    setAlignmentData: 'alignmentData', setWaveformExportFn: 'waveformExportFn'
  })) context[setter] = value => { context[state] = typeof value === 'function' ? value(context[state]) : value }
  for (const name of ['setIsPlaying', 'setDrawMode', 'setSaving', 'setSaveMessage', 'setSaveDialogOpen',
    'setMediaLoading', 'setSpacyTokens', 'setSpacyEntities', 'setCurrentCorpus', 'setSelectedFrameworkId',
    'setCoderName', 'setClipAnnotation']) context[name] = () => {}
  context.seekTo = time => { context.currentTime = time; context.currentFrame = Math.round(time * context.fps) }
  context.showFrameMsg = (text, type) => context.messages.push({ text, type })
  run(context, fs.readFileSync(path.join(root, 'src/utils/videoAnnotationTracks.ts'), 'utf8'))
  run(context, fs.readFileSync(path.join(root, 'src/utils/audioAnnotationArchive.ts'), 'utf8'))
  Object.assign(context, context.exports)
  for (const name of ['handleVideoTrackAdd', 'handleAnnotationRemove', 'handleAnnotationUpdate', 'handleLoadArchive', 'handleMediaSelect', 'handleCorpusChange', 'handleSave', 'handleAudioBoxAdd', 'handleAudioBoxUpdate', 'handleAudioBoxRemove']) {
    run(context, `var ${name} = ${extract(page, name, true)}`)
  }
  context.onVideoTrackAdd = context.handleVideoTrackAdd
  context.onAudioBoxAdd = context.handleAudioBoxAdd
  context.onAnnotationAdd = ann => context.annotations.push({ ...ann, id: `audio-interval-${context.annotations.length}` })
  for (const name of ['trackToNextFrame', 'saveKeyframeSequence', 'handleCanvasMouseMove', 'handleAudioRangeSelect', 'handleAlignedWordClick']) run(context, `var ${name} = ${extract(workspace, name, true)}`)
  for (const name of ['handleBoxMouseDown', 'handleBoxMouseMove', 'handleBoxMouseUp']) run(context, `var ${name} = ${extract(waveform, name, true)}`)
  run(context, extract(api, 'createMultimodalAnnotationRequest'))
  context.annotationApi = {
    save: async request => { context.request = JSON.parse(JSON.stringify(request)); return { success: false } },
    load: async () => ({ success: true, data: { data: context.archive } })
  }
  return context
}


module.exports = { harness, root, extract, run, source }
