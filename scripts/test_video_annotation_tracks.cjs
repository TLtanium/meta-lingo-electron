// Run with: node --test scripts/test_video_annotation_tracks.cjs
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { test } = require('node:test')
const i18next = require('i18next')
const { harness, root } = require('./annotation_test_harness.cjs')

function markMovingSequence(c) {
  c.trackToNextFrame()
  c.handleCanvasMouseMove({ clientX: 20, clientY: 10 })
  c.trackToNextFrame()
  c.handleCanvasMouseMove({ clientX: 40, clientY: 20 })
  c.saveKeyframeSequence()
}

test('draw, advance, drag twice, save: all anchors and intermediate positions reach the request', async () => {
  const c = harness()
  markMovingSequence(c)
  await c.handleSave()
  const track = c.request.manualTracks[0]
  assert.equal(track.keyframes.length, 3)
  assert.equal(track.frames.length, 21)
  assert.deepEqual(track.keyframes.map(k => k.frameNumber), [100, 110, 120])
  assert.deepEqual(track.keyframes.map(k => k.bbox[0]), [100.4, 120.4, 140.4])
  assert.equal(track.frames[5].bbox[0], 110.4)
  assert.equal(track.annotationId, c.request.annotations[0].id)
  assert.equal(track.labelPath, '非遗/器物/鼓')
  assert.equal(track.interpolation, 'linear')
  fs.writeFileSync('/tmp/metalingo-video-track-request.json', JSON.stringify(c.request, null, 2))
})

test('load and save preserves trajectories; editing and deleting affect the linked track', async () => {
  const c = harness()
  markMovingSequence(c)
  await c.handleSave()
  c.archive = { ...c.request, id: 'archive-id' }
  const original = JSON.parse(JSON.stringify(c.request.manualTracks))
  c.manualTracks = []
  c.annotations = []
  await c.handleLoadArchive({ corpusName: '回归测试', id: 'archive-id' })
  await c.handleSave()
  assert.deepEqual(c.request.manualTracks, original)
  assert.equal(c.getUnlinkedVideoAnnotations(c.annotations, c.manualTracks).length, 0)
  const id = c.annotations[0].id
  c.handleAnnotationUpdate(id, { remark: 'review=approved', label: '锣鼓' })
  await c.handleSave()
  assert.equal(c.request.manualTracks[0].remark, 'review=approved')
  assert.equal(c.request.manualTracks[0].frames[10].label, '锣鼓')
  c.handleAnnotationRemove(id)
  await c.handleSave()
  assert.deepEqual(c.request.manualTracks, [])
  assert.deepEqual(c.request.annotations, [])
})

test('a final adjustment at an existing anchor replaces its old box', () => {
  const c = harness()
  c.keyframeSequence = [{ frameNumber: 100, time: 4, bbox: [1, 2, 3, 4], label: '鼓' }]
  c.saveKeyframeSequence()
  const saved = JSON.parse(JSON.stringify(c.manualTracks[0]))
  assert.deepEqual(saved.keyframes[0].bbox, [100.4, 100, 200.4, 200])
  assert.equal(saved.frameCount, 1)
})

test('loading a legacy archive never fabricates the missing keyframes', async () => {
  const c = harness()
  c.manualTracks = [{ id: 1 }]
  c.archive = { id: 'legacy', text: '', annotations: [{ id: 'old', type: 'video', bbox: [1, 2, 3, 4], frameCount: 76 }] }
  await c.handleLoadArchive({ corpusName: '回归测试', id: 'legacy' })
  assert.equal(c.manualTracks.length, 0)
  assert.equal(c.getUnlinkedVideoAnnotations(c.annotations, c.manualTracks).length, 1)
})

test('two targets at the same time remain two distinct tracks, without duplicate summary rows', () => {
  const c = harness()
  markMovingSequence(c)
  c.currentBox = { x1: 400, y1: 200, x2: 500, y2: 300, label: '鼓', color: '#123456' }
  c.saveKeyframeSequence()
  assert.equal(c.manualTracks.length, 2)
  assert.notEqual(c.manualTracks[0].id, c.manualTracks[1].id)
  assert.equal(c.getUnlinkedVideoAnnotations(c.annotations, c.manualTracks).length, 0)
})

test('switching a media resource or corpus clears the previous manual trajectories', async () => {
  const c = harness()
  markMovingSequence(c)
  c.corpusApi = { getText: async () => ({ success: false }) }
  await c.handleMediaSelect({ id: 'other-media', filename: 'other.mp4', mediaType: 'video' })
  assert.equal(c.manualTracks.length, 0)
  assert.equal(c.annotations.length, 0)
  c.currentBox = { x1: 1, y1: 2, x2: 3, y2: 4, label: '鼓' }
  c.saveKeyframeSequence()
  assert.equal(c.manualTracks.length, 1)
  c.handleCorpusChange('other-corpus')
  assert.equal(c.manualTracks.length, 0)
})

test('all sequence messages work when switching Chinese → English → Chinese', async () => {
  const i18n = i18next.createInstance()
  await i18n.init({ lng: 'zh', resources: {
    zh: { translation: JSON.parse(fs.readFileSync(path.join(root, 'src/i18n/zh.json'))) },
    en: { translation: JSON.parse(fs.readFileSync(path.join(root, 'src/i18n/en.json'))) }
  } })
  const c = harness(i18n.t.bind(i18n))
  for (const lang of ['zh', 'en', 'zh']) {
    await i18n.changeLanguage(lang)
    c.keyframeSequence = []
    c.currentBox = null
    c.saveKeyframeSequence()
    assert.equal(c.messages.at(-1).text, i18n.t('annotation.sequenceEmpty'))
    const keys = ['videoSequenceText', 'videoBoxText', 'sequenceSaved', 'sequenceEmpty', 'boxConfirmed',
      'boxCleared', 'sequenceStartBoundary', 'videoEndReached', 'frameAdjustHint']
    for (const key of keys) {
      const message = i18n.t(`annotation.${key}`, { label: '鼓', count: 21, duration: '0.80', frame: 110 })
      assert.ok(!message.includes('{{') && !message.startsWith('annotation.'))
      if (lang === 'en') assert.ok(!/[\u4e00-\u9fff]/.test(message.replace('鼓', '')))
    }
  }
})
