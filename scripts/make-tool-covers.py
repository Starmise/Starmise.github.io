"""
Portadas provisionales de las herramientas del Taller (sala `workshop`).

Dibuja, en pixel art estilo plano técnico, un icono por herramienta y lo guarda como
art/img/Tools<Nombre>.png (640×480). Son marcadores de posición originales y sin texto (sirven en
los dos idiomas): para usar una captura real, copiarla a art/img/ con el MISMO nombre (o cambiar
`cover` en src/data/projects.json) y correr `npm run images`.

Uso:  python scripts/make-tool-covers.py            (requiere Pillow: pip install pillow)
      python scripts/make-tool-covers.py --force    (sobrescribe también las que ya existan)
"""

import math
import os
import sys

from PIL import Image, ImageDraw

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
OUT = os.path.join(ROOT, "art", "img")
W, H, SCALE = 160, 120, 4

BG = (16, 30, 52)
GRID = (26, 46, 76)
GRID2 = (34, 60, 98)
INK = (217, 207, 182)  # hueso, como el papel de las fichas
DIM = (120, 132, 150)
GROUPS = {
    "editor": (150, 166, 186),
    "ai": (78, 150, 222),
    "gameplay": (200, 52, 64),
    "online": (82, 186, 110),
}


def base(accent):
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)
    for x in range(0, W, 8):
        d.line([(x, 0), (x, H)], fill=GRID2 if x % 40 == 0 else GRID)
    for y in range(0, H, 8):
        d.line([(0, y), (W, y)], fill=GRID2 if y % 40 == 0 else GRID)
    d.rectangle([0, 0, W - 1, 5], fill=accent)
    # Esquinas de plano.
    for (x, y, sx, sy) in [(6, 12, 1, 1), (W - 7, 12, -1, 1), (6, H - 7, 1, -1), (W - 7, H - 7, -1, -1)]:
        d.line([(x, y), (x + 10 * sx, y)], fill=INK)
        d.line([(x, y), (x, y + 10 * sy)], fill=INK)
    return img, d


def circle(d, c, r, **kw):
    d.ellipse([c[0] - r, c[1] - r, c[0] + r, c[1] + r], **kw)


def arrow_up(d, x, y, h, color, w=2):
    d.line([(x, y), (x, y - h)], fill=color, width=w)
    d.polygon([(x - 4, y - h + 3), (x + 4, y - h + 3), (x, y - h - 3)], fill=color)


def person(d, x, y, color, s=1.0):
    circle(d, (x, y - 22 * s), 6 * s, fill=color)
    d.rectangle([x - 7 * s, y - 14 * s, x + 7 * s, y + 2 * s], fill=color)
    d.rectangle([x - 6 * s, y + 2 * s, x - 2 * s, y + 16 * s], fill=color)
    d.rectangle([x + 2 * s, y + 2 * s, x + 6 * s, y + 16 * s], fill=color)


def spawning(d, a):
    d.ellipse([46, 78, 114, 98], outline=a, width=3)
    d.ellipse([58, 83, 102, 93], outline=INK, width=1)
    for x, h in [(62, 22), (80, 34), (98, 22)]:
        arrow_up(d, x, 80, h, INK)
    d.rectangle([72, 26, 88, 42], outline=a, width=2)
    d.line([(72, 26), (77, 21), (93, 21), (88, 26)], fill=a, width=2)
    d.line([(93, 21), (93, 37), (88, 42)], fill=a, width=2)


def google_accounts(d, a):
    d.rounded_rectangle([44, 24, 116, 98], radius=6, outline=INK, width=2)
    circle(d, (80, 48), 11, fill=INK)
    d.pieslice([58, 60, 102, 104], 180, 360, fill=INK)
    d.rectangle([58, 82, 102, 96], fill=BG)
    d.rounded_rectangle([96, 70, 120, 92], radius=3, fill=a)
    d.arc([100, 60, 116, 78], 180, 360, fill=a, width=3)
    circle(d, (108, 81), 2, fill=BG)


