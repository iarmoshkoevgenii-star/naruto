"""Draws the placeholder room sprites into public/game/placeholders.png and writes
public/game/placeholders.json (sprite id -> [x, y, w, h]). Low-effort stand-ins: replace them with
real art through the teacher editor (Room & shop -> Uploads)."""
import json, os
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OL = (43, 42, 51, 255)        # outline
C = {
    "wood": (168, 107, 60), "wood_d": (122, 74, 40), "wood_l": (201, 139, 85),
    "walnut": (110, 70, 45), "walnut_d": (78, 48, 30), "walnut_l": (140, 94, 62),
    "white": (240, 237, 230), "white_d": (205, 200, 190), "white_l": (252, 251, 248),
    "teal": (62, 140, 140), "teal_d": (40, 100, 100), "teal_l": (100, 175, 170),
    "orange": (224, 138, 60), "orange_d": (178, 98, 36), "orange_l": (240, 172, 104),
    "green": (94, 155, 84), "green_d": (62, 110, 58), "green_l": (136, 190, 118),
    "blue": (84, 124, 186), "blue_d": (58, 90, 140), "blue_l": (130, 166, 214),
    "red": (196, 82, 66), "red_d": (150, 56, 46), "red_l": (224, 126, 108),
    "mustard": (214, 168, 64), "mustard_d": (170, 128, 40), "mustard_l": (234, 198, 110),
    "gray": (138, 143, 152), "gray_d": (100, 104, 112), "gray_l": (176, 180, 188),
    "beige": (227, 211, 181), "beige_d": (196, 176, 140), "beige_l": (242, 232, 212),
    "sky": (156, 207, 232), "sky_l": (210, 236, 248), "screen": (46, 59, 78), "glow": (127, 209, 199),
    "pot": (186, 110, 72), "pot_d": (140, 78, 50), "cream": (240, 228, 196),
}
def c(name): return C[name] + (255,)

def canvas(w, h): return Image.new("RGBA", (w, h), (0, 0, 0, 0))
def box(d, x0, y0, x1, y1, fill, ol=True): d.rectangle((x0, y0, x1, y1), fill=fill, outline=OL if ol else None)

def desk(t):
    im = canvas(40, 20); d = ImageDraw.Draw(im)
    box(d, 0, 0, 39, 6, c(t + "_l")); box(d, 2, 6, 37, 14, c(t))
    d.line((6, 10, 18, 10), fill=c(t + "_d")); d.line((21, 10, 33, 10), fill=c(t + "_d"))
    box(d, 3, 14, 5, 19, c(t + "_d")); box(d, 34, 14, 36, 19, c(t + "_d"))
    return im

def chair(t):
    im = canvas(16, 22); d = ImageDraw.Draw(im)
    box(d, 2, 0, 13, 10, c(t)); d.line((4, 2, 11, 2), fill=c(t + "_l"))
    box(d, 1, 10, 14, 15, c(t + "_l"))
    box(d, 2, 15, 3, 21, c("wood_d")); box(d, 12, 15, 13, 21, c("wood_d"))
    return im

def bed(t):
    im = canvas(32, 44); d = ImageDraw.Draw(im)
    box(d, 0, 0, 31, 9, c("wood")); d.line((2, 3, 29, 3), fill=c("wood_l"))
    box(d, 1, 8, 30, 41, c("white")); box(d, 4, 10, 27, 16, c("white_l"))
    box(d, 1, 18, 30, 41, c(t)); d.line((2, 20, 29, 20), fill=c(t + "_l"))
    box(d, 1, 41, 30, 43, c("wood_d"))
    return im

def bookshelf(t):
    im = canvas(28, 40); d = ImageDraw.Draw(im)
    box(d, 0, 0, 27, 39, c(t)); box(d, 2, 2, 25, 37, c(t + "_d"), ol=False)
    spines = ["red", "blue", "green", "mustard", "teal", "orange", "white", "red", "blue"]
    for row, y in enumerate((3, 14, 25)):
        box(d, 2, y + 9, 25, y + 10, c(t + "_l"), ol=False)
        x = 3
        for i in range(6):
            if row == 2:  # DVDs: thin dark cases
                d.rectangle((x, y + 1, x + 2, y + 8), fill=(40, 40, 48, 255)); d.point((x + 1, y + 2), fill=c("gray_l")); x += 4
            else:
                s = spines[(i + row * 3) % len(spines)]; h = 7 - (i % 2)
                d.rectangle((x, y + 9 - h, x + 2, y + 8), fill=c(s)); x += 4
    return im

