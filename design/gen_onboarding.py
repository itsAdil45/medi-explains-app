PURPLE = "#792884"
PURPLE_TINT = "#f1e4f4"
PURPLE_LINE = "#c9a3d1"
GREEN = "#4ab96a"
GREEN_DEEP = "#2f8f4e"
GREEN_TINT = "#e4f7ea"
GREEN_LINE = "#a9ddba"
INK = "#3a2340"

def svg(body, vb=320):
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="{vb}" height="{vb}" viewBox="0 0 {vb} {vb}">{body}</svg>'

# ---------------------------------------------------------------
# 1. "Every word, understood" - two overlapping transcript bubbles
# ---------------------------------------------------------------
def lines(x, y, w, color, gap=16):
    out = ""
    widths = [w, w*0.72, w*0.5]
    for i, ww in enumerate(widths):
        out += f'<rect x="{x}" y="{y+i*gap}" width="{ww}" height="7" rx="3.5" fill="{color}"/>'
    return out

bubble1 = f'''
<g transform="translate(40,60) rotate(-4)">
  <rect x="0" y="0" width="170" height="118" rx="22" fill="{PURPLE_TINT}" stroke="{PURPLE}" stroke-width="3"/>
  <path d="M28,118 L18,140 L52,118 Z" fill="{PURPLE_TINT}" stroke="{PURPLE}" stroke-width="3" stroke-linejoin="round"/>
  {lines(24, 38, 120, PURPLE)}
</g>
'''

bubble2 = f'''
<g transform="translate(112,140) rotate(3)">
  <rect x="0" y="0" width="170" height="118" rx="22" fill="{GREEN_TINT}" stroke="{GREEN_DEEP}" stroke-width="3"/>
  <path d="M150,0 L162,-20 L128,0 Z" fill="{GREEN_TINT}" stroke="{GREEN_DEEP}" stroke-width="3" stroke-linejoin="round"/>
  {lines(24, 38, 120, GREEN_DEEP)}
</g>
'''

badge = f'''
<circle cx="160" cy="150" r="30" fill="{GREEN}" stroke="#ffffff" stroke-width="4"/>
<path d="M148,144 h20 M162,138 l6,6 l-6,6" fill="none" stroke="#ffffff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M172,156 h-20 M158,162 l-6,-6 l6,-6" fill="none" stroke="#ffffff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
'''

open("design/svg/ob-1.svg", "w").write(svg(bubble1 + bubble2 + badge))

# ---------------------------------------------------------------
# 2. "Just say Hey Doctor" - phone + mic + voice waves
# ---------------------------------------------------------------
def arc(cx, cy, r, color, w, a0, a1):
    import math
    x0 = cx + r*math.cos(math.radians(a0)); y0 = cy + r*math.sin(math.radians(a0))
    x1 = cx + r*math.cos(math.radians(a1)); y1 = cy + r*math.sin(math.radians(a1))
    large = 1 if (a1-a0) > 180 else 0
    return f'<path d="M{x0:.1f},{y0:.1f} A{r},{r} 0 {large} 1 {x1:.1f},{y1:.1f}" fill="none" stroke="{color}" stroke-width="{w}" stroke-linecap="round"/>'

waves = ""
for i, (r, col) in enumerate([(78, PURPLE_LINE), (108, GREEN_LINE), (138, PURPLE_LINE)]):
    waves += arc(160, 168, r, col, 6, 200, 340)
    waves += arc(160, 168, r, col, 6, 20, 160)

phone = f'''
<rect x="118" y="86" width="84" height="164" rx="20" fill="#ffffff" stroke="{PURPLE}" stroke-width="4"/>
<rect x="132" y="102" width="56" height="112" rx="8" fill="{PURPLE_TINT}"/>
<circle cx="160" cy="234" r="7" fill="{PURPLE}"/>
'''

mic = f'''
<circle cx="160" cy="150" r="26" fill="{GREEN}"/>
<rect x="150" y="132" width="20" height="30" rx="10" fill="#ffffff"/>
<path d="M142,156 a18,18 0 0 0 36,0" fill="none" stroke="#ffffff" stroke-width="4" stroke-linecap="round"/>
<line x1="160" y1="174" x2="160" y2="184" stroke="#ffffff" stroke-width="4" stroke-linecap="round"/>
'''

bubble = f'''
<rect x="60" y="46" width="120" height="46" rx="23" fill="{GREEN}"/>
<path d="M110,92 l-10,16 l22,-16 Z" fill="{GREEN}"/>
<text x="120" y="74" font-family="Helvetica, Arial, sans-serif" font-size="17" font-weight="700" fill="#ffffff" text-anchor="middle">Hey Doctor</text>
'''

open("design/svg/ob-2.svg", "w").write(svg(waves + phone + mic + bubble))

# ---------------------------------------------------------------
# 3. "Never miss a dose" - medication card + speaking clock
# ---------------------------------------------------------------
card = f'''
<rect x="46" y="70" width="170" height="130" rx="20" fill="{GREEN_TINT}" stroke="{GREEN_DEEP}" stroke-width="3"/>
<circle cx="82" cy="106" r="14" fill="{GREEN}"/>
<path d="M82,96 v20 M72,106 h20" stroke="#ffffff" stroke-width="4" stroke-linecap="round"/>
{lines(108, 96, 88, GREEN_DEEP, gap=15)}
<line x1="62" y1="150" x2="200" y2="150" stroke="{GREEN_LINE}" stroke-width="2"/>
<circle cx="82" cy="176" r="10" fill="{PURPLE}"/>
{lines(108, 170, 70, PURPLE, gap=13)}
'''

clock = f'''
<circle cx="222" cy="196" r="54" fill="#ffffff" stroke="{PURPLE}" stroke-width="4"/>
<circle cx="222" cy="196" r="4" fill="{PURPLE}"/>
<line x1="222" y1="196" x2="222" y2="166" stroke="{PURPLE}" stroke-width="5" stroke-linecap="round"/>
<line x1="222" y1="196" x2="242" y2="204" stroke="{GREEN}" stroke-width="5" stroke-linecap="round"/>
'''

speak = f'''
<path d="M270,166 q10,10 0,20" fill="none" stroke="{GREEN}" stroke-width="4" stroke-linecap="round"/>
<path d="M278,158 q22,20 0,44" fill="none" stroke="{GREEN}" stroke-width="4" stroke-linecap="round"/>
'''

open("design/svg/ob-3.svg", "w").write(svg(card + clock + speak))
print("done")
