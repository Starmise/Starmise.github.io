/**
 * Comprueba los presupuestos de la Fase 5 (PLAN.md §4):
 *
 *   - carga inicial < 5 MB  → HTML + CSS + JS (comprimidos con gzip, como los sirve GitHub Pages)
 *                             + sala de inicio + personaje + portadas de esa sala
 *   - < 5 000 triángulos por sala (sin contar COL_* ni TRG_*, que no se dibujan)
 *
 * Uso: `npm run build && npm run budget`. Sale con código 1 si algo se pasa.
 * Los 60 fps se miden en el navegador: F3 en el juego muestra fps, draw calls y triángulos.
 */
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(ROOT, 'public');
const DIST = join(ROOT, 'dist');
const BUDGET = { initialBytes: 5 * 1024 * 1024, roomTriangles: 5000 };

const rooms = readJson('src/data/rooms.json');
const projects = readJson('src/data/projects.json');
const START_ROOM = 'hall'; // igual que en src/game.js

let failed = false;
const kb = (bytes) => `${(bytes / 1024).toFixed(0).padStart(5)} kB`;

// ---------- Salas ----------

console.log('\nSalas (triángulos dibujados · draw calls · peso del GLB + portadas)');
const roomInfo = new Map();
for (const room of rooms) {
  if (!room.model) continue;
  const file = join(PUBLIC, room.model);
  const glb = parseGlb(readFileSync(file));
  const { triangles, drawCalls, interactables } = countScene(glb.json);
  const covers = interactables
    .map((id) => projects.find((p) => p.id === id)?.cover)
    .filter(Boolean)
    .map((cover) => join(PUBLIC, thumbUrl(cover)))
    .filter(existsSync);
  const bytes = statSync(file).size + covers.reduce((sum, f) => sum + statSync(f).size, 0);
  roomInfo.set(room.id, { bytes });
  const ok = triangles <= BUDGET.roomTriangles;
  if (!ok) failed = true;
  console.log(
    `  ${ok ? '✓' : '✗'} ${room.id.padEnd(12)} ${String(triangles).padStart(5)} tris · ${String(drawCalls).padStart(3)} draw calls · ${kb(bytes)}`,
  );
}

const player = join(PUBLIC, 'models/player.glb');
const playerGlb = parseGlb(readFileSync(player));
const playerTris = countScene(playerGlb.json).triangles;
console.log(`    ${'personaje'.padEnd(12)} ${String(playerTris).padStart(5)} tris ·                 ${kb(statSync(player).size)}`);

// ---------- Carga inicial ----------

if (!existsSync(join(DIST, 'index.html'))) {
  console.log('\nFalta dist/: corre `npm run build` para medir la carga inicial.');
  process.exit(failed ? 1 : 0);
}

const html = readFileSync(join(DIST, 'index.html'));
const entryFiles = [...html.toString().matchAll(/(?:src|href)="\.?\/?(assets\/[^"]+)"/g)].map((m) => m[1]);
const assets = readdirSync(join(DIST, 'assets'));
const gameChunk = assets.find((f) => /^game-.*\.js$/.test(f));
const bootChunk = assets.find((f) => /^boot-.*\.js$/.test(f));
const gz = (file) => gzipSync(readFileSync(join(DIST, file))).length;
// Diccionario del idioma (src/i18n/): se descarga uno; se cuenta el más pesado (inglés, que
// trae también la traducción de los datos).
const langChunk = assets
  .filter((f) => /^(es|en)-.*\.js$/.test(f))
  .map((f) => [`assets/${f} (idioma)`, gz(`assets/${f}`)])
  .sort((a, b) => b[1] - a[1])[0];

const lines = [
  ['index.html', gzipSync(html).length],
  ...entryFiles.map((f) => [f, gz(f)]),
  ...(langChunk ? [langChunk] : []),
  ...(bootChunk ? [[`assets/${bootChunk}`, gz(`assets/${bootChunk}`)]] : []),
];
const listOnly = lines.reduce((sum, [, b]) => sum + b, 0);
if (gameChunk) lines.push([`assets/${gameChunk}`, gz(`assets/${gameChunk}`)]);
lines.push([`sala inicial (${START_ROOM}) + portadas`, roomInfo.get(START_ROOM)?.bytes ?? 0]);
lines.push(['models/player.glb', statSync(player).size]);
const initial = lines.reduce((sum, [, b]) => sum + b, 0);
const rest = [...roomInfo].filter(([id]) => id !== START_ROOM).reduce((sum, [, r]) => sum + r.bytes, 0);

console.log('\nCarga inicial (hasta la pantalla de título; JS/CSS/HTML con gzip)');
for (const [name, bytes] of lines) console.log(`    ${kb(bytes)}  ${name}`);
const ok = initial <= BUDGET.initialBytes;
if (!ok) failed = true;
console.log(`  ${ok ? '✓' : '✗'} ${kb(initial)}  TOTAL (presupuesto ${kb(BUDGET.initialBytes).trim()})`);
console.log(`    ${kb(rest)}  resto de salas (se precargan al empezar a jugar)`);
console.log(`    ${kb(listOnly)}  modo lista con #lista (sin contar imágenes, que cargan al verse)`);

console.log(failed ? '\n✗ Hay presupuestos excedidos.\n' : '\n✓ Todo dentro de presupuesto.\n');
process.exit(failed ? 1 : 0);

// ---------- Utilidades ----------

function readJson(path) {
  return JSON.parse(readFileSync(join(ROOT, path), 'utf8'));
}

/** Igual que thumbUrl() de src/core/assets.js. */
function thumbUrl(path) {
  return path.replace(/^(.*?img\/)(?:thumb\/)?([^/]+)\.\w+$/, '$1thumb/$2.webp');
}

function parseGlb(buffer) {
  if (buffer.readUInt32LE(0) !== 0x46546c67) throw new Error('No es un GLB');
  const length = buffer.readUInt32LE(12);
  const json = JSON.parse(buffer.subarray(20, 20 + length).toString('utf8'));
  return { json };
}

/** Triángulos y draw calls de lo que se dibuja (sin COL_/TRG_), y los ids de INT_<id>. */
function countScene(gltf) {
  let triangles = 0;
  let drawCalls = 0;
  const interactables = [];
  const visit = (index) => {
    const node = gltf.nodes[index];
    const name = node.name ?? '';
    if (name.startsWith('COL_') || name.startsWith('TRG_')) return;
    const m = name.match(/^INT_([a-z0-9-]+)$/);
    if (m) interactables.push(m[1]);
    if (node.mesh !== undefined) {
      for (const prim of gltf.meshes[node.mesh].primitives) {
        const accessor = gltf.accessors[prim.indices ?? prim.attributes.POSITION];
        const mode = prim.mode ?? 4;
        if (mode === 4) triangles += accessor.count / 3;
        else if (mode === 5 || mode === 6) triangles += accessor.count - 2;
        drawCalls++;
      }
    }
    for (const child of node.children ?? []) visit(child);
  };
  for (const index of gltf.scenes[gltf.scene ?? 0].nodes) visit(index);
  return { triangles: Math.round(triangles), drawCalls, interactables };
}
