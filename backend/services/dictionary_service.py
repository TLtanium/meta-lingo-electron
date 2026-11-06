"""Generic indexed lookup of user-imported MDX dictionaries."""
import sqlite3
from contextlib import contextmanager
from services.user_resource_store import list_resources, resource_path
from services.dictionary_import import resource_key


class DictionaryService:
    def list_dictionaries(self):
        return list_resources('dictionary')

    def _resolve(self, name):
        return next((m for m in self.list_dictionaries() if name == m['id'] or name.casefold() == m['name'].casefold()), None)

    @contextmanager
    def _connect(self, meta):
        path = resource_path('dictionary', meta['id']) / 'index.sqlite'
        connection = sqlite3.connect(path.as_uri() + '?mode=ro', uri=True)
        try:
            yield connection
        finally:
            connection.close()

    def lookup(self, word, dict_names):
        results = {}
        for name in dict_names:
            meta = self._resolve(name)
            if not meta:
                results[name] = {'found': False, 'word': word, 'error': 'Import a dictionary in Settings → User resources first.'}
                continue
            with self._connect(meta) as db:
                target, seen, rows = word.strip(), set(), []
                for _ in range(12):
                    if target.casefold() in seen:
                        break
                    seen.add(target.casefold())
                    rows = db.execute('SELECT key,content FROM entries WHERE normalized=?', (target.casefold(),)).fetchall()
                    if len(rows) == 1 and rows[0][1].strip().startswith('@@@LINK='):
                        target = rows[0][1].strip()[8:].strip()
                        rows = []
                        continue
                    break
            results[name] = {'found': bool(rows), 'word': word, 'dictionary_id': meta['id'],
                'content': '\n<hr>\n'.join(r[1] for r in rows), 'matched_key': rows[0][0] if rows else None}
        return {'query': word, 'results': results}

    def get_suggestions(self, prefix, dict_names, limit=10):
        result, start = set(), prefix.strip().casefold()
        for name in dict_names:
            meta = self._resolve(name)
            if meta:
                with self._connect(meta) as db:
                    result.update(r[0] for r in db.execute(
                        'SELECT key FROM entries WHERE normalized>=? AND normalized<? ORDER BY normalized LIMIT ?',
                        (start, start + '\U0010ffff', limit)))
        return sorted(result, key=str.casefold)[:limit]

    def get_resource(self, dictionary_id, path):
        meta = self._resolve(dictionary_id)
        if not meta:
            return None
        with self._connect(meta) as db:
            row = db.execute('SELECT data FROM resources WHERE key=?', (resource_key(path),)).fetchone()
        return row[0] if row else None

    def unload_dictionary(self, name):
        return self._resolve(name) is not None

    def clear_cache(self):
        pass  # Short-lived connections; no stale resources cached.


dictionary_service = DictionaryService()
