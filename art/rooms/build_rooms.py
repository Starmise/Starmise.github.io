"""
Salas del portafolio (Fase 4).

Genera desde cero, con geometría low-poly y texturas procedurales de 64×64, las siete salas
del juego siguiendo la convención de nombres de PLAN.md §6.2, y las exporta como GLB:

    hall         Hall principal: vitrina con los 4 destacados, diario (bio), TV con el DemoReel
    unreal-wing  Ala Unreal: galería de cuadros
    unity-wing   Ala Unity: estudio con computadoras CRT
    lab          Laboratorio: estaciones de trabajo, servidores y un planetario
    game-room    Sala de juegos: máquinas arcade
    save-room    Sala de guardado: máquina de escribir (contacto) y libreta (curiosidades)
    workshop     Taller: herramientas modulares (cofres de herramientas con tablero perforado)

Cada proyecto es un objeto INT_<id> (cuadro, monitor, máquina arcade, cofre, pedestal…) con un hijo
de material MAT_Cover, que el juego sustituye por la portada del proyecto en baja resolución.

Cómo usarlo
-----------
- Desde Blender: pestaña *Scripting* → abrir este archivo → *Run Script* (genera todas).
- Sin interfaz:   blender -b -P art/rooms/build_rooms.py                  (todas)
                  blender -b -P art/rooms/build_rooms.py -- hall lab      (solo esas)
- Con Python:     python art/rooms/build_rooms.py hall                    (con `pip install bpy`)

Resultado:
- art/rooms/<sala>.blend               fuentes editables (no se publican)
- public/models/rooms/<sala>.glb       lo que carga el juego (rutas en src/data/rooms.json)

Si editas una sala a mano en su .blend, exporta tú el GLB (File > Export > glTF 2.0, formato
GLB, +Y Up, Cameras y Punctual Lights activados, Lighting Mode = Raw, Apply Modifiers) a la
misma ruta y NO vuelvas a generar esa sala con este script, porque la reconstruye desde cero.

Convención (PLAN.md §6.2)
-------------------------
COL_*            colisión (invisible en el juego)
CAM_<n>          cámara fija
TRG_CAM_<n>[_x]  volumen(es) que activan CAM_<n> (solapar ~0.4 m con los vecinos)
INT_<id>         objeto examinable: proyecto de projects.json o documento del perfil
                 (about, contact, trivia, demoreel). Un hijo con MAT_Cover recibe la portada.
DOOR_<roomId>    puerta hacia otra sala (rooms.json)
SPAWN_<roomId>   punto de aparición al llegar desde esa sala; SPAWN_default para el inicio
Las luces puntuales se exportan tal cual (modo RAW: la potencia en W = intensidad en Three.js).
Coordenadas de Blender: Z arriba, X este, Y norte, 1 unidad = 1 m.
"""

import math
import os
import sys
import zlib

import bpy
import bmesh
import numpy as np
from mathutils import Vector

# --------------------------------------------------------------------------------------
# Rutas
# --------------------------------------------------------------------------------------


def repo_root():
    here = None
    if "__file__" in globals() and os.path.isfile(__file__):
        here = os.path.dirname(os.path.abspath(__file__))
    elif bpy.data.filepath:
        here = os.path.dirname(bpy.data.filepath)
    elif bpy.context.space_data and getattr(bpy.context.space_data, "text", None):
        path = bpy.context.space_data.text.filepath
        here = os.path.dirname(bpy.path.abspath(path)) if path else None
    if here is None:
        sys.exit("Guarda el script en art/rooms/ o ejecútalo con blender -b -P")
    return os.path.normpath(os.path.join(here, "..", ".."))


ROOT = repo_root()

# --------------------------------------------------------------------------------------
# Escena limpia (una por sala)
# --------------------------------------------------------------------------------------

scene = None
COLLECTIONS = {}
MATS = {}


def new_scene():
    global scene
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.preferences.filepaths.save_version = 0  # sin copias .blend1
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.render.resolution_x = 320
    scene.render.resolution_y = 240
    COLLECTIONS.clear()
    MATS.clear()


def collection(name):
    if name not in COLLECTIONS:
        col = bpy.data.collections.new(name)
        scene.collection.children.link(col)
        COLLECTIONS[name] = col
    return COLLECTIONS[name]


# --------------------------------------------------------------------------------------
# Texturas procedurales (64×64, color de 15 bits, filtrado Closest)
#
# Cada función recibe un generador aleatorio con semilla fija (el nombre de la textura),
# así que volver a correr el script produce exactamente las mismas imágenes.
# --------------------------------------------------------------------------------------

S = 64
YY, XX = np.mgrid[0:S, 0:S]


def fill(rgb):
    return np.broadcast_to(np.array(rgb, dtype=float), (S, S, 3)).copy()


def grain(rng, amount):
    return (rng.random((S, S, 1)) - 0.5) * amount


def veins(rng, strength=0.12):
    """Vetas de mármol: líneas onduladas diagonales."""
    phase = rng.random() * 6
    v = np.sin((XX + YY * 0.6) * 0.21 + np.sin(YY * 0.17 + phase) * 2.5 + np.sin(XX * 0.09) * 1.5)
    return (np.abs(v) < 0.08)[..., None] * strength


