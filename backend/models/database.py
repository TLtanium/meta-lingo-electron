"""
SQLite Database Models and Setup
Full support for multimodal corpus management
"""

import sqlite3
import os
import json
import threading
from contextlib import contextmanager
from typing import Optional, List, Dict, Any
from datetime import datetime

# Import path from config module
from config import DATABASE_PATH

# Thread-local storage for database connections
_local = threading.local()

# Reentrant lock for write operations (allows same thread to acquire multiple times)
_write_lock = threading.RLock()


def init_database():
    """Initialize SQLite database with schema"""
    os.makedirs(DATABASE_PATH.parent, exist_ok=True)
    
    conn = sqlite3.connect(str(DATABASE_PATH), timeout=30.0)
    cursor = conn.cursor()
    
    # Enable WAL mode for better concurrency
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA busy_timeout=30000")
    
    # Create corpora table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS corpora (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL UNIQUE,
            language TEXT,
            author TEXT,
            source TEXT,
            text_type TEXT,
            description TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    """)
    
    # Create texts table with extended metadata
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS texts (
            id TEXT PRIMARY KEY,
            corpus_id TEXT NOT NULL,
            filename TEXT NOT NULL,
            original_filename TEXT,
            content_path TEXT,
            media_type TEXT NOT NULL,
            transcript_path TEXT,
            transcript_json_path TEXT,
            has_timestamps BOOLEAN DEFAULT FALSE,
            yolo_annotation_path TEXT,
            clip_annotation_path TEXT,
            audio_path TEXT,
            word_count INTEGER DEFAULT 0,
            duration REAL,
            metadata TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (corpus_id) REFERENCES corpora(id) ON DELETE CASCADE,
            UNIQUE(corpus_id, filename)
        )
    """)
    
    # Add clip_annotation_path column if it doesn't exist (for existing databases)
    try:
        cursor.execute("ALTER TABLE texts ADD COLUMN clip_annotation_path TEXT")
    except sqlite3.OperationalError:
        pass  # Column already exists
    
    # Create tags table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS tags (
            id TEXT PRIMARY KEY,
            name TEXT UNIQUE NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    """)
    
    # Create corpus_tags junction table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS corpus_tags (
            corpus_id TEXT NOT NULL,
            tag_id TEXT NOT NULL,
            PRIMARY KEY (corpus_id, tag_id),
            FOREIGN KEY (corpus_id) REFERENCES corpora(id) ON DELETE CASCADE,
            FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
        )
    """)
    
    # Create text_tags junction table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS text_tags (
            text_id TEXT NOT NULL,
            tag_id TEXT NOT NULL,
            PRIMARY KEY (text_id, tag_id),
            FOREIGN KEY (text_id) REFERENCES texts(id) ON DELETE CASCADE,
            FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
        )
    """)
    
    # Create processing_tasks table for async task tracking
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS processing_tasks (
            id TEXT PRIMARY KEY,
            corpus_id TEXT,
            text_id TEXT,
            task_type TEXT NOT NULL,
            status TEXT DEFAULT 'pending',
            progress INTEGER DEFAULT 0,
            message TEXT,
            result TEXT,
            error TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            completed_at DATETIME,
            FOREIGN KEY (corpus_id) REFERENCES corpora(id) ON DELETE SET NULL,
            FOREIGN KEY (text_id) REFERENCES texts(id) ON DELETE SET NULL
        )
    """)
    
    # Create preprocess_configs table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS preprocess_configs (
            id TEXT PRIMARY KEY,
            corpus_id TEXT NOT NULL,
            name TEXT NOT NULL,
            config TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (corpus_id) REFERENCES corpora(id) ON DELETE CASCADE
        )
    """)
    
    # Create indices for better performance
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_texts_corpus_id ON texts(corpus_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_texts_media_type ON texts(media_type)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_corpus_tags_corpus ON corpus_tags(corpus_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_text_tags_text ON text_tags(text_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_tasks_status ON processing_tasks(status)")
    
    # ==================== Bibliographic Database Tables ====================
    
    # Create biblio_libraries table for bibliographic library management
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS biblio_libraries (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL UNIQUE,
            source_type TEXT NOT NULL CHECK(source_type IN ('WOS', 'CNKI')),
            description TEXT,
            entry_count INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    """)
    
    # Create biblio_entries table for bibliographic entries
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS biblio_entries (
            id TEXT PRIMARY KEY,
            library_id TEXT NOT NULL,
            title TEXT NOT NULL,
            authors TEXT,
            institutions TEXT,
            countries TEXT,
            journal TEXT,
            year INTEGER,
            volume TEXT,
            issue TEXT,
            pages TEXT,
            doi TEXT,
            keywords TEXT,
            abstract TEXT,
            doc_type TEXT,
            language TEXT,
            citation_count INTEGER DEFAULT 0,
            source_url TEXT,
            unique_id TEXT,
            raw_data TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (library_id) REFERENCES biblio_libraries(id) ON DELETE CASCADE
        )
    """)
    
    # Create indices for biblio tables
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_biblio_entries_library ON biblio_entries(library_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_biblio_entries_year ON biblio_entries(year)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_biblio_entries_doi ON biblio_entries(doi)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_biblio_entries_unique_id ON biblio_entries(unique_id)")
    
    conn.commit()
    conn.close()


@contextmanager
def get_db_connection(readonly: bool = False):
    """Get database connection context manager with proper concurrency handling"""
    conn = sqlite3.connect(str(DATABASE_PATH), timeout=30.0, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=30000")
    
    if readonly:
        try:
            yield conn
        finally:
            conn.close()
    else:
        # Use write lock for non-readonly operations
        with _write_lock:
            try:
                yield conn
            finally:
                conn.close()


@contextmanager
def get_db_readonly():
    """Get read-only database connection (no lock needed)"""
    conn = sqlite3.connect(str(DATABASE_PATH), timeout=30.0, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=30000")
    try:
        yield conn
    finally:
        conn.close()


def row_to_dict(row: sqlite3.Row) -> Dict[str, Any]:
    """Convert sqlite3.Row to dictionary"""
    return dict(row)


def rows_to_list(rows: List[sqlite3.Row]) -> List[Dict[str, Any]]:
    """Convert list of sqlite3.Row to list of dictionaries"""
    return [row_to_dict(row) for row in rows]


class CorpusDB:
    """Database operations for corpora"""
    
    @staticmethod
    def create(corpus_data: Dict[str, Any]) -> Dict[str, Any]:
        """Create a new corpus"""
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO corpora (id, name, language, author, source, text_type, description)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (
                corpus_data['id'],
                corpus_data['name'],
                corpus_data.get('language'),
                corpus_data.get('author'),
                corpus_data.get('source'),
                corpus_data.get('text_type'),
                corpus_data.get('description')
            ))
            
            # Handle tags - pass connection to avoid nested locks
            if corpus_data.get('tags'):
                for tag_name in corpus_data['tags']:
                    tag_id = TagDB.get_or_create(tag_name, conn=conn)
                    cursor.execute(
                        "INSERT OR IGNORE INTO corpus_tags (corpus_id, tag_id) VALUES (?, ?)",
                        (corpus_data['id'], tag_id)
                    )
            
            conn.commit()
            return CorpusDB.get_by_id(corpus_data['id'])
    
    @staticmethod
    def get_by_id(corpus_id: str) -> Optional[Dict[str, Any]]:
        """Get corpus by ID"""
        with get_db_readonly() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM corpora WHERE id = ?", (corpus_id,))
            row = cursor.fetchone()
            if row:
                corpus = row_to_dict(row)
                corpus['tags'] = CorpusDB._get_tags_with_conn(conn, corpus_id)
                corpus['text_count'] = TextDB._count_by_corpus_with_conn(conn, corpus_id)
                return corpus
            return None
    
    @staticmethod
    def get_by_name(name: str) -> Optional[Dict[str, Any]]:
        """Get corpus by name"""
        with get_db_readonly() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM corpora WHERE name = ?", (name,))
            row = cursor.fetchone()
            if row:
                corpus = row_to_dict(row)
                corpus['tags'] = CorpusDB._get_tags_with_conn(conn, corpus['id'])
                corpus['text_count'] = TextDB._count_by_corpus_with_conn(conn, corpus['id'])
                return corpus
            return None
    
    @staticmethod
    def list_all() -> List[Dict[str, Any]]:
        """List all corpora"""
        with get_db_readonly() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM corpora ORDER BY updated_at DESC")
            rows = cursor.fetchall()
            corpora = []
            for row in rows:
                corpus = row_to_dict(row)
                corpus['tags'] = CorpusDB._get_tags_with_conn(conn, corpus['id'])
                corpus['text_count'] = TextDB._count_by_corpus_with_conn(conn, corpus['id'])
                corpora.append(corpus)
            return corpora
    
    @staticmethod
    def update(corpus_id: str, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Update corpus"""
        with get_db_connection() as conn:
            cursor = conn.cursor()
            
            fields = []
            values = []
            for key in ['name', 'language', 'author', 'source', 'text_type', 'description']:
                if key in data:
                    fields.append(f"{key} = ?")
                    values.append(data[key])
            
            if fields:
                fields.append("updated_at = CURRENT_TIMESTAMP")
                values.append(corpus_id)
                cursor.execute(
                    f"UPDATE corpora SET {', '.join(fields)} WHERE id = ?",
                    values
                )
            
            # Handle tags update - pass connection to avoid nested locks
            if 'tags' in data:
                cursor.execute("DELETE FROM corpus_tags WHERE corpus_id = ?", (corpus_id,))
                for tag_name in data['tags']:
                    tag_id = TagDB.get_or_create(tag_name, conn=conn)
                    cursor.execute(
                        "INSERT OR IGNORE INTO corpus_tags (corpus_id, tag_id) VALUES (?, ?)",
                        (corpus_id, tag_id)
                    )
            
            conn.commit()
            return CorpusDB.get_by_id(corpus_id)
    
    @staticmethod
    def delete(corpus_id: str) -> bool:
        """Delete corpus and all related data"""
        with get_db_connection() as conn:
            cursor = conn.cursor()
            # Delete related tags first
            cursor.execute("DELETE FROM corpus_tags WHERE corpus_id = ?", (corpus_id,))
            # Delete related text tags
            cursor.execute("""
                DELETE FROM text_tags WHERE text_id IN (
                    SELECT id FROM texts WHERE corpus_id = ?
                )
            """, (corpus_id,))
            # Delete related texts (should cascade, but explicit for safety)
            cursor.execute("DELETE FROM texts WHERE corpus_id = ?", (corpus_id,))
            # Delete the corpus itself
            cursor.execute("DELETE FROM corpora WHERE id = ?", (corpus_id,))
            conn.commit()
            return cursor.rowcount > 0
    
    @staticmethod
    def _get_tags_with_conn(conn, corpus_id: str) -> List[str]:
        """Get corpus tags using existing connection"""
        cursor = conn.cursor()
        cursor.execute("""
            SELECT t.name FROM tags t
            JOIN corpus_tags ct ON t.id = ct.tag_id
            WHERE ct.corpus_id = ?
        """, (corpus_id,))
        return [row[0] for row in cursor.fetchall()]
    
    @staticmethod
    def get_tags(corpus_id: str) -> List[str]:
        """Get corpus tags"""
        with get_db_readonly() as conn:
            return CorpusDB._get_tags_with_conn(conn, corpus_id)
    
    @staticmethod
    def add_tag(corpus_id: str, tag_name: str) -> bool:
        """Add tag to corpus"""
        with get_db_connection() as conn:
            cursor = conn.cursor()
            tag_id = TagDB.get_or_create(tag_name, conn=conn)
            try:
                cursor.execute(
                    "INSERT INTO corpus_tags (corpus_id, tag_id) VALUES (?, ?)",
                    (corpus_id, tag_id)
                )
                conn.commit()
                return True
            except sqlite3.IntegrityError:
                return False
    
    @staticmethod
    def remove_tag(corpus_id: str, tag_name: str) -> bool:
        """Remove tag from corpus"""
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                DELETE FROM corpus_tags WHERE corpus_id = ? AND tag_id IN (
                    SELECT id FROM tags WHERE name = ?
                )
            """, (corpus_id, tag_name))
            conn.commit()
            return cursor.rowcount > 0


class TextDB:
    """Database operations for texts"""
    
    @staticmethod
    def create(text_data: Dict[str, Any]) -> Dict[str, Any]:
        """Create a new text entry"""
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO texts (
                    id, corpus_id, filename, original_filename, content_path, 
                    media_type, transcript_path, transcript_json_path, has_timestamps,
                    yolo_annotation_path, clip_annotation_path, audio_path, word_count, duration, metadata
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                text_data['id'],
                text_data['corpus_id'],
                text_data['filename'],
                text_data.get('original_filename'),
                text_data.get('content_path'),
                text_data['media_type'],
                text_data.get('transcript_path'),
                text_data.get('transcript_json_path'),
                text_data.get('has_timestamps', False),
                text_data.get('yolo_annotation_path'),
                text_data.get('clip_annotation_path'),
                text_data.get('audio_path'),
                text_data.get('word_count', 0),
                text_data.get('duration'),
                json.dumps(text_data.get('metadata', {}))
            ))
            
            # Handle tags - pass connection to avoid nested locks
            if text_data.get('tags'):
                for tag_name in text_data['tags']:
                    tag_id = TagDB.get_or_create(tag_name, conn=conn)
                    cursor.execute(
                        "INSERT OR IGNORE INTO text_tags (text_id, tag_id) VALUES (?, ?)",
                        (text_data['id'], tag_id)
                    )
            
            conn.commit()
            return TextDB.get_by_id(text_data['id'])
    
    @staticmethod
    def _get_tags_with_conn(conn, text_id: str) -> List[str]:
        """Get text tags using existing connection"""
        cursor = conn.cursor()
        cursor.execute("""
            SELECT t.name FROM tags t
            JOIN text_tags tt ON t.id = tt.tag_id
            WHERE tt.text_id = ?
        """, (text_id,))
        return [row[0] for row in cursor.fetchall()]
    
    @staticmethod
    def get_by_id(text_id: str) -> Optional[Dict[str, Any]]:
        """Get text by ID"""
        with get_db_readonly() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM texts WHERE id = ?", (text_id,))
            row = cursor.fetchone()
            if row:
                text = row_to_dict(row)
                text['tags'] = TextDB._get_tags_with_conn(conn, text_id)
                if text.get('metadata'):
                    text['metadata'] = json.loads(text['metadata'])
                return text
            return None
    
    @staticmethod
    def list_by_corpus(corpus_id: str) -> List[Dict[str, Any]]:
        """List all texts in a corpus"""
        with get_db_readonly() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT * FROM texts WHERE corpus_id = ? ORDER BY created_at DESC",
                (corpus_id,)
            )
            rows = cursor.fetchall()
            texts = []
            for row in rows:
                text = row_to_dict(row)
                text['tags'] = TextDB._get_tags_with_conn(conn, text['id'])
                if text.get('metadata'):
                    text['metadata'] = json.loads(text['metadata'])
                texts.append(text)
            return texts
    
    @staticmethod
    def _count_by_corpus_with_conn(conn, corpus_id: str) -> int:
        """Count texts in a corpus using existing connection"""
        cursor = conn.cursor()
        cursor.execute(
            "SELECT COUNT(*) FROM texts WHERE corpus_id = ?",
            (corpus_id,)
        )
        return cursor.fetchone()[0]
    
    @staticmethod
    def count_by_corpus(corpus_id: str) -> int:
        """Count texts in a corpus"""
        with get_db_readonly() as conn:
            return TextDB._count_by_corpus_with_conn(conn, corpus_id)
    
    @staticmethod
    def update(text_id: str, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Update text entry"""
        with get_db_connection() as conn:
            cursor = conn.cursor()
            
            fields = []
            values = []
            for key in ['filename', 'content_path', 'transcript_path', 'transcript_json_path',
                       'has_timestamps', 'yolo_annotation_path', 'clip_annotation_path', 'audio_path', 
                       'word_count', 'duration']:
                if key in data:
                    fields.append(f"{key} = ?")
                    values.append(data[key])
            
            if 'metadata' in data:
                fields.append("metadata = ?")
                values.append(json.dumps(data['metadata']))
            
            if fields:
                fields.append("updated_at = CURRENT_TIMESTAMP")
                values.append(text_id)
                cursor.execute(
                    f"UPDATE texts SET {', '.join(fields)} WHERE id = ?",
                    values
                )
            
            # Handle tags update - pass connection to avoid nested locks
            if 'tags' in data:
                cursor.execute("DELETE FROM text_tags WHERE text_id = ?", (text_id,))
                for tag_name in data['tags']:
                    tag_id = TagDB.get_or_create(tag_name, conn=conn)
                    cursor.execute(
                        "INSERT OR IGNORE INTO text_tags (text_id, tag_id) VALUES (?, ?)",
                        (text_id, tag_id)
                    )
            
            conn.commit()
            return TextDB.get_by_id(text_id)
    
    @staticmethod
    def delete(text_id: str) -> bool:
        """Delete text entry"""
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM texts WHERE id = ?", (text_id,))
            conn.commit()
            return cursor.rowcount > 0
    
    @staticmethod
    def get_tags(text_id: str) -> List[str]:
        """Get text tags"""
        with get_db_readonly() as conn:
            return TextDB._get_tags_with_conn(conn, text_id)
    
    @staticmethod
    def add_tag(text_id: str, tag_name: str) -> bool:
        """Add tag to text"""
        with get_db_connection() as conn:
            cursor = conn.cursor()
            tag_id = TagDB.get_or_create(tag_name, conn=conn)
            try:
                cursor.execute(
                    "INSERT INTO text_tags (text_id, tag_id) VALUES (?, ?)",
                    (text_id, tag_id)
                )
                conn.commit()
                return True
            except sqlite3.IntegrityError:
                return False
    
    @staticmethod
    def remove_tag(text_id: str, tag_name: str) -> bool:
        """Remove tag from text"""
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                DELETE FROM text_tags WHERE text_id = ? AND tag_id IN (
                    SELECT id FROM tags WHERE name = ?
                )
            """, (text_id, tag_name))
            conn.commit()
            return cursor.rowcount > 0


class TagDB:
    """Database operations for tags"""
    
    @staticmethod
    def get_or_create(tag_name: str, conn=None) -> str:
        """Get existing tag ID or create new one
        
        Args:
            tag_name: Tag name
            conn: Optional existing database connection (to avoid nested locks)
        """
        import uuid
        
        if conn is not None:
            # Use existing connection (no new lock needed)
            cursor = conn.cursor()
            cursor.execute("SELECT id FROM tags WHERE name = ?", (tag_name,))
            row = cursor.fetchone()
            if row:
                return row[0]
            
            tag_id = str(uuid.uuid4())
            cursor.execute(
                "INSERT INTO tags (id, name) VALUES (?, ?)",
                (tag_id, tag_name)
            )
            # Don't commit here - let the caller handle it
            return tag_id
        else:
            # Create new connection
            with get_db_connection() as new_conn:
                cursor = new_conn.cursor()
                cursor.execute("SELECT id FROM tags WHERE name = ?", (tag_name,))
                row = cursor.fetchone()
                if row:
                    return row[0]
                
                tag_id = str(uuid.uuid4())
                cursor.execute(
                    "INSERT INTO tags (id, name) VALUES (?, ?)",
                    (tag_id, tag_name)
                )
                new_conn.commit()
                return tag_id
    
    @staticmethod
    def list_all() -> List[str]:
        """List all tag names"""
        with get_db_readonly() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT name FROM tags ORDER BY name")
            return [row[0] for row in cursor.fetchall()]


class TaskDB:
    """Database operations for processing tasks"""
    
    @staticmethod
    def create(task_data: Dict[str, Any]) -> Dict[str, Any]:
        """Create a new task"""
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO processing_tasks (
                    id, corpus_id, text_id, task_type, status, message
                )
                VALUES (?, ?, ?, ?, ?, ?)
            """, (
                task_data['id'],
                task_data.get('corpus_id'),
                task_data.get('text_id'),
                task_data['task_type'],
                task_data.get('status', 'pending'),
                task_data.get('message')
            ))
            conn.commit()
            return TaskDB.get_by_id(task_data['id'])
    
    @staticmethod
    def get_by_id(task_id: str) -> Optional[Dict[str, Any]]:
        """Get task by ID"""
        with get_db_readonly() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM processing_tasks WHERE id = ?", (task_id,))
            row = cursor.fetchone()
            if row:
                task = row_to_dict(row)
                if task.get('result'):
                    task['result'] = json.loads(task['result'])
                return task
            return None
    
    @staticmethod
    def update(task_id: str, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Update task"""
        with get_db_connection() as conn:
            cursor = conn.cursor()
            
            fields = ["updated_at = CURRENT_TIMESTAMP"]
            values = []
            
            for key in ['status', 'progress', 'message', 'error']:
                if key in data:
                    fields.append(f"{key} = ?")
                    values.append(data[key])
            
            if 'result' in data:
                fields.append("result = ?")
                values.append(json.dumps(data['result']))
            
            if data.get('status') == 'completed':
                fields.append("completed_at = CURRENT_TIMESTAMP")
            
            values.append(task_id)
            cursor.execute(
                f"UPDATE processing_tasks SET {', '.join(fields)} WHERE id = ?",
                values
            )
            conn.commit()
            return TaskDB.get_by_id(task_id)
    
    @staticmethod
    def list_by_corpus(corpus_id: str) -> List[Dict[str, Any]]:
        """List active tasks for a corpus (pending/processing, or recently completed)"""
        with get_db_readonly() as conn:
            cursor = conn.cursor()
            # Only return:
            # - Active tasks (pending or processing)
            # - Tasks completed within the last 2 minutes (to show completion status)
            cursor.execute(
                """SELECT * FROM processing_tasks 
                   WHERE corpus_id = ? 
                   AND (
                       status IN ('pending', 'processing')
                       OR (status IN ('completed', 'failed') 
                           AND updated_at > datetime('now', '-2 minutes'))
                   )
                   ORDER BY created_at DESC""",
                (corpus_id,)
            )
            return rows_to_list(cursor.fetchall())
    
    @staticmethod
    def cleanup_stale_tasks():
        """Mark any pending/processing tasks as failed (called on startup)"""
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """UPDATE processing_tasks 
                   SET status = 'failed', 
                       message = 'Task interrupted (server restart)',
                       updated_at = CURRENT_TIMESTAMP
                   WHERE status IN ('pending', 'processing')"""
            )
            affected = cursor.rowcount
            conn.commit()
            if affected > 0:
                print(f"[TaskDB] Cleaned up {affected} stale task(s)")
            return affected


class BiblioLibraryDB:
    """Database operations for bibliographic libraries"""
    
    @staticmethod
    def create(library_data: Dict[str, Any]) -> Dict[str, Any]:
        """Create a new bibliographic library"""
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO biblio_libraries (id, name, source_type, description)
                VALUES (?, ?, ?, ?)
            """, (
                library_data['id'],
                library_data['name'],
                library_data['source_type'],
                library_data.get('description')
            ))
            conn.commit()
            return BiblioLibraryDB.get_by_id(library_data['id'])
    
    @staticmethod
    def get_by_id(library_id: str) -> Optional[Dict[str, Any]]:
        """Get library by ID"""
        with get_db_readonly() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM biblio_libraries WHERE id = ?", (library_id,))
            row = cursor.fetchone()
            if row:
                library = row_to_dict(row)
                # Get actual entry count
                cursor.execute(
                    "SELECT COUNT(*) FROM biblio_entries WHERE library_id = ?",
                    (library_id,)
                )
                library['entry_count'] = cursor.fetchone()[0]
                return library
            return None
    
    @staticmethod
    def get_by_name(name: str) -> Optional[Dict[str, Any]]:
        """Get library by name"""
        with get_db_readonly() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM biblio_libraries WHERE name = ?", (name,))
            row = cursor.fetchone()
            if row:
                library = row_to_dict(row)
                cursor.execute(
                    "SELECT COUNT(*) FROM biblio_entries WHERE library_id = ?",
                    (library['id'],)
                )
                library['entry_count'] = cursor.fetchone()[0]
                return library
            return None
    
    @staticmethod
    def list_all() -> List[Dict[str, Any]]:
        """List all bibliographic libraries"""
        with get_db_readonly() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM biblio_libraries ORDER BY updated_at DESC")
            rows = cursor.fetchall()
            libraries = []
            for row in rows:
                library = row_to_dict(row)
                cursor.execute(
                    "SELECT COUNT(*) FROM biblio_entries WHERE library_id = ?",
                    (library['id'],)
                )
                library['entry_count'] = cursor.fetchone()[0]
                libraries.append(library)
            return libraries
    
    @staticmethod
    def update(library_id: str, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Update library"""
        with get_db_connection() as conn:
            cursor = conn.cursor()
            
            fields = []
            values = []
            for key in ['name', 'description']:
                if key in data:
                    fields.append(f"{key} = ?")
                    values.append(data[key])
            
            if fields:
                fields.append("updated_at = CURRENT_TIMESTAMP")
                values.append(library_id)
                cursor.execute(
                    f"UPDATE biblio_libraries SET {', '.join(fields)} WHERE id = ?",
                    values
                )
                conn.commit()
            
            return BiblioLibraryDB.get_by_id(library_id)
    
    @staticmethod
    def delete(library_id: str) -> bool:
        """Delete library and all related entries"""
        with get_db_connection() as conn:
            cursor = conn.cursor()
            # Delete all entries first
            cursor.execute("DELETE FROM biblio_entries WHERE library_id = ?", (library_id,))
            # Delete the library
            cursor.execute("DELETE FROM biblio_libraries WHERE id = ?", (library_id,))
            conn.commit()
            return cursor.rowcount > 0
    
    @staticmethod
    def update_entry_count(library_id: str):
        """Update the entry count for a library"""
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """UPDATE biblio_libraries 
                   SET entry_count = (SELECT COUNT(*) FROM biblio_entries WHERE library_id = ?),
                       updated_at = CURRENT_TIMESTAMP
                   WHERE id = ?""",
                (library_id, library_id)
            )
            conn.commit()


class BiblioEntryDB:
    """Database operations for bibliographic entries"""
    
    @staticmethod
    def create(entry_data: Dict[str, Any]) -> Dict[str, Any]:
        """Create a new bibliographic entry"""
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO biblio_entries (
                    id, library_id, title, authors, institutions, countries,
                    journal, year, volume, issue, pages, doi, keywords,
                    abstract, doc_type, language, citation_count, source_url,
                    unique_id, raw_data
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                entry_data['id'],
                entry_data['library_id'],
                entry_data['title'],
                json.dumps(entry_data.get('authors', []), ensure_ascii=False),
                json.dumps(entry_data.get('institutions', []), ensure_ascii=False),
                json.dumps(entry_data.get('countries', []), ensure_ascii=False),
                entry_data.get('journal'),
                entry_data.get('year'),
                entry_data.get('volume'),
                entry_data.get('issue'),
                entry_data.get('pages'),
                entry_data.get('doi'),
                json.dumps(entry_data.get('keywords', []), ensure_ascii=False),
                entry_data.get('abstract'),
                entry_data.get('doc_type'),
                entry_data.get('language'),
                entry_data.get('citation_count', 0),
                entry_data.get('source_url'),
                entry_data.get('unique_id'),
                json.dumps(entry_data.get('raw_data', {}), ensure_ascii=False)
            ))
            conn.commit()
            return BiblioEntryDB.get_by_id(entry_data['id'])
    
    @staticmethod
    def create_batch(entries: List[Dict[str, Any]]) -> int:
        """Create multiple entries in batch"""
        with get_db_connection() as conn:
            cursor = conn.cursor()
            count = 0
            for entry in entries:
                try:
                    cursor.execute("""
                        INSERT INTO biblio_entries (
                            id, library_id, title, authors, institutions, countries,
                            journal, year, volume, issue, pages, doi, keywords,
                            abstract, doc_type, language, citation_count, source_url,
                            unique_id, raw_data
                        )
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, (
                        entry['id'],
                        entry['library_id'],
                        entry['title'],
                        json.dumps(entry.get('authors', []), ensure_ascii=False),
                        json.dumps(entry.get('institutions', []), ensure_ascii=False),
                        json.dumps(entry.get('countries', []), ensure_ascii=False),
                        entry.get('journal'),
                        entry.get('year'),
                        entry.get('volume'),
                        entry.get('issue'),
                        entry.get('pages'),
                        entry.get('doi'),
                        json.dumps(entry.get('keywords', []), ensure_ascii=False),
                        entry.get('abstract'),
                        entry.get('doc_type'),
                        entry.get('language'),
                        entry.get('citation_count', 0),
                        entry.get('source_url'),
                        entry.get('unique_id'),
                        json.dumps(entry.get('raw_data', {}), ensure_ascii=False)
                    ))
                    count += 1
                except sqlite3.IntegrityError:
                    continue  # Skip duplicates
            conn.commit()
            return count
    
    @staticmethod
    def get_by_id(entry_id: str) -> Optional[Dict[str, Any]]:
        """Get entry by ID"""
        with get_db_readonly() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM biblio_entries WHERE id = ?", (entry_id,))
            row = cursor.fetchone()
            if row:
                entry = row_to_dict(row)
                # Parse JSON fields
                for field in ['authors', 'institutions', 'countries', 'keywords', 'raw_data']:
                    if entry.get(field):
                        try:
                            entry[field] = json.loads(entry[field])
                        except (json.JSONDecodeError, TypeError):
                            entry[field] = []
                return entry
            return None
    
    @staticmethod
    def list_by_library(library_id: str, filters: Optional[Dict[str, Any]] = None, 
                        page: int = 1, page_size: int = 50) -> Dict[str, Any]:
        """List entries in a library with optional filters and pagination"""
        with get_db_readonly() as conn:
            cursor = conn.cursor()
            
            # Build query
            query = "SELECT * FROM biblio_entries WHERE library_id = ?"
            count_query = "SELECT COUNT(*) FROM biblio_entries WHERE library_id = ?"
            params = [library_id]
            
            if filters:
                # Year range filter
                if filters.get('year_start'):
                    query += " AND year >= ?"
                    count_query += " AND year >= ?"
                    params.append(filters['year_start'])
                if filters.get('year_end'):
                    query += " AND year <= ?"
                    count_query += " AND year <= ?"
                    params.append(filters['year_end'])
                
                # Author filter (search in JSON array)
                if filters.get('author'):
                    query += " AND authors LIKE ?"
                    count_query += " AND authors LIKE ?"
                    params.append(f'%{filters["author"]}%')
                
                # Institution filter
                if filters.get('institution'):
                    query += " AND institutions LIKE ?"
                    count_query += " AND institutions LIKE ?"
                    params.append(f'%{filters["institution"]}%')
                
                # Keyword filter
                if filters.get('keyword'):
                    query += " AND keywords LIKE ?"
                    count_query += " AND keywords LIKE ?"
                    params.append(f'%{filters["keyword"]}%')
                
                # Journal filter
                if filters.get('journal'):
                    query += " AND journal LIKE ?"
                    count_query += " AND journal LIKE ?"
                    params.append(f'%{filters["journal"]}%')
                
                # Document type filter
                if filters.get('doc_type'):
                    query += " AND doc_type = ?"
                    count_query += " AND doc_type = ?"
                    params.append(filters['doc_type'])
            
            # Get total count
            cursor.execute(count_query, params)
            total = cursor.fetchone()[0]
            
            # Add pagination
            query += " ORDER BY year DESC, title ASC LIMIT ? OFFSET ?"
            params.extend([page_size, (page - 1) * page_size])
            
            cursor.execute(query, params)
            rows = cursor.fetchall()
            
            entries = []
            for row in rows:
                entry = row_to_dict(row)
                for field in ['authors', 'institutions', 'countries', 'keywords', 'raw_data']:
                    if entry.get(field):
                        try:
                            entry[field] = json.loads(entry[field])
                        except (json.JSONDecodeError, TypeError):
                            entry[field] = []
                entries.append(entry)
            
            return {
                'entries': entries,
                'total': total,
                'page': page,
                'page_size': page_size,
                'total_pages': (total + page_size - 1) // page_size
            }
    
    @staticmethod
    def get_all_by_library(library_id: str, filters: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
        """Get all entries in a library (for visualization)"""
        with get_db_readonly() as conn:
            cursor = conn.cursor()
            
            query = "SELECT * FROM biblio_entries WHERE library_id = ?"
            params = [library_id]
            
            if filters:
                if filters.get('year_start'):
                    query += " AND year >= ?"
                    params.append(filters['year_start'])
                if filters.get('year_end'):
                    query += " AND year <= ?"
                    params.append(filters['year_end'])
                if filters.get('author'):
                    query += " AND authors LIKE ?"
                    params.append(f'%{filters["author"]}%')
                if filters.get('institution'):
                    query += " AND institutions LIKE ?"
                    params.append(f'%{filters["institution"]}%')
                if filters.get('keyword'):
                    query += " AND keywords LIKE ?"
                    params.append(f'%{filters["keyword"]}%')
                if filters.get('journal'):
                    query += " AND journal LIKE ?"
                    params.append(f'%{filters["journal"]}%')
                if filters.get('doc_type'):
                    query += " AND doc_type = ?"
                    params.append(filters['doc_type'])
            
            query += " ORDER BY year DESC"
            cursor.execute(query, params)
            rows = cursor.fetchall()
            
            entries = []
            for row in rows:
                entry = row_to_dict(row)
                for field in ['authors', 'institutions', 'countries', 'keywords', 'raw_data']:
                    if entry.get(field):
                        try:
                            entry[field] = json.loads(entry[field])
                        except (json.JSONDecodeError, TypeError):
                            entry[field] = []
                entries.append(entry)
            
            return entries
    
    @staticmethod
    def delete(entry_id: str) -> bool:
        """Delete a single entry"""
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM biblio_entries WHERE id = ?", (entry_id,))
            conn.commit()
            return cursor.rowcount > 0
    
    @staticmethod
    def delete_by_library(library_id: str) -> int:
        """Delete all entries in a library"""
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM biblio_entries WHERE library_id = ?", (library_id,))
            count = cursor.rowcount
            conn.commit()
            return count
    
    @staticmethod
    def get_statistics(library_id: str) -> Dict[str, Any]:
        """Get statistics for a library"""
        with get_db_readonly() as conn:
            cursor = conn.cursor()
            
            # Total count
            cursor.execute(
                "SELECT COUNT(*) FROM biblio_entries WHERE library_id = ?",
                (library_id,)
            )
            total = cursor.fetchone()[0]
            
            # Year range
            cursor.execute(
                "SELECT MIN(year), MAX(year) FROM biblio_entries WHERE library_id = ? AND year IS NOT NULL",
                (library_id,)
            )
            year_row = cursor.fetchone()
            year_start = year_row[0]
            year_end = year_row[1]
            
            # Year distribution
            cursor.execute(
                """SELECT year, COUNT(*) as count 
                   FROM biblio_entries 
                   WHERE library_id = ? AND year IS NOT NULL
                   GROUP BY year ORDER BY year""",
                (library_id,)
            )
            year_distribution = {row[0]: row[1] for row in cursor.fetchall()}
            
            # Document types
            cursor.execute(
                """SELECT doc_type, COUNT(*) as count 
                   FROM biblio_entries 
                   WHERE library_id = ? AND doc_type IS NOT NULL
                   GROUP BY doc_type ORDER BY count DESC""",
                (library_id,)
            )
            doc_types = {row[0]: row[1] for row in cursor.fetchall()}
            
            return {
                'total': total,
                'year_start': year_start,
                'year_end': year_end,
                'year_distribution': year_distribution,
                'doc_types': doc_types
            }
    
    @staticmethod
    def get_unique_values(library_id: str, field: str) -> List[str]:
        """Get unique values for a field (for filter dropdowns)"""
        with get_db_readonly() as conn:
            cursor = conn.cursor()
            
            if field in ['authors', 'institutions', 'countries', 'keywords']:
                # For JSON array fields, we need to parse and aggregate
                cursor.execute(
                    f"SELECT {field} FROM biblio_entries WHERE library_id = ?",
                    (library_id,)
                )
                values = set()
                for row in cursor.fetchall():
                    if row[0]:
                        try:
                            items = json.loads(row[0])
                            if isinstance(items, list):
                                values.update(items)
                        except (json.JSONDecodeError, TypeError):
                            pass
                return sorted(list(values))
            else:
                # For simple fields
                cursor.execute(
                    f"SELECT DISTINCT {field} FROM biblio_entries WHERE library_id = ? AND {field} IS NOT NULL ORDER BY {field}",
                    (library_id,)
                )
                return [row[0] for row in cursor.fetchall()]


# Initialize database on module import
init_database()

# Clean up any stale tasks from previous runs
TaskDB.cleanup_stale_tasks()
