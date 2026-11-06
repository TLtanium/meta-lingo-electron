#!/usr/bin/env python3
"""Integration checks using isolated app data and optional local MDict/NRC fixtures."""
import csv
import io
import json
import os
import shutil
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'backend'))


def check():
    with tempfile.TemporaryDirectory(prefix='metalingo-resources-check-') as temp:
        temporary = Path(temp)
        os.environ['METALINGO_DATA_PATH'] = str(temporary / 'app-data')
        from services.user_resource_store import list_resources, remove_resource
        from services.nrc_service import get_nrc_service
        from services.nrc_resource_import import import_nrc
        from services.reference_resource_import import validate_reference_csv, import_reference
        from services.reference_export import export_reference
        from services.corpus_resource_service import CorpusResourceService
        from services.corpus_export_service import CorpusExportService
        from services.dictionary_import import import_dictionary
        from services.dictionary_service import dictionary_service
        assert not list_resources('reference') and not dictionary_service.list_dictionaries()
        assert not get_nrc_service().is_available('english'), 'Legacy bundled NRC must not load'
        samples = [{'text': 'Love', 'lemma': 'love', 'pos': 'NOUN', 'usas_tag': 'E2+', 'usas_tags': ['E2+', 'X2']},
                   {'text': 'love', 'lemma': 'love', 'pos': 'VERB', 'usas_tag': 'E2+'}]
        output = export_reference([{'id': 'a'}, {'id': 'b'}], lambda text: samples)
        csv_path = temporary / 'reference.csv'; csv_path.write_bytes(output)
        assert validate_reference_csv(csv_path)['word_count'] == 4
        meta = dict(name_en='Test', name_zh='测试', prefix='test', category='total', tags_en=['test'], tags_zh=['测试'], description_en='Test reference', description_zh='测试参考语料')
        imported = import_reference(csv_path, meta)
        service = CorpusResourceService()
        assert service.list_resources()[0]['word_count'] == 4
        assert service.build_frequency_table(imported['id']) == {'love': 4}
        assert service.build_frequency_table(imported['id'], mode='lemma') == {'love': 4}
        assert service.build_frequency_table(imported['id'], mode='domain') == {'E2': 4}
        for invalid in [b'word,freq\nx,1', output.replace(b',2\r\n', b',-2\r\n'), output.replace(b',2\r\n', b',1.5\r\n')]:
            bad = temporary / 'bad.csv'; bad.write_bytes(invalid)
            try: validate_reference_csv(bad)
            except ValueError: pass
            else: raise AssertionError('Malformed CSV accepted')
        try: export_reference([{}], lambda _: [{'text': 'no annotation'}])
        except ValueError: pass
        else: raise AssertionError('Missing annotations silently accepted')
        remove_resource('reference', imported['id'])
        assert not service.list_resources() and not service.build_frequency_table(imported['id'])
        # Exercise actual sidecar and transcript paths, including repeated segment-local offsets.
        content = temporary / 'one.txt'; content.write_text('Love love')
        content.with_suffix('.usas.json').write_text(json.dumps({'tokens': samples}))
        transcript = temporary / 'video.json'
        transcript.write_text(json.dumps({'spacy_annotations': {'segments': {
            '10': {'tokens': [{'text': 'Love', 'lemma': 'love', 'pos': 'NOUN', 'start': 0}]},
            '20': {'tokens': [{'text': 'love', 'lemma': 'love', 'pos': 'VERB', 'start': 0}]}}},
            'usas_annotations': {'segments': {
            '10': {'tokens': [{'text': 'Love', 'start': 0, 'usas_tag': 'E2+'}]},
            '20': {'tokens': [{'text': 'love', 'start': 0, 'usas_tag': 'X2'}]}}}}))
        payload, _, _ = CorpusExportService().export_texts([
            {'content_path': str(content)}, {'media_type': 'video', 'transcript_json_path': str(transcript)}], [], 'reference')
        csv_path.write_bytes(payload)
        assert validate_reference_csv(csv_path)['word_count'] == 4
        rows = list(csv.DictReader(io.StringIO(payload.decode('utf-8-sig'))))
        assert any(r['Word'] == 'love' and r['usas'] == 'X2' for r in rows), rows
        assert any(r['Word'] == 'Love' and r['usas'] == 'E2+' for r in rows), rows
        print('PASS: strict CSV validation, combined text/media export and reference word/lemma/domain roundtrip', flush=True)
        nrc_folder = Path('/Users/tommyleo/Downloads/Files/NRC-Emotion-Lexicon')
        if nrc_folder.exists():
            nrc = import_nrc(nrc_folder)
            assert len(nrc['languages']) == 11, nrc['languages']
            assert get_nrc_service().is_available('zh') and get_nrc_service().is_available('en')
            assert not get_nrc_service().is_available('unsupported')
            assert get_nrc_service().annotate_tokens([{'text': 'love'}], 'en')[0]['positive'] == 1
            remove_resource('nrc', nrc['id'])
            assert not get_nrc_service().is_available('en')
            print('PASS: official NRC folder, 11 languages, no fallback, cache invalidation on removal', flush=True)
        fixture = Path('/Users/tommyleo/Downloads/Files/dictionary')
        for mdx in sorted(fixture.glob('*.mdx')):
            folder = temporary / 'dictionary-input'; folder.mkdir(exist_ok=True)
            for path in fixture.iterdir():
                if path.stem == mdx.stem:
                    try: os.link(path, folder / path.name)
                    except OSError: shutil.copyfile(path, folder / path.name)
            item = import_dictionary(folder)
            suggestions = dictionary_service.get_suggestions('love', [item['name']])
            assert suggestions, item
            result = dictionary_service.lookup(suggestions[0], [item['name']])['results'][item['name']]
            assert result['found'] and result['content'] and result['dictionary_id'] == item['id']
            from services.user_resource_store import resource_path
            import sqlite3
            with sqlite3.connect(resource_path('dictionary', item['id']) / 'index.sqlite') as db:
                row = db.execute('SELECT key,length(data) FROM resources LIMIT 1').fetchone()
            if row: assert len(dictionary_service.get_resource(item['id'], row[0])) == row[1]
            remove_resource('dictionary', item['id']); shutil.rmtree(folder)
            print(f"PASS: MDX/MDD import, lookup and companion resources: {mdx.name} ({item['count']} entries)", flush=True)
        # Exercise multipart routes including path traversal and validation before activation.
        from fastapi import FastAPI
        from fastapi.testclient import TestClient
        from routers.resources import router
        app = FastAPI(); app.include_router(router, prefix='/api/resources')
        with TestClient(app) as client:
            assert client.get('/api/resources').json()['reference'] == []
            response = client.post('/api/resources/reference/import', files={'files': ('reference.csv', output)}, data={'validate_only': 'true'})
            assert response.status_code == 200, response.text
            assert not list_resources('reference')
            response = client.post('/api/resources/reference/import', files={'files': ('reference.csv', output)}, data={'metadata': json.dumps(meta)})
            assert response.status_code == 200, response.text
            resource_id = response.json()['data']['id']
            response = client.post('/api/resources/reference/import', files={'files': ('../escape.csv', output)})
            assert response.status_code == 400
            assert client.delete(f'/api/resources/reference/{resource_id}').status_code == 200
        print('PASS: resource status/import/validate/remove API and unsafe upload rejection', flush=True)


if __name__ == '__main__': check()
