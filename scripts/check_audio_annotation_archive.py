"""Run with the Python interpreter from conda meta-lingo-electron."""
import io
import json
import os
import unittest
import zipfile
from pathlib import Path

import check_video_annotation_archive as archive_checks


def audio_request():
    path = os.environ.get('METALINGO_AUDIO_REQUEST')
    if path:
        return json.loads(Path(path).read_text())
    request = archive_checks.fixture_request()
    request.update(mediaType='audio', resourceName='sample.wav', manualTracks=[], annotations=[{
        'id': 'audio-word', 'type': 'audio', 'text': '样例', 'label': '唱词', 'labelPath': '粤剧/唱词',
        'startPosition': 0, 'endPosition': 0, 'timestamp': 0, 'startTime': 0, 'endTime': 1.2345, 'color': '#123456',
    }], audioBoxes=[{
        'id': 1, 'label': '鼓', 'labelPath': '非遗/器物/鼓', 'remark': 'review=approved\n完整区间',
        'startTime': 1.2345, 'endTime': 5.6789, 'color': '#123456', 'y': 0.1, 'height': 0.2,
    }], waveformData={'enabled': True, 'peaks': [0.1, 0.2], 'duration': 20, 'sampleRate': 16000},
        pitchData={'enabled': True, 'f0': [120], 'times': [1], 'periodicity': [0.9], 'fmin': 50, 'fmax': 550},
        acousticData={'enabled': True, 'intensity': {'times': [1], 'values': [60]}, 'parameters': {'max_formant': 5500}})
    return request


class AudioArchiveTests(unittest.IsolatedAsyncioTestCase):
    setUp = archive_checks.VideoArchiveTests.setUp
    save = archive_checks.VideoArchiveTests.save

    async def test_audio_snapshot_and_all_regions_survive_schema_disk_load_and_batch_export(self):
        request = audio_request()
        saved = await self.save(request)
        for field in ('audioBoxes', 'waveformData', 'pitchData', 'acousticData'):
            if isinstance(request[field], list):
                self.assertEqual(len(saved[field]), len(request[field]))
                for original, actual in zip(request[field], saved[field]):
                    for key, value in original.items():
                        self.assertEqual(actual[key], value)
            else:
                for key, value in request[field].items():
                    self.assertEqual(saved[field][key], value)
        loaded = await self.ns['load_annotation'](request['corpusName'], saved['id'])
        self.assertEqual(loaded['data'], saved)
        response = await self.ns['export_annotations_batch'](self.ns['BatchExportRequest'](
            items=[{'corpusName': request['corpusName'], 'id': saved['id']}]))
        content = b''.join([chunk async for chunk in response.body_iterator])
        with zipfile.ZipFile(io.BytesIO(content)) as bundle:
            exported = json.loads(bundle.read(bundle.namelist()[0]))
        self.assertEqual(exported, saved)

    async def test_audio_ends_are_preserved_and_missing_legacy_ends_are_not_invented(self):
        request = audio_request()
        request['annotations'] = [{
            'id': 'word', 'type': 'audio', 'text': '样例', 'label': '唱词', 'labelPath': '粤剧/唱词',
            'startPosition': 0, 'endPosition': 0, 'timestamp': 0, 'startTime': 0, 'endTime': 1.2345, 'color': '#123456',
        }]
        saved = await self.save(request)
        self.assertEqual(saved['annotations'][0]['endTime'], 1.2345)
        del request['annotations'][0]['startTime']
        del request['annotations'][0]['endTime']
        legacy = await self.save(request)
        self.assertIsNone(legacy['annotations'][0]['endTime'])

    async def test_clear_all_regions_preserves_snapshots_and_corpus_bundle_keeps_audio(self):
        request = audio_request()
        saved = await self.save(request)
        omitted = dict(request, archiveId=saved['id'])
        del omitted['audioBoxes']
        preserved = await self.save(omitted)
        self.assertEqual(preserved['audioBoxes'], saved['audioBoxes'])
        request.update(archiveId=saved['id'], audioBoxes=[], annotations=[])
        for field in ('waveformData', 'pitchData', 'acousticData'):
            del request[field]
        cleared = await self.save(request)
        self.assertEqual(cleared['audioBoxes'], [])
        self.assertEqual(cleared['waveformData'], saved['waveformData'])
        self.ns['CORPORA_DIR'] = self.base / 'corpora'
        folder = self.ns['CORPORA_DIR'] / request['corpusName']
        folder.mkdir(parents=True)
        (folder / 'sample.wav').write_bytes(b'fixture audio file')
        self.ns['read_corpus_bundle_meta'] = lambda _: {'corpus': {'name': request['corpusName']}, 'texts': []}
        archive_checks.load_definitions('backend/services/migration/pack_common.py', self.ns, {'_is_junk', 'add_dir_to_zip', 'write_json_to_zip'})
        archive_checks.load_definitions('backend/services/migration/corpus_pack.py', self.ns, {'pack_corpus'})
        data = io.BytesIO()
        with zipfile.ZipFile(data, 'w') as bundle:
            self.ns['pack_corpus'](bundle, 'fixture', 'corpus')
        with zipfile.ZipFile(io.BytesIO(data.getvalue())) as bundle:
            self.assertEqual(bundle.read('corpus/corpus_files/sample.wav'), b'fixture audio file')
            exported = json.loads(bundle.read(f'corpus/annotations/{saved["id"]}.json'))
        self.assertEqual(exported, cleared)


if __name__ == '__main__':
    unittest.main()