def combat(d, a):
    # Espada en diagonal (melee) y mira (a distancia).
    d.line([(38, 92), (84, 38)], fill=INK, width=5)
    d.polygon([(84, 38), (92, 28), (88, 42)], fill=INK)
    d.line([(36, 74), (56, 94)], fill=a, width=4)
    d.line([(30, 100), (40, 88)], fill=a, width=4)
    circle(d, (110, 66), 18, outline=a, width=3)
    circle(d, (110, 66), 8, outline=INK, width=2)
    for dx, dy in [(0, -26), (0, 26), (-26, 0), (26, 0)]:
        d.line([(110 + dx * 0.4, 66 + dy * 0.4), (110 + dx, 66 + dy)], fill=INK, width=2)
    circle(d, (110, 66), 2, fill=a)


def perception(d, a):
    d.polygon([(52, 60), (132, 30), (132, 92)], outline=a)
    for i in range(1, 4):
        x = 52 + i * 20
        d.line([(x, 60 - i * 7.5), (x, 60 + i * 8)], fill=GRID2)
    d.chord([24, 44, 80, 78], 200, 340, fill=INK)
    d.chord([24, 42, 80, 76], 20, 160, fill=INK)
    circle(d, (52, 60), 9, fill=BG)
    circle(d, (52, 60), 5, fill=a)
    circle(d, (120, 60), 6, fill=INK)  # algo detectado dentro del cono


def quests(d, a):
    d.rectangle([48, 30, 104, 94], fill=INK)
    d.rectangle([44, 26, 108, 32], fill=DIM)
    d.rectangle([44, 92, 108, 98], fill=DIM)
    for i, y in enumerate([44, 58, 72]):
        d.rectangle([56, y - 4, 64, y + 4], outline=BG, width=2)
        if i < 2:
            d.line([(57, y), (60, y + 3), (66, y - 5)], fill=a, width=2)
        d.line([(70, y), (96, y)], fill=BG, width=2)
    d.rectangle([116, 30, 126, 72], fill=a)
    d.rectangle([116, 80, 126, 90], fill=a)


def pathfinding(d, a):
    nodes = [(36, 88), (58, 54), (84, 82), (100, 40), (126, 66), (74, 30), (124, 98)]
    edges = [(0, 1), (1, 2), (1, 5), (2, 3), (3, 4), (5, 3), (2, 6), (4, 6)]
    path = [(0, 1), (1, 2), (2, 3), (3, 4)]
    for i, j in edges:
        d.line([nodes[i], nodes[j]], fill=DIM, width=1)
    for i, j in path:
        d.line([nodes[i], nodes[j]], fill=a, width=3)
    for k, n in enumerate(nodes):
        circle(d, n, 5, fill=INK if k in (0, 4) else BG, outline=INK, width=2)
    d.polygon([(126, 50), (126, 60), (134, 55)], fill=a)  # banderín de destino
    d.line([(126, 50), (126, 66)], fill=INK, width=1)


def level_editor(d, a):
    x0, y0, s = 40, 26, 16
    fills = {(0, 3), (1, 3), (2, 3), (3, 3), (1, 2), (3, 1), (0, 0)}
    for i in range(4):
        for j in range(4):
            box = [x0 + i * s, y0 + j * s, x0 + i * s + s - 2, y0 + j * s + s - 2]
            d.rectangle(box, fill=a if (i, j) in fills else None, outline=INK)
    # Lápiz.
    d.line([(98, 96), (128, 50)], fill=INK, width=7)
    d.polygon([(94, 104), (95, 94), (102, 98)], fill=a)
    d.line([(124, 56), (130, 46)], fill=DIM, width=7)


