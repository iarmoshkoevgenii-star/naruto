"""Draws the placeholder art for the DVD shelf (Phase 3 of docs/room-shop/PLAN.md):

  public/game/dvd/bookshelf-wood-empty.png   28x40  bookshelf with nothing on it
  public/game/dvd/bookshelf-white-empty.png  28x40
  public/game/dvd/dvd-blank.png              3x8    one blank DVD case seen from the spine side
  public/game/dvd/shelf-layout.json          where DVDs may stand on each empty bookshelf
  public/game/dvd/preview.png                (8x) shelves with 0, 4, 9 and 20 DVDs, to eyeball the result

Same palette and style as scripts/placeholders.py. The blank DVD is drawn in light grays on purpose:
the room tints it with the item's cover colour (multiply), so a light body takes any colour well.
Run:  python3 scripts/dvd-placeholders.py      (needs Pillow)"""
import json, os
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "public", "game", "dvd")
OL = (43, 42, 51, 255)
C = {
    "wood": (168, 107, 60), "wood_d": (122, 74, 40), "wood_l": (201, 139, 85),
    "white": (240, 237, 230), "white_d": (205, 200, 190), "white_l": (252, 251, 248),
}
def c(name): return C[name] + (255,)
def canvas(w, h): return Image.new("RGBA", (w, h), (0, 0, 0, 0))
def box(d, x0, y0, x1, y1, fill, ol=True): d.rectangle((x0, y0, x1, y1), fill=fill, outline=OL if ol else None)

# Geometry shared with scripts/placeholders.py bookshelf(): three rows starting at y = 3, 14, 25,
# each 8 px of free height above a 2 px ledge, free width x = 3..24.
ROW_TOPS = (3, 14, 25)
DVD_W, DVD_H, DVD_GAP = 3, 8, 1

def empty_bookshelf(t):
    im = canvas(28, 40); d = ImageDraw.Draw(im)
    box(d, 0, 0, 27, 39, c(t)); box(d, 2, 2, 25, 37, c(t + "_d"), ol=False)
    for y in ROW_TOPS:
        box(d, 2, y + 9, 25, y + 10, c(t + "_l"), ol=False)       # ledge
        d.line((3, y + 1, 24, y + 1), fill=c(t + "_d")[:3] + (255,))  # back-panel shadow line
    return im

def dvd_blank():
    im = canvas(DVD_W, DVD_H); d = ImageDraw.Draw(im)
    d.rectangle((0, 0, DVD_W - 1, DVD_H - 1), fill=(236, 236, 240, 255), outline=(70, 70, 80, 255))
    d.point((1, 1), fill=(255, 255, 255, 255))   # top label highlight
    d.point((1, DVD_H - 2), fill=(196, 196, 204, 255))
    return im

def layout():
    rows = [{"x": 3, "y": y + 1, "w": 22, "h": DVD_H} for y in ROW_TOPS]  # y = top of a standing DVD
    per_row = (22 + DVD_GAP) // (DVD_W + DVD_GAP)
    return {
        "dvd": {"w": DVD_W, "h": DVD_H, "gap": DVD_GAP},
        "shelves": {"bookshelf-wood": rows, "bookshelf-white": rows},
        "capacity": per_row * len(rows),
        "note": "Coordinates are in sprite pixels relative to the bookshelf sprite's top-left. Fill rows top to bottom, left to right.",
    }

TINTS = [(30, 92, 98), (196, 82, 66), (84, 124, 186), (214, 168, 64), (94, 155, 84), (224, 138, 60), (110, 70, 45)]
def tinted(blank, rgb):
    out = blank.copy(); px = out.load()
    for y in range(out.height):
        for x in range(out.width):
            r, g, b, a = px[x, y]
            if a and (r, g, b) != (70, 70, 80): px[x, y] = (r * rgb[0] // 255, g * rgb[1] // 255, b * rgb[2] // 255, a)
    return out

def compose(shelf, blank, lay, n):
    im = shelf.copy(); cap = lay["capacity"]; rows = lay["shelves"]["bookshelf-wood"]
    per = cap // len(rows)
    for i in range(min(n, cap)):
        r = rows[i // per]; x = r["x"] + (i % per) * (DVD_W + DVD_GAP)
        im.alpha_composite(tinted(blank, TINTS[i % len(TINTS)]), (x, r["y"]))
    if n > cap:  # "+N" marker stand-in: a small badge in the top-right corner
        d = ImageDraw.Draw(im); d.rectangle((21, 0, 27, 5), fill=(224, 138, 60, 255), outline=OL)
    return im

def main():
    os.makedirs(OUT, exist_ok=True)
    shelves = {t: empty_bookshelf(t) for t in ("wood", "white")}
    blank = dvd_blank(); lay = layout()
    for t, im in shelves.items(): im.save(os.path.join(OUT, f"bookshelf-{t}-empty.png"))
    blank.save(os.path.join(OUT, "dvd-blank.png"))
    with open(os.path.join(OUT, "shelf-layout.json"), "w") as f: json.dump(lay, f, indent=2); f.write("\n")
    counts = (0, 4, 9, 20); pad = 4
    sheet = canvas(len(counts) * (28 + pad) + pad, 40 + 2 * pad)
    for i, n in enumerate(counts): sheet.alpha_composite(compose(shelves["wood"], blank, lay, n), (pad + i * (28 + pad), pad))
    sheet.resize((sheet.width * 8, sheet.height * 8), Image.NEAREST).save(os.path.join(OUT, "preview.png"))
    print("capacity", lay["capacity"], "->", OUT)

if __name__ == "__main__":
    main()
