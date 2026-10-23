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


def logo(size, pad_ratio=0.0, bg=(22, 23, 25), radius_ratio=0.19):
    """The keys mark from the favicon, drawn at any size."""
    s = size * 4  # supersample, then shrink for smooth edges
    img = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    pad = int(s * pad_ratio)
    d.rounded_rectangle([pad, pad, s - pad, s - pad], radius=int((s - 2 * pad) * radius_ratio), fill=bg)
    inner = s - 2 * pad
    ox = pad + inner * 0.1875
    oy = pad + inner * 0.22
    kw = inner * 0.125
    gap = inner * 0.031
    kh = inner * 0.56
    for i in range(4):
        x = ox + i * (kw + gap)
        d.rounded_rectangle([x, oy, x + kw, oy + kh], radius=int(kw * 0.25), fill=CREAM)
    bw = kw * 0.75
    bh = kh * 0.61
    for i in (0, 2):
        x = ox + (i + 1) * (kw + gap) - gap / 2 - bw / 2
        d.rounded_rectangle([x, oy, x + bw, oy + bh], radius=int(bw * 0.25), fill=AMBER)
    return img.resize((size, size), Image.LANCZOS)


def icons():
    logo(192).save(OUT / 'icon-192.png')
    logo(512).save(OUT / 'icon-512.png')
    logo(180, bg=(22, 23, 25), radius_ratio=0.0).save(OUT / 'apple-touch-icon.png')
    # maskable: full-bleed background, mark inside the 80% safe zone
    m = Image.new('RGBA', (512, 512), (22, 23, 25, 255))
    mark = logo(380, bg=(22, 23, 25))
    m.alpha_composite(mark, (66, 66))
    m.save(OUT / 'icon-maskable-512.png')


def og_image():
    W, H = 1200, 630
    img = Image.new('RGB', (W, H), BG)
    d = ImageDraw.Draw(img)
    # faint bar grid, like the studio playlist
    for x in range(0, W, 60):
        d.line([(x, 0), (x, H)], fill=(20, 21, 24) if x % 240 else (26, 27, 31))

    img.paste(logo(96), (80, 78), logo(96))
    d.text((200, 92), 'Sonare', font=font(FONT, 64, 650), fill=CREAM)
    d.text((80, 214), 'Play 112 instruments in your browser.', font=font(FONT, 46, 600), fill=CREAM)
    d.text((80, 274), 'Make beats, record vocals and finish songs in the studio.', font=font(FONT, 30, 450), fill=MUTED)
    tags = ['Piano', 'Guitar', 'Drums', 'Flute', 'Studio', 'Learn songs']
    x = 80
    tf = font(MONO, 20, 500)
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
