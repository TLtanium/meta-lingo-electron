#!/usr/bin/env python3
"""Exercise the real playback route without models or user data."""
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from urllib.parse import unquote

ROOT = Path(__file__).resolve().parents[1]
TEMP = tempfile.TemporaryDirectory(prefix='metalingo-media-header-')
BASE = Path(TEMP.name)
os.environ['METALINGO_DATA_PATH'] = str(BASE / 'data')
sys.path.insert(0, str(ROOT / 'backend'))
from fastapi import FastAPI
from fastapi.testclient import TestClient
from routers import corpus

app = FastAPI()
app.include_router(corpus.router, prefix='/api/corpus')
client = TestClient(app)
BODY = bytes(range(256)) * 16
URL = '/api/corpus/corpus-fixture/texts/text-fixture/media'


class MediaHeaders(unittest.TestCase):
    def play(self, filename, media_type='video', range_header=None):
        path = BASE / filename
        path.write_bytes(BODY)
        transcript = path.with_suffix('.txt')
        transcript.write_text('中文或英文转录都不影响媒体流', encoding='utf-8')
        text = {'id': 'text-fixture', 'corpus_id': 'corpus-fixture', 'media_type': media_type,
                'filename': filename, 'content_path': str(transcript)}
        headers = {'Range': range_header} if range_header else {}
        with patch.object(corpus.TextDB, 'get_by_id', return_value=text):
            return client.get(URL, headers=headers)

    def assert_name(self, response, filename):
        header = response.headers['content-disposition']
        self.assertTrue(header.isascii())
        self.assertTrue(header.startswith("inline; filename*=UTF-8''"))
        self.assertEqual(unquote(header.split("''", 1)[1]), filename)

    def test_chinese_video_full_response(self):
        name = '粤剧 演示视频.mp4'
        response = self.play(name)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.content, BODY)
        self.assertEqual(response.headers['content-type'], 'video/mp4')
        self.assertEqual(response.headers['content-length'], str(len(BODY)))
        self.assert_name(response, name)

    def test_chinese_video_range_start_and_seek(self):
        name = 'NIKE_廣告_蔚爾導演.mp4'
        for interval, expected in [('bytes=0-127', BODY[:128]), ('bytes=500-899', BODY[500:900]), ('bytes=4000-', BODY[4000:])]:
            with self.subTest(range=interval):
                response = self.play(name, range_header=interval)
                self.assertEqual(response.status_code, 206)
                self.assertEqual(response.content, expected)
                self.assertEqual(int(response.headers['content-length']), len(expected))
                self.assertEqual(response.headers['accept-ranges'], 'bytes')
                self.assert_name(response, name)

    def test_english_and_unicode_names_keep_original_bytes(self):
        for filename in ['English video.mp4', 'café_🎬.mp4', '影片%20副本.mp4']:
            with self.subTest(filename=filename):
                response = self.play(filename, range_header='bytes=0-255')
                self.assertEqual(response.status_code, 206)
                self.assertEqual(response.content, BODY[:256])
                self.assert_name(response, filename)

    def test_chinese_audio_uses_same_safe_header(self):
        response = self.play('中文音频.wav', media_type='audio', range_header='bytes=100-199')
        self.assertEqual(response.status_code, 206)
        self.assertEqual(response.content, BODY[100:200])
        self.assertEqual(response.headers['content-type'], 'audio/wav')
        self.assert_name(response, '中文音频.wav')


if __name__ == '__main__':
    try:
        unittest.main(verbosity=2)
    finally:
        TEMP.cleanup()
