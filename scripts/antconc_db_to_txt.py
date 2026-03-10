#!/usr/bin/env python3
"""
AntConc corpus library .db → 原始 txt 导出

将 AntConc 语料库库目录下的 SQLite .db 文件还原为按文档的 txt 文件。
表结构（AntConc）：
  - docs: doc_id, doc_file_name, corpus_id_from, corpus_id_to
  - corpus: id, doc_id, doc_token_id, type, type_ws (词形及带尾随空格/标点)
  - corpus_info: encoding 等

用法:
  python scripts/antconc_db_to_txt.py /Users/tommyleo/Downloads/antconc_corpus_library/default
  python scripts/antconc_db_to_txt.py /path/to/antconc_corpus_library/default --out /path/to/export

默认会在库目录下创建 export/ 子目录，每个 .db 对应一个子目录，其内为 doc_file_name 的 txt。
"""

from __future__ import annotations

import argparse
import sqlite3
import sys
from pathlib import Path


def find_db_files(root: Path, skip_demo: bool = True) -> list[Path]:
    """递归查找所有 .db，跳过 demo.db（可选）。"""
    out: list[Path] = []
    for p in root.rglob("*.db"):
        if skip_demo and p.name.lower() == "demo.db":
            continue
        out.append(p)
    return sorted(out)


def get_encoding(conn: sqlite3.Connection) -> str:
    try:
        row = conn.execute("SELECT encoding FROM corpus_info LIMIT 1").fetchone()
        if row and row[0]:
            return (row[0] or "utf-8").strip().lower()
    except Exception:
        pass
    return "utf-8"


def export_one_db(db_path: Path, out_base: Path) -> int:
    """
    导出单个 .db：按 docs 表逐文档取 corpus 中 id 在 [corpus_id_from, corpus_id_to] 的
    type_ws（或 type）拼接成正文，写入 out_base / doc_file_name。
    返回导出的文件数。
    """
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    try:
        encoding = get_encoding(conn)
        # 与 AntConc 一致：corpus_id_from / corpus_id_to 对应 corpus.id 闭区间
        docs = conn.execute(
            "SELECT doc_id, doc_file_name, corpus_id_from, corpus_id_to FROM docs ORDER BY doc_id"
        ).fetchall()
        if not docs:
            return 0

        out_dir = out_base / db_path.stem
        out_dir.mkdir(parents=True, exist_ok=True)
        n = 0
        for row in docs:
            doc_id, doc_file_name, cid_from, cid_to = (
                row["doc_id"],
                row["doc_file_name"],
                row["corpus_id_from"],
                row["corpus_id_to"],
            )
            if not doc_file_name or not doc_file_name.strip():
                continue
            # 安全文件名：只保留名称，避免路径穿越
            name = Path(doc_file_name).name or f"doc_{doc_id}.txt"
            if not name.lower().endswith(".txt"):
                name += ".txt"

            tokens = conn.execute(
                "SELECT type_ws, type FROM corpus WHERE id >= ? AND id <= ? ORDER BY id",
                (cid_from, cid_to),
            ).fetchall()
            parts: list[str] = []
            for t in tokens:
                tws, ttype = (t["type_ws"] or "").strip(), (t["type"] or "").strip()
                if tws:
                    parts.append(tws)
                elif ttype:
                    parts.append(ttype + " ")
            text = "".join(parts)
            if text and not text.endswith("\n"):
                text += "\n"
            out_path = out_dir / name
            out_path.write_text(text, encoding=encoding)
            n += 1
        return n
    finally:
        conn.close()


def main() -> int:
    parser = argparse.ArgumentParser(description="AntConc .db → 原始 txt 导出")
    parser.add_argument(
        "library_root",
        type=Path,
        help="AntConc 语料库库根目录，如 .../antconc_corpus_library/default",
    )
    parser.add_argument(
        "--out",
        type=Path,
        default=None,
        help="导出根目录，默认 library_root/export",
    )
    parser.add_argument("--no-skip-demo", action="store_true", help="不跳过 demo.db")
    args = parser.parse_args()
    root = args.library_root.resolve()
    if not root.is_dir():
        print(f"Not a directory: {root}", file=sys.stderr)
        return 1
    out_base = (args.out or root / "export").resolve()
    out_base.mkdir(parents=True, exist_ok=True)

    dbs = find_db_files(root, skip_demo=not args.no_skip_demo)
    if not dbs:
        print("No .db files found.")
        return 0
    print(f"Found {len(dbs)} .db file(s), exporting to {out_base}")
    total_files = 0
    for db_path in dbs:
        try:
            n = export_one_db(db_path, out_base)
            total_files += n
            print(f"  {db_path.relative_to(root)} -> {n} file(s)")
        except Exception as e:
            print(f"  ERROR {db_path}: {e}", file=sys.stderr)
    print(f"Done. Total {total_files} txt file(s) under {out_base}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
