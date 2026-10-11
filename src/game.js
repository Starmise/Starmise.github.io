import * as THREE from 'three';
import { projects, profile, rooms } from './data/index.js';
import { Input } from './core/input.js';
import { settings, setSetting, onSettingsChange } from './core/settings.js';
import { t } from './core/i18n.js';
import { reducedMotion, onReducedMotionChange } from './core/motion.js';
import { PerfMonitor } from './core/perfMonitor.js';
import { caps, listView, openList, closeList } from './shell.js';
import { Ps1Renderer } from './render/ps1Renderer.js';
import { RoomManager } from './world/roomManager.js';
import { CameraDirector } from './world/cameraDirector.js';
import { DoorTransition } from './world/doorTransition.js';
import { Interaction } from './world/interaction.js';
import { loadPlayer } from './player/loadPlayer.js';
import { PlayerController } from './player/playerController.js';
import { UiStack } from './ui/uiStack.js';
import { FileView } from './ui/fileView.js';
import { PauseMenu } from './ui/pauseMenu.js';
import { TitleScreen } from './ui/titleScreen.js';
import { Hud } from './ui/hud.js';
import { TouchControls } from './ui/touchControls.js';
import { SuggestDialog } from './ui/suggestDialog.js';
import { resolveInteractable } from './ui/documents.js';
import { audio } from './audio/audio.js';
import { wireUiSounds } from './audio/uiSounds.js';

// El juego: título, salas, transiciones, interacción y pausa. Lo carga main.js (en su propio
// bloque de JS) salvo en el modo lista. Fase 5: táctil, movimiento reducido, rendimiento.
// Fase 6: audio original (audio/), silencioso hasta la primera interacción.

const BASE = import.meta.env.BASE_URL;
const START_ROOM = 'hall';

// ---------- Infraestructura ----------

const input = new Input();
const stack = new UiStack();
wireUiSounds(stack, audio);
const hud = new Hud();
const touch = new TouchControls(document.getElementById('hud'), input);
const uiRoot = document.getElementById('ui');

const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
document.getElementById('app').appendChild(renderer.domElement);
renderer.info.autoReset = false; // se reinicia a mano: cuenta los dos pasos del render PS1
const ps1 = new Ps1Renderer(renderer, { height: 240 });
ps1.setEnabled(settings.ps1);
ps1.setSnap(!reducedMotion());
onReducedMotionChange((reduced) => ps1.setSnap(!reduced));

const scene = new THREE.Scene();
const fogColor = new THREE.Color(0x050506);
scene.background = fogColor;
scene.fog = new THREE.Fog(fogColor, 5, 15); // cada sala ajusta near/far con `fog` de rooms.json
const ambient = new THREE.HemisphereLight(0x8790a8, 0x1c140e, 0.75); // `ambient` de rooms.json
scene.add(ambient);

const doorLoading = document.getElementById('door-loading');
doorLoading.textContent = t('common.loading');
const transition = new DoorTransition(document.getElementById('fade'), doorLoading);
transition.onCue = (cue) => audio.door(cue);

const manager = new THREE.LoadingManager();
const roomManager = new RoomManager(rooms, {
  baseUrl: BASE,
  manager,
  resolve: (id) => resolveInteractable(id, { projects, profile }),
});

// ---------- UI ----------

const fileView = new FileView(uiRoot, stack, { baseUrl: BASE, onMedia: (on) => audio.setMedia(on) });
const pause = new PauseMenu(uiRoot, stack, {
  fileView,
  projects,
  profile,
  rooms,
  getCurrentRoom: () => world.room?.id,
  onTravel: (id) => {
    stack.clear();
    goToRoom(id, 'default', 'short');
  },
  onTitle: () => {
    state = 'title';
    hud.setVisible(false);
    title.show();
  },
  onList: () => openList(),
});
const title = new TitleScreen(uiRoot, stack, {
  profile,
  onStart: () => {
    state = 'play';
    hud.setVisible(true);
    hud.flash(world.room?.def.name ?? '');
    if (world.room) roomManager.prefetchNeighbours(world.room);
    hintPortrait();
  },
  onList: () => openList(),
});
if (caps.slow) {
  title.setHint(t('game.slowHint', { reasons: caps.reasons.join('; ') }));
}
const suggest = new SuggestDialog(uiRoot, stack);