def computer():
    im = canvas(18, 16); d = ImageDraw.Draw(im)
    box(d, 0, 0, 17, 11, c("gray_d")); box(d, 2, 2, 15, 9, c("screen"), ol=False)
    d.line((3, 4, 10, 4), fill=c("glow")); d.line((3, 6, 13, 6), fill=c("glow")); d.point((12, 4), fill=c("orange"))
    box(d, 7, 11, 10, 13, c("gray")); box(d, 3, 13, 14, 15, c("gray_l"))
    return im

def diary():
    im = canvas(10, 8); d = ImageDraw.Draw(im)
    box(d, 0, 0, 9, 7, c("red")); d.line((1, 1, 1, 6), fill=c("red_d")); d.line((6, 0, 6, 7), fill=c("mustard"))
    return im

def calendar():
    im = canvas(16, 18); d = ImageDraw.Draw(im)
    box(d, 0, 2, 15, 17, c("white")); box(d, 0, 2, 15, 6, c("red"))
    d.point((4, 1), fill=OL); d.point((11, 1), fill=OL); d.point((4, 2), fill=OL); d.point((11, 2), fill=OL)
    for yy in (9, 12, 15):
        for xx in (3, 6, 9, 12): d.point((xx, yy), fill=c("gray_d"))
    d.rectangle((8, 11, 10, 13), outline=c("red"))
    return im

def window(curtain=None):
    im = canvas(32, 24); d = ImageDraw.Draw(im)
    box(d, 0, 0, 31, 21, c("wood")); box(d, 2, 2, 29, 19, c("sky"), ol=False)
    d.line((15, 2, 16, 19), fill=c("wood")); d.line((2, 10, 29, 10), fill=c("wood"))
    d.line((4, 4, 7, 4), fill=c("sky_l")); d.line((18, 12, 22, 12), fill=c("sky_l"))
    box(d, -1, 21, 32, 23, c("wood_l"))
    if curtain:
        box(d, 0, 0, 5, 20, c(curtain)); box(d, 26, 0, 31, 20, c(curtain))
    return im

def door(t):
    im = canvas(24, 40); d = ImageDraw.Draw(im)
    box(d, 0, 0, 23, 39, c("wood_d")); box(d, 2, 2, 21, 39, c(t))
    d.rectangle((5, 5, 18, 17), outline=c(t + "_d")); d.rectangle((5, 21, 18, 35), outline=c(t + "_d"))
    d.rectangle((17, 20, 18, 22), fill=c("mustard"))
    return im

def rug(t, round_=False):
    im = canvas(48, 26); d = ImageDraw.Draw(im)
    if round_:
        d.ellipse((0, 0, 47, 25), fill=c(t), outline=OL); d.ellipse((7, 4, 40, 21), outline=c(t + "_l")); d.ellipse((16, 8, 31, 17), fill=c(t + "_d"))
    else:
        box(d, 0, 0, 47, 25, c(t)); d.rectangle((3, 3, 44, 22), outline=c(t + "_l")); d.rectangle((6, 6, 41, 19), outline=c(t + "_d"))
        for x in range(9, 40, 6): d.point((x, 12), fill=c(t + "_l")); d.point((x + 3, 13), fill=c(t + "_d"))
    return im

def plant(tall):
    im = canvas(14, 24); d = ImageDraw.Draw(im)
    box(d, 3, 17, 10, 23, c("pot")); d.line((4, 18, 9, 18), fill=c("pot_d"))
    if tall:
        for x0, y0, x1, y1 in ((6, 2, 8, 17), (2, 6, 6, 12), (8, 4, 12, 10), (3, 0, 7, 5)):
            d.ellipse((x0 - 1, y0, x1 + 1, y1), fill=c("green"), outline=OL)
    else:
        d.ellipse((0, 8, 13, 18), fill=c("green_d"), outline=OL); d.ellipse((3, 5, 10, 14), fill=c("green"), outline=OL); d.point((6, 8), fill=c("green_l"))
    return im

