"""
Build the web cut of Fraunces used by the site (src/assets/fonts/).

Pins weight, softness and wonk to the Figma instance (wght 400, SOFT 0, WONK 1) and keeps
only the optical-size axis, from Fontsource's Latin files. Re-run if the brand ever needs
another weight.

    pip install fonttools brotli
    python3 scripts/build-fonts.py
"""
from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

SRC = 'node_modules/@fontsource-variable/fraunces/files/fraunces-latin-full-{}.woff2'
OUT = 'src/assets/fonts/fraunces-{}-opsz.woff2'
PIN = {'wght': 400, 'SOFT': 0, 'WONK': 1}
LATIN = (
    list(range(0x20, 0x7F)) + list(range(0xA0, 0x100))
    + [0x131, 0x152, 0x153, 0x2BB, 0x2BC, 0x2C6, 0x2DA, 0x2DC]
    + list(range(0x2000, 0x2070)) + [0x20AC, 0x2122, 0x2212]
)

for style in ('normal', 'italic'):
    font = instantiateVariableFont(TTFont(SRC.format(style)), PIN, inplace=False)
    if style == 'normal':  # the italic source trips fontTools' subsetter; it's Latin already
        options = subset.Options()
        options.flavor = 'woff2'
        options.layout_features = ['*']
        options.name_IDs = ['*']
        subsetter = subset.Subsetter(options=options)
        subsetter.populate(unicodes=LATIN)
        subsetter.subset(font)
    font.flavor = 'woff2'
    font.save(OUT.format(style))
    print('wrote', OUT.format(style))
