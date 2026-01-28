"""
词典服务模块
提供词典加载、查询、模糊搜索等功能
"""

import os
import json
from typing import Dict, List, Optional, Any
from functools import lru_cache
import re

from config import SAVES_DIR


class DictionaryService:
    """词典服务类 - 支持懒加载和缓存"""
    
    # 词典目录路径 - 使用 config.py 中的 SAVES_DIR
    DICT_DIR = str(SAVES_DIR / "dict")
    
    # 已加载的词典缓存
    _loaded_dicts: Dict[str, Dict] = {}
    
    # 词典元数据缓存 (不包含entries)
    _dict_metadata: Dict[str, Dict] = {}
    
    @classmethod
    def get_dict_dir(cls) -> str:
        """获取词典目录路径"""
        return cls.DICT_DIR
    
    @classmethod
    def list_dictionaries(cls) -> List[Dict[str, Any]]:
        """
        获取可用词典列表
        返回词典名称和条目数量
        """
        dict_dir = cls.get_dict_dir()
        dictionaries = []
        
        if not os.path.exists(dict_dir):
            return dictionaries
        
        for filename in os.listdir(dict_dir):
            if filename.endswith('.json'):
                dict_name = filename[:-5]  # 移除 .json 后缀
                
                # 尝试从缓存获取元数据
                if dict_name in cls._dict_metadata:
                    meta = cls._dict_metadata[dict_name]
                else:
                    # 只读取元数据，不加载整个词典
                    meta = cls._load_dict_metadata(dict_name)
                    if meta:
                        cls._dict_metadata[dict_name] = meta
                
                if meta:
                    dictionaries.append({
                        "name": meta.get("name", dict_name),
                        "count": meta.get("count", 0),
                        "filename": filename
                    })
        
        return dictionaries
    
    @classmethod
    def _load_dict_metadata(cls, dict_name: str) -> Optional[Dict]:
        """
        加载词典元数据 (不加载entries)
        使用流式读取以节省内存
        """
        dict_path = os.path.join(cls.get_dict_dir(), f"{dict_name}.json")
        
        if not os.path.exists(dict_path):
            return None
        
        try:
            # 只读取文件开头部分获取元数据
            with open(dict_path, 'r', encoding='utf-8') as f:
                # 读取前1000个字符来解析 name 和 count
                header = f.read(1000)
                
                # 提取 name
                name_match = re.search(r'"name"\s*:\s*"([^"]+)"', header)
                name = name_match.group(1) if name_match else dict_name
                
                # 提取 count
                count_match = re.search(r'"count"\s*:\s*(\d+)', header)
                count = int(count_match.group(1)) if count_match else 0
                
                return {"name": name, "count": count}
        except Exception as e:
            print(f"加载词典元数据失败 {dict_name}: {e}")
            return None
    
    @classmethod
    def load_dictionary(cls, dict_name: str) -> Optional[Dict]:
        """
        加载完整词典数据
        使用缓存避免重复加载
        """
        # 检查缓存
        if dict_name in cls._loaded_dicts:
            return cls._loaded_dicts[dict_name]
        
        dict_path = os.path.join(cls.get_dict_dir(), f"{dict_name}.json")
        
        if not os.path.exists(dict_path):
            return None
        
        try:
            print(f"加载词典: {dict_name}")
            with open(dict_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            # 缓存词典
            cls._loaded_dicts[dict_name] = data
            
            # 更新元数据缓存
            cls._dict_metadata[dict_name] = {
                "name": data.get("name", dict_name),
                "count": data.get("count", len(data.get("entries", {})))
            }
            
            return data
        except Exception as e:
            print(f"加载词典失败 {dict_name}: {e}")
            return None
    
    @classmethod
    def lookup(cls, word: str, dict_names: List[str]) -> Dict[str, Any]:
        """
        在指定词典中查询单词
        
        Args:
            word: 要查询的单词
            dict_names: 词典名称列表
        
        Returns:
            查询结果，包含各词典的释义
        """
        word_lower = word.strip().lower()
        results = {}
        
        for dict_name in dict_names:
            dict_data = cls.load_dictionary(dict_name)
            
            if not dict_data:
                results[dict_name] = {
                    "found": False,
                    "error": f"词典 '{dict_name}' 未找到或加载失败"
                }
                continue
            
            entries = dict_data.get("entries", {})
            
            # 精确匹配
            if word_lower in entries:
                entry = entries[word_lower]
                results[dict_name] = {
                    "found": True,
                    "word": entry.get("word", word),
                    "content": cls._process_content(entry.get("content", "")),
                    "fuzzy": False
                }
            else:
                # 尝试模糊匹配
                fuzzy_result = cls._fuzzy_search(entries, word_lower)
                if fuzzy_result:
                    results[dict_name] = {
                        "found": True,
                        "word": fuzzy_result.get("word", word),
                        "content": cls._process_content(fuzzy_result.get("content", "")),
                        "fuzzy": True,
                        "matched_key": fuzzy_result.get("matched_key", "")
                    }
                else:
                    results[dict_name] = {
                        "found": False,
                        "word": word
                    }
        
        return {
            "query": word,
            "results": results
        }
    
    @classmethod
    def _fuzzy_search(cls, entries: Dict, word: str, limit: int = 1) -> Optional[Dict]:
        """
        模糊搜索
        优先级: 前缀匹配 > 包含匹配
        """
        # 前缀匹配
        for key, value in entries.items():
            if key.startswith(word):
                return {**value, "matched_key": key}
        
        # 包含匹配
        for key, value in entries.items():
            if word in key:
                return {**value, "matched_key": key}
        
        return None
    
    @classmethod
    def get_suggestions(cls, prefix: str, dict_names: List[str], limit: int = 10) -> List[str]:
        """
        获取输入建议
        
        Args:
            prefix: 输入前缀
            dict_names: 词典名称列表
            limit: 返回数量限制
        
        Returns:
            匹配的单词列表
        """
        prefix_lower = prefix.strip().lower()
        if not prefix_lower:
            return []
        
        suggestions = set()
        
        for dict_name in dict_names:
            dict_data = cls.load_dictionary(dict_name)
            if not dict_data:
                continue
            
            entries = dict_data.get("entries", {})
            
            # 查找前缀匹配
            for key in entries.keys():
                if key.startswith(prefix_lower):
                    entry = entries[key]
                    # 使用原始大小写
                    suggestions.add(entry.get("word", key))
                    if len(suggestions) >= limit * 2:  # 收集更多然后截取
                        break
        
        # 排序并限制数量
        sorted_suggestions = sorted(suggestions, key=lambda x: (len(x), x.lower()))
        return sorted_suggestions[:limit]
    
    @classmethod
    def _process_content(cls, content: str) -> str:
        """
        处理词典内容
        - 处理 entry:// 链接
        - 处理 @@@LINK= 格式
        """
        if not content:
            return content
        
        # 处理 @@@LINK=word 格式
        content = re.sub(
            r'@@@LINK=([^\s<>]+)',
            r'<a class="dict-link" data-word="\1" href="javascript:void(0)">\1</a>',
            content
        )
        
        # 处理 entry://word 格式的链接
        def replace_entry_link(match):
            href = match.group(1)
            text = match.group(2)
            if href.startswith('entry://'):
                word = href.replace('entry://', '')
                return f'<a class="dict-link" data-word="{word}" href="javascript:void(0)">{text}</a>'
            return match.group(0)
        
        content = re.sub(
            r'<a[^>]*href=["\']([^"\']*)["\'][^>]*>(.*?)</a>',
            replace_entry_link,
            content,
            flags=re.DOTALL
        )
        
        return content
    
    @classmethod
    def unload_dictionary(cls, dict_name: str) -> bool:
        """
        从缓存中卸载词典以释放内存
        """
        if dict_name in cls._loaded_dicts:
            del cls._loaded_dicts[dict_name]
            return True
        return False
    
    @classmethod
    def clear_cache(cls):
        """清除所有缓存"""
        cls._loaded_dicts.clear()
        cls._dict_metadata.clear()


# 单例实例
dictionary_service = DictionaryService()