def llm(d, a):
    d.rounded_rectangle([34, 28, 112, 78], radius=10, fill=INK)
    d.polygon([(50, 76), (46, 94), (66, 76)], fill=INK)
    for x in (56, 73, 90):
        circle(d, (x, 53), 5, fill=BG)
    d.rectangle([100, 70, 130, 100], fill=a)
    d.rectangle([106, 76, 124, 94], outline=BG, width=2)
    for k in range(4):
        y = 74 + k * 7
        d.line([(96, y), (100, y)], fill=a, width=2)
        d.line([(130, y), (134, y)], fill=a, width=2)


def occlusion(d, a):
    d.rectangle([26, 52, 44, 68], fill=INK)
    d.polygon([(44, 56), (52, 52), (52, 68), (44, 64)], fill=INK)
    d.line([(52, 52), (134, 24)], fill=DIM)
    d.line([(52, 68), (134, 100)], fill=DIM)
    d.rectangle([72, 42, 92, 80], fill=a)  # el que tapa
    for x in range(102, 130, 6):  # el oculto, punteado
        d.line([(x, 46), (x + 3, 46)], fill=INK)
        d.line([(x, 76), (x + 3, 76)], fill=INK)
    for y in range(46, 78, 6):
        d.line([(102, y), (102, y + 3)], fill=INK)
        d.line([(128, y), (128, y + 3)], fill=INK)
    d.line([(104, 48), (126, 74)], fill=a, width=2)
    d.line([(126, 48), (104, 74)], fill=a, width=2)


def procedural(d, a):
    for i in range(4):
        for j in range(4):
            if (i + j) % 2 == 0:
                d.rectangle([28 + i * 9, 30 + j * 9, 36 + i * 9, 38 + j * 9], fill=INK)
    d.rectangle([27, 29, 63, 65], outline=INK)
    pts = [(98, 30), (122, 42), (98, 54), (74, 42)]
    d.polygon(pts, outline=a)
    d.line([(74, 42), (74, 66), (98, 78), (98, 54)], fill=a, width=1)
    d.line([(98, 78), (122, 66), (122, 42)], fill=a, width=1)
    wave = [(24 + x, 92 - int(10 * math.sin(x / 7.0) * math.sin(x / 23.0 + 1))) for x in range(0, 112, 2)]
    d.line(wave, fill=INK, width=2)


def rounds(d, a):
    for r, c in [(30, a), (22, INK), (14, a), (6, INK)]:
        circle(d, (70, 62), r, fill=c)
    d.line([(70, 62), (112, 36)], fill=INK, width=2)
    d.polygon([(108, 32), (118, 30), (114, 40)], fill=DIM)
    for k in range(3):
        circle(d, (112 + k * 12, 92), 4, fill=a if k < 2 else None, outline=INK)


def achievements(d, a):
    d.polygon([(66, 24), (78, 24), (88, 56), (76, 56)], fill=a)
    d.polygon([(94, 24), (82, 24), (72, 56), (84, 56)], fill=GROUPS["ai"])
    circle(d, (80, 74), 22, fill=INK)
    circle(d, (80, 74), 16, outline=BG, width=2)
    pts = []
    for k in range(10):
        r = 11 if k % 2 == 0 else 5
        ang = math.radians(-90 + k * 36)
        pts.append((80 + r * math.cos(ang), 75 + r * math.sin(ang)))
    d.polygon(pts, fill=a)


def event_ui(d, a):
    d.rectangle([30, 28, 110, 92], outline=INK, width=2)
    d.rectangle([30, 28, 110, 38], fill=INK)
    for x in (100, 92):
        circle(d, (x, 33), 2, fill=BG)
    d.rectangle([38, 46, 80, 52], fill=a)
    d.rectangle([38, 58, 70, 64], fill=DIM)
    d.rectangle([38, 70, 76, 76], fill=DIM)
    d.polygon([(124, 34), (110, 62), (120, 62), (112, 90), (134, 54), (123, 54), (132, 34)], fill=a)


