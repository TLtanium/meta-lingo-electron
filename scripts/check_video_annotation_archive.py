"""Run in conda meta-lingo-electron: python scripts/check_video_annotation_archive.py.

Load the real archive schemas and handlers in isolation so regression tests never
initialize NLP models or touch the user's corpus directory.
"""
import ast
import io
import json
import logging
import os
import re
import tempfile
import unittest
import uuid
import zipfile
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

ROOT = Path(__file__).resolve().parents[1]


def load_definitions(relative, namespace, names, include_models=False):
    source = ROOT / relative
    nodes = []
    for node in ast.parse(source.read_text()).body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            if node.name in names or (include_models and isinstance(node, ast.ClassDef) and node.name != 'ThemeRhemeRequest' and node.lineno < 630):
                node.decorator_list = []
                nodes.append(node)
    exec(compile(ast.Module(body=nodes, type_ignores=[]), str(source), 'exec'), namespace)


def fixture_request():
    anchors = [
        {'frameNumber': 100, 'time': 4, 'bbox': [100.4, 100, 200.4, 200], 'label': '鼓', 'color': '#123456'},
        {'frameNumber': 110, 'time': 4.4, 'bbox': [120.4, 110, 220.4, 210], 'label': '鼓', 'color': '#123456'},
    ]
    frames = [
        {'frameNumber': 100 + i, 'time': 4 + i * 0.04, 'bbox': [100.4 + 2 * i, 100 + i, 200.4 + 2 * i, 200 + i], 'label': '鼓'}
        for i in range(11)
    ]
    return {
        'corpusName': '回归测试', 'textId': 'media-id', 'resourceName': 'sample.mp4',
        'framework': '自建框架', 'frameworkCategory': 'Custom', 'type': 'multimodal',
        'text': '样例唱词', 'mediaType': 'video', 'mediaPath': '/api/corpus/fixture/media',
        'annotations': [{
            'id': 'video-track-1', 'text': '视频序列', 'startPosition': 0, 'endPosition': 0,
            'label': '鼓', 'labelPath': '非遗/器物/鼓', 'color': '#123456', 'type': 'video',
            'bbox': anchors[0]['bbox'], 'timestamp': 4, 'frameNumber': 100, 'frameCount': 11,
        }],
        'manualTracks': [{
            'id': 1, 'annotationId': 'video-track-1', 'label': '鼓', 'labelPath': '非遗/器物/鼓',
            'remark': 'review=approved', 'color': '#123456', 'startFrame': 100, 'endFrame': 110,
            'frameCount': 11, 'startTime': 4, 'endTime': 4.4, 'interpolation': 'linear',
            'keyframes': anchors, 'frames': frames,
        }],
    }


class VideoArchiveTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='metalingo-track-tests-')
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name)
        self.ns = dict(globals(), ANNOTATIONS_DIR=self.base / 'annotations', logger=logging.getLogger(__name__),
                       _ILLEGAL_FILENAME_CHARS=re.compile(r'[<>:"/\\|?*]'))
        load_definitions('backend/routers/annotation.py', self.ns, {
            'get_corpus_dir', 'get_archive_path', 'load_archive', 'save_archive', 'save_annotation',
            'load_annotation', 'export_annotations_batch',
        }, include_models=True)

    async def save(self, request):
        model = self.ns['SaveAnnotationRequest'](**request)
        result = await self.ns['save_annotation'](model)
        self.assertTrue(result['success'])
        return self.ns['load_archive'](request['corpusName'], result['data']['id'])

    async def test_save_load_and_batch_export_keep_every_position(self):
        request = fixture_request()
        # The frontend regression suite also emits a real save request for this assertion.
        contract_path = os.environ.get('METALINGO_TRACK_REQUEST')
        if contract_path:
            request = json.loads(Path(contract_path).read_text())
        archive = await self.save(request)
        track = archive['manualTracks'][0]
        for key in ('annotationId', 'labelPath', 'keyframes', 'frames', 'interpolation'):
            self.assertEqual(track[key], request['manualTracks'][0][key])
        loaded = await self.ns['load_annotation'](request['corpusName'], archive['id'])
        self.assertEqual(loaded['data']['manualTracks'], archive['manualTracks'])
        response = await self.ns['export_annotations_batch'](self.ns['BatchExportRequest'](
            items=[{'corpusName': request['corpusName'], 'id': archive['id']}]))
        contents = b''.join([chunk async for chunk in response.body_iterator])
        with zipfile.ZipFile(io.BytesIO(contents)) as bundle:
            exported = json.loads(bundle.read(bundle.namelist()[0]))
        self.assertEqual(exported['manualTracks'], archive['manualTracks'])

    async def test_explicit_empty_clears_tracks_but_omitted_field_preserves(self):
        request = fixture_request()
        archive = await self.save(request)
        request['archiveId'] = archive['id']
        del request['manualTracks']
        preserved = await self.save(request)
        self.assertEqual(preserved['manualTracks'], archive['manualTracks'])
        request.update(manualTracks=[], annotations=[])
        cleared = await self.save(request)
        self.assertEqual(cleared['manualTracks'], [])
        self.assertEqual(cleared['annotations'], [])

    async def test_legacy_archive_saves_without_inventing_a_trajectory(self):
        request = fixture_request()
        del request['manualTracks']
        archive = await self.save(request)
        self.assertNotIn('manualTracks', archive)
        self.assertEqual(archive['annotations'][0]['bbox'], request['annotations'][0]['bbox'])

    async def test_corpus_bundle_includes_media_and_full_saved_track(self):
        request = fixture_request()
        archive = await self.save(request)
        self.ns['CORPORA_DIR'] = self.base / 'corpora'
        folder = self.ns['CORPORA_DIR'] / request['corpusName']
        folder.mkdir(parents=True)
        (folder / 'sample.mp4').write_bytes(b'fixture media file')
        self.ns['read_corpus_bundle_meta'] = lambda _: {'corpus': {'name': request['corpusName']}, 'texts': []}
        load_definitions('backend/services/migration/pack_common.py', self.ns, {'_is_junk', 'add_dir_to_zip', 'write_json_to_zip'})
        load_definitions('backend/services/migration/corpus_pack.py', self.ns, {'pack_corpus'})
        data = io.BytesIO()
        with zipfile.ZipFile(data, 'w') as bundle:
            self.ns['pack_corpus'](bundle, 'fixture', 'corpus')
        with zipfile.ZipFile(io.BytesIO(data.getvalue())) as bundle:
            self.assertEqual(bundle.read('corpus/corpus_files/sample.mp4'), b'fixture media file')
            exported = json.loads(bundle.read(f'corpus/annotations/{archive["id"]}.json'))
        self.assertEqual(exported['manualTracks'], archive['manualTracks'])


if __name__ == '__main__':
    unittest.main()
