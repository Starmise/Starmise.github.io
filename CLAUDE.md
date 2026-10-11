# CLAUDE.md — Contexto del proyecto

Portafolio **interactivo en 3D** de **Starmise** (Luis Rosaldo), desarrollador de videojuegos.
La comunicación con el usuario es **en español**. El portafolio es **bilingüe (español / inglés)**:
el español es la fuente de todo el texto y el inglés se añade encima (ver "Idiomas" abajo).

> **Este es el repositorio activo del portafolio.** El repo anterior
> (`Starmise/About-Me-Website`, estética *Persona 5*) queda **solo como referencia de
> lectura**: no se edita ni se hace push ahí. Todo el trabajo nuevo va en este repo.

- **Repo:** https://github.com/Starmise/Starmise.github.io (rama `main`; antes se llamaba
  `Starmise-Interactive-Portfolio` y GitHub redirige el nombre viejo)
- **Sitio:** https://starmise.github.io/ (GitHub Pages con el workflow `.github/workflows/deploy.yml`;
  en Settings → Pages la fuente debe ser **GitHub Actions**)
- **Copia local del usuario (Windows):**
  `C:\Users\Lu1sR\Documents\VisualStudioProjects\Starmise-Interactive-Portfolio`
- **Portafolio original (referencia):** https://github.com/Starmise/About-Me-Website —
  en vivo en https://starmise.github.io/About-Me-Website/

## Flujo de trabajo con Git (importante)

- **El usuario hace los `git push` él mismo.** Claude nunca debe hacer push.
- Claude puede preparar los cambios en la copia local; hacer `git add`/`git commit` solo
  si el usuario lo pide. Por defecto, dejar los cambios sin commitear y sugerir un mensaje
  de commit para que el usuario lo haga.
- Al trabajar en la copia local desde una sesión en la nube, incluso `git status` puede dejar
  `.git/index.lock` si no hay permiso de borrado en la carpeta; si pasa, apartarlo
  (`mv .git/index.lock .git/stale-index-lock`) o pedir permiso de borrado.

## Plan del proyecto → `PLAN.md`

**Leer `PLAN.md` antes de trabajar.** Contiene la visión (portafolio jugable estilo
*survival horror* de PS1), las decisiones, las fases con casillas, el pipeline del personaje
y el diseño técnico. Al terminar tareas, marcar sus casillas y anotar cambios de rumbo en su
"Registro de decisiones".

**Copias en el proyecto de Claude ("Starmise Portfolio").** `PLAN.md` y este `CLAUDE.md`
tienen copia en los documentos del proyecto (`claude/interactive-portfolio-plan.md` y
`claude/interactive-portfolio-context.md`), que es lo que ven las sesiones nuevas aunque no
estén vinculadas a la computadora. **Cada vez que se modifique `PLAN.md` o `CLAUDE.md`,
subir también el contenido completo actualizado a su documento del proyecto**
(`project_write` a la misma ruta). Si difieren, manda la versión del repo.

Resumen de decisiones: tercera persona con cámaras fijas · Three.js vanilla · Vite
(`base: './'`) · salas modeladas en Blender con convención de nombres (`COL_`, `CAM_`,
`TRG_CAM_`, `INT_<id>`, `DOOR_`, `SPAWN_`) · todo el texto sale de `src/data/` ·
GitHub Pages vía Actions (`.github/workflows/deploy.yml`: `npm ci` → `npm run build` → sube `dist/`).
No usar assets, logos, fuentes ni sonidos de Capcom/Resident Evil: solo se evoca el estilo. Tampoco
música u otros sonidos con copyright (p. ej. OST comerciales): todo el audio es original (`src/audio/`).

## Estado actual

Fases 0–6 completadas en código (pendientes del usuario abajo). Hay **seis salas**
(mansión): Hall (vitrina con los 4 destacados, diario con la bio, TV con el DemoReel), Ala Unreal
(cuadros), Ala Unity (escritorios con CRT), Laboratorio (estaciones CRT), Sala de juegos (máquinas
arcade) y Sala de guardado (contacto y curiosidades); cada proyecto es un objeto con su portada. Hay
título con carga, menú de pausa (inventario, mapa, opciones), fichas navegables (con galería y video),
soporte de mando y táctil, **modo lista** (HTML sin 3D; `#lista` en la URL), sugerencia de modo lista en
equipos lentos, movimiento reducido, **audio original** (música continua "Nocturno de la mansión",
ambiente por sala, pasos según el suelo, puertas y menús; todo sintetizado, sin archivos) y meta tags /
Open Graph / favicon. Es **bilingüe**: la primera visita pregunta el idioma (Español / English) y se
recuerda; se cambia desde el título, Opciones o el modo lista, o con `?lang=en|es` en la URL.
**Pendiente (TODO del usuario):** textura final del personaje y
exportar `player.glb` desde Blender con `Idle`/`Walk`/`Run` (PLAN.md §5) — el actual es **provisional**
(solo `Walk`); imágenes finales de los proyectos e imágenes reales para `profile.gallery` (hoy
`GalleryExample*`); comprobar 60 fps con F3 en un portátil medio; probar en Firefox, Safari y un
teléfono real; cambiar en Settings → Pages la fuente a GitHub Actions y hacer push; enlazar el sitio
nuevo desde el portafolio clásico; rehacer `public/og-image.jpg` cuando esté el personaje final.
Siguiente: revisar las salas y el audio con el usuario.

