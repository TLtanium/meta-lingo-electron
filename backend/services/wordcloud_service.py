#!/usr/bin/env python3
# -*- coding: utf-8 -*-
#
# Copyright (c) 2025 TommyLeo/Meta-Lingo. All rights reserved.
# License: Apache-2.0

"""
Word Cloud Generation Service
Legacy word cloud engine using Python wordcloud library
"""

import os
import io
import base64
import tempfile
from pathlib import Path
from typing import Dict, Optional, Tuple
import numpy as np
from PIL import Image
from wordcloud import WordCloud, ImageColorGenerator
import matplotlib
matplotlib.use('Agg')  # Use non-interactive backend
import matplotlib.pyplot as plt


class WordCloudService:
    """Word cloud generation service using Python wordcloud library"""
    
    def __init__(self):
        """Initialize the word cloud service"""
        pass
    
    def generate_wordcloud(
        self,
        word_freq: Dict[str, int],
        max_words: int = 100,
        mask_image_data: Optional[bytes] = None,
        colormap: Optional[str] = None,
        wc_style: str = "默认",
        contour_width: int = 0,
        contour_color: str = "black",
        output_format: str = "base64"  # "base64" or "file"
    ) -> Tuple[Optional[str], Optional[str]]:
        """
        Generate word cloud image
        
        Args:
            word_freq: Dictionary of word frequencies {word: frequency}
            max_words: Maximum number of words to display
            mask_image_data: Mask image as bytes (optional)
            colormap: Colormap name (optional, for default/mask styles)
            wc_style: Word cloud style ["默认", "使用蒙版", "基于图片颜色"]
            contour_width: Contour width (for boundary mapped style)
            contour_color: Contour color (for boundary mapped style)
            output_format: Output format "base64" or "file"
            
        Returns:
            Tuple of (image_data_or_path, error_message)
            - If output_format is "base64": (base64_string, None) or (None, error_msg)
            - If output_format is "file": (file_path, None) or (None, error_msg)
        """
        try:
            # Process mask
            mask = None
            image_colors = None
            
            if mask_image_data:
                # Load mask image from bytes
                mask_img = Image.open(io.BytesIO(mask_image_data))
                
                # For mask-based styles, create mask from image
                # WordCloud mask format: numpy array where 255 = show words, 0 = hide words
                if wc_style in ["使用蒙版", "基于图片颜色"]:
                    # Convert to RGBA mode to get alpha channel (following old version logic)
                    if mask_img.mode != 'RGBA':
                        mask_img = mask_img.convert('RGBA')
                    
                    # Extract mask from alpha channel if available (old version approach)
                    if mask_img.mode == 'RGBA':
                        # Use alpha channel (4th channel, index 3)
                        mask_array = np.array(mask_img)[:, :, 3]  # Only use alpha channel
                        # Invert alpha channel: transparent (0) -> show words (255), opaque (255) -> hide words (0)
                        mask_array = 255 - mask_array
                    else:
                        # For non-transparent images, use grayscale as mask
                        mask_array = np.array(mask_img.convert('L'))
                        # Invert grayscale values: black (0) -> show words (255), white (255) -> hide words (0)
                        mask_array = 255 - mask_array
                    
                    mask = mask_array.astype(np.uint8)
                else:
                    mask = None
                
                # Prepare color generator for image color styles
                if wc_style == "基于图片颜色":
                    # Use RGB image to create color generator
                    rgb_image = np.array(mask_img.convert('RGB'))
                    image_colors = ImageColorGenerator(rgb_image)
                else:
                    image_colors = None
            
            # Create word cloud base parameters
            # If max_words is very large (999999), it means use all words
            actual_max_words = max_words if max_words < 999999 else len(word_freq)
            
            wc_params = {
                "background_color": 'white',
                "max_words": actual_max_words,
                "collocations": False,
                "font_path": self._get_font_path(),
                "relative_scaling": 0.5,  # Optimize font size ratio
                "min_font_size": 8,       # Set minimum font size
            }
            
            # Add mask if provided - mask determines the shape and size of the word cloud
            # WordCloud mask: numpy array where 255 = show words, 0 = hide words
            if mask is not None:
                wc_params["mask"] = mask
                # Don't set width/height when mask is provided - WordCloud will use mask dimensions
            else:
                # Set explicit dimensions when no mask is provided
                wc_params["width"] = 2400
                wc_params["height"] = 1200
            
            # Add style-specific parameters
            if wc_style in ["默认", "使用蒙版"] and colormap:
                wc_params["colormap"] = colormap
            
            # Add contour settings (if any)
            if contour_width > 0:
                wc_params["contour_width"] = contour_width
                wc_params["contour_color"] = contour_color
            
            # Create word cloud
            wordcloud = WordCloud(**wc_params).generate_from_frequencies(word_freq)
            
            # Apply image colors (if needed)
            if wc_style == "基于图片颜色" and image_colors is not None:
                wordcloud = wordcloud.recolor(color_func=image_colors)
            
            # Save high-quality image
            plt.figure(figsize=(16, 8))  # Large figure size
            plt.imshow(wordcloud, interpolation='bilinear')
            
            plt.axis("off")
            plt.tight_layout(pad=0)
            
            if output_format == "base64":
                # Save to bytes buffer
                buffer = io.BytesIO()
                plt.savefig(buffer, format='png', bbox_inches='tight', pad_inches=0, 
                           dpi=600, facecolor='white', edgecolor='none')
                buffer.seek(0)
                image_base64 = base64.b64encode(buffer.read()).decode('utf-8')
                plt.close()
                return (f"data:image/png;base64,{image_base64}", None)
            else:
                # Save to temporary file
                temp_dir = Path(tempfile.gettempdir()) / "meta-lingo-wordcloud"
                temp_dir.mkdir(exist_ok=True)
                output_path = temp_dir / f"wordcloud_{os.getpid()}_{id(wordcloud)}.png"
                plt.savefig(str(output_path), bbox_inches='tight', pad_inches=0, 
                           dpi=600, facecolor='white', edgecolor='none')
                plt.close()
                return (str(output_path), None)
                
        except Exception as e:
            import traceback
            error_msg = f"Failed to generate word cloud: {str(e)}\n{traceback.format_exc()}"
            print(f"❌ {error_msg}")
            return (None, error_msg)
    
    def _get_font_path(self) -> Optional[str]:
        """Get available font path"""
        # Preferred fonts
        preferred_fonts = [
            # Windows fonts
            "C:/Windows/Fonts/simhei.ttf",
            "C:/Windows/Fonts/msyh.ttc",
            # macOS fonts
            "/Library/Fonts/Arial Unicode.ttf",
            "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
            # Linux fonts
            "/usr/share/fonts/truetype/droid/DroidSansFallbackFull.ttf",
            "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
            # Project fonts
            "./fonts/simhei.ttf"
        ]
        
        # Check if font exists
        for font_path in preferred_fonts:
            if Path(font_path).exists():
                return font_path
        
        # Try to use matplotlib default font
        try:
            import matplotlib.font_manager as fm
            fonts = fm.findSystemFonts()
            for font in fonts:
                if "arial" in font.lower() or "sans" in font.lower():
                    return font
            return fonts[0] if fonts else None
        except:
            return None  # Use default font


# Singleton instance
_wordcloud_service: Optional[WordCloudService] = None


def get_wordcloud_service() -> WordCloudService:
    """Get word cloud service singleton"""
    global _wordcloud_service
    if _wordcloud_service is None:
        _wordcloud_service = WordCloudService()
    return _wordcloud_service
