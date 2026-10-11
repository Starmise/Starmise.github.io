import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { toPs1Material, clonePs1 } from '../render/ps1Material.js';
import { CollisionWorld } from './collision.js';
import { createVideoScreen } from './videoScreen.js';
import { createDoorMarkers } from './doorMarkers.js';
import { thumbUrl } from '../core/assets.js';

/**
 * Carga una sala exportada desde Blender e interpreta la convención de nombres
 * (PLAN.md §6.2):
 *
 *   COL_*            → colisión (se oculta)
 *   CAM_<n>          → cámara fija
 *   TRG_CAM_<n>[_x]  → volumen(es) que activan CAM_<n> (se ocultan)
 *   INT_<id>         → objeto examinable: proyecto de projects.json o documento del perfil
 *                      (about, contact, trivia, demoreel); las mallas con MAT_Cover reciben la
 *                      portada del proyecto (miniatura en baja) o, si es un video, una pantalla animada
 *   DOOR_<roomId>    → puerta hacia otra sala
 *   SPAWN_<roomId>   → punto de aparición al llegar desde esa sala (SPAWN_default al inicio)
 *
 * `resolve(id)` traduce el id de un INT_ a { kind, label, verb?, project?, video?, document() } o null.
 * La sala devuelta tiene `update(dt, playerPosition, target)` para animar sus pantallas y las
 * pistas de las puertas (world/doorMarkers.js).
 * `doorLabel(roomId)` da el nombre visible de la sala de destino de una puerta y
 * `doorAvailable(roomId)` si se puede abrir (las cerradas brillan en rojo).
 */
export async function loadRoom(url, { resolve = () => null, doorLabel = (id) => id, doorAvailable = () => true, baseUrl = './', manager } = {}) {
  const gltf = await new GLTFLoader(manager).loadAsync(url);
  const root = gltf.scene;
  root.updateMatrixWorld(true);

  const room = {
    root,
    cameras: new Map(), // n → PerspectiveCamera
    triggers: [], // { cameraId, mesh, box (local), inverse }
    interactables: [], // { kind, id, label, object, box (world), document?, project?, roomId? }
    spawns: new Map(), // nombre → { position, yaw }
    helpers: [], // COL_/TRG_ para el modo depuración
    doorTexture: null,
    collision: null,
    animated: [], // { texture, update(dt) } — pantallas de video
    doorMarkers: null, // brillo de las puertas (world/doorMarkers.js)
    update(dt, playerPosition = null, target = null) {
      for (const a of this.animated) a.update(dt);
      this.doorMarkers?.update(dt, playerPosition, target);
    },
  };

  const colliders = [];
  const materialCache = new Map();
  const shellCache = new Map();
  const pending = [];

  root.traverse((obj) => {
    const name = obj.name;
    let m;

    if (obj.isCamera && (m = name.match(/^CAM_([A-Za-z0-9]+)$/))) {
      room.cameras.set(m[1], obj);
      return;
    }
    if (obj.isMesh && name.startsWith('COL_')) {
      colliders.push(obj);
      hideAsHelper(obj, 0x3fa7ff, room);
      return;
    }
    // TRG_CAM_<n> o TRG_CAM_<n>_<sufijo> (varios volúmenes para la misma cámara).
    if (obj.isMesh && (m = name.match(/^TRG_CAM_([A-Za-z0-9]+)(?:_\w+)?$/))) {
      obj.geometry.computeBoundingBox();
      room.triggers.push({
        cameraId: m[1],
        mesh: obj,
        box: obj.geometry.boundingBox.clone(),
        inverse: obj.matrixWorld.clone().invert(),
      });
      hideAsHelper(obj, 0xffc83f, room);
      return;
    }
    if ((m = name.match(/^SPAWN_(\w[\w-]*)$/))) {
      const position = new THREE.Vector3().setFromMatrixPosition(obj.matrixWorld);
      // La flecha +Z local de Blender se convierte en +Y local en glTF (Y arriba).
      const dir = new THREE.Vector3(0, 1, 0).transformDirection(obj.matrixWorld);
      room.spawns.set(m[1], { position, yaw: Math.atan2(dir.x, dir.z) });
      return;
    }
    if ((m = name.match(/^DOOR_([a-z0-9-]+)$/))) {
      const roomId = m[1];
      pending.push(() => room.interactables.push({
        kind: 'door',
        id: roomId,
        roomId,
        label: doorLabel(roomId),
        object: obj,
        box: new THREE.Box3().setFromObject(obj),
      }));
    }
    if ((m = name.match(/^INT_([a-z0-9-]+)$/))) {
      const id = m[1];
      const info = resolve(id);
      if (!info) console.warn(`[room] ${name}: "${id}" no es un proyecto ni un documento del perfil`);
      else pending.push(() => room.interactables.push({ ...info, id, object: obj, box: new THREE.Box3().setFromObject(obj) }));
    }

    if (obj.isMesh) {
      // El "cascarón" (piso, muros y techo) se empuja un poco hacia atrás en profundidad: con el
      // vertex snapping, lo que va pegado a él (cuadros, ventanas, alfombras) parpadearía.
      const shell = name.startsWith('Room_Shell');
      obj.material = convertMaterial(obj.material, shell ? shellCache : materialCache, shell);
      if (!room.doorTexture && obj.material.name === 'MAT_Door') room.doorTexture = obj.material.map;
    }
  });
  pending.forEach((fn) => fn());

  // Portadas: cada INT_ con un hijo de material MAT_Cover recibe la portada del proyecto en baja
  // (su miniatura) o, si el documento es un video, una pantalla de TV animada.
  await Promise.all(
    room.interactables.map(async (it) => {
      let tex;
      if (it.video) {
        const { thumbnail, label } = it.video;
        const screen = createVideoScreen({ label, thumbnail: /^https?:/.test(thumbnail) ? thumbnail : baseUrl + thumbnail });
        room.animated.push(screen);
        tex = screen.texture;
      } else if (it.project?.cover) {
        try {
          tex = await loadCoverTexture(baseUrl + thumbUrl(it.project.cover));
        } catch (err) {
          console.warn('[room] no se pudo cargar la portada', it.project.cover, err);
          return;
        }
      } else {
        return;
      }
      it.object.traverse((o) => {
        if (o.isMesh && o.material?.name === 'MAT_Cover') {
          o.material = clonePs1(o.material);
          o.material.map = tex;
          o.material.emissiveMap = tex;
          o.material.needsUpdate = true;
        }
      });
    }),
  );

  room.collision = new CollisionWorld(colliders);
  room.doorMarkers = createDoorMarkers(room, { isAvailable: doorAvailable });
  return room;
}

