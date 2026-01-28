"""
Framework Importer Service
Converts folder-based frameworks from corpuscortex_app to JSON format
"""

import json
import uuid
import hashlib
from pathlib import Path
from typing import Dict, List, Optional, Tuple
from datetime import datetime


class FrameworkImporter:
    """Import frameworks from folder structure to JSON format"""
    
    def __init__(self, output_dir: str = "./data/frameworks"):
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)
    
    def generate_color_for_path(self, path: str) -> str:
        """Generate a unique color based on path hash"""
        path_hash = hashlib.md5(path.encode('utf-8')).hexdigest()
        
        r_raw = int(path_hash[0:2], 16)
        g_raw = int(path_hash[2:4], 16)
        b_raw = int(path_hash[4:6], 16)
        
        # Map to range 120-220 to avoid too dark or too light colors
        min_val = 120
        max_val = 220
        range_size = max_val - min_val
        
        r = min_val + int((r_raw / 255) * range_size)
        g = min_val + int((g_raw / 255) * range_size)
        b = min_val + int((b_raw / 255) * range_size)
        
        return f"#{r:02x}{g:02x}{b:02x}"
    
    def read_definition(self, folder_path: Path) -> Optional[str]:
        """Read definition from .txt file in folder"""
        txt_files = list(folder_path.glob("*.txt"))
        if txt_files:
            try:
                with open(txt_files[0], 'r', encoding='utf-8') as f:
                    return f.read().strip()
            except Exception as e:
                print(f"Error reading definition from {txt_files[0]}: {e}")
        return None
    
    def convert_folder_to_node(self, folder_path: Path, parent_path: str = "") -> Optional[Dict]:
        """Convert a folder to a framework node"""
        if not folder_path.is_dir():
            return None
        
        folder_name = folder_path.name
        current_path = f"{parent_path}/{folder_name}" if parent_path else folder_name
        
        # Determine type based on naming convention
        # Previously: uppercase = tier, lowercase = label
        # Now: more flexible - can mark as tier/label based on structure
        node_type = 'tier' if folder_name.isupper() else 'label'
        
        # Create node
        node = {
            'id': str(uuid.uuid4()),
            'name': folder_name,
            'type': node_type,
            'definition': self.read_definition(folder_path),
            'children': []
        }
        
        # Assign color for label nodes
        if node_type == 'label':
            node['color'] = self.generate_color_for_path(current_path)
        
        # Process children folders (sorted for consistency)
        for child_path in sorted(folder_path.iterdir()):
            if child_path.is_dir() and not child_path.name.startswith('.'):
                child_node = self.convert_folder_to_node(child_path, current_path)
                if child_node:
                    node['children'].append(child_node)
        
        # Remove empty children list
        if not node['children']:
            del node['children']
        
        return node
    
    def import_single_framework(
        self, 
        framework_path: Path, 
        category: str,
        name: Optional[str] = None
    ) -> Tuple[bool, str, Optional[Dict]]:
        """
        Import a single framework from folder structure
        
        Args:
            framework_path: Path to the framework folder
            category: Category name for the framework
            name: Optional custom name (defaults to folder name)
            
        Returns:
            Tuple of (success, message, framework_data)
        """
        if not framework_path.exists():
            return False, f"Path does not exist: {framework_path}", None
        
        if not framework_path.is_dir():
            return False, f"Path is not a directory: {framework_path}", None
        
        fw_name = name or framework_path.name
        
        try:
            # Find root node - first subdirectory
            root_folder = None
            for item in sorted(framework_path.iterdir()):
                if item.is_dir() and not item.name.startswith('.'):
                    root_folder = item
                    break
            
            if not root_folder:
                # Use the framework folder itself as root
                root_node = self.convert_folder_to_node(framework_path)
            else:
                root_node = self.convert_folder_to_node(root_folder)
            
            if not root_node:
                return False, f"Failed to convert folder structure for {fw_name}", None
            
            # Create framework
            framework_id = str(uuid.uuid4())
            now = datetime.now().isoformat()
            
            framework = {
                'id': framework_id,
                'name': fw_name,
                'category': category,
                'description': f"Imported from {framework_path}",
                'root': root_node,
                'createdAt': now,
                'updatedAt': now
            }
            
            # Save to file
            output_path = self.output_dir / f"{framework_id}.json"
            with open(output_path, 'w', encoding='utf-8') as f:
                json.dump(framework, f, ensure_ascii=False, indent=2)
            
            return True, f"Successfully imported {fw_name}", framework
            
        except Exception as e:
            return False, f"Error importing {fw_name}: {str(e)}", None
    
    def import_category(
        self, 
        category_path: Path,
        category_name: Optional[str] = None
    ) -> Dict:
        """
        Import all frameworks from a category folder
        
        Args:
            category_path: Path to the category folder containing framework folders
            category_name: Optional custom category name
            
        Returns:
            Dict with import results
        """
        if not category_path.exists() or not category_path.is_dir():
            return {
                'success': False,
                'imported': 0,
                'failed': 0,
                'errors': [f"Invalid category path: {category_path}"]
            }
        
        cat_name = category_name or category_path.name
        imported = 0
        failed = 0
        errors = []
        frameworks = []
        
        for fw_folder in sorted(category_path.iterdir()):
            if not fw_folder.is_dir() or fw_folder.name.startswith('.'):
                continue
            
            success, message, framework = self.import_single_framework(
                fw_folder, cat_name
            )
            
            if success:
                imported += 1
                frameworks.append(framework)
            else:
                failed += 1
                errors.append(message)
        
        return {
            'success': True,
            'imported': imported,
            'failed': failed,
            'errors': errors if errors else None,
            'frameworks': frameworks
        }
    
    def import_all(self, source_path: Path) -> Dict:
        """
        Import all frameworks from a source directory
        (e.g., schemas/frameworks/ from corpuscortex_app)
        
        Expected structure:
        source_path/
          Category1/
            Framework1/
            Framework2/
          Category2/
            Framework3/
        
        Args:
            source_path: Path to the root frameworks directory
            
        Returns:
            Dict with import results
        """
        if not source_path.exists() or not source_path.is_dir():
            return {
                'success': False,
                'imported': 0,
                'failed': 0,
                'errors': [f"Invalid source path: {source_path}"]
            }
        
        total_imported = 0
        total_failed = 0
        all_errors = []
        
        # Iterate through category folders
        for category_folder in sorted(source_path.iterdir()):
            if not category_folder.is_dir() or category_folder.name.startswith('.'):
                continue
            
            result = self.import_category(category_folder)
            total_imported += result['imported']
            total_failed += result['failed']
            if result.get('errors'):
                all_errors.extend(result['errors'])
        
        return {
            'success': True,
            'imported': total_imported,
            'failed': total_failed,
            'errors': all_errors[:50] if all_errors else None  # Limit errors
        }


