"""Genere les icones SPOTI NOX (note noire sur fond vert) : build/icon.png + icones Android.
Usage : python3 scripts/make-icons.py   (necessite Pillow)"""
import math, os
from PIL import Image, ImageDraw

GREEN_TOP, GREEN_BOT = (59, 228, 119), (23, 168, 75)
ROOT = os.path.join(os.path.dirname(__file__), '..')

def bez(p0, p1, p2, p3, n=40):
    return [tuple((1-t)**3*p0[i] + 3*(1-t)**2*t*p1[i] + 3*(1-t)*t**2*p2[i] + t**3*p3[i] for i in (0, 1))
            for t in [k/n for k in range(n+1)]]

def note_mask(size, scale):
    """Masque d'une croche centree. scale = part de la largeur occupee par la hauteur de la note."""
    S = size * 4
    m = Image.new('L', (S, S), 0)
    d = ImageDraw.Draw(m)
    u = S * scale / 36.0            # la note fait 36 unites de haut (y 14..50), centre en (32,32)
    X = lambda x: S/2 + (x-32)*u
    Y = lambda y: S/2 + (y-32)*u
    # tete : ellipse inclinee
    pts = []
    for k in range(120):
        a = 2*math.pi*k/120
        ex, ey = 8.4*math.cos(a), 6.2*math.sin(a)
        r = math.radians(-22)
        pts.append((X(26 + ex*math.cos(r) - ey*math.sin(r)), Y(44 + ex*math.sin(r) + ey*math.cos(r))))
    d.polygon(pts, fill=255)
    # hampe
    d.rounded_rectangle([X(31.6), Y(14), X(35.4), Y(45.5)], radius=u*1.2, fill=255)
    # crochet (drapeau)
    top = bez((35.4, 14), (38.5, 20), (47, 22), (46.5, 31.5))
    back = bez((46.5, 31.5), (45, 27), (40.5, 25.5), (35.4, 25))
    d.polygon([(X(x), Y(y)) for x, y in top + back], fill=255)
    return m.resize((size, size), Image.LANCZOS)

def gradient(size):
    g = Image.new('RGB', (size, size))
    px = g.load()
    for y in range(size):
        for x in range(size):
            t = (x + y) / (2*size)
            px[x, y] = tuple(int(GREEN_TOP[i]*(1-t) + GREEN_BOT[i]*t) for i in range(3))
    return g

def rounded(size, radius_ratio):
    S = size*4
    m = Image.new('L', (S, S), 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, S-1, S-1], radius=int(S*radius_ratio), fill=255)
    return m.resize((size, size), Image.LANCZOS)

def icon(size, shape):
    bg = gradient(size).convert('RGBA')
    black = Image.new('RGBA', (size, size), (0, 0, 0, 255))
    bg.paste(black, (0, 0), note_mask(size, 0.52))
    out = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    out.paste(bg, (0, 0), rounded(size, 0.5 if shape == 'round' else 0.22))
    return out

def foreground(size):
    out = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    black = Image.new('RGBA', (size, size), (0, 0, 0, 255))
    out.paste(black, (0, 0), note_mask(size, 0.34))   # reste dans la zone sure (66 %) des icones adaptatives
    return out

os.makedirs(os.path.join(ROOT, 'build'), exist_ok=True)
icon(1024, 'square').save(os.path.join(ROOT, 'build', 'icon.png'))
for name, ls, fs in [('mdpi', 48, 108), ('hdpi', 72, 162), ('xhdpi', 96, 216), ('xxhdpi', 144, 324), ('xxxhdpi', 192, 432)]:
    d = os.path.join(ROOT, 'android-icons', 'mipmap-' + name)
    os.makedirs(d, exist_ok=True)
    icon(ls, 'square').save(os.path.join(d, 'ic_launcher.png'))
    icon(ls, 'round').save(os.path.join(d, 'ic_launcher_round.png'))
    foreground(fs).save(os.path.join(d, 'ic_launcher_foreground.png'))
print('icones generees')
