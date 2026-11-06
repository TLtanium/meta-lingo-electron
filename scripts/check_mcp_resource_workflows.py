#!/usr/bin/env python3
"""Exercise real MCP tools and NRC coverage without user data or a live app."""
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'backend'))
ISOLATED = tempfile.TemporaryDirectory(prefix='metalingo-mcp-resource-')
os.environ['METALINGO_DATA_PATH'] = ISOLATED.name

from mcp.server.fastmcp import FastMCP
from mcp_server.tools import reference, semantic, analysis
from services.sentiment_analysis_service import SentimentAnalysisService


class Client:
    def __init__(self, dictionaries=None, resources=None, result=None):
        self.dictionaries = dictionaries or []
        self.resources = resources or []
        self.result = result or {}
        self.calls = []

    async def get(self, path, **kwargs):
        self.calls.append(('get', path, kwargs))
        if path == '/api/dictionary/list': return {'success': True, 'data': self.dictionaries}
        if path == '/api/corpus-resource/list': return {'success': True, 'data': self.resources}
        if path == '/api/resources': return {'dictionary': self.dictionaries, 'nrc': [], 'reference': self.resources}
        if path == '/api/dictionary/lookup':
            return {'success': True, 'results': {d['name']: {'found': True, 'content': '<p>Definition <b>one</b></p><script>injected</script>'} for d in self.dictionaries}}
        raise AssertionError(path)

    async def post(self, path, **kwargs):
        self.calls.append(('post', path, kwargs))
        return self.result


def tools(client):
    mcp = FastMCP('resource-test')
    for module in [reference, semantic, analysis]: module.register(mcp, client)
    return {name: tool.fn for name, tool in mcp._tool_manager._tools.items()}


class ResourceTools(unittest.IsolatedAsyncioTestCase):
    async def test_no_dictionary_pauses_without_lookup(self):
        client = Client(); result = json.loads(await tools(client)['dictionary_lookup']('word'))
        self.assertEqual(result['status'], 'dictionary_required')
        self.assertEqual(len(client.calls), 1)

    async def test_one_or_multiple_dictionaries_require_selection(self):
        for dictionaries in [[{'id': 'a', 'name': 'Primary'}], [{'id': 'a', 'name': 'Primary'}, {'id': 'b', 'name': 'Secondary'}]]:
            client = Client(dictionaries)
            result = json.loads(await tools(client)['dictionary_lookup']('word'))
            self.assertEqual(result['status'], 'dictionary_selection_required')
            self.assertEqual(result['dictionaries'], dictionaries)
            self.assertFalse(any(c[1].endswith('/lookup') for c in client.calls))

    async def test_explicit_references_preserve_priority_and_plain_definitions(self):
        client = Client([{'id': 'a', 'name': 'Primary'}, {'id': 'b', 'name': 'Secondary'}])
        result = await tools(client)['dictionary_lookup']('word', ['b', 'a'])
        self.assertEqual(client.calls[-1][2]['params']['dictionaries'], 'Secondary,Primary')
        self.assertLess(result.index('━━━ Secondary'), result.index('━━━ Primary'))
        self.assertIn('Definition one', result); self.assertNotIn('injected', result)

    async def test_missing_selected_reference_never_silently_falls_back(self):
        client = Client([{'id': 'a', 'name': 'Primary'}])
        result = json.loads(await tools(client)['dictionary_lookup']('word', ['removed', 'a']))
        self.assertEqual(result['status'], 'selected_dictionary_unavailable')
        self.assertEqual(len(client.calls), 1)

    async def test_discovery_and_status_do_not_lookup(self):
        client = Client([{'id': 'a', 'name': 'Primary'}]); available = tools(client)
        self.assertEqual(json.loads(await available['list_dictionaries']())['status'], 'available')
        self.assertEqual(json.loads(await available['get_resource_status']())['nrc_languages'], [])
        self.assertFalse(any(c[1].endswith('/lookup') for c in client.calls))

    async def test_keyness_missing_or_removed_resource_does_not_analyze(self):
        for resources in [[], [{'id': 'another'}]]:
            client = Client(resources=resources)
            result = await tools(client)['keyness_resource_analysis']('corpus', 'missing')
            self.assertIn('REFERENCE_RESOURCE_', result)
            self.assertFalse(any(c[0] == 'post' for c in client.calls))

    async def test_failed_keyness_is_not_no_significance(self):
        client = Client(resources=[{'id': 'chosen'}], result={'success': False, 'error': 'annotation missing'})
        result = await tools(client)['keyness_resource_analysis']('corpus', 'chosen')
        self.assertTrue(result.startswith('KEYNESS_ANALYSIS_FAILED'))

    async def test_nrc_absent_annotations_and_valid_filtered_empty_are_distinct(self):
        for coverage, expected in [({'annotated_texts': 0, 'requested_texts': 2}, 'NRC_ANNOTATION_REQUIRED'),
                                   ({'annotated_texts': 2, 'requested_texts': 2}, 'No NRC results matched')]:
            client = Client(result={'success': True, 'annotation_coverage': coverage, 'results': []})
            self.assertTrue((await tools(client)['sentiment_analysis']('corpus')).startswith(expected))

    async def test_saved_nrc_results_remain_available_without_lexicon(self):
        client = Client(result={'success': True, 'annotation_coverage': {'annotated_texts': 1, 'requested_texts': 2},
            'results': [{'word': 'love', 'polarity': 'positive', 'frequency': 1}], 'summary': {'positive': 1}})
        result = await tools(client)['sentiment_analysis']('corpus')
        self.assertIn('love', result); self.assertIn('Only annotated/aligned texts', result)
        self.assertNotIn('NRC_ANNOTATION_REQUIRED', result)

    async def test_tools_and_agent_registry_agree(self):
        from mcp_server.server import create_server
        from services.tool_registry import TOOL_DEFINITIONS
        server = create_server()
        actual = set(server._tool_manager._tools)
        registered = {t['function']['name'] for t in TOOL_DEFINITIONS}
        self.assertEqual(actual, registered)
        self.assertEqual(len(actual), 65)


