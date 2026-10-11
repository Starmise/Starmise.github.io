import { loadRoom } from './loadRoom.js';

/**
 * Gestor de salas: lee rooms.json, carga cada GLB bajo demanda (una sola vez) y lo
 * guarda en caché. Las salas son pequeñas, así que se conservan en memoria; si algún
 * día pesan demasiado, `unload` libera geometrías y texturas.
 */
export class RoomManager {
  constructor(rooms, { baseUrl, resolve, manager }) {
    this.defs = new Map(rooms.map((r) => [r.id, r]));
    this.baseUrl = baseUrl;
    this.resolve = resolve;
    this.manager = manager;
    this.cache = new Map(); // id → Promise<room>
  }

  get(id) {
    return this.defs.get(id);
  }

  isAvailable(id) {
    return !!this.defs.get(id)?.model;
  }

  /** Promesa de la sala cargada (empieza a cargar si no lo estaba). */
  load(id) {
    if (!this.cache.has(id)) {
      const def = this.defs.get(id);
      if (!def?.model) return Promise.reject(new Error(`La sala "${id}" no existe o aún no tiene modelo`));
      const promise = loadRoom(this.baseUrl + def.model, {
        baseUrl: this.baseUrl,
        resolve: this.resolve,
        doorLabel: (roomId) => this.defs.get(roomId)?.name ?? roomId,
        doorAvailable: (roomId) => this.isAvailable(roomId),
        manager: this.manager,
      }).then((room) => {
        room.id = id;
        room.def = def;
        return room;
      });
      promise.catch(() => this.cache.delete(id));
      this.cache.set(id, promise);
    }
    return this.cache.get(id);
  }

  /** Precarga las salas a las que llevan las puertas de `room` (en segundo plano). */
  prefetchNeighbours(room) {
    for (const it of room.interactables) {
      if (it.kind === 'door' && this.isAvailable(it.roomId)) this.load(it.roomId).catch(() => {});
    }
  }

  unload(id) {
    const p = this.cache.get(id);
    if (!p) return;
    this.cache.delete(id);
    p.then((room) => {
      room.root.traverse((o) => {
        o.geometry?.dispose();
        for (const m of [o.material].flat().filter(Boolean)) {
          m.map?.dispose();
          m.dispose();
        }
      });
    });
  }
}