Controles: WASD/flechas o stick mover · Shift/X correr · E/Enter/A examinar y abrir puertas ·
Esc/Tab/Start menú · M/Select mapa · I inventario · Q/E o LB/RB pestañas y fichas · F3 (o `º`)
depuración (colisiones, triggers, fps, draw calls, triángulos). Táctil: joystick en la mitad izquierda
(al borde corre), botón de acción, Mapa y ☰. En la consola del navegador, `__game` expone el estado
(`__game.stats`: fps, draw calls, triángulos).

## Comandos

```bash
npm install      # o npm ci
npm run dev      # servidor local con recarga
npm run build    # genera dist/
npm run preview  # sirve dist/ para probar el build
npm run images   # regenera public/img/*.webp y public/img/thumb/ desde art/img/ (usa sharp)
npm run budget   # tras el build: carga inicial y triángulos/draw calls por sala vs. presupuestos
npm run icons    # regenera los PNG del favicon/manifest desde public/favicon.svg (usa sharp)
blender -b -P art/rooms/build_rooms.py [-- hall lab …]   # regenera las salas (.blend + .glb)
```

## Estructura

```
index.html         Punto de entrada de Vite (HUD + contenedor de UI, iconos y manifest)
vite.config.js     base './', salida en dist/; plugin que inyecta título, descripción, Open Graph y
                   schema.org desde `profile.site`
package.json       three + three-mesh-bvh + vite (+ sharp, solo para npm run images)
scripts/optimize-images.mjs  art/img/* → public/img/<nombre>.webp (≤1280 px) + public/img/thumb/ (≤256 px)
scripts/check-budgets.mjs    npm run budget: presupuestos de la Fase 5
scripts/make-icons.mjs       npm run icons: favicon-32, apple-touch-icon, icon-192/512 desde favicon.svg
.github/workflows/deploy.yml  Deploy a GitHub Pages
public/            Se copia tal cual a dist/
  img/             Imágenes WebP generadas (~1.2 MB); los JSON las referencian como img/<nombre>.webp
  img/thumb/       Miniaturas ≤256 px (texturas de portada en las salas, galerías)
  models/player.glb  Personaje (PROVISIONAL: textura placeholder, solo la caminata "Walk")
  models/rooms/    hall, unreal_wing, unity_wing, lab, game_room, save_room (.glb, de build_rooms.py)
  favicon.svg      Estrella pixel art 16×16 (fuente de los PNG de iconos)
  og-image.jpg     Vista previa de enlaces 1200×630 (captura del título)
  manifest.webmanifest  Nombre, colores e iconos para "añadir a la pantalla de inicio"
src/
  main.js          Entrada: decide el idioma (URL, guardado o pantalla de elección) y carga boot.js
  boot.js          Arranque ligero: #lista o sin WebGL → modo lista; si no, importa game.js
  shell.js         Compartido arranque/juego sin Three.js: capacidades del equipo y modo lista (#lista)
  game.js          El juego y su bucle: título, salas, transiciones, interacción, pausa
  style.css        HUD, título, menú de pausa, fichas "Archivo", táctil y modo lista
  audio/audio.js   Motor de audio (Web Audio): desbloqueo con el primer gesto, buses y volúmenes,
                   pausa/video/modo lista/pestaña oculta, salas (ambiente, ánimo, suelo, reverb)
  audio/music.js   Música original "Nocturno de la mansión" (generada en vivo; ánimos tense/calm)
  audio/ambience.js  Ambientes por sala (hall, gallery, studio, lab, arcade, save)
  audio/sfx.js     Efectos sintetizados: pasos por suelo, puertas, reloj, crujidos, interfaz
  audio/uiSounds.js  Sonidos de menús conectados a la UiStack y a los clics (`data-sfx`)
  audio/dsp.js     Utilidades de síntesis (PRNG, biquad, ruidos, reverberación)
  core/input.js    Teclado + mando (Gamepad API) + táctil: acciones de juego y de menú
  core/settings.js Opciones del jugador (localStorage) con suscripción a cambios (incluye `lang`)
  core/i18n.js     Idioma: t('clave'), carga del diccionario, cambiar idioma (recarga), localizeData()
  core/motion.js   Movimiento reducido (sistema u opción) → clase reduce-motion
  core/capabilities.js  WebGL 2, render por software, poca memoria, ahorro de datos
  core/perfMonitor.js   FPS jugando; avisa si el equipo va lento
  core/assets.js   Rutas de miniaturas (thumbUrl) y de YouTube (miniatura, embed)
  render/ps1Material.js  Vertex snapping + mapeo afín (onBeforeCompile), conversión a Lambert
  render/ps1Renderer.js  Render a 240 px + post-proceso 15 bits con dithering
  world/roomManager.js   rooms.json → carga/caché de salas, precarga de vecinas
  world/loadRoom.js      Carga un GLB de sala e interpreta COL_/CAM_/TRG_CAM_/INT_/DOOR_/SPAWN_ y las portadas
  world/videoScreen.js   Pantalla de TV animada (DemoReel) como CanvasTexture
  world/collision.js     Cápsula contra COL_* con three-mesh-bvh
  world/cameraDirector.js  Cámara activa según TRG_CAM_* (con histéresis)
  world/interaction.js   Qué INT_/DOOR_ está al alcance y de frente
  world/doorTransition.js  Animación de puerta / fundido que oculta la carga
  world/doorMarkers.js   Pistas visuales de las puertas: rendija de luz, charco en el piso, marco que brilla
                         (más al acercarse; late cuando es la que se abriría; rojo si la sala está cerrada)
  player/loadPlayer.js   Carga el GLB del personaje, materiales PS1, quita root motion horizontal
  player/playerController.js  Movimiento (moderno/tanque, analógico), colisión, animación, TUNING
  ui/uiStack.js    Pila de capas de UI y navegación (teclado/mando)
  ui/titleScreen.js  Carga + título + menú principal
  ui/pauseMenu.js  Inventario, mapa y opciones
  ui/fileView.js   Documento "Archivo" (fichas de proyecto y del perfil)
  ui/documents.js  Convierte projects.json/profile.json en documentos; resuelve INT_<id>
  ui/hud.js        Prompt "Examinar/Abrir", ayuda de controles, avisos
  ui/listView.js   Modo lista: todo el portafolio en HTML accesible (sin Three.js)
  ui/touchControls.js  Joystick virtual y botones en pantalla
  ui/suggestDialog.js  Diálogo de dos opciones (sugerir el modo lista)
  ui/languageScreen.js Pantalla bilingüe de elección de idioma (primera visita)
  i18n/es.js, en.js  Textos de la interfaz por idioma (mismas claves); en.js trae también data/en/
  data/
    index.js       Exporta projects/profile/rooms ya en el idioma activo (usar esto, no los JSON)
    projects.json  FUENTE ÚNICA de los proyectos (22, con su sala en `room`)
    profile.json   Bio, estudio, DemoReel, habilidades, "qué hago", curiosidades, galería, contacto
    rooms.json     Salas: nombre, descripción, GLB (null = aún no construida), niebla, luz ambiente y
                   sonido (ambience, floor, reverb, mood)
    en/            Traducción al inglés: solo los textos (projects por id, rooms por id, profile parcial)
    README.md      Esquema de los JSON, de la traducción y scripts de validación
art/character/     Fuentes del personaje (no se publican)
  PSX_Char_Male_Base.fbx            Personaje PS1 (19 huesos, caminata de Mixamo, sin textura)
  PSX_Char_Male_UV_1024.png         Plantilla de UVs para pintar la textura
  PSX_Char_Male_Placeholder_1024.png / _256.png  Textura placeholder (base para pintar encima)
art/img/           Imágenes originales en alta (~33 MB; fuente de npm run images, no se publican)
art/rooms/
  build_rooms.py     Script de Blender que genera las seis salas (.blend + .glb)
  <sala>.blend       Fuentes editables (guardadas con Blender 5.2)
CLAUDE.md          Este archivo
PLAN.md            Plan del proyecto (fases, decisiones, diseño técnico)
```

