#!/usr/bin/env python3
"""
Generate the Sea Air Club favicon set from the Fraunces variable font.

Placeholder mark until Jasper's final logo arrives: an off-white Fraunces "S" on a
Driftwood rounded square. The glyph is taken from the self-hosted font, so the icon
matches the headline type exactly.

Outputs (in public/):
  favicon.svg             true vector: the glyph as an outlined path, never <text>
  favicon.ico             16, 32 and 48px
  apple-touch-icon.png    180px, full-bleed square (iOS rounds the corners itself)
  icon-192.png            Android / PWA, rounded square with transparent corners
  icon-512.png
  icon-maskable-512.png   full-bleed, glyph kept inside the maskable safe zone

Pixel sizes are drawn at 8x the target size and downsampled with LANCZOS, which
avoids the soft or stepped edges you get from rendering small sizes directly.

Requirements: Python 3.10+, plus
  pip install fonttools brotli pillow
(brotli lets fontTools read the .woff2 font files.)

Run from the repo root:
  python3 scripts/generate-icons.py
"""

from __future__ import annotations

import math
from pathlib import Path

from fontTools.pens.basePen import BasePen
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from PIL import Image, ImageChops, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
FONT = ROOT / 'node_modules/@fontsource-variable/fraunces/files/fraunces-latin-full-normal.woff2'
OUT = ROOT / 'public'

# Brand colours
DRIFTWOOD = '#2B2521'
OFF_WHITE = '#FAF4F0'

# Fraunces instance. SOFT 0 / WONK 1 match the site's headlines. A mid optical size and
# a slightly heavier weight than the headlines keep the hairlines alive at 16px.
AXES = {'opsz': 48, 'wght': 600, 'SOFT': 0, 'WONK': 1}
GLYPH = 'S'

# Geometry, as fractions of the icon size
CORNER_RADIUS = 0.2  # rounded square
GLYPH_HEIGHT = 0.64  # cap height plus overshoot, for the standard icons
GLYPH_HEIGHT_APPLE = 0.6  # iOS masks the corners, so the glyph sits a touch smaller
GLYPH_HEIGHT_MASKABLE = 0.5  # stays well inside the 80% safe-zone circle

SUPERSAMPLE = 8
SVG_GRID = 512


def hex_rgba(value: str) -> tuple[int, int, int, int]:
    value = value.lstrip('#')
    return (int(value[0:2], 16), int(value[2:4], 16), int(value[4:6], 16), 255)


def load_glyph():
    """Instance the variable font at AXES and return (glyph set, glyph, bounds)."""
    font = TTFont(FONT)
    instance = instantiateVariableFont(font, AXES)
    glyph_set = instance.getGlyphSet()
    name = instance.getBestCmap()[ord(GLYPH)]
    glyph = glyph_set[name]
    bounds_pen = BoundsPen(glyph_set)
    glyph.draw(bounds_pen)
    return glyph_set, glyph, bounds_pen.bounds


def glyph_transform(bounds, size: float, height_frac: float):
    """Affine transform (font units -> icon pixels, y down) centring the glyph's ink."""
    x_min, y_min, x_max, y_max = bounds
    scale = size * height_frac / (y_max - y_min)
    dx = (size - (x_max - x_min) * scale) / 2 - x_min * scale
    dy = (size + (y_max - y_min) * scale) / 2 + y_min * scale
    return (scale, 0, 0, -scale, dx, dy)


class PolygonPen(BasePen):
    """Flattens a glyph outline into polygons (one per contour)."""

    STEPS = 48

    def __init__(self, glyph_set):
        super().__init__(glyph_set)
        self.contours: list[list[tuple[float, float]]] = []
        self.current: list[tuple[float, float]] = []

    def _moveTo(self, pt):
        self.current = [pt]

    def _lineTo(self, pt):
        self.current.append(pt)

    def _qCurveToOne(self, pt1, pt2):
        (x0, y0), (x1, y1), (x2, y2) = self._getCurrentPoint(), pt1, pt2
        for i in range(1, self.STEPS + 1):
            t = i / self.STEPS
            u = 1 - t
            self.current.append(
                (u * u * x0 + 2 * u * t * x1 + t * t * x2, u * u * y0 + 2 * u * t * y1 + t * t * y2)
            )

    def _curveToOne(self, pt1, pt2, pt3):
        (x0, y0), (x1, y1), (x2, y2), (x3, y3) = self._getCurrentPoint(), pt1, pt2, pt3
        for i in range(1, self.STEPS + 1):
            t = i / self.STEPS
            u = 1 - t
            self.current.append(
                (
                    u**3 * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t**3 * x3,
                    u**3 * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t**3 * y3,
                )
            )

    def _closePath(self):
        if len(self.current) > 2:
            self.contours.append(self.current)
        self.current = []

    _endPath = _closePath


