// Run with: node --test scripts/test_audio_annotation_archive.cjs
const assert = require('node:assert/strict')
const fs = require('node:fs')
const { test } = require('node:test')
const { harness, root } = require('./annotation_test_harness.cjs')
const i18next = require('i18next')

function audioHarness() {
  const c = harness()
  Object.assign(c, {
    mediaType: 'audio', selectedMedia: { id: 'media-id', filename: 'sample.wav' }, duration: 20,
    drawMode: true, isDrawing: false, zoom: 50, height: 300,
    boxCanvasRef: { current: { getBoundingClientRect: () => ({ left: 0, top: 0 }) } },
    corpusApi: { getText: async () => ({ success: false }) }
  })
  c.setIsDrawing = value => { c.isDrawing = value }
  c.setDrawStart = value => { c.drawStart = value }
  return c
}

function draw(c, x1, y1, x2, y2) {
  c.handleBoxMouseDown({ clientX: x1, clientY: y1 })
  c.handleBoxMouseMove({ clientX: x2, clientY: y2 })
  c.handleBoxMouseUp()
}

test('multiple overlapping audio boxes retain both time boundaries, geometry, paths and remarks', async () => {
  const c = audioHarness()
  // Make both events occur within the same clock tick to check unique IDs.
  c.Date = { now: () => 12345 }
  draw(c, 50, 20, 250, 35)
  draw(c, 125, 60, 400, 120)
  assert.equal(c.savedAudioBoxes.length, 2)
  assert.notEqual(c.savedAudioBoxes[0].id, c.savedAudioBoxes[1].id)
  const first = c.savedAudioBoxes[0]
  assert.equal(first.startTime, 1)
  assert.equal(first.endTime, 5)
  assert.equal(first.height, 0.05) // Do not silently expand a short box to 10% height.
  assert.equal(first.labelPath, '非遗/器物/鼓')
  c.handleAudioBoxUpdate(first.id, { remark: 'review=approved;包含,逗号\n第二行' })
  c.waveformData = { enabled: true, peaks: [0.1, 0.2, 0.3], duration: 20, sample_rate: 16000 }
  c.pitchData = { enabled: true, f0: [120, 140], times: [1, 2], periodicity: [0.8, 0.9],
    fmin: 50, fmax: 550, hop_length_ms: 10, sample_rate: 16000 }
  c.acousticData = { enabled: true, intensity: { times: [1, 2], values: [60, 62] },
    parameters: { max_formant: 5500, max_number_of_formants: 5, time_step: 0.01, dynamic_range: 50, gender: 'female' } }
  await c.handleSave()
  assert.equal(c.request.audioBoxes[0].remark, 'review=approved;包含,逗号\n第二行')
  assert.deepEqual(c.request.pitchData.periodicity, [0.8, 0.9])
  assert.equal(c.request.waveformData.sampleRate, 16000)
  assert.equal(c.request.acousticData.parameters.max_formant, 5500)
  fs.writeFileSync('/tmp/metalingo-audio-annotation-request.json', JSON.stringify(c.request, null, 2))
})

test('audio range and aligned-word annotations save their ends without fabricating text from time', async () => {
  const c = audioHarness()
  c.handleAudioRangeSelect({ start: 1.2345, end: 5.6789 })
  c.handleAlignedWordClick({ word: '样例', start: 6.001, end: 6.824, score: 0.95 })
  await c.handleSave()
  assert.equal(c.request.annotations[0].startTime, 1.2345)
  assert.equal(c.request.annotations[0].endTime, 5.6789)
  assert.equal(c.request.annotations[1].text, '样例')
  assert.equal(c.request.annotations[1].endTime, 6.824)
  assert.equal(c.request.annotations[1].labelPath, '非遗/器物/鼓')
})