def t_marble_checker(rng):
    tile = ((XX // 32) + (YY // 32)) % 2
    rgb = np.where(tile[..., None], fill([0.62, 0.58, 0.49]), fill([0.11, 0.10, 0.11]))
    rgb += grain(rng, 0.05)
    rgb += np.where(tile[..., None], -1, 1) * veins(rng, 0.10)
    rgb[(XX % 32 == 0) | (YY % 32 == 0)] = [0.30, 0.28, 0.24]
    return rgb


def t_marble(rng):
    return fill([0.60, 0.58, 0.53]) + grain(rng, 0.05) - veins(rng, 0.18)


def t_damask(rng):
    # Papel tapiz rojo oscuro con rombos y puntos dorados.
    d = (np.abs((XX % 16) - 8) + np.abs((YY % 24) - 12) * 0.66)
    rgb = fill([0.26, 0.05, 0.05]) + (d < 5)[..., None] * np.array([0.08, 0.03, 0.02])
    rgb[(np.abs(d - 6) < 0.6)] = [0.40, 0.25, 0.10]
    rgb += grain(rng, 0.04)
    damp = np.clip(1.0 - (YY / S) * 1.8, 0, 1) * rng.random((S, S)) * 0.06
    return rgb - damp[..., None]


def t_wainscot(rng, base=(0.20, 0.11, 0.06)):
    rgb = fill(base) + grain(rng, 0.04)
    rgb += np.sin(XX * 0.9 + rng.random(S)[None, :] * 3)[..., None] * 0.015
    rgb[(XX % 32) < 2] = np.array(base) * 0.45
    panel = ((XX % 32) > 5) & ((XX % 32) < 28) & (YY > 14) & (YY < 58)
    rgb[panel] -= 0.03
    rgb[panel & (((XX % 32) == 6) | ((XX % 32) == 27) | (YY == 15) | (YY == 57))] = np.array(base) * 1.5
    rgb[YY < 5] = np.array(base) * 1.4
    rgb[YY == 5] = np.array(base) * 0.4
    return rgb


def t_wainscot_dark(rng):
    return t_wainscot(rng, (0.13, 0.07, 0.04))


def t_wood(rng):
    rings = np.sin(YY * 0.55 + np.sin(XX * 0.15) * 2.0) * 0.03
    rgb = fill([0.20, 0.11, 0.06]) + rings[..., None] + grain(rng, 0.04)
    rgb[(YY % 21) == 0] = [0.08, 0.04, 0.02]
    return rgb


def t_wood_dark(rng):
    return t_wood(rng) * 0.65


def t_parquet(rng):
    # Tablas en espiga: bloques de 16×8 alternando dirección.
    block = ((XX // 16) + (YY // 16)) % 2
    lines = np.where(block, (YY % 8) == 0, (XX % 8) == 0)
    tone = rng.random((S // 8, S // 8)).repeat(8, 0).repeat(8, 1)[..., None] * 0.05
    rgb = fill([0.27, 0.15, 0.07]) + tone + grain(rng, 0.03)
    rgb[lines | (XX % 16 == 0) | (YY % 16 == 0)] = [0.10, 0.05, 0.02]
    return rgb


def t_ceiling(rng):
    rgb = fill([0.16, 0.15, 0.14]) + grain(rng, 0.05)
    rgb[(XX % 32 == 0) | (YY % 32 == 0)] = [0.09, 0.09, 0.08]
    rgb[(XX % 32 == 1) | (YY % 32 == 1)] = [0.21, 0.20, 0.18]
    return rgb


def t_coffer(rng):
    # Techo artesonado: casetones hundidos con moldura clara.
    m = np.minimum(np.minimum(XX % 32, 31 - XX % 32), np.minimum(YY % 32, 31 - YY % 32))
    rgb = fill([0.10, 0.07, 0.05]) + grain(rng, 0.03)
    rgb[m < 4] = [0.24, 0.16, 0.09]
    rgb[m == 4] = [0.06, 0.04, 0.03]
    return rgb


def t_carpet_red(rng):
    # Alfombra de pasillo: roja con cenefa dorada en los bordes (u = ancho).
    rgb = fill([0.32, 0.04, 0.05]) + grain(rng, 0.05)
    rgb[(XX < 5) | (XX > S - 6)] = [0.36, 0.26, 0.09]
    rgb[(XX == 6) | (XX == S - 7)] = [0.40, 0.30, 0.12]
    motif = (np.abs((XX - 32)) + np.abs((YY % 32) - 16)) < 7
    rgb[motif & ((XX + YY) % 3 == 0)] = [0.42, 0.10, 0.08]
    return rgb


def t_rug(rng):
    # Alfombra persa sencilla: cenefa, campo y medallón central (u, v de 0 a 1).
    m = np.minimum(np.minimum(XX, S - 1 - XX), np.minimum(YY, S - 1 - YY))
    rgb = fill([0.24, 0.07, 0.07]) + grain(rng, 0.05)
    rgb[m < 6] = [0.10, 0.12, 0.22]
    rgb[(m == 2) | (m == 6)] = [0.50, 0.40, 0.20]
    d = np.abs(XX - 31.5) + np.abs(YY - 31.5)
    rgb[d < 14] = [0.12, 0.14, 0.24]
    rgb[(np.abs(d - 14) < 1) | (d < 4)] = [0.50, 0.40, 0.20]
    rgb[(m > 6) & ((XX + YY) % 8 == 0) & (d > 16)] = [0.34, 0.12, 0.09]
    return rgb


def t_gallery_wall(rng):
    rgb = fill([0.13, 0.16, 0.21]) + grain(rng, 0.03)
    rgb[(XX % 8) == 0] = [0.17, 0.20, 0.26]
    damp = np.clip(1.0 - (YY / S) * 1.6, 0, 1) * rng.random((S, S)) * 0.05
    return rgb - damp[..., None]


def t_green_wall(rng):
    stripe = ((XX // 8) % 2).astype(float)
    rgb = fill([0.20, 0.25, 0.18]) + stripe[..., None] * np.array([0.04, 0.05, 0.03])
    rgb += grain(rng, 0.06)
    rgb[(XX % 16 == 12) & (YY % 16 == 8)] = [0.36, 0.33, 0.20]
    damp = np.clip(1.0 - (YY / S) * 1.6, 0, 1) * rng.random((S, S)) * 0.08
    return rgb - damp[..., None]


def t_purple_wall(rng):
    rgb = fill([0.12, 0.06, 0.16]) + grain(rng, 0.03)
    rgb[(XX % 16) < 2] = [0.20, 0.08, 0.24]
    rgb[((XX + YY * 2) % 32) == 0] = [0.08, 0.20, 0.26]
    return rgb


def t_carpet_green(rng):
    rgb = fill([0.10, 0.16, 0.11]) + grain(rng, 0.05)
    rgb[((XX % 16) == 8) & ((YY % 16) == 8)] = [0.30, 0.24, 0.12]
    rgb[((XX + YY) % 16 == 0) & (rng.random((S, S)) > 0.4)] = [0.07, 0.11, 0.08]
    return rgb


def t_arcade_carpet(rng):
    # Alfombra de arcade: fondo casi negro con figuras de colores.
    rgb = fill([0.04, 0.03, 0.08]) + grain(rng, 0.03)
    colors = [[0.38, 0.06, 0.30], [0.06, 0.30, 0.38], [0.42, 0.36, 0.06], [0.16, 0.36, 0.10]]
    for _ in range(18):
        cx, cy = rng.integers(0, S, 2)
        c = colors[rng.integers(0, len(colors))]
        kind = rng.integers(0, 3)
        dx = (XX - cx + S // 2) % S - S // 2
        dy = (YY - cy + S // 2) % S - S // 2
        if kind == 0:
            mask = np.abs(np.hypot(dx, dy) - 3) < 0.8
        elif kind == 1:
            mask = (np.abs(dx) < 4) & (np.abs(dy - (dx // 2) % 2) < 1)
        else:
            mask = (np.abs(dx) + np.abs(dy)) == 3
        rgb[mask] = c
    return rgb


def t_tile_white(rng):
    rgb = fill([0.50, 0.56, 0.52]) + grain(rng, 0.04)
    tone = rng.random((2, 2)).repeat(32, 0).repeat(32, 1)[..., None] * 0.05
    rgb += tone
    rgb[(XX % 32 < 2) | (YY % 32 < 2)] = [0.30, 0.33, 0.31]
    dirt = np.clip(1.0 - (YY / S) * 1.5, 0, 1) * rng.random((S, S)) * 0.10
    return rgb - dirt[..., None]


def t_tile_dark(rng):
    return t_tile_white(rng) * np.array([0.45, 0.55, 0.52])


def t_metal_floor(rng):
    rgb = fill([0.17, 0.18, 0.19]) + grain(rng, 0.04)
    a = ((XX + YY) % 8 < 2) & (XX % 8 < 5) & (YY % 16 < 8)
    b = ((XX - YY) % 8 < 2) & (XX % 8 < 5) & (YY % 16 >= 8)
    rgb[a | b] = [0.26, 0.27, 0.28]
    rgb[(XX % 32 == 0) | (YY % 32 == 0)] = [0.07, 0.07, 0.08]
    return rgb


def t_metal(rng):
    rgb = fill([0.13, 0.13, 0.14]) + grain(rng, 0.05)
    rgb[(YY % 16) == 0] = [0.20, 0.20, 0.21]
    return rgb


def t_steel(rng):
    rgb = fill([0.33, 0.34, 0.36]) + grain(rng, 0.05)
    rgb += np.sin(YY * 1.3)[..., None] * 0.015
    return rgb


def t_brass(rng):
    return fill([0.46, 0.34, 0.12]) + grain(rng, 0.08)


def t_gold_frame(rng):
    m = np.minimum(np.minimum(XX, S - 1 - XX), np.minimum(YY, S - 1 - YY)) % 8
    rgb = fill([0.42, 0.30, 0.10]) + grain(rng, 0.06)
    rgb[m < 2] = [0.58, 0.45, 0.18]
    rgb[m == 5] = [0.22, 0.15, 0.05]
    return rgb


def t_crate(rng):
    rgb = fill([0.33, 0.24, 0.13]) + grain(rng, 0.06)
    rgb[(YY % 16) == 0] = [0.15, 0.10, 0.05]
    border = (XX < 5) | (XX > S - 6) | (YY < 5) | (YY > S - 6)
    rgb[border] = [0.25, 0.17, 0.09]
    rgb[(np.abs(XX - YY) < 3) & ~border] = [0.27, 0.19, 0.10]
    return rgb


def t_door(rng):
    rgb = fill([0.17, 0.08, 0.05]) + grain(rng, 0.04)
    for (x0, x1, y0, y1) in [(8, 28, 6, 28), (36, 56, 6, 28), (8, 28, 36, 58), (36, 56, 36, 58)]:
        rgb[y0:y1, x0:x1] = [0.13, 0.06, 0.04]
        rgb[y0:y1, x0] = rgb[y0, x0:x1] = [0.24, 0.12, 0.07]
    return rgb


def t_book(rng):
    rgb = fill([0.30, 0.07, 0.06]) + grain(rng, 0.05)
    rgb[(XX < 4) | (XX > S - 5) | (YY < 4) | (YY > S - 5)] = [0.45, 0.36, 0.16]
    return rgb


def t_paper(rng):
    rgb = fill([0.80, 0.76, 0.64]) + grain(rng, 0.05)
    lines = ((YY % 6) == 0) & (XX > 6) & (XX < S - 6) & (rng.random((S, S)) > 0.25)
    rgb[lines] = [0.30, 0.28, 0.25]
    return rgb


def t_bookshelf(rng):
    # Dos baldas de lomos de libros de colores (v: 0 abajo, 1 arriba).
    rgb = fill([0.12, 0.07, 0.04])
    palette = np.array([[0.35, 0.08, 0.06], [0.10, 0.16, 0.30], [0.12, 0.25, 0.12], [0.40, 0.32, 0.14],
                        [0.25, 0.10, 0.22], [0.45, 0.42, 0.36], [0.08, 0.08, 0.09]])
    for y0 in (3, 35):
        x = 1
        while x < S - 2:
            w = int(rng.integers(2, 5))
            h = int(rng.integers(20, 28))
            c = palette[rng.integers(0, len(palette))] * (0.8 + rng.random() * 0.4)
            rgb[y0 + (28 - h):y0 + 28, x:x + w] = c
            rgb[y0 + (28 - h) + 4, x:x + w] = c * 1.6
            x += w + int(rng.random() > 0.8)
        rgb[y0 + 28:y0 + 32, :] = [0.22, 0.13, 0.07]
    return np.flipud(rgb)


def t_plastic(rng):
    return fill([0.55, 0.52, 0.44]) + grain(rng, 0.04)


def t_plastic_dark(rng):
    return fill([0.12, 0.12, 0.13]) + grain(rng, 0.03)


def t_screen_off(rng):
    rgb = fill([0.03, 0.06, 0.05]) + grain(rng, 0.02)
    rgb[(YY % 3) == 0] *= 0.6
    return rgb


def t_server(rng):
    # Rack: bandejas horizontales con LEDs (la emisión hace brillar solo los LEDs claros).
    rgb = fill([0.03, 0.03, 0.035])
    rgb[(YY % 8) == 0] = [0.08, 0.08, 0.09]
    leds = ((YY % 8) == 4) & ((XX % 6) == 2) & (rng.random((S, S)) > 0.35)
    colors = np.array([[0.1, 0.9, 0.2], [0.9, 0.6, 0.1], [0.1, 0.5, 0.9]])
    idx = rng.integers(0, 3, (S, S))
    rgb[leds] = colors[idx[leds]]
    rgb[((YY % 8) == 3) & (XX > 40) & (XX < 60)] = [0.06, 0.06, 0.07]
    return rgb


def t_chalkboard(rng):
    rgb = fill([0.07, 0.14, 0.10]) + grain(rng, 0.03)
    # Garabatos de tiza: ecuaciones y diagramas ilegibles.
    for row in range(8, 56, 9):
        x = 6 + int(rng.integers(0, 6))
        while x < 58:
            w = int(rng.integers(2, 7))
            amp = rng.integers(1, 3)
            for i in range(w):
                y = row + int(amp * math.sin((x + i) * 1.3))
                if 0 <= y < S and x + i < S:
                    rgb[y, x + i] = [0.62, 0.66, 0.60]
            x += w + int(rng.integers(1, 4))
    rr = np.hypot(XX - 48, YY - 46)
    rgb[np.abs(rr - 8) < 0.6] = [0.62, 0.66, 0.60]
    rgb[(XX < 2) | (XX > S - 3) | (YY < 2) | (YY > S - 3)] = [0.24, 0.15, 0.08]
    return rgb


def t_felt(rng):
    return fill([0.05, 0.22, 0.12]) + grain(rng, 0.04)


def t_velvet(rng):
    return fill([0.20, 0.04, 0.06]) + grain(rng, 0.05) + (np.sin(XX * 0.8)[..., None] * 0.01)


def t_plant(rng):
    rgb = fill([0.06, 0.14, 0.05]) + grain(rng, 0.10)
    leaves = rng.random((S, S)) > 0.7
    rgb[leaves] = [0.12, 0.26, 0.08]
    return rgb


def t_pot(rng):
    rgb = fill([0.30, 0.13, 0.07]) + grain(rng, 0.05)
    rgb[(YY % 16) < 2] = [0.20, 0.08, 0.04]
    return rgb


def t_cabinet(rng, color):
    # Lateral de máquina arcade: panel de color con moldura negra y un rayo más claro.
    rgb = fill(color) + grain(rng, 0.04)
    rgb[(np.abs(XX - YY * 0.5 - 16) < 3)] = np.array(color) * 1.6
    m = np.minimum(np.minimum(XX, S - 1 - XX), np.minimum(YY, S - 1 - YY))
    rgb[m < 3] = [0.03, 0.03, 0.04]
    return rgb


def t_marquee(rng, color):
    # Marquesina iluminada: degradado con estrellas (sin texto).
    t = (YY / S)[..., None]
    rgb = np.array(color) * (0.5 + 0.5 * t) + grain(rng, 0.05)
    stars = rng.random((S, S)) > 0.985
    rgb[stars] = [1, 1, 1]
    rgb[(YY < 3) | (YY > S - 4)] = [0.05, 0.05, 0.05]
    return rgb


def t_neon(rng):
    return fill([0.95, 0.35, 0.80])


def t_lamp(rng):
    return fill([0.95, 0.80, 0.50]) + grain(rng, 0.05)


def t_fluor(rng):
    return fill([0.80, 0.92, 0.95])


def t_window(rng):
    # Vitral con luz de luna: cuadrícula de emplomado sobre azul.
    rgb = fill([0.16, 0.24, 0.40]) + grain(rng, 0.10)
    rgb[(XX % 16 < 2) | (YY % 21 < 2)] = [0.02, 0.02, 0.03]
    rgb[((XX // 16 + YY // 21) % 3 == 0) & ~((XX % 16 < 2) | (YY % 21 < 2))] += [0.10, 0.04, 0.12]
    return rgb


def t_cover_placeholder(rng):
    return fill([0.1, 0.1, 0.1]) + grain(rng, 0.2)


def t_tv_body(rng):
    rgb = fill([0.10, 0.08, 0.06]) + grain(rng, 0.03)
    rgb += np.sin(XX * 0.7)[..., None] * 0.01  # chapa de madera falsa
    return rgb


# ---------- Taller ----------


def t_concrete(rng):
    # Piso de concreto con juntas, manchas de aceite y algo de polvo.
    rgb = fill([0.26, 0.25, 0.23]) + grain(rng, 0.06)
    blot = rng.random((S // 8, S // 8)).repeat(8, 0).repeat(8, 1)[..., None] * 0.04
    rgb += blot
    for _ in range(3):
        cx, cy, r = rng.integers(0, S), rng.integers(0, S), rng.integers(4, 9)
        d = np.hypot((XX - cx + S // 2) % S - S // 2, (YY - cy + S // 2) % S - S // 2)
        rgb[d < r] *= 0.78
    rgb[(XX % 32 == 0) | (YY % 32 == 0)] = [0.15, 0.15, 0.14]
    return rgb


def t_brick(rng):
    # Ladrillo rojo con juntas de mortero; cada hilada desplazada media pieza.
    row = YY // 8
    xs = (XX + (row % 2) * 8) % 16
    rgb = fill([0.30, 0.12, 0.08]) + grain(rng, 0.05)
    tone = rng.random((S // 8, S // 16 + 1))
    idx = ((XX + (row % 2) * 8) // 16) % tone.shape[1]
    rgb += (tone[row, idx][..., None] - 0.5) * 0.08
    rgb[(YY % 8 == 0) | (xs == 0)] = [0.24, 0.22, 0.19]
    damp = np.clip(1.0 - (YY / S) * 1.6, 0, 1) * rng.random((S, S)) * 0.06
    return rgb - damp[..., None]


def t_paint_band(rng):
    # Zócalo de pintura industrial verde, con raspones y una línea superior.
    rgb = fill([0.14, 0.22, 0.17]) + grain(rng, 0.03)
    scuff = (rng.random((S, S)) > 0.985) | ((YY > 50) & (rng.random((S, S)) > 0.9))
    rgb[scuff] = [0.30, 0.29, 0.26]
    rgb[YY < 3] = [0.40, 0.32, 0.10]
    return rgb


def t_pegboard(rng):
    # Tablero perforado con siluetas pintadas de herramientas a los lados (la portada va al centro).
    rgb = fill([0.44, 0.33, 0.20]) + grain(rng, 0.03)
    shadow = np.zeros((S, S), dtype=bool)
    shadow |= (np.abs(XX - 6) < 1.5) & (YY > 12) & (YY < 46)          # destornillador
    shadow |= (np.abs(XX - 6) < 3) & (YY > 40) & (YY < 52)
    shadow |= (np.abs(XX - 57) < 1.5) & (YY > 14) & (YY < 50)         # martillo
    shadow |= (np.abs(XX - 57) < 6) & (YY > 10) & (YY < 16)
    shadow |= (np.abs(XX - 12) < 2) & (YY > 52) & (YY < 60) | (np.abs(XX - 52) < 2) & (YY > 54) & (YY < 60)
    rgb[shadow] = [0.20, 0.13, 0.07]
    holes = ((XX % 4) == 2) & ((YY % 4) == 2)
    rgb[holes] = [0.12, 0.08, 0.05]
    m = np.minimum(np.minimum(XX, S - 1 - XX), np.minimum(YY, S - 1 - YY))
    rgb[m < 2] = [0.22, 0.14, 0.08]
    return rgb


def t_chest_paint(rng, color):
    rgb = fill(color) + grain(rng, 0.035)
    rgb[(rng.random((S, S)) > 0.992)] = [0.32, 0.32, 0.33]  # pintura saltada
    return rgb


def t_drawers(rng, color):
    # Frente de un cofre de herramientas: cajones con jaladera metálica.
    c = np.array(color)
    rgb = fill(color) + grain(rng, 0.03)
    edges = [0, 9, 18, 27, 38, 51, 64]  # cajones más altos abajo
    for y0, y1 in zip(edges[:-1], edges[1:]):
        rgb[y0:y0 + 1, :] = c * 0.35
        rgb[y0 + 1:y0 + 2, :] = c * 1.35
        mid = (y0 + y1) // 2
        rgb[mid - 1:mid + 1, 14:50] = [0.62, 0.62, 0.60]
        rgb[mid + 1, 14:50] = [0.18, 0.18, 0.19]
    rgb[:, :2] = rgb[:, -2:] = c * 0.5
    return rgb


def t_hazard(rng):
    # Franjas de seguridad amarillas y negras (desgastadas).
    stripe = ((XX + YY) // 8) % 2
    rgb = np.where(stripe[..., None], fill([0.55, 0.44, 0.06]), fill([0.06, 0.06, 0.06]))
    rgb[rng.random((S, S)) > 0.93] = [0.22, 0.21, 0.19]
    return rgb


def t_locker(rng):
    # Casillero metálico gris azulado con rejillas de ventilación arriba.
    rgb = fill([0.24, 0.29, 0.32]) + grain(rng, 0.03)
    vents = (YY > 6) & (YY < 18) & (YY % 3 == 0) & (XX > 12) & (XX < 52)
    rgb[vents] = [0.08, 0.09, 0.10]
    rgb[(XX < 2) | (XX > S - 3)] = [0.14, 0.16, 0.18]
    rgb[30:36, 48:52] = [0.55, 0.55, 0.52]  # cerradura
    return rgb


CHEST_COLORS = {
    "Red": [0.42, 0.07, 0.07],
    "Blue": [0.08, 0.17, 0.40],
    "Steel": [0.30, 0.32, 0.34],
    "Green": [0.09, 0.27, 0.13],
}


# Registro: nombre del material → (función de textura, emisión, color multiplicador)
TEXTURES = {
    "Floor_Marble": (t_marble_checker, 0, None),
    "Marble": (t_marble, 0, None),
    "Damask": (t_damask, 0, None),
    "Wainscot": (t_wainscot, 0, None),
    "Wainscot_Dark": (t_wainscot_dark, 0, None),
    "Wood": (t_wood, 0, None),
    "Wood_Dark": (t_wood_dark, 0, None),
    "Parquet": (t_parquet, 0, None),
    "Ceiling": (t_ceiling, 0, None),
    "Coffer": (t_coffer, 0, None),
    "Carpet_Red": (t_carpet_red, 0, None),
    "Rug": (t_rug, 0, None),
    "Gallery_Wall": (t_gallery_wall, 0, None),
    "Green_Wall": (t_green_wall, 0, None),
    "Purple_Wall": (t_purple_wall, 0, None),
    "Carpet_Green": (t_carpet_green, 0, None),
    "Arcade_Carpet": (t_arcade_carpet, 0, None),
    "Tile": (t_tile_white, 0, None),
    "Tile_Dark": (t_tile_dark, 0, None),
    "Metal_Floor": (t_metal_floor, 0, None),
    "Metal": (t_metal, 0, None),
    "Steel": (t_steel, 0, None),
    "Brass": (t_brass, 0, None),
    "Gold_Frame": (t_gold_frame, 0, None),
    "Crate": (t_crate, 0, None),
    "Door": (t_door, 0, None),
    "Book": (t_book, 0, None),
    "Paper": (t_paper, 0.3, None),
    "Bookshelf": (t_bookshelf, 0, None),
    "Plastic": (t_plastic, 0, None),
    "Plastic_Dark": (t_plastic_dark, 0, None),
    "Screen_Off": (t_screen_off, 0.4, None),
    "Server": (t_server, 1.0, None),
    "Chalkboard": (t_chalkboard, 0, None),
    "Felt": (t_felt, 0, None),
    "Velvet": (t_velvet, 0, None),
    "Plant": (t_plant, 0, None),
    "Pot": (t_pot, 0, None),
    "Cabinet_Red": (lambda r: t_cabinet(r, [0.36, 0.06, 0.08]), 0, None),
    "Cabinet_Blue": (lambda r: t_cabinet(r, [0.07, 0.16, 0.38]), 0, None),
    "Cabinet_Gold": (lambda r: t_cabinet(r, [0.40, 0.30, 0.06]), 0, None),
    "Marquee_Pink": (lambda r: t_marquee(r, [0.85, 0.20, 0.60]), 1.2, None),
    "Marquee_Cyan": (lambda r: t_marquee(r, [0.15, 0.70, 0.85]), 1.2, None),
    "Marquee_Gold": (lambda r: t_marquee(r, [0.90, 0.65, 0.15]), 1.2, None),
    "Neon": (t_neon, 2.0, None),
    "Lamp": (t_lamp, 1.5, None),
    "Fluorescent": (t_fluor, 1.5, None),
    "Window": (t_window, 0.8, None),
    "TV_Body": (t_tv_body, 0, None),
    "Concrete": (t_concrete, 0, None),
    "Brick": (t_brick, 0, None),
    "Paint_Band": (t_paint_band, 0, None),
    "Pegboard": (t_pegboard, 0, None),
    "Hazard": (t_hazard, 0, None),
    "Locker": (t_locker, 0, None),
    **{f"Chest_{k}": ((lambda c: lambda r: t_chest_paint(r, c))(c), 0, None) for k, c in CHEST_COLORS.items()},
    **{f"Drawers_{k}": ((lambda c: lambda r: t_drawers(r, c))(c), 0, None) for k, c in CHEST_COLORS.items()},
    # El juego sustituye esta textura por la portada del proyecto (projects.json).
    "Cover": (t_cover_placeholder, 0.9, None),
}


def to_image(name, rgb):
    """rgb: array (S, S, 3) en 0..1, fila 0 = arriba de la imagen."""
    img = bpy.data.images.new(name, S, S, alpha=False)
    rgba = np.ones((S, S, 4), dtype=np.float32)
    # Cuantizar a 5 bits por canal, como las texturas de 15 bits de la época.
    rgba[..., :3] = np.round(np.clip(rgb, 0, 1) * 31) / 31
    img.pixels.foreach_set(np.flipud(rgba).ravel())  # Blender guarda de abajo hacia arriba
    img.pack()
    return img


def M(key):
    """Material MAT_<key>, creado la primera vez que una sala lo usa."""
    if key in MATS:
        return MATS[key]
    fn, emission, color = TEXTURES[key]
    rng = np.random.default_rng(zlib.crc32(key.encode()))
    img = to_image("T_" + key, fn(rng))
    mat = bpy.data.materials.new("MAT_" + key)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = img
    tex.interpolation = "Closest"
    nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 1.0
    bsdf.inputs["Metallic"].default_value = 0.0
    if color:
        bsdf.inputs["Base Color"].default_value = (*color, 1)
    if emission:
        nt.links.new(tex.outputs["Color"], bsdf.inputs["Emission Color"])
        bsdf.inputs["Emission Strength"].default_value = emission
    MATS[key] = mat
    return mat


# --------------------------------------------------------------------------------------
# Geometría básica
# --------------------------------------------------------------------------------------

# Hacia dónde mira el frente de un objeto (su −Y local) → rotación en Z.
FACE = {"S": 0, "E": 90, "N": 180, "W": -90}
# Hacia dónde mira un SPAWN (flecha) → rotación en Z.
LOOK = {"N": 0, "W": 90, "S": 180, "E": -90}


def new_object(name, bm, col="Props", mats=()):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for m in mats:
        me.materials.append(m)
    obj = bpy.data.objects.new(name, me)
    collection(col).objects.link(obj)
    return obj


def add_quad(bm, uv_layer, corners, uvs, mat_index=0):
    verts = [bm.verts.new(c) for c in corners]
    face = bm.faces.new(verts)
    face.material_index = mat_index
    for loop, uv in zip(face.loops, uvs):
        loop[uv_layer].uv = uv
    return face


def gridded_quad(bm, uv_layer, origin, u_axis, v_axis, u_len, v_len, step, uv_scale, mat_index=0,
                 uv_offset=(0.0, 0.0)):
    """Quad subdividido en celdas de `step` m (evita la deformación afín exagerada)."""
    o = Vector(origin)
    ua = Vector(u_axis).normalized()
    va = Vector(v_axis).normalized()
    nu = max(1, round(u_len / step))
    nv = max(1, round(v_len / step))
    du, dv = u_len / nu, v_len / nv
    for i in range(nu):
        for j in range(nv):
            u0, u1 = i * du, (i + 1) * du
            v0, v1 = j * dv, (j + 1) * dv
            corners = [o + ua * u0 + va * v0, o + ua * u1 + va * v0,
                       o + ua * u1 + va * v1, o + ua * u0 + va * v1]
            uvs = [((u + uv_offset[0]) / uv_scale, (v + uv_offset[1]) / uv_scale)
                   for (u, v) in [(u0, v0), (u1, v0), (u1, v1), (u0, v1)]]
            add_quad(bm, uv_layer, corners, uvs, mat_index)


def box(name, center, size, mat=None, col="Props", uv_scale=1.0, face=None, parent=None):
    """Caja con UVs proyectadas por cara (texel ~constante). `face`: hacia dónde mira su −Y."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co = Vector((v.co.x * size[0], v.co.y * size[1], v.co.z * size[2]))
    uv = bm.loops.layers.uv.new("UVMap")
    off = Vector(center) if parent is None else Vector((0, 0, 0))
    for f in bm.faces:
        n = f.normal
        ax = max(range(3), key=lambda k: abs(n[k]))
        for loop in f.loops:
            co = loop.vert.co + off
            if ax == 0:
                u, v = co.y * (1 if n.x > 0 else -1), co.z
            elif ax == 1:
                u, v = co.x * (-1 if n.y > 0 else 1), co.z
            else:
                u, v = co.x, co.y
            loop[uv].uv = (u / uv_scale, v / uv_scale)
    obj = new_object(name, bm, col, [mat] if mat else [])
    if parent is not None:
        obj.parent = parent
    obj.location = center
    if face:
        obj.rotation_euler.z = math.radians(FACE[face])
    return obj


def stretched_box(name, center, size, mat, col="Props", face=None, parent=None):
    """Caja cuya textura cubre cada cara una vez (para tableros, pantallas apagadas…)."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    uv = bm.loops.layers.uv.new("UVMap")
    for f in bm.faces:
        n = f.normal
        ax = max(range(3), key=lambda k: abs(n[k]))
        a, b = [k for k in range(3) if k != ax]
        for loop in f.loops:
            co = loop.vert.co
            u = co[a] + 0.5
            v = co[b] + 0.5
            if ax == 1:  # caras ±Y: u = X (invertida en +Y), v = Z
                u = (-co.x if n.y > 0 else co.x) + 0.5
            if ax == 0:
                u = (co.y if n.x > 0 else -co.y) + 0.5
            loop[uv].uv = (u, v)
    for v in bm.verts:
        v.co = Vector((v.co.x * size[0], v.co.y * size[1], v.co.z * size[2]))
    obj = new_object(name, bm, col, [mat])
    if parent is not None:
        obj.parent = parent
    obj.location = center
    if face:
        obj.rotation_euler.z = math.radians(FACE[face])
    return obj


def cylinder(name, center, radius, depth, mat, segments=8, radius_top=None, col="Props", parent=None):
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new("UVMap")
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=segments, radius1=radius,
                          radius2=radius if radius_top is None else radius_top, depth=depth, calc_uvs=True)
    obj = new_object(name, bm, col, [mat])
    if parent is not None:
        obj.parent = parent
    obj.location = center
    return obj


def sphere(name, center, radius, mat, segments=8, rings=6, col="Props", parent=None):
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new("UVMap")
    bmesh.ops.create_uvsphere(bm, u_segments=segments, v_segments=rings, radius=radius, calc_uvs=True)
    obj = new_object(name, bm, col, [mat])
    if parent is not None:
        obj.parent = parent
    obj.location = center
    return obj


def plane(name, center, size, mat, col="Props", parent=None, subdiv=1, normal="-Y"):
    """Rectángulo (ancho X, alto Z) que mira a −Y local, con UV de 0 a 1 y subdividido."""
    w, h = size
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new("UVMap")
    for i in range(subdiv):
        for j in range(subdiv):
            u0, u1 = i / subdiv, (i + 1) / subdiv
            v0, v1 = j / subdiv, (j + 1) / subdiv
            corners = [(-w / 2 + w * u0, 0, -h / 2 + h * v0), (-w / 2 + w * u1, 0, -h / 2 + h * v0),
                       (-w / 2 + w * u1, 0, -h / 2 + h * v1), (-w / 2 + w * u0, 0, -h / 2 + h * v1)]
            add_quad(bm, uv, corners, [(u0, v0), (u1, v0), (u1, v1), (u0, v1)])
    obj = new_object(name, bm, col, [mat])
    if parent is not None:
        obj.parent = parent
    obj.location = center
    return obj


def floor_patch(name, x0, y0, x1, y1, mat, z=0.015, uv_scale=None, col="Props"):
    """Rectángulo horizontal (alfombras). Sin uv_scale, la textura cubre el rectángulo una vez."""
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new("UVMap")
    corners = [(x0, y0, z), (x1, y0, z), (x1, y1, z), (x0, y1, z)]
    if uv_scale:
        gridded_quad(bm, uv, (x0, y0, z), (1, 0, 0), (0, 1, 0), x1 - x0, y1 - y0, 1, uv_scale, 0, (0, y0))
    else:
        nu = max(1, round(x1 - x0))
        nv = max(1, round(y1 - y0))
        for i in range(nu):
            for j in range(nv):
                u0, u1 = i / nu, (i + 1) / nu
                v0, v1 = j / nv, (j + 1) / nv
                cs = [(x0 + (x1 - x0) * u0, y0 + (y1 - y0) * v0, z), (x0 + (x1 - x0) * u1, y0 + (y1 - y0) * v0, z),
                      (x0 + (x1 - x0) * u1, y0 + (y1 - y0) * v1, z), (x0 + (x1 - x0) * u0, y0 + (y1 - y0) * v1, z)]
                add_quad(bm, uv, cs, [(u0, v0), (u1, v0), (u1, v1), (u0, v1)])
    return new_object(name, bm, col, [mat])


def collider(name, center, size, rot_deg=0):
    """Volumen de colisión COL_*: invisible en el juego, alambre en Blender."""
    obj = box(f"COL_{name}", center, size, None, "Collision")
    obj.display_type = "WIRE"
    obj.hide_render = True
    obj.rotation_euler.z = math.radians(rot_deg)
    return obj


def solid(name, center, size, mat, uv_scale=1.0, face=None, pad=0.05):
    """Caja visible + su colisión."""
    obj = box(name, center, size, mat, "Props", uv_scale, face)
    rot = FACE[face] if face else 0
    collider(name, (center[0], center[1], max(size[2], 1.0) / 2), (size[0] + pad, size[1] + pad, max(size[2], 1.0)), rot)
    return obj


# --------------------------------------------------------------------------------------
# Piezas de las salas
# --------------------------------------------------------------------------------------

WAINSCOT_H = 1.0


def rect_room(x0, x1, y0, y1, h, floor, wall, wainscot, ceiling, floor_uv=1.0, ceiling_uv=2.0,
              wainscot_h=WAINSCOT_H):
    """Caja vista desde dentro: piso, techo y muros (zócalo + pared) con normales hacia dentro."""
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new("UVMap")
    gridded_quad(bm, uv, (x0, y0, 0), (1, 0, 0), (0, 1, 0), x1 - x0, y1 - y0, 1, floor_uv, 0, (x0, y0))
    gridded_quad(bm, uv, (x0, y1, h), (1, 0, 0), (0, -1, 0), x1 - x0, y1 - y0, 1, ceiling_uv, 3)
    outline = [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]  # antihorario: el interior queda a la izquierda
    run = 0.0
    for i in range(4):
        a = Vector((*outline[i], 0))
        b = Vector((*outline[(i + 1) % 4], 0))
        d = b - a
        gridded_quad(bm, uv, a, d, (0, 0, 1), d.length, wainscot_h, 1, 1, 2, (run, 0))
        gridded_quad(bm, uv, a + Vector((0, 0, wainscot_h)), d, (0, 0, 1), d.length, h - wainscot_h,
                     1, 1, 1, (run, wainscot_h))
        run += d.length
    obj = new_object("Room_Shell", bm, "Room", [M(floor), M(wall), M(wainscot), M(ceiling)])
    me = obj.data
    bm = bmesh.new()
    bm.from_mesh(me)
    for f in bm.faces:
        p = f.calc_center_median() + f.normal * 0.05
        if not (x0 < p.x < x1 and y0 < p.y < y1 and 0 < p.z < h):
            f.normal_flip()
    bm.to_mesh(me)
    bm.free()

    t = 0.4
    collider("Wall_S", ((x0 + x1) / 2, y0 - t / 2, 1.5), (x1 - x0 + 2 * t, t, 3))
    collider("Wall_N", ((x0 + x1) / 2, y1 + t / 2, 1.5), (x1 - x0 + 2 * t, t, 3))
    collider("Wall_W", (x0 - t / 2, (y0 + y1) / 2, 1.5), (t, y1 - y0, 3))
    collider("Wall_E", (x1 + t / 2, (y0 + y1) / 2, 1.5), (t, y1 - y0, 3))
    return obj


def crown_molding(x0, x1, y0, y1, h, mat="Wood_Dark"):
    """Cornisa en lo alto de los cuatro muros."""
    s = 0.12
    box("Molding_S", ((x0 + x1) / 2, y0 + s / 2, h - s / 2), (x1 - x0, s, s), M(mat), "Props", 0.5)
    box("Molding_N", ((x0 + x1) / 2, y1 - s / 2, h - s / 2), (x1 - x0, s, s), M(mat), "Props", 0.5)
    box("Molding_W", (x0 + s / 2, (y0 + y1) / 2, h - s / 2), (s, y1 - y0 - 2 * s, s), M(mat), "Props", 0.5)
    box("Molding_E", (x1 - s / 2, (y0 + y1) / 2, h - s / 2), (s, y1 - y0 - 2 * s, s), M(mat), "Props", 0.5)


def wall_pos(xy, face, offset):
    """Punto a `offset` m de un muro hacia el interior, según hacia dónde mira el objeto."""
    x, y = xy
    dx, dy = {"S": (0, -1), "N": (0, 1), "E": (1, 0), "W": (-1, 0)}[face]
    return (x + dx * offset, y + dy * offset)


def door(room_id, xy, face):
    """Puerta en un muro: marco + hoja (DOOR_<roomId>). `face`: hacia dónde mira (al interior)."""
    root = box(f"DOOR_{room_id}", (*xy, 1.15), (1.2, 0.08, 2.3), M("Door"), "Doors", uv_scale=2.3, face=face)
    for i, (dx, w, z, h) in enumerate([(-0.66, 0.12, 1.2, 2.4), (0.66, 0.12, 1.2, 2.4), (0, 1.44, 2.42, 0.12)]):
        box(f"DOORFRAME_{room_id}_{i}", (dx, 0, z - 1.15), (w, 0.14, h), M("Wainscot_Dark"), "Doors", 1, parent=root)
    box(f"DOORKNOB_{room_id}", (0.45, -0.06, -0.1), (0.06, 0.06, 0.06), M("Brass"), "Doors", 1, parent=root)
    return root


def spawn(name, xy, look):
    """Empty SPAWN_<name>. `look`: hacia dónde mira el jugador al aparecer (N, S, E, W)."""
    sp = bpy.data.objects.new(f"SPAWN_{name}", None)
    sp.empty_display_type = "SINGLE_ARROW"
    sp.empty_display_size = 0.6
    collection("Spawns").objects.link(sp)
    sp.location = (xy[0], xy[1], 0)
    # La flecha de un Empty apunta a +Z local: tumbarla hacia +Y y girarla alrededor de Z.
    sp.rotation_euler = (math.radians(-90), 0, math.radians(LOOK[look]))
    return sp


def door_with_spawn(room_id, xy, face):
    """Puerta + punto de aparición 0.9 m delante de ella, mirando al interior."""
    door(room_id, xy, face)
    look = {"S": "S", "N": "N", "E": "E", "W": "W"}[face]
    spawn(room_id, wall_pos(xy, face, 0.9), look)


def camera(name, location, target, fov_deg=55):
    cam_data = bpy.data.cameras.new(name)
    cam_data.lens_unit = "FOV"
    cam_data.sensor_fit = "VERTICAL"
    cam_data.angle = math.radians(fov_deg)
    cam_data.clip_start = 0.1
    cam_data.clip_end = 40
    cam = bpy.data.objects.new(name, cam_data)
    collection("Cameras").objects.link(cam)
    cam.location = location
    direction = Vector(target) - Vector(location)
    cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    return cam


def zone(cam_id, x0, x1, y0, y1, suffix=None):
    """Volumen TRG_CAM_<id>[_suffix] (de z=0 a z=2) entre las coordenadas dadas."""
    name = f"TRG_CAM_{cam_id}" + (f"_{suffix}" if suffix else "")
    obj = box(name, ((x0 + x1) / 2, (y0 + y1) / 2, 1), (x1 - x0, y1 - y0, 2), None, "Triggers")
    obj.display_type = "WIRE"
    obj.hide_render = True
    return obj


def light(name, location, power, color=(1.0, 0.8, 0.6)):
    """Luz puntual. Se exporta en modo RAW: `power` es directamente la intensidad (cd)
    que usará Three.js, por eso en el viewport de Blender se ven tenues."""
    data = bpy.data.lights.new(name, "POINT")
    data.energy = power
    data.color = color
    data.shadow_soft_size = 0.1
    obj = bpy.data.objects.new(name, data)
    collection("Lights").objects.link(obj)
    obj.location = location
    return obj


# ---------- Objetos de proyecto (INT_<id> + hijo con MAT_Cover) ----------


def cover(project_id, location, size, parent, tilt_deg=0, subdiv=3):
    """Portada (4:3) que mira a −Y local del padre. El juego le pone la imagen del proyecto."""
    c = plane(f"COVER_{project_id}", location, size, M("Cover"), "Interactables", parent, subdiv)
    c.rotation_euler.x = math.radians(tilt_deg)
    return c


def pedestal(project_id, xy, face):
    """Pedestal de mármol con atril inclinado que muestra la portada (vitrina del hall)."""
    x, y = xy
    root = box(f"INT_{project_id}", (x, y, 0.45), (0.6, 0.6, 0.9), M("Marble"), "Interactables", face=face)
    box(f"PEDTOP_{project_id}", (0, 0, 0.47), (0.7, 0.7, 0.06), M("Marble"), "Interactables", parent=root)
    box(f"PEDBASE_{project_id}", (0, 0, -0.42), (0.7, 0.7, 0.08), M("Marble"), "Interactables", parent=root)
    w, h = 0.56, 0.42
    lectern = plane(f"COVER_{project_id}", (0, -0.04, 0.62), (w, h), M("Cover"), "Interactables", root, 3)
    lectern.rotation_euler.x = math.radians(-55)  # inclinado hacia quien lo mira
    frame = box(f"FRAME_{project_id}", (0, 0.025, 0), (w + 0.06, 0.03, h + 0.06), M("Brass"), "Interactables",
                parent=lectern)
    collider(f"Pedestal_{project_id}", (x, y, 0.5), (0.75, 0.75, 1.0), FACE[face])
    return root


def painting(project_id, xy, face, size=(1.4, 1.05), z=1.75, light_power=2.2):
    """Cuadro en un muro con marco dorado y lámpara de cuadro. `xy`: punto del muro."""
    w, h = size
    pos = wall_pos(xy, face, 0.03)
    root = box(f"INT_{project_id}", (*pos, z), (w + 0.04, 0.04, h + 0.04), M("Wood_Dark"), "Interactables",
               0.5, face)
    cover(project_id, (0, -0.05, 0), (w, h), root)
    fw = 0.1  # marco: cuatro listones que sobresalen de la portada
    for i, (cx, cz, sx, sz) in enumerate([(0, h / 2 + fw / 2, w + 2 * fw, fw), (0, -h / 2 - fw / 2, w + 2 * fw, fw),
                                          (-w / 2 - fw / 2, 0, fw, h), (w / 2 + fw / 2, 0, fw, h)]):
        stretched_box(f"FRAME_{project_id}_{i}", (cx, -0.05, cz), (sx, 0.1, sz), M("Gold_Frame"), "Interactables",
                      parent=root)
    lamp = box(f"PICLAMP_{project_id}", (0, -0.14, h / 2 + 0.2), (w * 0.5, 0.06, 0.05), M("Brass"),
               "Interactables", parent=root)
    box(f"PICBULB_{project_id}", (0, -0.02, -0.03), (w * 0.45, 0.04, 0.02), M("Lamp"), "Interactables", parent=lamp)
    lx, ly = wall_pos(xy, face, 0.7)
    light(f"Light_{project_id}", (lx, ly, z + h / 2 + 0.3), light_power, (1.0, 0.85, 0.62))
    # Cordón y postes: no dejan pegarse al cuadro pero sí examinarlo.
    return root


def crt(name, center, face, parent=None, size=0.5, screen_id=None, col="Props"):
    """Monitor CRT beige. Con `screen_id` la pantalla es una portada (MAT_Cover)."""
    s = size
    body = box(name, center, (s, s * 0.9, s * 0.84), M("Plastic"), col, 0.5, face, parent)
    box(f"{name}_Back", (0, s * 0.55, -s * 0.05), (s * 0.7, s * 0.4, s * 0.6), M("Plastic"), col, 0.5, parent=body)
    w, h = s * 0.76, s * 0.57
    if screen_id:
        cover(screen_id, (0, -s * 0.451, 0.02 * s), (w, h), body)
    else:
        plane(f"{name}_Screen", (0, -s * 0.451, 0.02 * s), (w, h), M("Screen_Off"), col, body, 2)
    return body


def workstation(project_id, xy, face, desk_w=1.3, desk_d=0.75, mat="Wood"):
    """Escritorio contra un muro con un CRT que muestra la portada (INT_ = el escritorio)."""
    pos = wall_pos(xy, face, desk_d / 2 + 0.02)
    root = box(f"INT_{project_id}", (*pos, 0.74), (desk_w, desk_d, 0.06), M(mat), "Interactables", 1.0, face)
    for i, (dx, dy) in enumerate([(-1, -1), (1, -1), (-1, 1), (1, 1)]):
        box(f"DESKLEG_{project_id}_{i}", (dx * (desk_w / 2 - 0.05), dy * (desk_d / 2 - 0.05), -0.37),
            (0.06, 0.06, 0.68), M(mat), "Interactables", parent=root)
    crt(f"CRT_{project_id}", (0.0, 0.06, 0.28), None, root, 0.6, project_id, "Interactables")
    box(f"KEYB_{project_id}", (0.0, -0.24, 0.045), (0.46, 0.16, 0.03), M("Plastic"), "Interactables", 0.5, parent=root)
    box(f"PAPERS_{project_id}", (desk_w / 2 - 0.22, -0.1, 0.035), (0.24, 0.3, 0.01), M("Paper"), "Interactables", 0.3,
        parent=root)
    collider(f"Desk_{project_id}", (*pos, 0.5), (desk_w + 0.06, desk_d + 0.06, 1.0), FACE[face])
    return root


def arcade(project_id, xy, face, palette="Red"):
    """Máquina arcade contra un muro; la pantalla muestra la portada."""
    marquee = {"Red": "Marquee_Pink", "Blue": "Marquee_Cyan", "Gold": "Marquee_Gold"}[palette]
    pos = wall_pos(xy, face, 0.42)
    root = box(f"INT_{project_id}", (*pos, 0.9), (0.78, 0.8, 1.8), M(f"Cabinet_{palette}"), "Interactables", 1.0, face)
    # Panel de control y botones.
    panel = box(f"PANEL_{project_id}", (0, -0.5, 0.0), (0.78, 0.3, 0.12), M("Plastic_Dark"), "Interactables",
                parent=root)
    panel.rotation_euler.x = math.radians(-12)
    for i, dx in enumerate([-0.22, 0.05, 0.15, 0.25]):
        mat = M("Steel") if i == 0 else M(marquee)
        box(f"BTN_{project_id}_{i}", (dx, 0, 0.07), (0.05, 0.05, 0.05 if i else 0.12), mat, "Interactables",
            parent=panel)
    # Pantalla inclinada hacia atrás, hundida en el frente.
    cover(project_id, (0, -0.41, 0.42), (0.6, 0.45), root, tilt_deg=-10)
    box(f"BEZEL_{project_id}", (0, -0.39, 0.42), (0.7, 0.02, 0.56), M("Plastic_Dark"), "Interactables", parent=root)
    # Marquesina luminosa.
    stretched_box(f"MARQUEE_{project_id}", (0, -0.2, 0.8), (0.78, 0.42, 0.2), M(marquee), "Interactables",
                  parent=root)
    collider(f"Arcade_{project_id}", (*pos, 0.9), (0.85, 0.95, 1.8), FACE[face])
    return root


def tool_chest(project_id, xy, face, palette="Red", extra=None):
    """Cofre de herramientas contra un muro con un tablero perforado encima; la portada va
    sujeta al tablero (INT_ = el cofre). `extra`: objeto pequeño sobre la tapa."""
    w, dpt, h, gap = 0.9, 0.5, 0.92, 0.06
    pos = wall_pos(xy, face, dpt / 2 + gap)
    root = box(f"INT_{project_id}", (*pos, h / 2), (w, dpt, h), M(f"Chest_{palette}"), "Interactables", 0.5, face)
    # Frente de cajones (sobresale 3 cm: con el vertex snapping lo coplanar parpadea).
    stretched_box(f"DRAWERS_{project_id}", (0, -dpt / 2 - 0.015, -0.02), (w - 0.06, 0.03, h - 0.1),
                  M(f"Drawers_{palette}"), "Interactables", parent=root)
    box(f"CHESTTOP_{project_id}", (0, 0, h / 2 + 0.025), (w + 0.04, dpt + 0.04, 0.05), M("Wood"), "Interactables",
        0.5, parent=root)
    # Tablero en el muro (3 cm separado de la pared) con la portada colgada al centro.
    peg = stretched_box(f"PEG_{project_id}", (0, dpt / 2 + gap - 0.045, 1.62 - h / 2), (1.1, 0.03, 0.95),
                        M("Pegboard"), "Interactables", parent=root)
    cover(project_id, (0, -0.045, 0.03), (0.6, 0.45), peg)
    if extra == "box":
        box(f"TOPBOX_{project_id}", (0.22, 0.02, h / 2 + 0.11), (0.3, 0.18, 0.12), M("Crate"), "Interactables", 0.5,
            parent=root)
    elif extra == "can":
        cylinder(f"TOPCAN_{project_id}", (-0.26, 0.04, h / 2 + 0.12), 0.06, 0.14, M("Steel"), 6, parent=root)
    elif extra == "lamp":
        box(f"TOPLAMP_{project_id}", (0.3, 0.08, h / 2 + 0.2), (0.03, 0.03, 0.3), M("Metal"), "Interactables",
            parent=root)
        box(f"TOPLAMP_{project_id}_Shade", (0.3, -0.02, h / 2 + 0.36), (0.12, 0.16, 0.06), M("Lamp"), "Interactables",
            parent=root)
    collider(f"Chest_{project_id}", (*pos, 0.5), (w + 0.08, dpt + 0.08, 1.0), FACE[face])
    return root


# ---------- Decoración ----------


def plant(name, xy, scale=1.0):
    x, y = xy
    cylinder(f"{name}_Pot", (x, y, 0.22 * scale), 0.22 * scale, 0.44 * scale, M("Pot"), 8, 0.28 * scale)
    for i, (r, z) in enumerate([(0.45, 0.75), (0.36, 1.05), (0.22, 1.3)]):
        cylinder(f"{name}_Leaves_{i}", (x, y, z * scale), r * scale, 0.35 * scale, M("Plant"), 6, r * scale * 0.4)
    collider(name, (x, y, 0.5), (0.6 * scale, 0.6 * scale, 1.0))


def bookshelf(name, xy, face, width=1.6, height=2.2, depth=0.4):
    pos = wall_pos(xy, face, depth / 2)
    root = box(name, (*pos, height / 2), (width, depth, height), M("Wood_Dark"), "Props", 1.0, face)
    stretched_box(f"{name}_Books", (0, -depth / 2 + 0.01, 0.0), (width - 0.12, 0.02, height - 0.16), M("Bookshelf"),
                  "Props", parent=root)
    collider(name, (*pos, 1.0), (width + 0.05, depth + 0.05, 2.0), FACE[face])
    return root


def table(name, center, size, mat="Wood", leg=0.07, collide=True):
    x, y, h = center[0], center[1], size[2]
    top = box(f"{name}_Top", (x, y, h - 0.03), (size[0], size[1], 0.06), M(mat), "Props")
    for i, (dx, dy) in enumerate([(-1, -1), (1, -1), (-1, 1), (1, 1)]):
        box(f"{name}_Leg_{i}", (x + dx * (size[0] / 2 - leg), y + dy * (size[1] / 2 - leg), (h - 0.06) / 2),
            (leg, leg, h - 0.06), M(mat), "Props")
    if collide:
        collider(name, (x, y, 0.5), (size[0] + 0.05, size[1] + 0.05, 1.0))
    return top


def ceiling_lamp(name, xy, h, power, color=(1.0, 0.8, 0.55), drop=0.5):
    x, y = xy
    box(f"{name}_Cord", (x, y, h - drop / 2), (0.02, 0.02, drop), M("Metal"))
    cylinder(f"{name}_Shade", (x, y, h - drop - 0.1), 0.28, 0.2, M("Lamp"), 8, 0.1)
    light(name, (x, y, h - drop - 0.3), power, color)


def fluorescent(name, xy, h, power, length=1.4, axis="X"):
    x, y = xy
    size = (length, 0.18, 0.06) if axis == "X" else (0.18, length, 0.06)
    box(f"{name}_Housing", (x, y, h - 0.03), size, M("Metal"))
    size = (length - 0.1, 0.1, 0.02) if axis == "X" else (0.1, length - 0.1, 0.02)
    box(f"{name}_Tube", (x, y, h - 0.07), size, M("Fluorescent"))
    light(name, (x, y, h - 0.4), power, (0.82, 0.95, 1.0))


# --------------------------------------------------------------------------------------
# Hall principal (12 × 10 m, 4.2 m de alto)
#
#   N  [unreal]      escalera + vitral      [unity]
#      plantas                              plantas
#   W [lab]     4 pedestales (destacados)    [game] E
#      escritorio + diario      sillón + TV (DemoReel)
#   S  [save]              alfombra · inicio            [workshop]
# --------------------------------------------------------------------------------------


def build_hall():
    x0, x1, y0, y1, H = -6.0, 6.0, -5.0, 5.0, 4.2
    rect_room(x0, x1, y0, y1, H, "Floor_Marble", "Damask", "Wainscot_Dark", "Coffer", floor_uv=1.0,
              ceiling_uv=2.0, wainscot_h=1.2)
    crown_molding(x0, x1, y0, y1, H)

    # Alfombra desde la entrada hasta la escalera, y alfombra persa bajo la vitrina.
    floor_patch("Runner", -0.6, y0, 0.6, 2.7, M("Carpet_Red"), 0.03, uv_scale=1.2)
    floor_patch("Rug_Vitrina", -3.6, -0.6, 3.6, 1.4, M("Rug"), 0.015)

    # Escalera al norte (decorativa: sube a un rellano bajo el vitral).
    steps, rise, run = 8, 0.2, 0.28
    for i in range(steps):
        y = 2.75 + i * run
        box(f"Stair_{i}", (0, y + run / 2, (i + 1) * rise / 2), (3.0, run, (i + 1) * rise), M("Marble"), "Props", 1.0)
    landing_y = 2.75 + steps * run
    box("Stair_Landing", (0, (landing_y + y1) / 2, steps * rise / 2), (3.0, y1 - landing_y, steps * rise),
        M("Marble"), "Props", 1.0)
    floor_patch("Stair_Runner", -0.6, landing_y, 0.6, y1, M("Carpet_Red"), steps * rise + 0.02, uv_scale=1.2)
    for s in (-1, 1):
        # Barandilla: zócalo inclinado + pilar al pie.
        bx = s * 1.55
        rail = box(f"Banister_{s}", (bx, 2.75 + steps * run / 2, steps * rise / 2 + 0.55),
                   (0.1, math.hypot(steps * run, steps * rise) + 0.1, 0.12), M("Wood_Dark"), "Props", 0.5)
        rail.rotation_euler.x = math.atan2(steps * rise, steps * run)
        box(f"Newel_{s}", (bx, 2.72, 0.55), (0.18, 0.18, 1.1), M("Wood_Dark"), "Props", 0.5)
        sphere(f"Newel_Cap_{s}", (bx, 2.72, 1.16), 0.1, M("Brass"), 6, 4)
        box(f"Balustrade_{s}", (bx, 2.75 + steps * run / 2, steps * rise / 2 + 0.2),
            (0.06, steps * run, steps * rise * 0.5 + 0.4), M("Wood_Dark"), "Props", 0.5)
    collider("Stairs", (0, (2.7 + y1) / 2, 1.0), (3.3, y1 - 2.7, 2.0))
    # Vitral sobre el rellano.
    # Separado de la pared: el vertex snapping hace "pelear" superficies a pocos cm.
    plane("Window_N", (0, y1 - 0.06, 2.95), (2.2, 2.0), M("Window"), "Props", None, 2)
    for i, (cx, cz, sx, sz) in enumerate([(0, 4.0, 2.44, 0.12), (0, 1.9, 2.44, 0.12), (-1.16, 2.95, 0.12, 2.0),
                                          (1.16, 2.95, 0.12, 2.0)]):
        box(f"Window_Frame_{i}", (cx, y1 - 0.08, cz), (sx, 0.16, sz), M("Wood_Dark"), "Props", 0.5)

    # Vitrina: los cuatro proyectos destacados (también viven en sus alas).
    for pid, x in [("persona-error", -2.7), ("catharsis", -0.9), ("kerberos-engine", 0.9), ("death-of-will", 2.7)]:
        pedestal(pid, (x, 0.4), "S")

    # Escritorio de recepción con el diario (profile.about), contra el muro oeste.
    desk_x, desk_y = x0 + 0.55, -2.4
    box("Desk", (desk_x, desk_y, 0.4), (0.8, 1.8, 0.8), M("Wood_Dark"), "Props", 1.0)
    box("Desk_Top", (desk_x, desk_y, 0.82), (0.9, 1.9, 0.05), M("Wood"), "Props", 1.0)
    collider("Desk", (desk_x, desk_y, 0.5), (0.95, 1.95, 1.0))
    diary = box("INT_about", (desk_x + 0.1, desk_y + 0.2, 0.865), (0.3, 0.42, 0.04), M("Book"), "Interactables", 0.5)
    diary.rotation_euler.z = math.radians(-12)
    box("PAGES_about", (0, 0, 0.026), (0.26, 0.38, 0.012), M("Paper"), "Interactables", 0.5, parent=diary)
    box("Desk_Lamp_Base", (desk_x - 0.15, desk_y - 0.6, 0.87), (0.12, 0.12, 0.05), M("Brass"))
    box("Desk_Lamp_Stem", (desk_x - 0.15, desk_y - 0.6, 1.05), (0.03, 0.03, 0.34), M("Brass"))
    cylinder("Desk_Lamp_Shade", (desk_x - 0.15, desk_y - 0.6, 1.25), 0.16, 0.16, M("Lamp"), 8, 0.07)
    light("Light_Desk", (desk_x + 0.3, desk_y - 0.5, 1.4), 2.5, (1.0, 0.75, 0.45))

    # TV con el DemoReel sobre un mueble, contra el muro este; sillón enfrente.
    tv_x, tv_y = x1 - 0.4, -2.4
    tv = box("INT_demoreel", (tv_x, tv_y, 0.3), (1.2, 0.6, 0.6), M("Wood_Dark"), "Interactables", 1.0, "W")
    body = box("TV_Body", (0, 0.02, 0.6), (0.82, 0.55, 0.62), M("TV_Body"), "Interactables", 0.5, parent=tv)
    cover("demoreel", (0, -0.281, 0.03), (0.6, 0.45), body)
    box("TV_Knobs", (0.36, -0.28, -0.15), (0.06, 0.02, 0.18), M("Brass"), "Interactables", parent=body)
    box("TV_Antenna_L", (-0.12, 0.05, 0.45), (0.015, 0.015, 0.4), M("Steel"), "Interactables",
        parent=body).rotation_euler.y = math.radians(-25)
    box("TV_Antenna_R", (0.12, 0.05, 0.45), (0.015, 0.015, 0.4), M("Steel"), "Interactables",
        parent=body).rotation_euler.y = math.radians(25)
    box("VCR", (0, -0.02, 0.06), (0.7, 0.4, 0.1), M("Plastic_Dark"), "Interactables", parent=tv)
    collider("TV", (tv_x, tv_y, 0.5), (0.7, 1.3, 1.0))
    light("Light_TV", (tv_x - 0.8, tv_y, 1.0), 1.4, (0.55, 0.7, 1.0))
    # Sillón mirando a la TV.
    ax = tv_x - 2.0
    box("Armchair_Seat", (ax, tv_y, 0.25), (0.8, 0.8, 0.5), M("Velvet"))
    box("Armchair_Back", (ax - 0.33, tv_y, 0.6), (0.18, 0.8, 0.8), M("Velvet"))
    box("Armchair_Arm_L", (ax, tv_y - 0.38, 0.45), (0.8, 0.12, 0.3), M("Velvet"))
    box("Armchair_Arm_R", (ax, tv_y + 0.38, 0.45), (0.8, 0.12, 0.3), M("Velvet"))
    collider("Armchair", (ax, tv_y, 0.5), (0.9, 0.9, 1.0))

    # Puertas a las alas y a la sala de guardado.
    door_with_spawn("unreal-wing", (-3.6, y1), "S")
    door_with_spawn("unity-wing", (3.6, y1), "S")
    door_with_spawn("lab", (x0, 0.4), "E")
    door_with_spawn("game-room", (x1, 0.4), "W")
    door_with_spawn("save-room", (-4.2, y0), "N")
    door_with_spawn("workshop", (4.2, y0), "N")
    spawn("default", (0.0, -3.9), "N")

    # Plantas y reloj de pie.
    plant("Plant_NW", (x0 + 0.5, y1 - 0.5))
    plant("Plant_NE", (x1 - 0.5, y1 - 0.5))
    plant("Plant_SE", (x1 - 0.5, y0 + 0.5))
    # Reloj de pie en el muro este (en el sur taparía la puerta del Taller desde la CAM_2).
    clock_y = 2.6
    box("Clock", (x1 - 0.25, clock_y, 1.0), (0.4, 0.55, 2.0), M("Wood_Dark"), "Props", 0.5)
    box("Clock_Face", (x1 - 0.44, clock_y, 1.6), (0.02, 0.38, 0.38), M("Paper"), "Props", 0.5)
    box("Clock_Pendulum", (x1 - 0.45, clock_y, 0.85), (0.02, 0.1, 0.5), M("Brass"), "Props", 0.5)
    collider("Clock", (x1 - 0.25, clock_y, 1.0), (0.45, 0.6, 2.0))

    # Candelabro central.
    cx, cy, cz = 0.0, -0.6, H - 0.9
    box("Chandelier_Rod", (cx, cy, (H + cz) / 2), (0.04, 0.04, H - cz), M("Brass"))
    cylinder("Chandelier_Ring", (cx, cy, cz), 0.7, 0.06, M("Brass"), 8)
    for i in range(8):
        a = i * math.pi / 4
        px, py = cx + math.cos(a) * 0.7, cy + math.sin(a) * 0.7
        box(f"Candle_{i}", (px, py, cz + 0.12), (0.05, 0.05, 0.18), M("Paper"))
        box(f"Flame_{i}", (px, py, cz + 0.25), (0.04, 0.04, 0.06), M("Lamp"))
    light("Light_Chandelier", (cx, cy, cz - 0.3), 26.0, (1.0, 0.78, 0.5))
    light("Light_Vitrina", (0.0, 0.9, 2.6), 6.0, (1.0, 0.85, 0.6))
    light("Light_Window", (0.0, y1 - 1.2, 3.0), 6.0, (0.55, 0.65, 1.0))
    for name, x in [("Unreal", -3.6), ("Unity", 3.6)]:
        for s in (-1, 1):
            box(f"Sconce_{name}_{s}", (x + s * 1.0, y1 - 0.06, 2.2), (0.1, 0.12, 0.22), M("Brass"))
            box(f"Sconce_{name}_{s}_Bulb", (x + s * 1.0, y1 - 0.12, 2.38), (0.06, 0.06, 0.1), M("Lamp"))
        light(f"Light_Door_{name}", (x, y1 - 0.9, 2.5), 3.5, (1.0, 0.75, 0.5))

    # Cámaras: dos para la mitad sur (entrada) y dos para la mitad norte.
    camera("CAM_1", (5.5, -4.5, 3.6), (-2.6, 0.4, 0.6), 55)   # SO: escritorio, puerta del lab, vitrina
    zone("1", x0 - 0.2, 0.2, y0 - 0.2, -0.6)
    camera("CAM_2", (-5.5, -4.5, 3.6), (2.6, 0.4, 0.6), 55)   # SE: TV, puerta de la sala de juegos
    zone("2", -0.2, x1 + 0.2, y0 - 0.2, -0.6)
    camera("CAM_3", (4.6, -1.6, 3.7), (-3.2, 3.8, 0.9), 55)   # NO: puerta del ala Unreal y del lab
    zone("3", x0 - 0.2, 0.2, -1.0, y1 + 0.2)
    camera("CAM_4", (-4.6, -1.6, 3.7), (3.2, 3.8, 0.9), 55)   # NE: puerta del ala Unity y de juegos
    zone("4", -0.2, x1 + 0.2, -1.0, y1 + 0.2)


# --------------------------------------------------------------------------------------
# Ala Unreal: galería (5.2 × 14 m)
# --------------------------------------------------------------------------------------


def build_unreal_wing():
    x0, x1, y0, y1, H = -2.6, 2.6, 0.0, 14.0, 3.6
    rect_room(x0, x1, y0, y1, H, "Parquet", "Gallery_Wall", "Wainscot_Dark", "Ceiling", floor_uv=1.0)
    crown_molding(x0, x1, y0, y1, H)
    for i in range(1, 7):  # vigas del techo
        box(f"Beam_{i}", (0, i * 2.0, H - 0.12), (x1 - x0, 0.2, 0.24), M("Wood_Dark"), "Props", 0.5)
    floor_patch("Runner", -0.7, y0, 0.7, y1, M("Carpet_Red"), 0.015, uv_scale=1.4)

    painting("epic-lucio-prototype", (x0, 3.8), "E")
    painting("3d-visualizer", (x0, 9.0), "E")
    painting("epic-lucio-mvp", (x1, 3.8), "W")
    painting("vessels", (x1, 9.0), "W")
    painting("death-of-will", (0.0, y1), "S", size=(2.2, 1.65), z=1.9, light_power=3.5)  # destacado

    # Bancos de museo en el centro y bustos de decoración.
    for i, y in enumerate([6.4]):
        box(f"Bench_{i}_Seat", (0, y, 0.42), (1.6, 0.5, 0.08), M("Velvet"))
        for s in (-1, 1):
            box(f"Bench_{i}_Leg_{s}", (s * 0.7, y, 0.2), (0.08, 0.42, 0.4), M("Wood_Dark"))
        collider(f"Bench_{i}", (0, y, 0.5), (1.7, 0.6, 1.0))
    for s in (-1, 1):
        x = s * 1.9
        box(f"Bust_Plinth_{s}", (x, 12.4, 0.55), (0.5, 0.5, 1.1), M("Marble"))
        sphere(f"Bust_Head_{s}", (x, 12.4, 1.38), 0.17, M("Marble"), 8, 6)
        box(f"Bust_Chest_{s}", (x, 12.4, 1.17), (0.36, 0.2, 0.16), M("Marble"))
        collider(f"Bust_{s}", (x, 12.4, 0.5), (0.6, 0.6, 1.0))
    plant("Plant_SW", (x0 + 0.45, 0.5), 0.9)
    plant("Plant_SE", (x1 - 0.45, 0.5), 0.9)

    door_with_spawn("hall", (0.0, y0), "N")
    spawn("default", (0.0, 1.0), "N")

    light("Light_Entry", (0.0, 1.6, 3.0), 4.0, (1.0, 0.8, 0.55))
    light("Light_Center", (0.0, 6.4, 3.0), 5.0, (0.85, 0.85, 1.0))

    camera("CAM_1", (1.95, 0.4, 3.2), (-1.1, 6.8, 0.9), 55)
    zone("1", x0 - 0.2, x1 + 0.2, y0 - 0.2, 6.6)
    camera("CAM_2", (0.0, 5.8, 3.3), (0.0, 13.8, 1.2), 58)
    zone("2", x0 - 0.2, x1 + 0.2, 6.2, y1 + 0.2)


# --------------------------------------------------------------------------------------
# Ala Unity: estudio con computadoras (9 × 9 m)
# --------------------------------------------------------------------------------------


def build_unity_wing():
    x0, x1, y0, y1, H = -4.5, 4.5, 0.0, 9.0, 3.2
    rect_room(x0, x1, y0, y1, H, "Carpet_Green", "Green_Wall", "Wainscot", "Ceiling", floor_uv=1.0)
    crown_molding(x0, x1, y0, y1, H)

    for pid, y in [("lucio-kart", 2.4), ("off-the-hook", 4.6), ("deadlock-escape", 6.8)]:
        workstation(pid, (x0, y), "E")
    for pid, y in [("ar-foundation-vuforia", 2.4), ("kiwi-procedural-agents", 4.6), ("pcg-enemies", 6.8)]:
        workstation(pid, (x1, y), "W")

    # Libreros al norte y archiveros junto a la puerta.
    for i, x in enumerate([-2.6, -0.8, 1.0, 2.8]):
        bookshelf(f"Shelf_{i}", (x, y1), "S", width=1.7)
    for i, x in enumerate([-3.6, 3.6]):
        box(f"Filing_{i}", (x, 0.35, 0.65), (0.6, 0.6, 1.3), M("Metal"), "Props", 0.5)
        for j in range(3):
            box(f"Filing_{i}_Drawer_{j}", (x, 0.04, 0.3 + j * 0.4), (0.5, 0.02, 0.3), M("Steel"), "Props", 0.5)
        collider(f"Filing_{i}", (x, 0.35, 0.65), (0.65, 0.65, 1.3))

    # Mesa central de planos con lámpara de banquero.
    table("Map_Table", (0.0, 4.6, 0.8), (1.6, 2.6, 0.8), "Wood_Dark")
    box("Blueprints", (0.1, 4.5, 0.81), (1.2, 1.8, 0.01), M("Paper"), "Props", 0.6)
    box("Banker_Lamp_Base", (-0.5, 5.5, 0.84), (0.14, 0.14, 0.04), M("Brass"))
    box("Banker_Lamp_Stem", (-0.5, 5.5, 0.97), (0.03, 0.03, 0.24), M("Brass"))
    box("Banker_Lamp_Shade", (-0.5, 5.42, 1.1), (0.34, 0.14, 0.08), M("Lamp"))
    light("Light_Table", (-0.3, 5.0, 1.5), 2.0, (0.85, 1.0, 0.7))
    floor_patch("Rug_Center", -1.4, 2.6, 1.4, 6.6, M("Rug"))

    door_with_spawn("hall", (0.0, y0), "N")
    spawn("default", (0.0, 1.0), "N")

    for i, (x, y) in enumerate([(-2.4, 3.4), (-2.4, 6.2), (2.4, 3.4), (2.4, 6.2)]):
        ceiling_lamp(f"Light_Lamp_{i}", (x, y), H, 4.5, drop=0.4)

    camera("CAM_1", (1.4, 0.3, 3.0), (-3.2, 5.2, 0.8), 58)  # pasillo oeste
    zone("1", x0 - 0.2, 0.2, y0 - 0.2, y1 + 0.2)
    camera("CAM_2", (-1.4, 0.3, 3.0), (3.2, 5.2, 0.8), 58)  # pasillo este
    zone("2", -0.2, x1 + 0.2, y0 - 0.2, y1 + 0.2)


# --------------------------------------------------------------------------------------
# Laboratorio: motores y gráficos en C++ (8 × 7 m)
# --------------------------------------------------------------------------------------


def build_lab():
    x0, x1, y0, y1, H = -4.0, 4.0, -3.5, 3.5, 3.0
    rect_room(x0, x1, y0, y1, H, "Metal_Floor", "Tile", "Tile_Dark", "Ceiling", floor_uv=1.0, wainscot_h=1.2)

    workstation("kerberos-engine", (-1.6, y1), "S", desk_w=1.6, mat="Steel")
    workstation("custom-2d-rendering-framework", (0.6, y1), "S", desk_w=1.6, mat="Steel")
    workstation("solar-system-simulation", (-0.8, y0), "N", desk_w=1.6, mat="Steel")

    # Planetario (decoración) junto a la simulación del sistema solar.
    ox, oy = -2.7, -2.4
    cylinder("Orrery_Table", (ox, oy, 0.4), 0.45, 0.8, M("Wood_Dark"), 8)
    sphere("Orrery_Sun", (ox, oy, 1.12), 0.14, M("Lamp"), 8, 6)
    box("Orrery_Stem", (ox, oy, 0.9), (0.03, 0.03, 0.2), M("Brass"))
    for i, (r, a, s) in enumerate([(0.25, 0.4, 0.04), (0.36, 2.1, 0.05), (0.44, 4.0, 0.06)]):
        box(f"Orrery_Arm_{i}", (ox + math.cos(a) * r / 2, oy + math.sin(a) * r / 2, 1.0 + i * 0.02),
            (r, 0.012, 0.012), M("Brass")).rotation_euler.z = a
        sphere(f"Orrery_Planet_{i}", (ox + math.cos(a) * r, oy + math.sin(a) * r, 1.0 + i * 0.02), s,
               M(["Steel", "Gold_Frame", "Felt"][i]), 6, 4)
    collider("Orrery", (ox, oy, 0.5), (1.0, 1.0, 1.0))
    light("Light_Orrery", (ox, oy, 1.6), 1.2, (1.0, 0.8, 0.5))

    # Racks de servidores al oeste, pizarrón al sur, tuberías en el techo.
    for i, y in enumerate([-0.9, 0.0, 0.9]):
        r = box(f"Rack_{i}", (x0 + 0.4, y, 1.0), (0.7, 0.85, 2.0), M("Plastic_Dark"), "Props", 0.5)
        stretched_box(f"Rack_{i}_Front", (0.36, 0, 0), (0.02, 0.75, 1.9), M("Server"), "Props", parent=r)
    collider("Racks", (x0 + 0.4, 0.0, 1.0), (0.75, 2.6, 2.0))
    light("Light_Racks", (x0 + 1.4, 0.0, 1.2), 1.2, (0.4, 1.0, 0.6))
    board = stretched_box("Chalkboard", (2.2, y0 + 0.03, 1.6), (2.2, 0.04, 1.2), M("Chalkboard"), "Props", "N")
    box("Chalk_Tray", (2.2, y0 + 0.08, 0.98), (2.2, 0.08, 0.04), M("Wood"))
    for i, y in enumerate([-2.6, 2.6]):
        box(f"Pipe_{i}", (0.0, y, H - 0.2), (x1 - x0, 0.12, 0.12), M("Steel"), "Props", 0.5)
    box("Pipe_Drop", (x1 - 0.3, 2.6, H - 1.0), (0.12, 0.12, 1.6), M("Steel"), "Props", 0.5)
    # Mesa de trabajo con cajas y herramientas, en la esquina sureste.
    table("Bench", (3.0, -1.8, 0.85), (1.2, 0.7, 0.85), "Steel")
    box("Bench_Crate", (3.2, -1.8, 1.0), (0.4, 0.3, 0.25), M("Crate"), "Props", 0.5)
    crt("CRT_Bench", (2.75, -1.75, 1.03), "W", size=0.42)
    box("Crate_Lab_1", (3.5, 3.0, 0.3), (0.6, 0.6, 0.6), M("Crate"), "Props", 0.6)
    collider("Crate_Lab_1", (3.5, 3.0, 0.5), (0.65, 0.65, 1.0))

    door_with_spawn("hall", (x1, 0.0), "W")
    spawn("default", (2.8, 0.0), "W")

    fluorescent("Light_Fluor_W", (-1.6, 1.6), H, 6.0, 1.4, "X")
    fluorescent("Light_Fluor_E", (1.2, 1.6), H, 6.0, 1.4, "X")
    fluorescent("Light_Fluor_S", (-0.4, -1.8), H, 5.0, 1.4, "X")

    camera("CAM_1", (3.6, -3.1, 2.75), (-2.4, 1.6, 0.8), 58)  # mitad oeste
    zone("1", x0 - 0.2, 0.2, y0 - 0.2, y1 + 0.2)
    camera("CAM_2", (-2.9, -3.1, 2.75), (2.4, 1.8, 0.8), 58)  # mitad este
    zone("2", -0.2, x1 + 0.2, y0 - 0.2, y1 + 0.2)


# --------------------------------------------------------------------------------------
# Sala de juegos: máquinas arcade (10 × 8 m)
# --------------------------------------------------------------------------------------


def build_game_room():
    x0, x1, y0, y1, H = -5.0, 5.0, -4.0, 4.0, 3.0
    rect_room(x0, x1, y0, y1, H, "Arcade_Carpet", "Purple_Wall", "Plastic_Dark", "Ceiling", floor_uv=1.5)

    for pid, x, pal in [("pops-and-barks", -2.4, "Blue"), ("memeception", -0.8, "Gold"), ("cosmic-fang", 0.8, "Red")]:
        arcade(pid, (x, y1), "S", pal)
    for pid, x, pal in [("lucio-galaxy", -2.4, "Red"), ("raboom", -0.8, "Blue"), ("lucio-clicker-simulator", 0.8, "Gold")]:
        arcade(pid, (x, y0), "N", pal)
    # Los destacados, juntos en el muro del fondo.
    arcade("persona-error", (x1, -1.0), "W", "Red")
    arcade("catharsis", (x1, 1.0), "W", "Blue")

    # Mesa de billar al centro con su lámpara.
    px, py = -0.6, 0.0
    box("Pool_Table", (px, py, 0.4), (2.0, 1.1, 0.8), M("Wood_Dark"), "Props", 0.5)
    stretched_box("Pool_Felt", (px, py, 0.805), (1.8, 0.9, 0.01), M("Felt"))
    for i, (bx, by, mat) in enumerate([(0.3, 0.1, "Lamp"), (0.4, -0.15, "Neon"), (-0.5, 0.2, "Paper")]):
        sphere(f"Ball_{i}", (px + bx, py + by, 0.84), 0.035, M(mat), 6, 4)
    collider("Pool_Table", (px, py, 0.5), (2.1, 1.2, 1.0))
    box("Pool_Lamp", (px, py, H - 0.7), (1.2, 0.3, 0.12), M("Felt"))
    box("Pool_Lamp_Glow", (px, py, H - 0.77), (1.1, 0.25, 0.02), M("Lamp"))
    light("Light_Pool", (px, py, H - 1.1), 3.5, (1.0, 0.85, 0.55))

    # Sofá junto a la entrada y estrella de neón (Starmise) sobre las máquinas destacadas.
    box("Sofa_Seat", (x0 + 0.5, -2.6, 0.25), (0.8, 1.6, 0.5), M("Velvet"))
    box("Sofa_Back", (x0 + 0.15, -2.6, 0.6), (0.2, 1.6, 0.8), M("Velvet"))
    collider("Sofa", (x0 + 0.45, -2.6, 0.5), (0.9, 1.7, 1.0))
    sx, sy, sz = x1 - 0.04, 0.0, 2.35
    for i in range(5):
        a1 = math.radians(90 + i * 144)
        a2 = math.radians(90 + (i + 1) * 144)
        p1 = (sy + math.cos(a1) * 0.42, sz + math.sin(a1) * 0.42)
        p2 = (sy + math.cos(a2) * 0.42, sz + math.sin(a2) * 0.42)
        mid = ((p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2)
        length = math.hypot(p2[0] - p1[0], p2[1] - p1[1])
        bar = box(f"Neon_Star_{i}", (sx, mid[0], mid[1]), (0.03, length, 0.035), M("Neon"))
        bar.rotation_euler.x = math.atan2(p2[1] - p1[1], p2[0] - p1[0])
    light("Light_Neon", (x1 - 0.8, 0.0, 2.3), 2.5, (1.0, 0.35, 0.8))

    door_with_spawn("hall", (x0, 0.0), "E")
    spawn("default", (-4.0, 0.0), "E")

    light("Light_Magenta", (-1.6, 2.4, 2.6), 5.0, (1.0, 0.4, 0.85))
    light("Light_Cyan", (-1.6, -2.4, 2.6), 5.0, (0.4, 0.85, 1.0))
    light("Light_Featured", (3.4, 0.0, 2.6), 4.0, (1.0, 0.8, 0.6))

    camera("CAM_1", (4.6, -3.6, 2.8), (-2.6, 1.4, 0.8), 58)  # mitad oeste (entrada)
    zone("1", x0 - 0.2, 0.4, y0 - 0.2, y1 + 0.2)
    camera("CAM_2", (-4.6, 3.6, 2.8), (2.8, -1.0, 0.8), 58)  # mitad este (destacados)
    zone("2", 0.0, x1 + 0.2, y0 - 0.2, y1 + 0.2)


# --------------------------------------------------------------------------------------
# Sala de guardado: 5 × 4 m, puerta al este hacia el hall
# --------------------------------------------------------------------------------------


def build_save_room():
    x0, x1, y0, y1, H = -2.5, 2.5, -2.0, 2.0, 2.8
    rect_room(x0, x1, y0, y1, H, "Parquet", "Green_Wall", "Wainscot", "Ceiling", floor_uv=1.0)
    crown_molding(x0, x1, y0, y1, H)
    floor_patch("Rug", -1.3, -1.1, 1.3, 0.9, M("Rug"))

    # Escritorio con la máquina de escribir (contacto), contra el muro norte.
    table("Desk", (0.0, 1.55, 0.77), (1.4, 0.7, 0.77), "Wood")
    tw = box("INT_contact", (0.0, 1.5, 0.84), (0.46, 0.34, 0.14), M("Metal"), "Interactables", 0.5)
    keys = box("TW_Keys", (0, -0.16, -0.03), (0.42, 0.14, 0.05), M("Metal"), "Interactables", 0.5, parent=tw)
    keys.rotation_euler.x = math.radians(-18)
    box("TW_Roller", (0, 0.1, 0.1), (0.52, 0.07, 0.07), M("Metal"), "Interactables", 0.5, parent=tw)
    sheet = box("TW_Paper", (0, 0.12, 0.25), (0.30, 0.01, 0.30), M("Paper"), "Interactables", 0.3, parent=tw)
    sheet.rotation_euler.x = math.radians(-12)
    box("Desk_Lamp_Base", (0.55, 1.7, 0.79), (0.12, 0.12, 0.04), M("Brass"))
    box("Desk_Lamp_Stem", (0.55, 1.7, 0.95), (0.03, 0.03, 0.3), M("Brass"))
    cylinder("Desk_Lamp_Shade", (0.55, 1.7, 1.12), 0.15, 0.14, M("Lamp"), 8, 0.06)

    # Mesita con la libreta de curiosidades (profile.trivia), esquina noroeste.
    box("SideTable", (-1.85, 1.45, 0.35), (0.6, 0.6, 0.7), M("Wood"), "Props")
    collider("SideTable", (-1.85, 1.45, 0.5), (0.7, 0.7, 1.0))
    note = box("INT_trivia", (-1.85, 1.4, 0.72), (0.3, 0.22, 0.03), M("Book"), "Interactables", 0.5)
    note.rotation_euler.z = math.radians(15)
    box("PAGES_trivia", (0, 0, 0.018), (0.27, 0.19, 0.01), M("Paper"), "Interactables", 0.5, parent=note)

    # Librero, baúl y reloj de pared.
    bookshelf("Shelf", (-1.2, y0), "N", width=1.4, height=2.0)
    box("Chest", (1.3, -1.6, 0.3), (0.9, 0.5, 0.6), M("Crate"), "Props", 0.6)
    box("Chest_Lid", (1.3, -1.6, 0.63), (0.94, 0.54, 0.08), M("Wood_Dark"), "Props", 0.6)
    box("Chest_Lock", (1.3, -1.86, 0.5), (0.1, 0.02, 0.12), M("Brass"), "Props", 0.6)
    collider("Chest", (1.3, -1.6, 0.5), (0.95, 0.6, 1.0))
    cyl = cylinder("Wall_Clock", (-0.9, y1 - 0.03, 2.05), 0.15, 0.05, M("Paper"), 10)
    cyl.rotation_euler.x = math.radians(90)

    door_with_spawn("hall", (x1, 0.0), "W")
    spawn("default", (0.0, 0.0), "W")

    camera("CAM_1", (-2.25, -1.75, 2.55), (1.4, 0.9, 0.5), 60)
    zone("1", x0 - 0.2, x1 + 0.2, y0 - 0.2, y1 + 0.2)

    light("Light_Desk", (0.3, 1.3, 1.3), 1.6, (1.0, 0.72, 0.45))
    light("Light_Ceiling", (0.0, 0.0, 2.5), 3.5, (0.95, 0.85, 0.70))


# --------------------------------------------------------------------------------------
# Taller: herramientas modulares para Unity (10 × 8 m). Puerta al norte, hacia el Hall.
#
#   N  casilleros      [hall]        estante + bidones
#   W  editor y         banco de      gameplay y
#      tecnología       trabajo       servicios en línea   E
#   S        IA · combate, misiones, inventario, crafting
#
# Cada herramienta es un cofre de herramientas con su portada en un tablero perforado; el
# color del cofre indica el grupo (acero = editor/técnica, azul = IA, rojo = gameplay,
# verde = servicios e interfaz).
# --------------------------------------------------------------------------------------


def build_workshop():
    x0, x1, y0, y1, H = -5.0, 5.0, -8.0, 0.0, 3.2
    rect_room(x0, x1, y0, y1, H, "Concrete", "Brick", "Paint_Band", "Ceiling", floor_uv=1.0, wainscot_h=1.1)
    for i in range(1, 4):  # vigas metálicas
        box(f"Beam_{i}", (0, -i * 2.0, H - 0.12), (x1 - x0, 0.16, 0.24), M("Metal"), "Props", 0.5)

    ys = [-1.9, -3.2, -4.5, -5.8, -7.1]
    west = [("spawning-tool", "lamp"), ("runtime-level-editor", None), ("occlusion-culling", "can"),
            ("procedural-asset-generator", None), ("waypoint-pathfinding", "box")]
    for (pid, extra), y in zip(west, ys):
        tool_chest(pid, (x0, y), "E", "Blue" if pid == "waypoint-pathfinding" else "Steel", extra)
    xs = [-3.25, -1.95, -0.65, 0.65, 1.95, 3.25]
    south = [("npc-perception", "Blue", None), ("llm-ai", "Blue", "lamp"), ("modular-combat", "Red", None),
             ("quest-system", "Red", "box"), ("modular-inventory", "Red", None), ("crafting-system", "Red", "can")]
    for (pid, pal, extra), x in zip(south, xs):
        tool_chest(pid, (x, y0), "N", pal, extra)
    east = [("fair-round-system", "Red", None), ("anti-gravity", "Red", "box"), ("event-driven-ui", "Green", "lamp"),
            ("google-accounts", "Green", None), ("achievements-system", "Green", "can")]
    for (pid, pal, extra), y in zip(east, reversed(ys)):
        tool_chest(pid, (x1, y), "W", pal, extra)

    # Banco de trabajo al centro, con tornillo de banco, planos y una caja de herramientas.
    bx, by = 0.0, -4.4
    table("Workbench", (bx, by, 0.9), (2.8, 1.1, 0.9), "Wood")
    box("Workbench_Shelf", (bx, by, 0.22), (2.6, 0.95, 0.04), M("Wood_Dark"), "Props", 0.5)
    box("Workbench_Crate", (bx - 0.7, by, 0.36), (0.6, 0.5, 0.24), M("Crate"), "Props", 0.5)
    box("Vise_Base", (bx + 1.05, by - 0.38, 0.95), (0.22, 0.2, 0.08), M("Steel"), "Props", 0.5)
    box("Vise_Jaw_A", (bx + 1.05, by - 0.45, 1.05), (0.24, 0.05, 0.12), M("Steel"), "Props", 0.5)
    box("Vise_Jaw_B", (bx + 1.05, by - 0.3, 1.05), (0.24, 0.05, 0.12), M("Steel"), "Props", 0.5)
    box("Vise_Screw", (bx + 1.05, by - 0.56, 1.03), (0.03, 0.18, 0.03), M("Metal"), "Props", 0.5)
    box("Blueprints", (bx - 0.3, by + 0.1, 0.91), (1.0, 0.7, 0.01), M("Paper"), "Props", 0.6)
    box("Toolbox", (bx + 0.45, by + 0.25, 1.0), (0.45, 0.22, 0.18), M("Chest_Red"), "Props", 0.5)
    box("Toolbox_Handle", (bx + 0.45, by + 0.25, 1.13), (0.3, 0.03, 0.03), M("Steel"), "Props", 0.5)
    cylinder("Stool_Seat", (bx - 0.9, by - 0.95, 0.62), 0.2, 0.06, M("Wood_Dark"), 8)
    cylinder("Stool_Leg", (bx - 0.9, by - 0.95, 0.3), 0.04, 0.6, M("Metal"), 6)
    collider("Stool", (bx - 0.9, by - 0.95, 0.5), (0.45, 0.45, 1.0))
    # Franjas de seguridad alrededor del banco.
    m, t = 0.45, 0.12
    ex, ey = 1.4 + m, 0.55 + m
    floor_patch("Hazard_N", bx - ex, by + ey - t, bx + ex, by + ey, M("Hazard"), 0.015, uv_scale=0.5)
    floor_patch("Hazard_S", bx - ex, by - ey, bx + ex, by - ey + t, M("Hazard"), 0.015, uv_scale=0.5)
    floor_patch("Hazard_W", bx - ex, by - ey + t, bx - ex + t, by + ey - t, M("Hazard"), 0.015, uv_scale=0.5)
    floor_patch("Hazard_E", bx + ex - t, by - ey + t, bx + ex, by + ey - t, M("Hazard"), 0.015, uv_scale=0.5)

    # Muro norte: casilleros a un lado de la puerta, estante con cajas y bidones al otro.
    for i, x in enumerate([-3.6, -3.05, -2.5]):
        stretched_box(f"Locker_{i}", (x, y1 - 0.27, 0.95), (0.52, 0.46, 1.9), M("Locker"), "Props", "S")
    collider("Lockers", (-3.05, y1 - 0.27, 1.0), (1.7, 0.5, 2.0))
    sx = 2.6
    for i, z in enumerate([0.1, 0.8, 1.5]):
        box(f"Shelf_Board_{i}", (sx, y1 - 0.25, z), (1.6, 0.42, 0.04), M("Metal"), "Props", 0.5)
    for s in (-1, 1):
        box(f"Shelf_Post_{s}", (sx + s * 0.78, y1 - 0.25, 0.9), (0.04, 0.42, 1.8), M("Metal"), "Props", 0.5)
    for i, (dx, z, w) in enumerate([(-0.4, 0.32, 0.6), (0.35, 0.3, 0.5), (-0.2, 1.0, 0.7), (0.5, 0.97, 0.3),
                                    (0.1, 1.68, 0.5)]):
        box(f"Shelf_Crate_{i}", (sx + dx, y1 - 0.25, z), (w, 0.34, w * 0.6), M("Crate"), "Props", 0.5)
    collider("Shelf", (sx, y1 - 0.25, 1.0), (1.7, 0.5, 2.0))
    for i, (x, y) in enumerate([(4.4, -0.55), (3.85, -0.5)]):
        cylinder(f"Drum_{i}", (x, y, 0.45), 0.28, 0.9, M("Chest_Blue" if i else "Chest_Red"), 8)
    collider("Drums", (4.12, -0.52, 0.5), (1.2, 0.65, 1.0))

    door_with_spawn("hall", (0.0, y1), "S")
    spawn("default", (0.0, -1.0), "S")

    fluorescent("Light_Fluor_W", (-3.7, -4.5), H, 5.5, 1.6, "Y")
    fluorescent("Light_Fluor_E", (3.7, -4.5), H, 5.5, 1.6, "Y")
    fluorescent("Light_Fluor_S", (0.0, -6.8), H, 5.0, 1.6, "X")
    fluorescent("Light_Bench", (bx, by), H, 4.5, 1.6, "X")  # pegada al techo: no tapa la CAM_3
    light("Light_Entry", (0.0, -1.2, 2.6), 3.0, (1.0, 0.82, 0.6))

    # Cámaras: la de la entrada, desde la esquina, enseña todo el taller al llegar; cada muro
    # tiene además una cámara frontal (desde el muro de enfrente, con FOV cerrado) para que los
    # cofres y el personaje se vean grandes. Los costados del banco quedan en las zonas laterales
    # (la cámara sur, tan cerca, no los alcanza).
    camera("CAM_1", (4.4, -0.45, 2.95), (-3.4, -5.0, 0.9), 58)    # entrada
    zone("1", -2.6, 2.6, -3.9, y1 + 0.2)
    camera("CAM_2", (4.5, -5.4, 2.7), (-5.0, -3.6, 1.0), 44)      # muro oeste
    zone("2", x0 - 0.2, -1.8, y0 - 0.2, y1 + 0.2)
    camera("CAM_3", (-4.5, -5.4, 2.7), (5.0, -3.6, 1.0), 44)      # muro este
    zone("3", 1.8, x1 + 0.2, y0 - 0.2, y1 + 0.2)
    camera("CAM_4", (0.0, -0.3, 2.75), (0.0, -8.0, 0.9), 52)      # muro sur
    zone("4", -2.2, 2.2, y0 - 0.2, -3.5)


# --------------------------------------------------------------------------------------
# Construcción y exportación
# --------------------------------------------------------------------------------------

ROOMS = {
    "hall": ("hall", build_hall),
    "unreal-wing": ("unreal_wing", build_unreal_wing),
    "unity-wing": ("unity_wing", build_unity_wing),
    "lab": ("lab", build_lab),
    "game-room": ("game_room", build_game_room),
    "save-room": ("save_room", build_save_room),
    "workshop": ("workshop", build_workshop),
}


def export(basename, active_camera="CAM_1"):
    scene.camera = bpy.data.objects[active_camera]
    blend_out = os.path.join(ROOT, "art", "rooms", f"{basename}.blend")
    glb_out = os.path.join(ROOT, "public", "models", "rooms", f"{basename}.glb")
    os.makedirs(os.path.dirname(blend_out), exist_ok=True)
    os.makedirs(os.path.dirname(glb_out), exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=blend_out, compress=True)
    bpy.ops.export_scene.gltf(
        filepath=glb_out,
        export_format="GLB",
        export_yup=True,
        export_apply=True,
        export_cameras=True,
        export_lights=True,
        export_import_convert_lighting_mode="RAW",
        export_extras=True,
        export_animations=False,
        export_materials="EXPORT",
        export_image_format="AUTO",
    )
    tris = sum(len(p.vertices) - 2 for o in scene.objects if o.type == "MESH" and not o.hide_render
               for p in o.data.polygons)
    print(f"OK: {basename} · {tris} triángulos visibles · {glb_out}")


def requested_rooms():
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
    args = [a for a in args if a in ROOMS]
    return args or list(ROOMS)


for room_id in requested_rooms():
    basename, build = ROOMS[room_id]
    new_scene()
    build()
    export(basename)