stack.onChange = (open) => {
  input.setEnabled(!open);
  hud.setPrompt(null);
  touch.setTarget(null);
  audio.setPaused(open && state === 'play'); // en pausa: música apagada y ambiente bajo
};
input.setEnabled(!stack.isOpen); // el título ya está abierto
input.onDeviceChange = (device) => {
  document.documentElement.dataset.input = device;
  hud.setDevice(device);
  pause.setDevice(device);
  title.setDevice(device);
  touch.setDevice(device);
};
input.onDeviceChange(input.lastDevice);

// Modo lista sobre el juego: el juego se pausa (no se dibuja) y la vista entra en la pila de UI
// para poder recorrerla con el mando; Esc / Ⓑ / "Volver al juego" la cierran.
listView.layer.onAction = (action) => {
  if (action === 'back' || action === 'pause') {
    closeList();
    return true;
  }
  return false;
};
listView.layer.sounds = { open: null, close: null }; // el audio se suspende con el modo lista
listView.subscribe((open) => {
  if (open) stack.push(listView.layer);
  else stack.pop(listView.layer);
  audio.setListOpen(open);
});

onSettingsChange((key, value) => {
  if (key === 'mode') world.player?.setMode(value);
  if (key === 'ps1') {
    ps1.setEnabled(value);
    onResize();
  }
});

// ---------- Mundo ----------

const timer = new THREE.Timer();
timer.connect(document); // pausa el delta cuando la pestaña está oculta

let state = 'title'; // 'title' | 'play'
const world = { room: null, director: null, interaction: null, player: null, debug: false, stats: null, ps1, audio };
window.__game = world; // para depurar desde la consola

// Rendimiento: FPS reales durante el juego; si no llega, sugerir el modo lista (una vez).
const perf = new PerfMonitor({ onSlow: suggestListMode });
const stats = (world.stats = { fps: 0, calls: 0, triangles: 0, frames: 0, time: 0 });
let lastTime = null;
let portraitHinted = false;

let shownProgress = 0;
let targetProgress = 0;
manager.onProgress = (_url, loaded, total) => (targetProgress = loaded / Math.max(total, 1));

boot().catch((err) => {
  console.error(err);
  title.setError(t('game.loadError'));
});

async function boot() {
  renderer.setAnimationLoop(loop);
  onResize();
  const [room, playerAsset] = await Promise.all([
    roomManager.load(START_ROOM),
    loadPlayer(`${BASE}models/player.glb`, manager),
  ]);
  world.player = new PlayerController(playerAsset, { input, collision: null });
  world.player.setMode(settings.mode);
  world.player.onFootstep = (running) => audio.footstep(running);
  scene.add(world.player.root);
  enterRoom(room, 'default');
  title.setReady();
}

function doorMode() {
  return reducedMotion() ? 'short' : settings.doorAnim;
}

/** Coloca al jugador en una sala ya cargada. */
function enterRoom(room, fromId) {
  if (world.room) scene.remove(world.room.root);
  world.room = room;
  scene.add(room.root);
  const [near, far] = room.def.fog ?? [5, 15];
  scene.fog.near = near;
  scene.fog.far = far;
  ambient.intensity = room.def.ambient ?? 0.75;
  for (const h of room.helpers) h.visible = world.debug;
  audio.setRoom(room.def); // ambiente, ánimo de la música, suelo y reverberación

  const player = world.player;
  player.collision = room.collision;
  const spawn = room.spawns.get(fromId) ?? room.spawns.get('default') ?? room.spawns.values().next().value
    ?? { position: new THREE.Vector3(), yaw: 0 };
  player.spawn(spawn);

  world.director = new CameraDirector(room);
  world.director.setAspect(window.innerWidth / window.innerHeight);
  world.director.onChange = (_id, cam) => player.setCamera(cam);
  world.director.start(player.position);
  player.snapCamera(world.director.camera);

  world.interaction = new Interaction(room.interactables);
  transition.setDoorTexture(room.doorTexture);
  // Las salas vecinas se precargan ya jugando (no en el título): la carga inicial es solo el Hall.
  if (state === 'play') roomManager.prefetchNeighbours(room);
}

/** Cambio de sala con transición (puerta completa o fundido rápido). */
async function goToRoom(id, fromId, mode = doorMode()) {
  if (transition.busy) return;
  if (!roomManager.isAvailable(id)) {
    audio.door('locked');
    hud.flash(t('game.locked'));
    return;
  }
  world.player.frozen = true;
  hud.setPrompt(null);
  hud.setVisible(false);
  const ready = roomManager.load(id);
  try {
    await transition.play({ ready, mode, input });
    enterRoom(await ready, fromId);
    hud.flash(world.room.def.name);
  } catch (err) {
    console.error(err);
    hud.flash(t('game.doorError'));
  } finally {
    transition.reveal();
    hud.setVisible(state === 'play');
    world.player.frozen = false;
  }
}

