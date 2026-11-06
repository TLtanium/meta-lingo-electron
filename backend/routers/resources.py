"""Local user-resource imports; uploaded files are validated before activation."""
import json
import shutil
import tempfile
from pathlib import Path, PurePosixPath
from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from starlette.concurrency import run_in_threadpool
from services.user_resource_store import list_resources, remove_resource
from services.nrc_resource_import import import_nrc
from services.dictionary_import import import_dictionary
from services.reference_resource_import import import_reference, validate_reference_csv

router = APIRouter()


def _upload_files(files, folder, kind):
    seen, total = set(), 0
    for upload in files:
        relative = PurePosixPath((upload.filename or "").replace("\\", "/"))
        if relative.is_absolute() or ".." in relative.parts or not relative.name or ":" in str(relative):
            raise ValueError("Invalid filename")
        if kind == "nrc" and relative.suffix.lower() != ".txt":
            continue
        if str(relative).casefold() in seen:
            raise ValueError("Duplicate filename")
        seen.add(str(relative).casefold())
        path = folder.joinpath(*relative.parts)
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("wb") as output:
            while chunk := upload.file.read(1024 * 1024):
                total += len(chunk)
                if total > 2 * 1024**3:
                    raise ValueError("Import exceeds 2 GB")
                output.write(chunk)
    return folder


def _import(kind, files, metadata, validate_only):
    with tempfile.TemporaryDirectory(prefix="metalingo-resource-") as temporary:
        folder = _upload_files(files, Path(temporary), kind)
        if kind == "nrc":
            return import_nrc(folder)
        if kind == "dictionary":
            return import_dictionary(folder, metadata.get("name", ""))
        if kind == "reference":
            paths = [p for p in folder.rglob("*") if p.is_file()]
            if len(paths) != 1 or paths[0].suffix.lower() != ".csv":
                raise ValueError("Select one UTF-8 reference CSV")
            if validate_only:
                return validate_reference_csv(paths[0])
            return import_reference(paths[0], metadata)
        raise ValueError("Unknown resource type")


@router.get("")
def resource_status():
    return {"nrc": list_resources("nrc"), "dictionary": list_resources("dictionary"), "reference": list_resources("reference")}


@router.post("/{kind}/import")
async def upload_resources(kind: str, files: list[UploadFile] = File(...), metadata: str = Form("{}"), validate_only: bool = Form(False)):
    try:
        values = json.loads(metadata)
        if not isinstance(values, dict):
            raise ValueError("Invalid metadata")
        result = await run_in_threadpool(_import, kind, files, values, validate_only)
        return {"success": True, "data": result}
    except (ValueError, UnicodeError) as exc:
        raise HTTPException(400, detail=str(exc)) from exc
    except Exception as exc:
        # MDict readers may assert for password-protected or unsupported variants.
        raise HTTPException(400, detail="Import failed: unsupported or damaged resource. Password-protected MDX is not supported.") from exc
    finally:
        for upload in files:
            await upload.close()


@router.delete("/{kind}/{resource_id}")
def delete_resource(kind: str, resource_id: str):
    try:
        remove_resource(kind, resource_id)
        if kind == "reference":
            from services.corpus_resource_service import get_corpus_resource_service
            get_corpus_resource_service().clear_cache(resource_id)
        return {"success": True}
    except ValueError as exc:
        raise HTTPException(400, detail=str(exc)) from exc
    except OSError as exc:
        raise HTTPException(500, detail="Could not remove resource. Close applications using its files and retry.") from exc