def main():
    """CLI entry point for importing frameworks"""
    import argparse
    
    parser = argparse.ArgumentParser(description='Import frameworks from folder structure')
    parser.add_argument('source', help='Source path (e.g., /path/to/schemas/frameworks)')
    parser.add_argument('--output', '-o', default='./data/frameworks', 
                        help='Output directory for JSON files')
    parser.add_argument('--category', '-c', help='Import only this category')
    parser.add_argument('--single', '-s', action='store_true',
                        help='Import source as single framework')
    
    args = parser.parse_args()
    
    importer = FrameworkImporter(args.output)
    source = Path(args.source)
    
    if args.single:
        success, message, _ = importer.import_single_framework(
            source, 
            args.category or "Imported"
        )
        print(message)
    elif args.category:
        category_path = source / args.category if not args.single else source
        result = importer.import_category(category_path)
        print(f"Imported: {result['imported']}, Failed: {result['failed']}")
        if result.get('errors'):
            for error in result['errors'][:10]:
                print(f"  Error: {error}")
    else:
        result = importer.import_all(source)
        print(f"Total imported: {result['imported']}, Failed: {result['failed']}")
        if result.get('errors'):
            print(f"First {min(10, len(result['errors']))} errors:")
            for error in result['errors'][:10]:
                print(f"  {error}")


if __name__ == '__main__':
    main()