function interact(target) {
  if (target.kind === 'door') {
    goToRoom(target.roomId, world.room.id);
    return;
  }
  fileView.open(target.document());
}

// ---------- Bucle ----------

function loop(time) {
  timer.update(time);
  const dt = Math.min(timer.getDelta(), 1 / 20);
  const rawDt = lastTime === null ? 0 : (time - lastTime) / 1000;
  lastTime = time;
  input.poll(time);
  for (const action of input.consumeUi()) if (stack.isOpen) stack.dispatch(action, true);

  // Con el modo lista abierto el juego no se dibuja (solo se lee el mando para navegarla).
  if (listView.isOpen) {
    perf.sample(rawDt, false);
    input.endFrame();
    return;
  }
  renderer.info.reset();

  shownProgress += (targetProgress - shownProgress) * Math.min(1, dt * 8);
  if (!title.ready) title.setProgress(shownProgress);

  transition.update(dt);
  const { player, director, interaction } = world;

  if (player && director) {
    const playing = state === 'play' && !stack.isOpen && !transition.busy;
    if (playing) handleGameActions();
    // En el título el personaje sigue respirando (idle); en pausa todo se congela.
    if (playing || state === 'title' || transition.busy) {
      player.frozen = !playing;
      player.update(dt);
      director.update(player.position);
    }
    const target = playing ? interaction.find(player) : null;
    // Pantallas animadas (siguen encendidas en pausa) y brillo de las puertas según la cercanía.
    world.room.update(dt, state === 'play' ? player.position : null, target);

    hud.setPrompt(target);
    touch.setTarget(target);
    if (target && input.consume('interact')) interact(target);
    perf.sample(rawDt, playing);
  }

  if (transition.active) ps1.render(transition.scene, transition.camera);
  else if (director) ps1.render(scene, director.camera);
  else renderer.clear();

  updateStats(rawDt);
  input.endFrame();
}

/** FPS, draw calls y triángulos (los muestra el modo depuración, F3; y `__game.stats`). */
function updateStats(rawDt) {
  stats.calls = renderer.info.render.calls;
  stats.triangles = renderer.info.render.triangles;
  if (rawDt > 0 && rawDt < 1) {
    stats.frames++;
    stats.time += rawDt;
  }
  if (stats.time >= 0.5) {
    stats.fps = Math.round(stats.frames / stats.time);
    stats.frames = stats.time = 0;
  }
  if (world.debug && world.player && world.director) {
    const p = world.player.position;
    hud.setStatus(
      `${stats.fps} fps · ${stats.calls} draw calls · ${stats.triangles} tris · ` +
        `${world.room.id} · CAM_${world.director.activeId} · x ${p.x.toFixed(2)} z ${p.z.toFixed(2)} · ` +
        `audio ${audio.ctx?.state ?? '—'} ${Number.isFinite(audio.level()) ? Math.round(audio.level()) + ' dB' : ''}`,
    );
  }
}

function suggestListMode(fps) {
  if (!settings.perfHint || listView.isOpen) return;
  const tip = settings.ps1 ? '' : ` ${t('game.slowTip')}`;
  suggest.open({
    title: t('game.slowTitle'),
    text: t('game.slowText', { fps: Math.round(fps) }) + tip,
    confirm: t('game.slowConfirm'),
    cancel: t('game.slowCancel'),
    onConfirm: () => openList(),
    onCancel: () => {
      setSetting('perfHint', false);
      hud.flash(t('game.listStillThere'), 3200);
    },
  });
}

/** En un móvil en vertical, sugerir girarlo (una vez por sesión). */
function hintPortrait() {
  if (portraitHinted || state !== 'play' || input.lastDevice !== 'touch') return;
  if (window.innerWidth >= window.innerHeight) return;
  portraitHinted = true;
  hud.flash(t('game.rotate'), 3500);
}

function handleGameActions() {
  if (input.consume('pause')) pause.open();
  else if (input.consume('map')) pause.open('map');
  else if (input.consume('inventory')) pause.open('inventory');
  if (input.consume('toggleDebug')) {
    world.debug = !world.debug;
    for (const h of world.room.helpers) h.visible = world.debug;
    hud.setStatus('');
    hud.flash(t(world.debug ? 'game.debugOn' : 'game.debugOff'));
  }
}

function onResize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  ps1.setSize(w, h);
  world.director?.setAspect(w / h);
  transition.setAspect(w / h);
  hintPortrait();
}
window.addEventListener('resize', onResize);
