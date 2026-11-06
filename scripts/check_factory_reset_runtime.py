#!/usr/bin/env python3
"""Test source/frozen runtime paths and reset boundaries using isolated files."""
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
TEMP = tempfile.TemporaryDirectory(prefix='metalingo-runtime-reset-')
BASE = Path(TEMP.name)
os.environ['METALINGO_DATA_PATH'] = str(BASE / 'user' / 'data')
sys.path.insert(0, str(ROOT / 'backend'))

from services.runtime_reset import reset_agent_tasks, reset_runtime_settings
from services.user_resource_store import _remove_tree
from services import agent_task_service


class RuntimeReset(unittest.TestCase):
    def setUp(self):
        self.data = BASE / 'user' / 'data'
        for folder in [self.data, BASE / 'user' / 'openai-plugin', BASE / 'frozen']:
            _remove_tree(folder)
        self.data.mkdir(parents=True)

    def put(self, path, content='fixture'):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content)
        return path

    def test_task_service_uses_user_data_and_survives_reset(self):
        self.assertEqual(agent_task_service.TASK_DIR, self.data / 'agent_tasks')
        service = agent_task_service.AgentTaskService()
        task_id = service.create_task('test', 'isolated', 1)
        self.assertTrue((self.data / 'agent_tasks' / task_id / 'manifest.json').exists())
        reset_agent_tasks()
        self.assertEqual(service.list_tasks(), [])
        self.assertTrue(service.create_task('test', 'isolated', 1))

    def test_frozen_reset_clears_orphans_legacy_and_generated_plugin(self):
        legacy = BASE / 'frozen' / 'data' / 'agent_tasks'
        self.put(legacy / 'old-task' / 'manifest.json')
        self.put(self.data / 'agent_tasks' / 'orphan' / 'result.md')
        self.put(BASE / 'user' / 'openai-plugin' / '.agents' / 'marketplace.json')
        template = self.put(BASE / 'frozen' / 'openai-plugin' / 'skills' / 'SKILL.md')
        original = self.put(BASE / 'downloads' / 'dictionary.mdx')
        self.put(self.data / 'settings' / 'bertopic_preprocess.json')
        self.put(self.data / 'settings' / 'model_management_settings.json')
        with patch.object(sys, 'frozen', True, create=True), patch.object(sys, '_MEIPASS', str(BASE / 'frozen'), create=True):
            reset_agent_tasks()
            reset_runtime_settings(True)
        self.assertFalse(legacy.exists())
        self.assertEqual(list((self.data / 'agent_tasks').iterdir()), [])
        self.assertEqual(list((self.data / 'settings').iterdir()), [])
        self.assertFalse((BASE / 'user' / 'openai-plugin').exists())
        self.assertTrue(template.exists())
        self.assertTrue(original.exists())

    def test_source_reset_preserves_developer_only_artifacts(self):
        developer = self.put(self.data / 'openai-plugin-dev' / 'manifest.json')
        legacy_html = self.put(self.data / 'topic_modeling' / 'legacy_comparison' / 'example.html')
        settings = self.put(self.data / 'settings' / 'usas_settings.json', '{"preserve":true}')
        self.put(self.data / 'settings' / 'bertopic_preprocess.json')
        with patch.object(sys, 'frozen', False, create=True):
            reset_agent_tasks()
            reset_runtime_settings(False)
        self.assertTrue(developer.exists())
        self.assertTrue(legacy_html.exists())
        self.assertEqual(settings.read_text(), '{"preserve":true}')
        self.assertFalse((self.data / 'settings' / 'bertopic_preprocess.json').exists())


if __name__ == '__main__':
    try:
        unittest.main(verbosity=2)
    finally:
        TEMP.cleanup()
