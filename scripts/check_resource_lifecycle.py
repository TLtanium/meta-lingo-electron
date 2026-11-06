#!/usr/bin/env python3
"""Isolated regressions, including AppleDouble deletion on the actual project volume."""
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
TEMP = Path(tempfile.mkdtemp(prefix='.resource-lifecycle-check-', dir=ROOT))
os.environ['METALINGO_DATA_PATH'] = str(TEMP / 'data')
sys.path.insert(0, str(ROOT / 'backend'))

from fastapi import FastAPI
from fastapi.testclient import TestClient
from fastapi.middleware.cors import CORSMiddleware
from routers import resources, corpus_resource
from services.user_resource_store import staged_import, resource_path, remove_resource, remove_all_resources, _remove_tree
from services.reference_resource_import import import_reference
from services.reference_group_colors import group_colors, PALETTE
from services.corpus_resource_service import get_corpus_resource_service
from services.nrc_service import get_nrc_service

APP = FastAPI()
APP.add_middleware(CORSMiddleware, allow_origins=['*'], allow_methods=['*'], allow_headers=['*'])
APP.include_router(resources.router, prefix='/api/resources')
APP.include_router(corpus_resource.router, prefix='/api/corpus-resource')
CLIENT = TestClient(APP)
META = dict(name_en='User reference', name_zh='自建参考', prefix='粤非遗', category='demo',
            tags_en=['demo'], tags_zh=['示例'], description_en='Example', description_zh='示例')