function hideAsHelper(mesh, color, room) {
  mesh.visible = false;
  mesh.material = new THREE.MeshBasicMaterial({ color, wireframe: true, transparent: true, opacity: 0.6, depthTest: false });
  mesh.renderOrder = 999;
  room.helpers.push(mesh);
}

function convertMaterial(material, cache, pushBack = false) {
  if (Array.isArray(material)) return material.map((m) => convertMaterial(m, cache, pushBack));
  if (!cache.has(material)) {
    const mat = toPs1Material(material);
    if (pushBack) {
      mat.polygonOffset = true;
      mat.polygonOffsetFactor = 4;
      mat.polygonOffsetUnits = 4;
    }
    cache.set(material, mat);
  }
  return cache.get(material);
}

/**
 * Reduce la portada (miniatura de ≤256 px) a 128×96 (contenida, con fondo negro) y la cuantiza a 15 bits,
 * para que parezca una textura de la época sin cargar la imagen en alta.
 */
async function loadCoverTexture(src) {
  const img = new Image();
  img.decoding = 'async';
  img.src = src;
  await img.decode();
  const W = 128;
  const H = 96;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  ctx.imageSmoothingQuality = 'high';
  const scale = Math.min(W / img.naturalWidth, H / img.naturalHeight);
  const w = Math.round(img.naturalWidth * scale);
  const h = Math.round(img.naturalHeight * scale);
  ctx.drawImage(img, Math.round((W - w) / 2), Math.round((H - h) / 2), w, h);
  const data = ctx.getImageData(0, 0, W, H);
  for (let i = 0; i < data.data.length; i += 4) {
    data.data[i] &= 0xf8;
    data.data[i + 1] &= 0xf8;
    data.data[i + 2] &= 0xf8;
  }
  ctx.putImageData(data, 0, 0);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.flipY = false; // las UV vienen de glTF
  return tex;
}
