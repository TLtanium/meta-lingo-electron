"""Stable group-only colours shared by reference cards and filter chips."""
import colorsys
import hashlib

# Moderately saturated colours with readable light-theme text.
PALETTE = (
    '#2563eb', '#0f766e', '#7c3aed', '#b45309', '#be185d', '#0369a1',
    '#15803d', '#a21caf', '#c2410c', '#4338ca', '#0e7490', '#9f1239',
    '#4d7c0f', '#6d28d9', '#b91c1c', '#047857',
)


def group_colors(prefixes) -> dict[str, str]:
    """Deterministic across resource IDs, metadata, order, language and filtering.

    Resolve palette/hash collisions across the entire group set before filtering,
    so distinct current groups never receive exactly the same colour.
    """
    result, used = {}, set()
    for prefix in sorted(set(prefixes)):
        digest = hashlib.sha256(prefix.encode('utf-8')).digest()
        start = int.from_bytes(digest[:4], 'big') % len(PALETTE)
        color = next((PALETTE[(start + i) % len(PALETTE)]
                      for i in range(len(PALETTE)) if PALETTE[(start + i) % len(PALETTE)] not in used), None)
        attempt = 0
        while color is None or color in used:
            extra = hashlib.sha256(f'{prefix}\0{attempt}'.encode('utf-8')).digest()
            hue = int.from_bytes(extra[:4], 'big') / 2**32
            saturation = .52 + extra[4] / 255 * .2
            lightness = .30 + extra[5] / 255 * .12
            channels = colorsys.hls_to_rgb(hue, lightness, saturation)
            # Keep coloured badge text readable on light backgrounds as well.
            def luminance(rgb):
                linear = [value / 12.92 if value <= .04045 else ((value + .055) / 1.055) ** 2.4 for value in rgb]
                return sum(value * weight for value, weight in zip(linear, (.2126, .7152, .0722)))
            while luminance(channels) > .175:
                lightness *= .94
                channels = colorsys.hls_to_rgb(hue, lightness, saturation)
            color = '#' + ''.join(f'{round(channel * 255):02x}' for channel in channels)
            attempt += 1
        result[prefix] = color
        used.add(color)
    return result
