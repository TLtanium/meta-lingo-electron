"""
Library / corpus migration (export & import) package.

Packs a corpus or bibliographic library — its database rows AND its on-disk files
(text content, annotation sidecars, media, annotation archives, PDFs, thumbnails) — into a
single portable .zip bundle, and restores it on another machine (or as a backup) so the
whole library reappears in the user's list.

Public API lives in `services.migration_service`.
"""

from .pack_common import (
    BUNDLE_FORMAT,
    BUNDLE_FORMAT_VERSION,
    MANIFEST_NAME,
)

__all__ = ["BUNDLE_FORMAT", "BUNDLE_FORMAT_VERSION", "MANIFEST_NAME"]