def lamp(t):
    im = canvas(12, 30); d = ImageDraw.Draw(im)
    d.polygon([(2, 9), (9, 9), (11, 0), (0, 0)], fill=c(t), outline=OL)
    d.line((5, 9, 5, 27), fill=c("gray_d")); d.line((6, 9, 6, 27), fill=c("gray"))
    box(d, 2, 27, 9, 29, c("gray_d"))
    return im

def art(kind):
    im = canvas(24, 16); d = ImageDraw.Draw(im)
    box(d, 0, 0, 23, 15, c("wood_d")); box(d, 2, 2, 21, 13, c("beige_l"), ol=False)
    if kind == "sunset":
        d.ellipse((8, 5, 15, 12), fill=c("orange")); d.rectangle((2, 10, 21, 13), fill=c("teal"))
    else:
        d.polygon([(2, 13), (9, 5), (14, 10), (17, 7), (21, 13)], fill=c("blue")); d.point((17, 4), fill=c("mustard"))
    return im

def armchair(t):
    im = canvas(24, 22); d = ImageDraw.Draw(im)
    box(d, 3, 0, 20, 12, c(t)); d.line((5, 2, 18, 2), fill=c(t + "_l"))
    box(d, 0, 6, 5, 18, c(t + "_d")); box(d, 18, 6, 23, 18, c(t + "_d")); box(d, 4, 11, 19, 17, c(t + "_l"))
    box(d, 3, 18, 4, 21, c("wood_d")); box(d, 19, 18, 20, 21, c("wood_d"))
    return im

def clock():
    im = canvas(12, 12); d = ImageDraw.Draw(im)
    d.ellipse((0, 0, 11, 11), fill=c("white"), outline=OL); d.line((6, 6, 6, 3), fill=OL); d.line((6, 6, 8, 7), fill=OL)
    return im

SPRITES = {
    "desk-wood": desk("wood"), "desk-white": desk("white"), "desk-walnut": desk("walnut"),
    "chair-teal": chair("teal"), "chair-orange": chair("orange"), "chair-green": chair("green"),
    "bed-blue": bed("blue"), "bed-orange": bed("orange"), "bed-green": bed("green"),
    "bookshelf-wood": bookshelf("wood"), "bookshelf-white": bookshelf("white"),
    "computer": computer(), "diary": diary(), "calendar": calendar(),
    "window-plain": window(), "window-curtain-teal": window("teal"), "window-curtain-red": window("red"),
    "door-wood": door("wood"), "door-teal": door("teal"),
    "rug-beige": rug("beige"), "rug-teal": rug("teal"), "rug-orange": rug("orange"), "rug-green-round": rug("green", True),
    "plant-bush": plant(False), "plant-tall": plant(True),
    "lamp-cream": lamp("cream" if False else "beige"), "lamp-teal": lamp("teal"),
    "art-sunset": art("sunset"), "art-mountains": art("mountains"),
    "armchair-mustard": armchair("mustard"), "armchair-gray": armchair("gray"),
    "clock": clock(),
}

def pack(sprites, width=256, pad=2):
    x = y = row = 0; rects = {}
    for k, im in sprites.items():
        w, h = im.size
        if x + w > width: x, y, row = 0, y + row + pad, 0
        rects[k] = [x, y, w, h]; x += w + pad; row = max(row, h)
    sheet = canvas(width, y + row)
    for k, im in sprites.items(): sheet.paste(im, tuple(rects[k][:2]), im)
    return sheet, rects

if __name__ == "__main__":
    sheet, rects = pack(SPRITES)
    out = os.path.join(ROOT, "public", "game"); os.makedirs(out, exist_ok=True)
    sheet.save(os.path.join(out, "placeholders.png"))
    with open(os.path.join(out, "placeholders.js"), "w") as f:
        f.write("/* Generated by scripts/placeholders.py: sprite id -> [x, y, w, h] in placeholders.png */\nexport default " + json.dumps(rects) + ";\n")
    print(len(rects), "sprites,", sheet.size)