def render_png(size: int, *, rounded: bool, height_frac: float, glyph_set, glyph, bounds) -> Image.Image:
    """Draw at SUPERSAMPLE x size, then downsample with LANCZOS."""
    big = size * SUPERSAMPLE
    image = Image.new('RGBA', (big, big), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    if rounded:
        draw.rounded_rectangle((0, 0, big - 1, big - 1), radius=round(big * CORNER_RADIUS), fill=hex_rgba(DRIFTWOOD))
    else:
        draw.rectangle((0, 0, big - 1, big - 1), fill=hex_rgba(DRIFTWOOD))

    polygon_pen = PolygonPen(glyph_set)
    glyph.draw(TransformPen(polygon_pen, glyph_transform(bounds, big, height_frac)))

    # Even-odd fill via XOR, correct for glyphs whose contours don't overlap
    # (an outer shape plus counters). The Fraunces "S" is a single contour.
    mask = Image.new('L', (big, big), 0)
    for contour in polygon_pen.contours:
        layer = Image.new('L', (big, big), 0)
        ImageDraw.Draw(layer).polygon(contour, fill=255)
        mask = ImageChops.logical_xor(mask.convert('1'), layer.convert('1')).convert('L')
    image.paste(Image.new('RGBA', (big, big), hex_rgba(OFF_WHITE)), (0, 0), mask)

    return image.resize((size, size), Image.Resampling.LANCZOS)


def fmt(value: float) -> str:
    text = f'{value:.1f}'.rstrip('0').rstrip('.')
    return '0' if text == '-0' else text


def write_svg(glyph_set, glyph, bounds) -> None:
    svg_pen = SVGPathPen(glyph_set, ntos=fmt)
    glyph.draw(TransformPen(svg_pen, glyph_transform(bounds, SVG_GRID, GLYPH_HEIGHT)))
    radius = fmt(SVG_GRID * CORNER_RADIUS)
    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {SVG_GRID} {SVG_GRID}">'
        f'<rect width="{SVG_GRID}" height="{SVG_GRID}" rx="{radius}" fill="{DRIFTWOOD}"/>'
        f'<path fill="{OFF_WHITE}" d="{svg_pen.getCommands()}"/>'
        '</svg>\n'
    )
    assert '<text' not in svg
    (OUT / 'favicon.svg').write_text(svg)


def main() -> None:
    OUT.mkdir(exist_ok=True)
    glyph_set, glyph, bounds = load_glyph()
    common = {'glyph_set': glyph_set, 'glyph': glyph, 'bounds': bounds}

    write_svg(glyph_set, glyph, bounds)

    ico_frames = [render_png(s, rounded=True, height_frac=GLYPH_HEIGHT, **common) for s in (48, 32, 16)]
    ico_frames[0].save(
        OUT / 'favicon.ico',
        format='ICO',
        sizes=[(f.width, f.height) for f in ico_frames],
        append_images=ico_frames[1:],
    )

    outputs = {
        'apple-touch-icon.png': render_png(180, rounded=False, height_frac=GLYPH_HEIGHT_APPLE, **common),
        'icon-192.png': render_png(192, rounded=True, height_frac=GLYPH_HEIGHT, **common),
        'icon-512.png': render_png(512, rounded=True, height_frac=GLYPH_HEIGHT, **common),
        'icon-maskable-512.png': render_png(512, rounded=False, height_frac=GLYPH_HEIGHT_MASKABLE, **common),
    }
    for name, image in outputs.items():
        if name == 'apple-touch-icon.png':
            image = image.convert('RGB')  # iOS fills transparency with black; keep it opaque
        image.save(OUT / name, optimize=True)

    for path in sorted(OUT.glob('*')):
        if path.suffix in {'.svg', '.ico', '.png'}:
            print(f'  {path.relative_to(ROOT)}  {path.stat().st_size:,} bytes')

    # Sanity check: the maskable glyph's bounding box fits the 80% safe-zone circle.
    x_min, y_min, x_max, y_max = bounds
    half_w = (x_max - x_min) / (y_max - y_min) * GLYPH_HEIGHT_MASKABLE / 2
    half_h = GLYPH_HEIGHT_MASKABLE / 2
    assert math.hypot(half_w, half_h) < 0.4, 'maskable glyph leaves the safe zone'


if __name__ == '__main__':
    main()