test('load-save restores audio snapshots even if source analysis is absent or has changed', async () => {
  const c = audioHarness()
  draw(c, 50, 20, 250, 80)
  c.waveformData = { enabled: true, peaks: [0.1, 0.2], duration: 20, sample_rate: 16000 }
  c.pitchData = { enabled: true, f0: [120], times: [1], periodicity: [0.9], fmin: 50, fmax: 550 }
  c.acousticData = { enabled: true, intensity: { times: [1], values: [60] } }
  await c.handleSave()
  c.archive = { ...c.request, id: 'audio-archive' }
  c.corpusApi.getText = async () => ({ success: true, transcript: {
    waveform: { enabled: true, peaks: [999], duration: 20 },
    pitch: { enabled: true, f0: [999], times: [1] }, acoustic: { enabled: false }
  } })
  c.savedAudioBoxes = []
  c.waveformData = c.pitchData = c.acousticData = null
  await c.handleLoadArchive({ corpusName: '回归测试', id: 'audio-archive' })
  await c.handleSave()
  assert.equal(c.request.audioBoxes.length, 1)
  assert.deepEqual(c.request.waveformData.peaks, [0.1, 0.2])
  assert.deepEqual(c.request.pitchData.f0, [120])
  assert.equal(c.request.acousticData.intensity.values[0], 60)
  c.handleAudioBoxRemove(c.savedAudioBoxes[0].id)
  await c.handleSave()
  assert.deepEqual(c.request.audioBoxes, [])
})

test('resource/corpus switches and legacy archive loads never carry over audio regions or analysis', async () => {
  const c = audioHarness()
  draw(c, 50, 20, 250, 80)
  c.waveformData = { enabled: true, peaks: [1], duration: 20 }
  await c.handleMediaSelect({ id: 'other', filename: 'other.wav', mediaType: 'audio' })
  assert.equal(c.savedAudioBoxes.length, 0)
  assert.equal(c.waveformData, null)
  c.savedAudioBoxes = [{ id: 1 }]
  c.archive = { id: 'old', text: '', annotations: [{ type: 'audio', timestamp: 2 }], mediaType: 'audio' }
  await c.handleLoadArchive({ corpusName: '回归测试', id: 'old' })
  assert.equal(c.savedAudioBoxes.length, 0)
  assert.equal(c.annotations[0].endTime, undefined)
  assert.equal(c.pitchData, null)
  c.savedAudioBoxes = [{ id: 2 }]
  c.handleCorpusChange('other-corpus')
  assert.equal(c.savedAudioBoxes.length, 0)
})

test('audio pixel conversion clips to the media and rejects empty or out-of-range selections', () => {
  const c = audioHarness()
  const box = { x1: 900, x2: 1200, y1: 280, y2: 350, label: '鼓', color: '#123456' }
  const clipped = c.createAudioBoxFromPixels(box, 50, 300, 20)
  assert.equal(clipped.startTime, 18)
  assert.equal(clipped.endTime, 20)
  assert.equal(clipped.y + clipped.height, 1)
  assert.equal(c.createAudioBoxFromPixels({ ...box, x1: 1100 }, 50, 300, 20), null)
  assert.equal(c.createAudioBoxFromPixels(box, 0, 300, 20), null)
})

test('audio CSV retains numerical precision, hierarchy and escaped multiline remarks', () => {
  const c = audioHarness()
  const csv = c.audioBoxesToCsv([{ id: 1, label: '鼓', labelPath: '非遗/器物/鼓', startTime: 1.234567,
    endTime: 5.678901, y: 0.1, height: 0.2, remark: '包含,"引号"\n第二行' }], ['ID'])
  assert.ok(csv.includes('"1.234567","5.678901"'))
  assert.ok(csv.includes('"非遗/器物/鼓"'))
  assert.ok(csv.includes('"包含,""引号""\n第二行"'))
})

test('audio remark editor uses translated labels in both languages', async () => {
  const i18n = i18next.createInstance()
  await i18n.init({ resources: {
    zh: { translation: JSON.parse(fs.readFileSync(`${root}/src/i18n/zh.json`)) },
    en: { translation: JSON.parse(fs.readFileSync(`${root}/src/i18n/en.json`)) }
  } })
  for (const language of ['zh', 'en', 'zh']) {
    await i18n.changeLanguage(language)
    for (const key of ['annotation.remark', 'annotation.enterRemark', 'annotation.labelPath',
      'annotation.audioBoxY', 'annotation.audioBoxHeight', 'common.save', 'common.cancel']) {
      const text = i18n.t(key)
      assert.notEqual(text, key)
      if (language === 'en') assert.ok(!/[\u4e00-\u9fff]/.test(text))
    }
  }
})
