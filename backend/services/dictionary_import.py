"""Index standard MDict files into local SQLite, without bundling dictionary data."""
import sqlite3
from pathlib import Path, PurePosixPath
from services.user_resource_store import staged_import, list_resources


def resource_key(value: str) -> str:
    value = value.replace('\\', '/').lstrip('/')
    path = PurePosixPath(value)
    if '..' in path.parts or not value or ':' in value:
        raise ValueError('Invalid dictionary resource path')
    return str(path).casefold()


def import_dictionary(folder: Path, name: str = '') -> dict:
    from mdict_utils.base.readmdict import MDX, MDD
    mdxs = [p for p in folder.rglob('*') if p.suffix.lower() == '.mdx']
    if len(mdxs) != 1:
        raise ValueError('Select exactly one MDX and its optional MDD/CSS companions')
    mdx = mdxs[0]
    name = (name or mdx.stem).strip()
    if not name or ',' in name or len(name) > 200:
        raise ValueError('Dictionary name must be 1–200 characters and cannot contain a comma')
    if any(m['name'].casefold() == name.casefold() for m in list_resources('dictionary')):
        raise ValueError('A dictionary with this name already exists')
    with staged_import('dictionary') as (stage, meta):
        db = sqlite3.connect(stage / 'index.sqlite')
        try:
            db.executescript('''CREATE TABLE entries (key TEXT, normalized TEXT, content TEXT);
                CREATE INDEX entry_word ON entries(normalized);
                CREATE TABLE resources (key TEXT PRIMARY KEY, data BLOB);''')
            count = 0
            for key, content in MDX(str(mdx)).items():
                word = key.decode('utf-8').strip('\x00 ')
                db.execute('INSERT INTO entries VALUES (?,?,?)', (word, word.casefold(), content.decode('utf-8')))
                count += 1
            if not count:
                raise ValueError('MDX contains no entries')
            resource_count = 0
            for path in folder.rglob('*'):
                if not path.is_file() or path == mdx:
                    continue
                if path.suffix.lower() == '.mdd':
                    for key, content in MDD(str(path)).items():
                        db.execute('INSERT OR REPLACE INTO resources VALUES (?,?)', (resource_key(key.decode('utf-8')), content))
                        resource_count += 1
                else:
                    db.execute('INSERT OR REPLACE INTO resources VALUES (?,?)',
                        (resource_key(path.relative_to(folder).as_posix()), path.read_bytes()))
                    resource_count += 1
            db.commit()
            meta.update(name=name, filename=mdx.name, count=count, resources=resource_count)
        finally:
            db.close()
    return meta
