"""App icons and the social-share image, drawn with Pillow (python scripts/make-images.py)."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'public'
FONT = ROOT / 'node_modules/@fontsource-variable/instrument-sans/files/instrument-sans-latin-wght-normal.woff2'
MONO = ROOT / 'node_modules/@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2'

BG = (15, 16, 18)
PANEL = (23, 24, 27)
CREAM = (239, 233, 220)
AMBER = (227, 160, 67)
MUTED = (161, 157, 149)
FAINT = (106, 103, 96)
BORDER = (42, 43, 48)


def font(path, size, weight=None):
    f = ImageFont.truetype(str(path), size)
    if weight:
        try:
            f.set_variation_by_axes([weight])
        except Exception:
            pass
    return f


TILE = (32, 33, 37)
EDGE = (60, 62, 69)
WHITE_KEY = (235, 231, 223)


def draw_mark(d, ox, oy, u, tile=True):
    """The mark from src/components/Logo.tsx (a 28-unit grid), drawn at `u` pixels per unit."""
    r = lambda x0, y0, w, h, rad, **kw: d.rounded_rectangle(
        [ox + x0 * u, oy + y0 * u, ox + (x0 + w) * u, oy + (y0 + h) * u], radius=rad * u, **kw)
    if tile:
        r(1, 1, 26, 26, 6, fill=TILE, outline=EDGE, width=max(1, round(u)))
    for x in (6, 10.6, 15.2, 19.8):
        r(x, 6, 3.4, 16, 1, fill=WHITE_KEY)
    for x in (8.6, 17.8):
        r(x, 6, 2.8, 9.5, 0.8, fill=AMBER)


def logo(size):
    """Transparent-cornered icon, exactly the favicon."""
    s = size * 4  # supersample, then shrink for smooth edges
    img = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    draw_mark(ImageDraw.Draw(img), 0, 0, s / 28)
    return img.resize((size, size), Image.LANCZOS)


def full_bleed(size, scale):
    """Square icon filled with the tile colour, the keys at `scale` of the width (for masks and iOS)."""
    s = size * 4
    img = Image.new('RGBA', (s, s), TILE + (255,))
    u = s * scale / 18  # the keys span 17.2 units; leave a hair of room
    ox = (s - 28 * u) / 2
    draw_mark(ImageDraw.Draw(img), ox, ox, u, tile=False)
    return img.resize((size, size), Image.LANCZOS)


def icons():
    logo(192).save(OUT / 'icon-192.png')
    logo(512).save(OUT / 'icon-512.png')
    full_bleed(180, 0.62).convert('RGB').save(OUT / 'apple-touch-icon.png')
    # maskable: everything important inside the central 80% safe zone
    full_bleed(512, 0.5).save(OUT / 'icon-maskable-512.png')
    ico = logo(256)
    ico.save(OUT / 'favicon.ico', sizes=[(16, 16), (32, 32), (48, 48)])


def og_image():
    W, H = 1200, 630
    img = Image.new('RGB', (W, H), BG)
    d = ImageDraw.Draw(img)
    # faint bar grid, like the studio playlist
    for x in range(0, W, 60):
        d.line([(x, 0), (x, H)], fill=(20, 21, 24) if x % 240 else (26, 27, 31))

    mark = logo(88)
    img.paste(mark, (80, 72), mark)
    d.text((188, 86), 'Sonare', font=font(FONT, 58, 650), fill=CREAM)
    d.text((80, 206), 'Play any instrument. Finish the song.', font=font(FONT, 52, 650), fill=CREAM)
    d.text((80, 276), '112 instruments, songs to learn and a studio — free, in your browser.', font=font(FONT, 28, 450), fill=MUTED)
    tags = ['Piano', 'Guitar', 'Drums', 'Flute', 'Studio', 'Learn songs']
    x = 80
    tf = font(FONT, 20, 500)
    for t in tags:
        w = d.textlength(t, font=tf) + 28
        d.rounded_rectangle([x, 340, x + w, 378], radius=19, outline=BORDER, width=2)
        d.text((x + 14, 348), t, font=tf, fill=MUTED)
        x += w + 10

    # keyboard along the bottom
    top, bottom = 430, H
    d.rectangle([0, top - 6, W, top - 1], fill=(122, 31, 31))
    whites = 28
    ww = W / whites
    pressed = {9, 11, 13}
    for i in range(whites):
        x0 = i * ww
        col = (247, 244, 236) if i not in pressed else (238, 206, 160)
        d.rectangle([x0 + 1, top, x0 + ww - 1, bottom], fill=col)
    pattern = [1, 1, 0, 1, 1, 1, 0]
    for i in range(whites - 1):
        if pattern[i % 7]:
            x = (i + 1) * ww - ww * 0.3
            d.rectangle([x, top, x + ww * 0.6, top + (bottom - top) * 0.6], fill=(20, 20, 20))
    img.save(OUT / 'og-image.png', optimize=True)


if __name__ == '__main__':
    icons()
    og_image()
    print('written to', OUT)
