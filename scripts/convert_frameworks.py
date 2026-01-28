"""
Framework Conversion Script
Converts old txt-based frameworks to new JSON format
"""

import os
import json
import uuid
import random
from pathlib import Path
from datetime import datetime

# Source and target directories
SOURCE_DIR = Path("/Users/tommyleo/Downloads/corpuscortex_app/schemas/frameworks")
TARGET_DIR = Path("/Users/tommyleo/Downloads/Meta-Lingo-Electron/data/frameworks")


def generate_color():
    """Generate a random pastel color"""
    r = random.randint(128, 220)
    g = random.randint(128, 220)
    b = random.randint(128, 220)
    return f"#{r:02x}{g:02x}{b:02x}"


def read_definition(txt_path: Path) -> str:
    """Read definition from txt file"""
    try:
        with open(txt_path, 'r', encoding='utf-8') as f:
            return f.read().strip()
    except Exception as e:
        print(f"  Warning: Could not read {txt_path}: {e}")
        return None


def is_tier_node(name: str) -> bool:
    """Check if directory name indicates a tier node (UPPERCASE with hyphens)"""
    # Tier nodes are typically ALL UPPERCASE or end with -TYPE/-TYPES
    return name.isupper() or name.endswith('-TYPE') or name.endswith('-TYPES')


def convert_directory(dir_path: Path, depth: int = 0) -> dict:
    """Recursively convert a directory to a node structure"""
    name = dir_path.name
    node_id = str(uuid.uuid4())
    
    # Determine node type
    is_tier = is_tier_node(name)
    node_type = "tier" if is_tier else "label"
    
    # Try to find definition txt file
    txt_file = dir_path / f"{name}.txt"
    definition = None
    if txt_file.exists():
        definition = read_definition(txt_file)
    
    # Build node
    node = {
        "id": node_id,
        "name": name,
        "type": node_type,
        "definition": definition
    }
    
    # Add color for label nodes (not tier nodes)
    if not is_tier:
        node["color"] = generate_color()
    
    # Process children
    children = []
    try:
        for item in sorted(dir_path.iterdir()):
            # Skip hidden files and txt files
            if item.name.startswith('.'):
                continue
            if item.suffix == '.txt':
                continue
            
            if item.is_dir():
                child = convert_directory(item, depth + 1)
                if child:
                    children.append(child)
    except PermissionError:
        pass
    
    if children:
        node["children"] = children
    
    return node


def convert_framework(framework_dir: Path, category: str) -> dict:
    """Convert a framework directory to JSON format"""
    framework_id = str(uuid.uuid4())
    name = framework_dir.name
    
    # Find the root node directory (usually has same name as framework or first subdir)
    root_node = None
    
    # Look for subdirectories
    subdirs = [d for d in framework_dir.iterdir() if d.is_dir() and not d.name.startswith('.')]
    
    if len(subdirs) == 1:
        # Single subdir is the root
        root_node = convert_directory(subdirs[0])
    elif len(subdirs) > 1:
        # Multiple subdirs - create a wrapper root
        root_node = {
            "id": str(uuid.uuid4()),
            "name": name.lower().replace(' ', '-').replace('_', '-'),
            "type": "label",
            "definition": f"Root node for {name}",
            "color": generate_color(),
            "children": [convert_directory(d) for d in sorted(subdirs)]
        }
    else:
        # No subdirs, try to use the framework dir itself
        root_node = convert_directory(framework_dir)
    
    # Try to find a root definition
    root_txt = framework_dir / f"{name}.txt"
    if root_txt.exists() and root_node:
        root_node["definition"] = read_definition(root_txt)
    
    framework = {
        "id": framework_id,
        "name": name,
        "category": category,
        "description": f"Converted from {framework_dir}",
        "root": root_node,
        "createdAt": datetime.now().isoformat(),
        "updatedAt": datetime.now().isoformat()
    }
    
    return framework


def get_category_frameworks():
    """Get list of framework categories and their subdirectories"""
    categories = {}
    
    for item in SOURCE_DIR.iterdir():
        if item.is_dir() and not item.name.startswith('.'):
            category_name = item.name
            frameworks = []
            
            # Check if this is a category with sub-frameworks or a single framework
            subdirs = [d for d in item.iterdir() if d.is_dir() and not d.name.startswith('.')]
            
            # Determine if subdirs are frameworks or part of the framework structure
            if subdirs and all(is_tier_node(d.name) or d.name.islower() for d in subdirs):
                # This is a single framework
                frameworks.append((item, category_name))
            else:
                # This is a category with multiple frameworks
                for subdir in subdirs:
                    frameworks.append((subdir, category_name))
            
            categories[category_name] = frameworks
    
    return categories


def main():
    """Main conversion function"""
    print("=" * 60)
    print("Framework Conversion Script")
    print("=" * 60)
    print(f"Source: {SOURCE_DIR}")
    print(f"Target: {TARGET_DIR}")
    print()
    
    # Ensure target directory exists
    TARGET_DIR.mkdir(parents=True, exist_ok=True)
    
    # Get existing framework names to avoid duplicates
    existing_names = set()
    for f in TARGET_DIR.glob("*.json"):
        try:
            with open(f, 'r', encoding='utf-8') as file:
                data = json.load(file)
                existing_names.add(data.get('name', ''))
        except:
            pass
    
    print(f"Found {len(existing_names)} existing frameworks")
    print()
    
    # Process each category
    converted = 0
    skipped = 0
    
    for category_dir in sorted(SOURCE_DIR.iterdir()):
        if not category_dir.is_dir() or category_dir.name.startswith('.'):
            continue
        
        category_name = category_dir.name
        print(f"Processing category: {category_name}")
        
        # Check for sub-frameworks
        subdirs = [d for d in category_dir.iterdir() if d.is_dir() and not d.name.startswith('.')]
        
        if not subdirs:
            continue
        
        # Check if this is a single framework or category with multiple frameworks
        # SpaCy Annotation, UAM categories have sub-frameworks
        # Others might be single frameworks
        
        for subdir in subdirs:
            framework_name = f"{category_name}/{subdir.name}" if len(subdirs) > 1 else category_name
            display_name = subdir.name if len(subdirs) > 1 else category_name
            
            # Check if already exists
            if display_name in existing_names:
                print(f"  Skipping {display_name} (already exists)")
                skipped += 1
                continue
            
            print(f"  Converting: {display_name}")
            
            try:
                framework = convert_framework(subdir, category_name)
                framework["name"] = display_name
                
                # Save to file
                output_path = TARGET_DIR / f"{framework['id']}.json"
                with open(output_path, 'w', encoding='utf-8') as f:
                    json.dump(framework, f, ensure_ascii=False, indent=2)
                
                print(f"    Saved: {output_path.name}")
                converted += 1
                existing_names.add(display_name)
                
            except Exception as e:
                print(f"    Error: {e}")
    
    print()
    print("=" * 60)
    print(f"Conversion complete!")
    print(f"  Converted: {converted}")
    print(f"  Skipped: {skipped}")
    print("=" * 60)


if __name__ == "__main__":
    main()

