"""Language-neutral metadata for user-imported references, including legacy reads."""
import re


def _text(*values):
    return next((value.strip() for value in values if isinstance(value, str) and value.strip()), "")


def split_reference_tags(value):
    values = [value] if isinstance(value, str) else value if isinstance(value, list) else []
    return list(dict.fromkeys(part.strip() for item in values if isinstance(item, str)
                              for part in re.split(r"[,，]", item) if part.strip()))


def reference_metadata(metadata):
    """Choose a stable legacy fallback; never choose content based on UI language."""
    return {
        "name": _text(metadata.get("name"), metadata.get("name_zh"), metadata.get("name_en")),
        "prefix": _text(metadata.get("prefix")),
        "description": _text(metadata.get("description"), metadata.get("description_zh"), metadata.get("description_en")),
        "tags": split_reference_tags(metadata["tags"] if "tags" in metadata else
                                     split_reference_tags(metadata.get("tags_zh")) + split_reference_tags(metadata.get("tags_en"))),
    }


def present_reference(metadata):
    fields = reference_metadata(metadata)
    # Retain older API consumers without storing duplicate translations on new imports.
    return dict(metadata, **fields, name_en=fields["name"], name_zh=fields["name"],
                description_en=fields["description"], description_zh=fields["description"],
                tags_en=fields["tags"], tags_zh=fields["tags"], category=metadata.get("category", ""))
