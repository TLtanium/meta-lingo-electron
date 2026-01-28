"""
Help Documentation API Router
"""

from fastapi import APIRouter, HTTPException
from typing import List
from pydantic import BaseModel
import os
from config import HELP_DIR

router = APIRouter()


class HelpFile(BaseModel):
    filename: str
    title: str


@router.get("/files", response_model=List[HelpFile])
async def get_help_files():
    """Get list of help documentation files"""
    help_files = []
    
    if HELP_DIR.exists():
        for filepath in HELP_DIR.glob("*.md"):
            name = filepath.stem
            # Convert filename to title (e.g., "getting-started" -> "Getting Started")
            title = name.replace("-", " ").title()
            help_files.append(HelpFile(filename=name, title=title))
    
    return help_files


@router.get("/{filename}")
async def get_help_content(filename: str):
    """Get help file content"""
    filepath = HELP_DIR / f"{filename}.md"
    
    if not filepath.exists():
        raise HTTPException(status_code=404, detail="Help file not found")
    
    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()
    
    return content

