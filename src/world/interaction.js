import * as THREE from 'three';

/** Distancia máxima (m) desde el borde del objeto y ángulo para poder examinarlo. */
const REACH = 0.75;
const MIN_FACING = 0.35; // coseno: ~70° a cada lado
/** En pantalla táctil apuntar con el joystick cuesta más: un poco más de alcance y de ángulo. */
export const TOUCH_ASSIST = { reach: 0.95, minFacing: 0.05 };

/**
 * Elige el objeto INT_ o la puerta DOOR_ con la que el jugador puede interactuar: cerca (respecto a su caja, no a su
 * centro) y más o menos de frente. Devuelve la entrada de `room.interactables` o null.
 */
export class Interaction {
  constructor(interactables) {
    this.items = interactables;
  }

  find(player, { reach = REACH, minFacing = MIN_FACING } = {}) {
    const pos = player.position;
    const fwd = player.forward(_fwd);
    let best = null;
    let bestScore = Infinity;
    for (const it of this.items) {
      it.box.clampPoint(_p.set(pos.x, it.box.min.y, pos.z), _closest);
      _to.subVectors(_closest, pos);
      _to.y = 0;
      const dist = _to.length();
      if (dist > reach) continue;
      const facing = dist < 1e-3 ? 1 : _to.divideScalar(dist).dot(fwd);
      if (facing < minFacing) continue;
      const score = dist - facing * 0.3;
      if (score < bestScore) {
        bestScore = score;
        best = it;
      }
    }
    return best;
  }

  /**
   * Objeto o puerta bajo un punto de la pantalla (tocar la escena). `ray` es un THREE.Ray en
   * coordenadas del mundo. Devuelve { item, distance } (distancia del jugador a su caja) o null.
   */
  pick(ray, player) {
    let best = null;
    let bestT = Infinity;
    for (const it of this.items) {
      const hit = ray.intersectBox(it.box, _hit);
      if (!hit) continue;
      const t = hit.distanceTo(ray.origin);
      if (t < bestT) {
        bestT = t;
        best = it;
      }
    }
    if (!best) return null;
    const pos = player.position;
    best.box.clampPoint(_p.set(pos.x, best.box.min.y, pos.z), _closest);
    _to.subVectors(_closest, pos);
    _to.y = 0;
    return { item: best, distance: _to.length() };
  }
}

const _hit = new THREE.Vector3();

const _fwd = new THREE.Vector3();
const _p = new THREE.Vector3();
const _closest = new THREE.Vector3();
const _to = new THREE.Vector3();