La estructura objetivo (con `public/`, `art/`, etc.) está en `PLAN.md` §7.

## Notas y trampas conocidas

- Las imágenes de `profile.gallery` (`GalleryExample*`) son marcadores de posición
  heredados del original (aún no se muestran en el juego).
- Imágenes: el original va en `art/img/`, se corre `npm run images` y el JSON usa `img/<nombre>.webp`.
  La miniatura (`img/thumb/<nombre>.webp`) se deriva sola con `thumbUrl()`.
- Para copiar un material de una sala usar `clonePs1()` (render/ps1Material.js), no `.clone()`: Three.js no
  copia `onBeforeCompile` y la copia perdería el snapping y el mapeo afín.
- Con el *vertex snapping*, dos superficies a pocos cm "pelean" en profundidad. Por eso el cascarón de
  cada sala (`Room_Shell*`) se dibuja con *polygon offset*; para objetos pegados entre sí (que no sean
  el cascarón), separarlos ≥3 cm.
- `.gitattributes` normaliza los finales de línea a LF. En el repo original, Windows mostraba
  casi todos los archivos como modificados solo por CRLF/LF; aquí no debería pasar.
- Las sesiones en la nube trabajan en la copia local desde una VM Linux: **no dejar
  `node_modules/` instalado desde ahí** (los binarios nativos de Vite/rolldown serían de Linux
  y `npm run dev` fallaría en Windows). Si se instala para probar, borrarlo al terminar.
