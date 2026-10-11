import * as THREE from 'three';
import { applyPs1, clonePs1 } from '../render/ps1Material.js';
import { reducedMotion } from '../core/motion.js';

/**
 * Pistas visuales de las puertas (DOOR_<roomId>), añadidas en código para todas las salas sin
 * tocar los GLB:
 *
 * - Rendija de luz: una línea cálida bajo la hoja y un charco de luz en el piso delante de ella,
 *   como si la sala de al lado estuviera iluminada. Se ve de lejos y encaja con la ambientación.
 * - Marco iluminado: el marco (DOORFRAME_*) y el picaporte reciben un brillo cálido que dibuja
 *   el contorno de la puerta contra el muro oscuro.
 * - Cercanía: al acercarse todo se intensifica, y cuando la puerta es la que se abriría (el
 *   prompt "Abrir"), late suavemente. Con movimiento reducido no late: solo sube de intensidad.
 *
 * Las puertas cerradas (salas sin modelo) usan una luz roja tenue y sin charco en el piso.
 *
 *   const markers = createDoorMarkers(room, { isAvailable });
 *   markers.update(dt, playerPosition, target);   // cada fotograma
 */
const OPEN = new THREE.Color(0xffb45a);
const LOCKED = new THREE.Color(0x8a1a1a);

// Distancias (m) para la cercanía: a partir de FAR empieza a subir, en NEAR está al máximo.
const FAR = 4.5;
const NEAR = 1.2;

// Intensidades [lejos, cerca, objetivo]: marco (emisivo), rendija, charco en el piso.
const FRAME = [0.32, 0.55, 0.9];
const SLIT = [0.75, 0.95, 1.0];
const POOL = [0.42, 0.62, 0.85];

export function createDoorMarkers(room, { isAvailable = () => true } = {}) {
  const doors = room.interactables.filter((it) => it.kind === 'door');
  if (!doors.length) return { update() {} };

  const roomCenter = new THREE.Box3().setFromObject(room.root).getCenter(new THREE.Vector3());
  const poolTexture = makeGlowTexture();
  const markers = doors.map((door) => buildMarker(door, room.root, roomCenter, poolTexture, isAvailable(door.roomId)));
  let time = 0;

  return {
    markers,
    update(dt, playerPos, target) {
      time += dt;
      const pulse = reducedMotion() ? 1 : 0.82 + 0.18 * Math.sin(time * 4.2);
      for (const m of markers) {
        // 0 = lejos, 1 = cerca; el objetivo de interacción va aparte.
        const d = playerPos ? m.door.box.distanceToPoint(_p.set(playerPos.x, m.door.box.min.y, playerPos.z)) : Infinity;
        const near = THREE.MathUtils.clamp((FAR - d) / (FAR - NEAR), 0, 1);
        const goal = m.door === target ? 1 : 0;
        // Suavizado para que no salte al entrar o salir del alcance.
        m.near += (near - m.near) * Math.min(1, dt * 6);
        m.focus += (goal - m.focus) * Math.min(1, dt * 8);
        m.apply(m.near, m.focus, m.focus > 0.01 ? pulse : 1);
      }
    },
  };
}

function buildMarker(door, root, roomCenter, poolTexture, available) {
  const color = available ? OPEN : LOCKED;
  const box = door.box;
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());

  // La hoja es fina en un eje horizontal; "hacia dentro" es hacia el centro de la sala.
  const alongX = size.x < size.z; // la puerta mira a ±X (está en un muro este/oeste)
  const inward = alongX
    ? new THREE.Vector3(Math.sign(roomCenter.x - center.x) || 1, 0, 0)
    : new THREE.Vector3(0, 0, Math.sign(roomCenter.z - center.z) || 1);
  const width = alongX ? size.z : size.x;
  const depth = alongX ? size.x : size.z;
  const yaw = Math.atan2(inward.x, inward.z);

  const group = new THREE.Group();
  group.name = `DoorMarker_${door.roomId}`;
  group.position.set(center.x, box.min.y, center.z);
  group.rotation.y = yaw; // +Z local = hacia el interior de la sala
  root.add(group);

  // Rendija: una línea de luz al pie de la hoja (el marco ocupa ~0.12 m a cada lado).
  const slitMat = applyPs1(new THREE.MeshBasicMaterial({ color: color.clone(), fog: true }));
  const slit = new THREE.Mesh(new THREE.BoxGeometry(Math.max(0.4, width - 0.36), 0.035, 0.02), slitMat);
  // Pegada a la cara de la hoja (0.08 m de grosor en build_rooms.py; el marco sobresale más).
  slit.position.set(0, 0.03, Math.min(depth / 2, 0.04) + 0.012);
  slit.name = 'DoorMarker_Slit';
  group.add(slit);

  // Charco de luz en el piso delante de la puerta (aditivo, sin escribir profundidad).
  let poolMat = null;
  if (available) {
    poolMat = applyPs1(new THREE.MeshBasicMaterial({
      map: poolTexture,
      color: color.clone(),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: true,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
    }));
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(width + 0.5, 1.5), poolMat);
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(0, 0.015, depth / 2 + 0.6);
    pool.name = 'DoorMarker_Pool';
    pool.renderOrder = 2;
    group.add(pool);
  }

  // Marco y picaporte: una copia de su material por puerta, con brillo propio.
  const glowMats = [];
  door.object.traverse((o) => {
    if (!o.isMesh || !/^DOOR(FRAME|KNOB)_/.test(o.name)) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    const copies = mats.map((mat) => {
      const copy = clonePs1(mat);
      copy.emissive = color.clone();
      copy.emissiveIntensity = FRAME[0];
      glowMats.push({ mat: copy, knob: o.name.startsWith('DOORKNOB_') });
      return copy;
    });
    o.material = Array.isArray(o.material) ? copies : copies[0];
  });

  const base = color.clone();
  const marker = {
    door,
    group,
    near: 0,
    focus: 0,
    apply(near, focus, pulse) {
      const k = (arr) => lerp3(arr, near, focus);
      const dim = available ? 1 : 0.6;
      for (const { mat, knob } of glowMats) mat.emissiveIntensity = k(FRAME) * pulse * dim * (knob ? 1.4 : 1);
      slitMat.color.copy(base).multiplyScalar(k(SLIT) * pulse * dim);
      if (poolMat) poolMat.color.copy(base).multiplyScalar(k(POOL) * pulse);
    },
  };
  marker.apply(0, 0, 1);
  return marker;
}

/** [lejos, cerca, objetivo] → valor según cercanía (0..1) y foco (0..1). */
function lerp3([far, near, focus], n, f) {
  const v = far + (near - far) * n;
  return v + (focus - v) * f;
}

/**
 * Degradado radial en escalones (sin suavizado, como una textura de la época), más ancho que
 * profundo: la luz sale de la rendija y se abre en el piso. El borde cercano a la puerta es el
 * más brillante.
 */
function makeGlowTexture() {
  const W = 32;
  const H = 32;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(W, H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      // v = 0 junto a la puerta, 1 lejos de ella (la UV v de PlaneGeometry crece hacia +Y local,
      // que tras tumbar el plano apunta hacia la puerta: por eso se invierte).
      const u = (x + 0.5) / W - 0.5;
      const v = 1 - (y + 0.5) / H;
      const r = Math.hypot(u * 1.6, v * 0.95);
      const a = Math.max(0, 1 - r) ** 1.6;
      const level = Math.round(a * 6) / 6; // 6 escalones
      const i = (y * W + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.round(level * 255);
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  return tex;
}

const _p = new THREE.Vector3();