class ApiCoverage(unittest.TestCase):
    def test_sentiment_response_serialization_preserves_coverage(self):
        from fastapi import FastAPI
        from fastapi.testclient import TestClient
        from routers import analysis as analysis_router
        app = FastAPI(); app.include_router(analysis_router.router, prefix='/api/analysis')
        coverage = {'requested_texts': 2, 'annotated_texts': 0, 'missing_annotations': ['a', 'b'], 'misaligned_annotations': []}
        result = {'success': True, 'summary': {}, 'results': [], 'analysis_mode': 'polarity', 'annotation_coverage': coverage}
        with patch.object(analysis_router, 'get_sentiment_analysis_service') as factory, \
             patch.object(analysis_router.CorpusDB, 'get_by_id', return_value={'language': 'chinese'}):
            factory.return_value.analyze.return_value = result
            response = TestClient(app).post('/api/analysis/sentiment', json={'corpus_id': 'isolated'})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()['annotation_coverage'], coverage)


class Coverage(unittest.TestCase):
    def test_saved_annotation_coverage_is_measured_before_filters(self):
        svc = SentimentAnalysisService()
        token = {'text': 'love', 'lemma': 'love', 'pos': 'NOUN'}
        texts = [{'id': 'annotated'}, {'id': 'missing'}, {'id': 'misaligned'}]
        with patch('services.sentiment_analysis_service.TextDB.list_by_corpus', return_value=texts), \
             patch.object(svc, '_load_spacy_annotation', return_value={'tokens': [token]}), \
             patch.object(svc, '_load_nrc_for_text', side_effect=lambda t: [{'positive': 1}] if t['id'] == 'annotated' else [] if t['id'] == 'missing' else [{}, {}]):
            result = svc.analyze('isolated', min_freq=10)
        self.assertEqual(result['results'], [])
        self.assertEqual(result['annotation_coverage'], {'requested_texts': 3, 'annotated_texts': 1,
            'missing_annotations': ['missing'], 'misaligned_annotations': ['misaligned']})


if __name__ == '__main__':
    try: unittest.main(verbosity=2)
    finally: ISOLATED.cleanup()
