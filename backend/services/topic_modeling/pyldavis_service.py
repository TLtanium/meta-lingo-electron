"""
PyLDAvis Visualization Service for LDA Topic Modeling
Provides interactive topic visualization using pyLDAvis
"""

import logging
from typing import Dict, Any, Optional, List

logger = logging.getLogger(__name__)


class PyLDAvisService:
    """Service for generating pyLDAvis interactive visualizations"""
    
    def __init__(self):
        self._cached_html: Dict[str, str] = {}
        self._pandas_patched = False
        self._original_pandas_methods = {}
    
    def _patch_pandas_compatibility(self):
        """Patch pandas for pyLDAvis compatibility (deprecated method names)"""
        if self._pandas_patched:
            return
        
        try:
            import pandas as pd
            
            # Check if DataFrame needs patching
            if not hasattr(pd.DataFrame, 'iteritems'):
                if hasattr(pd.DataFrame, 'items'):
                    self._original_pandas_methods['df_iteritems'] = None
                    pd.DataFrame.iteritems = pd.DataFrame.items
            
            # Check if Index needs patching  
            if not hasattr(pd.Index, 'is_integer') and hasattr(pd.Index, 'dtype'):
                def is_integer(self):
                    return self.dtype.kind == 'i'
                self._original_pandas_methods['index_is_integer'] = None
                pd.Index.is_integer = is_integer
            
            self._pandas_patched = True
            logger.debug("Pandas compatibility patches applied")
            
        except Exception as e:
            logger.warning(f"Failed to apply pandas patches: {e}")
    
    def _restore_pandas_methods(self):
        """Restore original pandas methods after visualization"""
        try:
            import pandas as pd
            
            if 'df_iteritems' in self._original_pandas_methods:
                if hasattr(pd.DataFrame, 'iteritems'):
                    delattr(pd.DataFrame, 'iteritems')
            
            if 'index_is_integer' in self._original_pandas_methods:
                if hasattr(pd.Index, 'is_integer'):
                    delattr(pd.Index, 'is_integer')
            
            self._pandas_patched = False
            self._original_pandas_methods = {}
            
        except Exception as e:
            logger.warning(f"Failed to restore pandas methods: {e}")
    
    def _determine_visualization_strategy(self, n_topics: int, n_docs: int) -> str:
        """Determine optimal visualization strategy based on data size"""
        # Insufficient data
        if n_topics < 2 or n_docs < 3:
            return "insufficient_data"
        
        # Topics too close to document count
        if n_topics >= n_docs - 1:
            return "insufficient_data"
        
        # Small scale data - use PCA/PCoA
        if n_topics <= 5 or n_docs <= 10:
            return "simple_mds"
        
        # When topics >= 10, prefer simple MDS to avoid perplexity issues
        if n_topics >= 10:
            return "simple_mds"
        
        # Medium scale - use optimized t-SNE
        if n_topics <= 9 and n_docs <= 100:
            return "optimized_tsne"
        
        # Large scale - standard settings
        return "standard"
    
    def _calculate_optimal_tsne_params(self, n_topics: int, n_docs: int) -> Dict[str, Any]:
        """Calculate optimal t-SNE parameters to avoid perplexity errors"""
        # Perplexity must be < n_samples (which is n_topics in pyLDAvis)
        max_allowed_perplexity = n_topics - 1
        
        # Calculate recommended perplexity
        if n_topics >= 10:
            if n_topics >= 15:
                recommended_perplexity = min(8, max_allowed_perplexity)
            else:
                recommended_perplexity = min(5, max_allowed_perplexity)
        elif max_allowed_perplexity <= 1:
            recommended_perplexity = 1
        elif max_allowed_perplexity <= 5:
            recommended_perplexity = max(1, max_allowed_perplexity - 1)
        else:
            recommended_perplexity = min(5, max_allowed_perplexity - 1)
        
        final_perplexity = max(1, min(recommended_perplexity, n_topics - 1))
        
        # Invalid perplexity - let pyLDAvis use defaults
        if final_perplexity >= n_topics:
            return {}
        
        n_iter = min(1000, max(250, n_topics * 50))
        learning_rate = 200.0 if n_topics > 10 else 100.0
        
        return {
            'tsne_kwargs': {
                'perplexity': final_perplexity,
                'n_iter': n_iter,
                'learning_rate': learning_rate,
                'random_state': 42
            }
        }
    
    def generate_pyldavis_html(
        self,
        gensim_model,
        gensim_corpus,
        gensim_dictionary,
        n_topics: int,
        n_docs: int,
        cache_key: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Generate pyLDAvis HTML visualization for Gensim LDA model
        
        Args:
            gensim_model: Trained Gensim LDA model
            gensim_corpus: Gensim corpus (list of bag-of-words)
            gensim_dictionary: Gensim dictionary
            n_topics: Number of topics
            n_docs: Number of documents
            cache_key: Optional cache key for result reuse
            
        Returns:
            Dict with 'success', 'html' or 'error' keys
        """
        # Check cache
        if cache_key and cache_key in self._cached_html:
            logger.info("Using cached pyLDAvis result")
            return {
                'success': True,
                'html': self._cached_html[cache_key],
                'cached': True
            }
        
        # Import pyLDAvis
        pyldavis_module = None
        gensim_vis_module = None
        
        try:
            import pyLDAvis
            pyldavis_module = pyLDAvis
            
            # Try different import paths for gensim module
            try:
                import pyLDAvis.gensim_models as gensim_vis_module
            except ImportError:
                try:
                    import pyLDAvis.gensim as gensim_vis_module
                except ImportError:
                    return {
                        'success': False,
                        'error': 'pyLDAvis gensim module not found. Please install pyLDAvis with gensim support.',
                        'error_type': 'import_error'
                    }
                    
        except ImportError as e:
            return {
                'success': False,
                'error': f'pyLDAvis not installed: {str(e)}. Install with: pip install pyLDAvis',
                'error_type': 'import_error'
            }
        
        # Determine visualization strategy
        strategy = self._determine_visualization_strategy(n_topics, n_docs)
        
        if strategy == "insufficient_data":
            return self._generate_insufficient_data_error(n_topics, n_docs)
        
        # Prepare kwargs based on strategy
        # IMPORTANT: Always use n_jobs=1 to avoid multiprocess worker crashes in PyInstaller packaged app
        # The joblib multiprocessing causes "worker process unexpectedly terminated" errors in frozen executables
        if strategy == "simple_mds":
            prepare_kwargs = {
                'mds': 'pcoa',
                'sort_topics': False,
                'n_jobs': 1  # Single-threaded to avoid PyInstaller multiprocess issues
            }
        elif strategy == "optimized_tsne":
            tsne_params = self._calculate_optimal_tsne_params(n_topics, n_docs)
            prepare_kwargs = {
                'mds': 'tsne',
                'sort_topics': False,
                'n_jobs': 1,  # Single-threaded to avoid PyInstaller multiprocess issues
                **tsne_params
            }
        else:  # standard
            prepare_kwargs = {
                'mds': 'tsne',
                'sort_topics': False,
                'n_jobs': 1  # Single-threaded to avoid PyInstaller multiprocess issues
            }
        
        # Apply pandas compatibility patches
        self._patch_pandas_compatibility()
        
        try:
            # Try primary strategy
            vis = gensim_vis_module.prepare(
                gensim_model,
                gensim_corpus,
                gensim_dictionary,
                **prepare_kwargs
            )
            
            html = pyldavis_module.prepared_data_to_html(vis)
            
            # Cache result
            if cache_key:
                self._cached_html[cache_key] = html
            
            return {
                'success': True,
                'html': html,
                'strategy': strategy,
                'cached': False
            }
            
        except Exception as e:
            error_msg = str(e).lower()
            
            # Handle perplexity error
            if "perplexity" in error_msg and "n_samples" in error_msg:
                logger.warning("t-SNE perplexity error, falling back to PCoA")
                return self._fallback_visualization(
                    gensim_vis_module, pyldavis_module,
                    gensim_model, gensim_corpus, gensim_dictionary,
                    n_topics, n_docs, str(e), cache_key
                )
            
            # Try fallback for other errors
            return self._fallback_visualization(
                gensim_vis_module, pyldavis_module,
                gensim_model, gensim_corpus, gensim_dictionary,
                n_topics, n_docs, str(e), cache_key
            )
            
        finally:
            self._restore_pandas_methods()
    
    def _fallback_visualization(
        self,
        gensim_vis_module,
        pyldavis_module,
        gensim_model,
        gensim_corpus,
        gensim_dictionary,
        n_topics: int,
        n_docs: int,
        original_error: str,
        cache_key: Optional[str] = None
    ) -> Dict[str, Any]:
        """Try multiple fallback visualization strategies"""
        
        # IMPORTANT: All strategies use n_jobs=1 to avoid PyInstaller multiprocess crashes
        # The joblib multiprocessing causes "worker process unexpectedly terminated" errors
        fallback_strategies = [
            ('pcoa', {'n_jobs': 1}),   # Single-threaded pcoa first (fastest, most reliable)
            ('mmds', {'n_jobs': 1}),   # Single-threaded mmds as backup
        ]
        
        for mds_method, extra_params in fallback_strategies:
            try:
                prepare_kwargs = {
                    'sort_topics': False,
                    'mds': mds_method,
                    **extra_params
                }
                
                vis = gensim_vis_module.prepare(
                    gensim_model,
                    gensim_corpus,
                    gensim_dictionary,
                    **prepare_kwargs
                )
                
                html = pyldavis_module.prepared_data_to_html(vis)
                
                # Cache result
                if cache_key:
                    self._cached_html[cache_key] = html
                
                logger.info(f"Fallback visualization successful with mds={mds_method}")
                
                return {
                    'success': True,
                    'html': html,
                    'strategy': f'fallback_{mds_method}',
                    'cached': False
                }
                
            except Exception as fallback_error:
                logger.warning(f"Fallback with {mds_method} failed: {fallback_error}")
                continue
        
        # All strategies failed
        return {
            'success': False,
            'error': f'All visualization strategies failed. Original error: {original_error}',
            'error_type': 'visualization_failed',
            'n_topics': n_topics,
            'n_docs': n_docs
        }
    
    def _generate_insufficient_data_error(self, n_topics: int, n_docs: int) -> Dict[str, Any]:
        """Generate error response for insufficient data"""
        suggestions = []
        problem_desc = ""
        
        if n_topics < 2:
            problem_desc = "Topic count too low"
            suggestions.append("Increase topic count (minimum 2)")
        elif n_docs < 3:
            problem_desc = "Document count too low"
            suggestions.append("Increase document count (minimum 3)")
        elif n_topics >= n_docs - 1:
            problem_desc = "Topic count too high relative to documents"
            max_recommended = max(2, n_docs - 2)
            suggestions.append(f"Reduce topics (current: {n_topics}, recommended max: {max_recommended})")
            if n_docs < 30:
                suggestions.append(f"Or increase documents (current: {n_docs}, need at least {n_topics + 2} for {n_topics} topics)")
        else:
            problem_desc = "Insufficient data scale"
            suggestions.append("Increase documents or reduce topics")
        
        return {
            'success': False,
            'error': problem_desc,
            'error_type': 'insufficient_data',
            'suggestions': suggestions,
            'n_topics': n_topics,
            'n_docs': n_docs
        }
    
    def clear_cache(self, cache_key: Optional[str] = None):
        """Clear visualization cache"""
        if cache_key:
            self._cached_html.pop(cache_key, None)
        else:
            self._cached_html.clear()
        logger.info(f"Cleared pyLDAvis cache: {cache_key or 'all'}")


# Singleton instance
_pyldavis_service: Optional[PyLDAvisService] = None


def get_pyldavis_service() -> PyLDAvisService:
    """Get pyLDAvis service singleton"""
    global _pyldavis_service
    if _pyldavis_service is None:
        _pyldavis_service = PyLDAvisService()
    return _pyldavis_service