class Lifecycle(unittest.TestCase):
    def setUp(self):
        remove_all_resources()

    def test_external_volume_delete_retry_and_cors(self):
        for kind in ('dictionary', 'reference', 'nrc'):
            with staged_import(kind) as (stage, meta):
                (stage / 'payload.bin').write_bytes(b'isolated fixture')
                meta.update(name='Isolated resource')
            path = resource_path(kind, meta['id'])
            companions = [p.name for p in path.iterdir() if p.name.startswith('._')]
            print(f'{kind}: AppleDouble companions = {companions}')
            url = f'/api/resources/{kind}/{meta["id"]}'
            response = CLIENT.delete(url, headers={'Origin': 'http://localhost:5173'})
            self.assertEqual(response.status_code, 200, response.text)
            self.assertIn('access-control-allow-origin', response.headers)
            self.assertFalse(path.exists())
            self.assertEqual(CLIENT.delete(url).status_code, 200)

    def test_interrupted_missing_metadata_can_be_removed(self):
        path = resource_path('dictionary', 'a' * 32)
        path.mkdir(); (path / 'index.sqlite').write_bytes(b'partial')
        remove_resource('dictionary', 'a' * 32)
        self.assertFalse(path.exists())
        with self.assertRaises(ValueError):
            remove_resource('dictionary', '../outside')

    def test_real_errors_are_not_hidden_as_success_or_network_error(self):
        with patch.object(resources, 'remove_resource', side_effect=PermissionError('busy')):
            response = CLIENT.delete('/api/resources/reference/' + 'b' * 32, headers={'Origin': 'http://localhost:5173'})
        self.assertEqual(response.status_code, 500)
        self.assertTrue(response.json()['detail'].startswith('Could not remove resource.'))
        self.assertIn('access-control-allow-origin', response.headers)

    def test_reference_import_delete_and_cached_frequency(self):
        response = CLIENT.post('/api/resources/reference/import', files={'files': ('sample.csv', b'Word,word,lemma,pos,usas,freq\nLove,love,love,NOUN,E2,3\n', 'text/csv')}, data={'metadata': json.dumps(META)})
        self.assertEqual(response.status_code, 200, response.text)
        resource_id = response.json()['data']['id']
        svc = get_corpus_resource_service()
        self.assertEqual(svc.build_frequency_table(resource_id), {'love': 3})
        listing = CLIENT.get('/api/corpus-resource/list').json()['data']
        self.assertRegex(listing[0]['color'], r'^#[0-9a-f]{6}$')
        self.assertEqual(CLIENT.delete('/api/resources/reference/' + resource_id).status_code, 200)
        self.assertEqual(CLIENT.get('/api/resources').json()['reference'], [])
        self.assertFalse(svc._frequency_cache)
        self.assertEqual(svc.build_frequency_table(resource_id), {})

    def test_factory_reset_option_removes_resources_and_caches_only_in_isolation(self):
        from routers import corpus
        from services import corpus_resource_service, nrc_service
        root = TEMP / 'original-downloads'; root.mkdir(exist_ok=True)
        original = root / 'source.csv'; original.write_text('Word,word,lemma,pos,usas,freq\nLove,love,love,NOUN,E2,1\n')
        reference = import_reference(original, META)
        with staged_import('nrc') as (stage, meta):
            (stage / 'english.json').write_text(json.dumps({'love': {'positive': 1}}))
            meta.update(languages={'english': 1})
        self.assertTrue(get_nrc_service().is_available('en'))
        get_corpus_resource_service().build_frequency_table(reference['id'])
        app = FastAPI(); app.include_router(corpus.router, prefix='/api/corpus')
        model_dir = TEMP / 'isolated-models'; model_dir.mkdir(exist_ok=True)
        settings_dir = TEMP / 'data' / 'settings'
        settings_dir.mkdir(parents=True, exist_ok=True)
        (settings_dir / 'bertopic_preprocess.json').write_text('{"chunking":{"enabled":true}}')
        orphan = TEMP / 'data' / 'agent_tasks' / 'orphan' / 'result.md'
        orphan.parent.mkdir(parents=True, exist_ok=True)
        orphan.write_text('orphaned analysis')
        options = dict(resetDatabase=False, resetCorpora=False, resetAnnotations=False,
                       resetTopicModeling=False, resetWord2Vec=False, resetUSAS=False)
        with patch('model_paths.get_user_models_dir', return_value=model_dir), patch('model_paths.read_builtin_models_marker', return_value=set()):
            kept = TestClient(app).post('/api/corpus/factory-reset', json={**options, 'resetUserResources': False})
            self.assertEqual(kept.status_code, 200, kept.text)
            self.assertTrue(kept.json()['success'], kept.text)
            self.assertFalse(orphan.exists())
            self.assertFalse((settings_dir / 'bertopic_preprocess.json').exists())
            self.assertEqual(json.loads((settings_dir / 'mcp_settings.json').read_text()), {'enabled': False})
            self.assertTrue(resource_path('reference', reference['id']).exists())
            removed = TestClient(app).post('/api/corpus/factory-reset', json={**options, 'resetUserResources': True})
        self.assertEqual(removed.status_code, 200, removed.text)
        self.assertTrue(original.exists())
        self.assertFalse(nrc_service._nrc_service._cache)
        self.assertFalse(corpus_resource_service._corpus_resource_service._frequency_cache)
        self.assertEqual(CLIENT.get('/api/resources').json(), {'nrc': [], 'dictionary': [], 'reference': []})

    def test_group_colors_ignore_names_tags_ids_and_collisions(self):
        groups = ['粤非遗', '用户组', 'foo', 'FOO', 'bnc'] + [f'group-{i}' for i in range(100)]
        colors = group_colors(groups)
        self.assertEqual(len(set(colors.values())), len(set(groups)))
        self.assertEqual(colors, group_colors(reversed(groups)))
        for color in colors.values():
            rgb = [int(color[i:i + 2], 16) / 255 for i in (1, 3, 5)]
            linear = [v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4 for v in rgb]
            luminance = sum(v * w for v, w in zip(linear, (.2126, .7152, .0722)))
            self.assertGreaterEqual(1.05 / (luminance + .05), 4.5)
        source = TEMP / 'colors.csv'; source.write_text('Word,word,lemma,pos,usas,freq\nLove,love,love,NOUN,E2,1\n')
        a = import_reference(source, META)
        b = import_reference(source, {**META, 'name_en': 'Renamed', 'name_zh': '另一个名称', 'tags_en': ['changed']})
        c = import_reference(source, {**META, 'prefix': '另一个组'})
        listed = {item['id']: item for item in get_corpus_resource_service().list_resources()}
        self.assertEqual(listed[a['id']]['color'], listed[b['id']]['color'])
        self.assertNotEqual(listed[a['id']]['color'], listed[c['id']]['color'])
        self.assertEqual(len(set(PALETTE)), len(PALETTE))


if __name__ == '__main__':
    try:
        unittest.main(verbosity=2)
    finally:
        _remove_tree(TEMP)