def crafting(d, a):
    d.polygon([(40, 76), (112, 76), (104, 86), (48, 86)], fill=INK)
    d.rectangle([62, 86, 90, 98], fill=INK)
    d.rectangle([52, 98, 100, 104], fill=DIM)
    d.polygon([(112, 76), (130, 78), (112, 82)], fill=INK)
    # Martillo inclinado.
    d.line([(64, 66), (100, 30)], fill=DIM, width=5)
    d.polygon([(52, 52), (66, 38), (80, 52), (66, 66)], fill=a)
    for x, y in [(96, 62), (106, 56), (100, 50)]:
        d.point((x, y), fill=a)
        d.point((x + 1, y), fill=a)


def inventory(d, a):
    s = 18
    items = {(0, 0): "sword", (1, 0): "potion", (3, 1): "gem", (2, 2): "coin", (0, 2): "potion"}
    for i in range(5):
        for j in range(3):
            x, y = 34 + i * s, 32 + j * s
            d.rectangle([x, y, x + s - 3, y + s - 3], outline=INK, fill=(22, 40, 66))
            kind = items.get((i, j))
            cx, cy = x + 7, y + 7
            if kind == "sword":
                d.line([(cx - 4, cy + 4), (cx + 4, cy - 4)], fill=INK, width=2)
            elif kind == "potion":
                circle(d, (cx, cy + 2), 4, fill=a)
                d.rectangle([cx - 1, cy - 5, cx + 1, cy - 2], fill=INK)
            elif kind == "gem":
                d.polygon([(cx, cy - 5), (cx + 5, cy), (cx, cy + 5), (cx - 5, cy)], fill=GROUPS["ai"])
            elif kind == "coin":
                circle(d, (cx, cy), 4, fill=(220, 180, 60))
    d.rectangle([34 + s - 1, 32 - 1, 34 + 2 * s - 2, 32 + s - 2], outline=a, width=2)


def anti_gravity(d, a):
    d.line([(26, 100), (134, 100)], fill=INK, width=2)
    for x in range(30, 134, 10):
        d.line([(x, 100), (x - 4, 106)], fill=DIM)
    d.ellipse([62, 94, 98, 100], fill=GRID2)
    person(d, 80, 58, INK, 1.0)
    for x in (52, 108):
        arrow_up(d, x, 88, 30, a)
    for x in (66, 94):
        arrow_up(d, x, 92, 14, a, 1)


# nombre de archivo, grupo, función
COVERS = [
    ("ToolsSpawning", "editor", spawning),
    ("ToolsGoogleAccounts", "online", google_accounts),
    ("ToolsCombat", "gameplay", combat),
    ("ToolsPerception", "ai", perception),
    ("ToolsQuests", "gameplay", quests),
    ("ToolsPathfinding", "ai", pathfinding),
    ("ToolsLevelEditor", "editor", level_editor),
    ("ToolsLLM", "ai", llm),
    ("ToolsOcclusion", "editor", occlusion),
    ("ToolsProcedural", "editor", procedural),
    ("ToolsRounds", "gameplay", rounds),
    ("ToolsAchievements", "online", achievements),
    ("ToolsEventUI", "online", event_ui),
    ("ToolsCrafting", "gameplay", crafting),
    ("ToolsInventory", "gameplay", inventory),
    ("ToolsAntiGravity", "gameplay", anti_gravity),
]

if __name__ == "__main__":
    force = "--force" in sys.argv
    os.makedirs(OUT, exist_ok=True)
    for name, group, draw in COVERS:
        path = os.path.join(OUT, name + ".png")
        if os.path.exists(path) and not force:
            print("existe (se conserva):", name)
            continue
        img, d = base(GROUPS[group])
        draw(d, GROUPS[group])
        img.resize((W * SCALE, H * SCALE), Image.NEAREST).save(path, optimize=True)
        print("OK:", path)