- La herramienta para copiar archivos a la copia local rechaza `.github/` (protegido). Truco: copiarlo
  a la raíz (p. ej. `deploy.yml`) y moverlo con la terminal remota (`mv deploy.yml .github/workflows/`).
- Los `.blend` de `art/rooms/` se guardaron con Blender 5.2; si tu Blender es más viejo y no lo abre, corre
  `art/rooms/build_rooms.py` desde tu Blender (pestaña Scripting) para regenerarlos. Ojo: el script
  reconstruye las salas desde cero; si editas un `.blend` a mano, exporta su GLB tú y no regeneres esa sala.
- Para probar en la nube: Blender está disponible como módulo (`pip install bpy`) y el Chromium
  preinstalado sirve con Playwright (`executablePath: '/opt/pw-browsers/chromium'`, flags de swiftshader).
  Google Fonts no carga desde ahí; no es un error del proyecto.
- Tras cambiar `package.json` (p. ej. al añadir `sharp`), correr `npm install` en Windows antes de
  `npm run dev`.
- El modo lista se enlaza directo con `…/#lista` (útil para reclutadores; en inglés:
  `…/?lang=en#lista`). Cualquier texto nuevo del portafolio va en `src/data/` y aparece solo en el
  juego y en el modo lista.
- **Idiomas.** Ningún texto visible se escribe en el código: la interfaz usa `t('clave')` con las claves
  de `src/i18n/es.js` y `en.js` (añadir siempre en los dos), y los datos se importan de
  `src/data/index.js` (no de los JSON directamente). Al cambiar un texto de `src/data/*.json`, actualizar
  su traducción en `src/data/en/` (README de datos). El idioma se elige **antes** de construir la UI y
  cambiarlo recarga la página (vuelve al título): no hay repintado en caliente. Para probar en inglés
  sin la pantalla de elección: `?lang=en` (o `localStorage['starmise.settings'] = '{"lang":"en"}'`).
  En pruebas automáticas, sin `lang` guardado aparece primero la pantalla de idioma (hay que elegir).
- En la nube, Chromium dibuja por software: el título muestra el aviso de "equipo lento" y a los ~10 s
  de juego aparece la sugerencia de modo lista. Para pruebas, guardar
  `localStorage['starmise.settings'] = '{"perfHint":false,"lang":"es"}'` antes de cargar. Como el render es lento y
  el paso de tiempo se limita a 1/20 s, en la nube todo (puertas, pasos) va "a cámara lenta".
- Audio: no hay archivos de sonido; todo se sintetiza (`src/audio/`, PLAN.md §6.5). El contexto de audio
  no existe hasta el primer gesto, así que en pruebas automáticas hay que pulsar una tecla o tocar antes
  de esperar sonido. `__game.audio.state` resume su estado; para escuchar la música fuera del juego se
  renderiza con un `OfflineAudioContext`. Para cambiar el ambiente o el suelo de una sala basta con
  `rooms.json`.
- `public/og-image.jpg` es una captura de la pantalla de título a 1200×630 (Playwright con las fuentes
  reales; el texto de "Pulsa Enter" se cambió por "Portafolio interactivo · Game Developer"). Rehacerla
  cuando cambie el personaje o el Hall. Las URL de Open Graph son absolutas (`profile.site.url`).
