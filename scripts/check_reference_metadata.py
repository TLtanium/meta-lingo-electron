"""Exercise imports, legacy reads and locale-independent reference APIs in isolated storage."""
import json
import os
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'backend'))

def check():
    with tempfile.TemporaryDirectory(prefix='metalingo-reference-metadata-') as directory:
        os.environ['METALINGO_DATA_PATH'] = directory
        from fastapi import FastAPI
        from fastapi.testclient import TestClient
        from routers import resources, corpus_resource
        from services.reference_metadata import split_reference_tags
        from services.user_resource_store import resource_root
        from services.corpus_resource_service import get_corpus_resource_service
        app = FastAPI()
        app.include_router(resources.router, prefix='/api/resources')
        app.include_router(corpus_resource.router, prefix='/api/corpus-resource')
        client = TestClient(app)
        csv = b'Word,word,lemma,pos,usas,freq\nLove,love,love,NOUN,E2+,3\n'
        meta = dict(name='我的参考 Corpus', prefix='粤非遗', tags='口语, news， 学术,news，， ', description='用户原始描述 Original description')
        def upload(metadata):
            return client.post('/api/resources/reference/import', files={'files': ('reference.csv', csv, 'text/csv')}, data={'metadata': json.dumps(metadata, ensure_ascii=False)})
        validation = client.post('/api/resources/reference/import', files={'files': ('reference.csv', csv, 'text/csv')}, data={'validate_only': 'true'})
        assert validation.status_code == 200
        result = upload(meta)
        assert result.status_code == 200, result.text
        resource = result.json()['data'];rid = resource['id']
        assert resource['name'] == meta['name'] and resource['tags'] == ['口语', 'news', '学术']
        stored = json.loads((resource_root('reference') / rid / 'meta.json').read_text())
        assert not any(key.endswith(('_en', '_zh')) for key in stored)
        assert stored['word_count'] == 3 and stored['file_size'] == len(csv)
        assert 'category' not in stored
        for value in ['a,b', 'a, b', 'a，b', 'a， b', ' a , b，a ,, ， ']:
            assert split_reference_tags(value) == ['a', 'b']
        assert split_reference_tags(['a, b', 'b，c']) == ['a', 'b', 'c']
        service = get_corpus_resource_service()
        en = client.get('/api/corpus-resource/list?lang=en').json()['data'][0]
        zh = client.get('/api/corpus-resource/list?lang=zh').json()['data'][0]
        assert en == zh
        for key in ('name','description','tags'): assert en[key] == resource[key]
        assert client.get('/api/resources').json()['reference'][0]['name'] == meta['name']
        tags = client.get('/api/corpus-resource/tags').json()
        assert tags['tags_en'] == tags['tags_zh']
        assert service.search_resources(query='我的参考', tags=['学术'], lang='en')[0]['id'] == rid
        assert service.build_frequency_table(rid) == {'love': 3}
        # Existing bilingual metadata remains on disk, but all readers present one stable view.
        legacy_id = 'f' * 32;folder = resource_root('reference') / legacy_id;folder.mkdir()
        legacy = dict(id=legacy_id, name_en='Old English', name_zh='旧中文名称', prefix='粤非遗', category='old',
                      description_en='Old English description', description_zh='旧中文描述', tags_en=['old'], tags_zh=['旧'], word_count=3, file_size=len(csv))
        raw = json.dumps(legacy, ensure_ascii=False);(folder/'meta.json').write_text(raw);(folder/'data.csv').write_bytes(csv)
        all_en = service.list_resources('en');all_zh = service.list_resources('zh');assert all_en == all_zh
        assert next(x for x in all_en if x['id']==legacy_id)['tags'] == ['旧','old']
        assert len({x['color'] for x in all_en}) == 1
        assert (folder/'meta.json').read_text() == raw
        other = upload({**meta, 'name':'Other', 'prefix':'不同分组', 'tags':['tag, other']})
        assert other.status_code == 200
        assert len({x['color'] for x in service.list_resources()}) == 2
        for invalid in [{**meta,'name':''},{**meta,'tags':' , ， '},{**meta,'tags':['ok',3]}]:
            assert upload(invalid).status_code == 400
        assert client.delete('/api/resources/reference/'+rid).status_code == 200
        print('PASS: four-field import, both comma forms/spacing/deduplication, calculated stats, language-invariant APIs/search/tags, unchanged legacy files, group-only colours, validation and deletion.')

if __name__ == '__main__': check()
