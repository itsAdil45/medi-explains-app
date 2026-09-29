# Generates every app-icon SVG variant from one shared stethoscope glyph.
# Coordinates are authored in a 0-100 box, then scaled to each target viewBox.

PURPLE = "#792884"
PURPLE_DEEP = "#5c1f66"
GREEN = "#4ab96a"
WHITE = "#ffffff"

def glyph(color_tube="white", color_chest=GREEN, chest_ring="#2f8f4e", stroke_w=9):
    # Two earpieces -> yoke -> stem -> chestpiece. Bold, simplified silhouette
    # (not a literal trace of any icon set) so it stays legible at 48x48.
    return f'''
    <circle cx="32" cy="19" r="7" fill="none" stroke="{color_tube}" stroke-width="{stroke_w}"/>
    <circle cx="68" cy="19" r="7" fill="none" stroke="{color_tube}" stroke-width="{stroke_w}"/>
    <path d="M32,26 C32,49 40,54 50,54 C60,54 68,49 68,26"
          fill="none" stroke="{color_tube}" stroke-width="{stroke_w}"
          stroke-linecap="round"/>
    <line x1="50" y1="54" x2="50" y2="65" stroke="{color_tube}" stroke-width="{stroke_w}" stroke-linecap="round"/>
    <circle cx="50" cy="80" r="15.5" fill="{color_chest}" stroke="{chest_ring}" stroke-width="2.5"/>
    <circle cx="50" cy="80" r="6" fill="{color_tube}" opacity="0.9"/>
    '''

def wrap(size, content, viewbox=100):
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" viewBox="0 0 {viewbox} {viewbox}">{content}</svg>'

# 1. Full icon (square bg + glyph) - iOS / root icon / favicon source
full = f'''
<rect width="100" height="100" fill="{PURPLE}"/>
<rect width="100" height="100" fill="url(#g)" opacity="0.35"/>
<defs>
  <radialGradient id="g" cx="30%" cy="20%" r="80%">
    <stop offset="0%" stop-color="#9a4aa6"/>
    <stop offset="100%" stop-color="{PURPLE_DEEP}"/>
  </radialGradient>
</defs>
{glyph()}
'''
open("design/svg/icon-full.svg", "w").write(wrap(1024, full))

# 2. Adaptive icon foreground (transparent, glyph only, kept inside Android's
#    ~66% safe zone by scaling+centering the 0-100 glyph box down)
fg_inner = glyph()
fg = f'<g transform="translate(15,15) scale(0.7)">{fg_inner}</g>'
open("design/svg/icon-fg.svg", "w").write(wrap(512, fg))

# 3. Adaptive icon background (flat plate, no glyph)
bg = f'<rect width="100" height="100" fill="{PURPLE}"/>'
open("design/svg/icon-bg.svg", "w").write(wrap(512, bg))

# 4. Monochrome (Android 13+ themed icon) - single shape, transparent bg,
#    OS applies its own tint, so this must be one solid color (no green accent)
mono_inner = glyph(color_tube="#000000", color_chest="#000000", chest_ring="#000000")
mono = f'<g transform="translate(15,15) scale(0.7)">{mono_inner}</g>'
open("design/svg/icon-mono.svg", "w").write(wrap(432, mono))

# 5. Splash mark (glyph only, transparent, for the animated splash screen -
#    rendered over a purple background in the app itself, not baked in here)
splash = glyph()
open("design/svg/icon-splash.svg", "w").write(wrap(300, splash))

print("done")
