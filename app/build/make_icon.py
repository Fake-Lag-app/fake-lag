"""Draws the Fake Lag logo: a Wi-Fi symbol whose outer arcs glitch apart.
Writes icon.png (1024) and icon.ico (16-256) next to this file.  usage: python make_icon.py
"""
import os, random
from PIL import Image, ImageDraw, ImageFilter

S = 1024                      # final size; drawn at 2x and scaled down for smooth edges
K = 2
N = S * K
here = os.path.dirname(os.path.abspath(__file__))
random.seed(4)

BG_TOP, BG_BOT = (33, 36, 46), (14, 15, 20)
WHITE = (240, 242, 246)
RED = (255, 90, 90)

def rounded_bg():
    grad = Image.new('RGB', (N, N))
    d = ImageDraw.Draw(grad)
    for y in range(N):
        t = y / N
        d.line([(0, y), (N, y)], fill=tuple(round(a + (b - a) * t) for a, b in zip(BG_TOP, BG_BOT)))
    mask = Image.new('L', (N, N), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, N - 1, N - 1], radius=int(N * 0.225), fill=255)
    out = Image.new('RGBA', (N, N), (0, 0, 0, 0))
    out.paste(grad, (0, 0), mask)
    return out

def arc_layer(radius, width, color):
    lay = Image.new('RGBA', (N, N), (0, 0, 0, 0))
    cx, cy = N / 2, N * 0.70
    box = [cx - radius, cy - radius, cx + radius, cy + radius]
    ImageDraw.Draw(lay).arc(box, start=225, end=315, fill=color, width=width)
    # round caps
    import math
    d = ImageDraw.Draw(lay)
    for ang in (225, 315):
        r = radius - width / 2
        x, y = cx + r * math.cos(math.radians(ang)), cy + r * math.sin(math.radians(ang))
        d.ellipse([x - width / 2, y - width / 2, x + width / 2, y + width / 2], fill=color)
    return lay

def glitch(layer, slices, max_shift):
    """cut the layer into horizontal bands and slide some of them sideways"""
    out = Image.new('RGBA', layer.size, (0, 0, 0, 0))
    bbox = layer.getbbox()
    if not bbox:
        return layer
    y0, y1 = bbox[1], bbox[3]
    cuts = sorted(random.sample(range(y0 + 1, y1), slices))
    bands = list(zip([y0] + cuts, cuts + [y1]))
    for i, (a, b) in enumerate(bands):
        band = layer.crop((0, a, N, b))
        dx = 0 if i % 2 == 0 else random.choice([-1, 1]) * random.randint(max_shift // 3, max_shift)
        out.alpha_composite(band, (dx, a))
    return out

img = rounded_bg()
w = int(N * 0.085)
cx, cy = N / 2, N * 0.70

# solid, healthy inner arcs
img.alpha_composite(arc_layer(N * 0.20, w, WHITE))
img.alpha_composite(arc_layer(N * 0.335, w, WHITE))
# outer arc: red and breaking apart
img.alpha_composite(glitch(arc_layer(N * 0.47, w, RED), slices=7, max_shift=int(N * 0.045)))

# the dot
d = ImageDraw.Draw(img)
r = w * 0.78
d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=WHITE)

# a few loose "packets" drifting off the broken arc
for (fx, fy, s) in [(0.80, 0.22, 0.040), (0.86, 0.30, 0.028), (0.75, 0.15, 0.024), (0.89, 0.19, 0.018)]:
    x, y, q = N * fx, N * fy, N * s
    d.rectangle([x, y, x + q, y + q], fill=RED)

img = img.resize((S, S), Image.LANCZOS)
img.save(os.path.join(here, 'icon.png'))
img.save(os.path.join(here, 'icon.ico'), sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
print('ok')
