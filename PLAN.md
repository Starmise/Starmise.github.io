# PLAN.md — Portafolio interactivo estilo survival horror de PS1

> Documento vivo. Cada sesión que avance el proyecto debe **marcar las casillas** de las
> tareas terminadas y anotar en "Registro de decisiones" cualquier cambio de rumbo.
> El contexto general (repo, flujo de Git, etc.) está en `CLAUDE.md`.

## 1. Visión

Un portafolio que se juega como un *survival horror* clásico de PlayStation 1 (cámaras
fijas, personaje en tercera persona, gráficos low-poly con *jitter* y texturas pixeladas).
El visitante explora una mansión/edificio donde **cada sala agrupa proyectos** y cada
proyecto es un objeto que se puede **examinar** para leer su "archivo" (ficha).

Debe funcionar en navegador, cargar rápido y **no castigar a quien tiene prisa**: siempre
hay un mapa / modo lista para llegar a cualquier proyecto en dos clics, y un enlace a la
versión clásica (`https://starmise.github.io/About-Me-Website/`).

**Regla de PI:** se evoca el *estilo* de la época, pero **no** se usan assets, logos,
tipografías, sonidos, música ni nombres de Capcom/Resident Evil. Todo es original o con
licencia libre.

## 2. Decisiones tomadas

| Tema | Decisión |
|------|----------|
| Perspectiva | Tercera persona con **cámaras fijas** por zonas (no primera persona). |
| Motor | **Three.js** en JavaScript vanilla (módulos ES), sin React. |
| Bundler | **Vite** (propuesto; mejor manejo de modelos/estáticos que Parcel). Configurar `base: './'`. |
| Personaje | Basemesh PSX masculino (`PSX_Char_Male_Base.fbx`) con animaciones de Mixamo, exportado a **GLB**. |
| Diseño de niveles | Salas modeladas en **Blender** y exportadas como GLB, con objetos marcados por **convención de nombres** (ver §6). |
| Datos | Todo el texto sale de `src/data/projects.json` y `profile.json`; nada escrito a mano en la escena. |
| Controles | Por defecto **relativos a cámara** (modernos); **tank controls** como opción "Modo clásico". |
| Hosting | GitHub Pages vía GitHub Actions. Repo renombrado a `Starmise.github.io` → https://starmise.github.io/. El usuario hace los push. |
| Audio | **Original y sintetizado en el navegador** (Web Audio): música, ambientes y efectos sin archivos de sonido. Nada de OST comerciales. |
| Idiomas | **Español e inglés.** La primera visita pregunta; se recuerda y se cambia desde el título, Opciones o el modo lista (`?lang=en|es` en la URL lo fuerza). El español es la fuente; el inglés solo añade traducciones. |

## 3. Experiencia y mapeo del portafolio

| Mecánica | Contenido |
|----------|-----------|
| Pantalla de título | "Starmise" + *Press Start*. Opciones: Empezar, Modo lista, Versión clásica, Controles. |
| Hall principal | Bio (`profile.about`), DemoReel en una TV, vitrina con los 4 proyectos `featured`, puertas a las alas. |
| Salas | Una por categoría (ver tabla abajo). |
| Objeto examinable | Un proyecto: pedestal, cuadro, cartucho, TV… Prompt "Examinar". |
| **Archivo / File** | Ficha del proyecto: portada, `tagline`, `description`, `process`, `role`, `tags`, botón a `externalLink`. |
| Puertas | Transición con animación de puerta abriéndose, que **también oculta la carga** de la sala siguiente. |
| Inventario (pausa) | Habilidades (`profile.skills`) y "Qué hago" (`profile.whatIDo`). |
| Mapa (pausa) | Lista de salas → proyectos; teletransporta o abre la ficha directamente. |
| Save room / máquina de escribir | Contacto (`profile.contact`) y curiosidades. |

### Distribución propuesta de salas (ajustable)

| Sala | Proyectos (`id`) |
|------|------------------|
| **Hall principal** (vitrina de destacados) | `persona-error`★, `catharsis`★, `kerberos-engine`★, `death-of-will`★ (solo acceso rápido; viven en su sala) |
| **Ala Unreal** | `death-of-will`★, `epic-lucio-prototype`, `epic-lucio-mvp`, `3d-visualizer`, `vessels` |
| **Ala Unity** | `lucio-kart`, `off-the-hook`, `deadlock-escape`, `ar-foundation-vuforia`, `kiwi-procedural-agents`, `pcg-enemies` |
| **Laboratorio** (motores y gráficos C++) | `kerberos-engine`★, `custom-2d-rendering-framework`, `solar-system-simulation` |
| **Sala de juegos** (game jams y prototipos) | `persona-error`★, `pops-and-barks`, `memeception`, `cosmic-fang`, `lucio-galaxy`, `raboom`, `lucio-clicker-simulator`, `catharsis`★ |
| **Save room** | Contacto y curiosidades |

Se implementará añadiendo un campo `room` a cada proyecto en `projects.json` y un
`src/data/rooms.json` con los metadatos de cada sala (nombre, archivo GLB, música, puertas).

## 4. Fases y tareas

### Fase 0 — Preparación ✅
- [x] Migrar `projects.json`, `profile.json` e imágenes desde `About-Me-Website`.
- [x] `CLAUDE.md`, `.gitignore`, `.gitattributes`.
- [x] Añadir el modelo del personaje (ahora en `art/character/`).
- [x] Generar plantilla de UVs para pintar la textura del personaje.

### Fase 1 — Base del proyecto
- [x] `package.json` con Vite + Three.js; `npm run dev` / `npm run build` funcionando.
- [x] Reorganizar carpetas según §7 (mover `src/img` → `public/img`, el FBX y fuentes → `art/character/`).
- [x] Workflow `.github/workflows/deploy.yml` (adaptado del original, con Vite y `dist/`). *(No llegó a
      subirse al repo; se rehízo en la Fase 6.)*
- [ ] **Personaje (TODO):** textura pintada + exportado a `public/models/player.glb` (ver §5).
  - [x] Provisional: `player.glb` convertido del FBX (escala 0.01, clip renombrado a `Walk`) con
        `art/character/PSX_Char_Male_Placeholder_256.png`, pintada a partir de la foto de referencia
        (chaqueta acolchada negra con franjas roja y crema, pantalón negro, tenis blancos).
- [x] Escena mínima: cargar `player.glb`, reproducir la caminata y verla en el navegador.

### Fase 2 — Prototipo vertical (una sala) ← hito para validar la sensación
- [x] Pipeline de render PS1 (§6.1): render a baja resolución, *vertex snapping*, texturas sin filtrado, mapeo afín, dithering, niebla. Toggle con `P`.
- [x] Controlador del personaje: idle/caminar/correr, controles relativos a cámara + modo tanque (`C`; giro rápido con atrás + Shift).
  - Mientras no existan `Idle` y `Run` en el GLB, se improvisan con `Walk` (pose de paso congelada / caminata acelerada).
- [x] Colisiones contra la geometría `COL_*` de la sala (cápsula + `three-mesh-bvh`).
- [x] 3 cámaras fijas que cambian con volúmenes `TRG_CAM_*` (con histéresis por solapamiento).
- [x] Objetos `INT_<id>` que abren la ficha del proyecto real desde `projects.json` (los 4 destacados).
- [x] Sala de prueba hecha en Blender (cajas texturizadas): `art/rooms/build_test_room.py` → `test_room.blend` + `public/models/rooms/test_room.glb` (reemplazados en la Fase 4 por `build_rooms.py`).
- [x] **Revisión con el usuario:** aprobada el 2026-10-09 (se pasó a la Fase 3 sin ajustes).

### Fase 3 — Sistemas
- [x] Puertas `DOOR_<sala>` + transición con animación de puerta y precarga (se puede saltar al terminar de cargar; versión "rápida" en Opciones).
- [x] Gestor de salas (carga/caché de GLB, precarga de salas vecinas, spawn points `SPAWN_*`).
- [x] Menú de pausa: inventario (habilidades + archivos personales), mapa (salas → proyectos; abre fichas o viaja), opciones (controles, volumen, efectos PS1, animación de puertas).
- [x] UI de "Archivo" final (HTML sobre el canvas), con navegación por teclado y mando; pasa a la ficha anterior/siguiente con Q/E o LB/RB.
- [x] Pantalla de título y pantalla de carga.
- [x] Soporte de mando (Gamepad API).
- Segunda sala de prueba (`save-room`) con la máquina de escribir (contacto) y la libreta (curiosidades); libro con la bio en el hall.

### Fase 4 — Contenido
- [x] Añadir `room` a `projects.json` y crear `rooms.json` (adelantado en la Fase 3).
- [x] Modelar y texturizar: Hall, Ala Unreal, Ala Unity, Laboratorio, Sala de juegos, Save room
      (`art/rooms/build_rooms.py` → `art/rooms/<sala>.blend` + `public/models/rooms/<sala>.glb`).
- [x] Representación de cada proyecto en su sala (objeto + textura con su portada en baja resolución):
      pedestales (vitrina del Hall), cuadros (Ala Unreal), computadoras CRT (Ala Unity y Laboratorio),
      máquinas arcade (Sala de juegos).
- [x] TV con DemoReel en el Hall (`INT_demoreel`: pantalla animada → ficha con el video de YouTube,
      que solo se incrusta al pulsar "Reproducir").
- [x] Generar versiones optimizadas de imágenes (`npm run images`: WebP ≤1280 px para fichas y
      miniaturas ≤256 px para texturas; los originales pasan a `art/img/`). 33 MB → 1.2 MB.
- [ ] **(TODO del usuario)** Cambiar las portadas de los proyectos por las finales: copiar las nuevas
      a `art/img/` (mismo nombre, o actualizar `cover` en `projects.json`) y correr `npm run images`.
      El juego y el modo lista las toman solas.
- [ ] **(TODO del usuario)** Reemplazar las imágenes de galería de muestra (`GalleryExample*`):
      copiar las reales a `art/img/`, correr `npm run images` y actualizar `profile.gallery`.
      (Aún no se muestran en ninguna parte del juego.)
- [ ] Revisión con el usuario: recorrer las seis salas y ajustar cámaras, luces y distribución.

### Fase 5 — Accesibilidad, móvil y rendimiento
- [x] **Modo lista**: vista HTML accesible con todos los proyectos (misma app, mismos datos).
      `src/ui/listView.js`; se abre desde el título (también durante la carga), el mapa, Opciones o
      con `#lista` en la URL (sin descargar el juego). Sin WebGL 2 se abre sola con un aviso.
- [x] Controles táctiles: joystick virtual + botón de interacción (`src/ui/touchControls.js`).
      No se hizo "clic para caminar": el joystick cubre lo mismo sin pathfinding.
- [x] Detección de equipo lento → sugerir modo lista (`src/core/capabilities.js` al arrancar y
      `src/core/perfMonitor.js` midiendo FPS mientras se juega).
- [x] `prefers-reduced-motion`: desactivar *jitter*/temblores de cámara (`src/core/motion.js`, opción
      "Movimiento" en Opciones).
- [ ] Presupuestos: carga inicial < 5 MB, < 5k triángulos por sala, 60 fps en un portátil medio.
  - [x] Carga inicial: **767 kB** (antes 2.1 MB) · modo lista directo: 18 kB + imágenes al verse.
  - [x] Triángulos: máx. **2 664** (Hall); el resto 600–1 900. Se comprueba con `npm run budget`.
  - [ ] **60 fps (TODO del usuario):** jugar en un portátil medio con F3 (muestra fps, draw calls y
        triángulos). En la nube solo hay render por software (~9 fps), que no sirve para medir.

### Fase 6 — Pulido y lanzamiento
- [x] Audio: ambiente por sala, sonidos de puerta/pasos/menú, silenciado hasta la primera interacción
      (`src/audio/`, ver §6.5). Música original "Nocturno de la mansión", continua en toda la mansión y
      más calmada en la Sala de guardado. Opciones: Sonido (sí/no, también en el título), volumen
      general, música y efectos.
- [x] Meta tags / Open Graph / favicon: `profile.site` → `<title>`, descripción, Open Graph, tarjeta de
      Twitter y schema.org (`Person`) con un plugin en `vite.config.js`; `public/og-image.jpg` (1200×630);
      favicon pixel art (`public/favicon.svg` + PNG con `npm run icons`) y `manifest.webmanifest`.
- [ ] Probar en Chrome, Firefox, Safari y móvil.
  - [x] Chromium (escritorio) y emulación de Pixel 7 / iPhone 13 con Playwright: título, audio (gesto,
        pestaña oculta, modo lista, video), puertas, pasos, táctil, `#lista` sin descargar el juego.
  - [ ] **(TODO del usuario)** Firefox, Safari (macOS o iPhone) y un teléfono real: en la nube solo hay
        Chromium. Revisar sobre todo que el audio arranque al primer toque en iPhone (con el interruptor
        de silencio apagado: iOS silencia el audio web con él).
- [ ] Publicar.
  - [x] Repo renombrado a `Starmise.github.io` (lo hizo el usuario) → el sitio vive en https://starmise.github.io/.
  - [x] `.github/workflows/deploy.yml`: `npm ci` → `npm run build` → GitHub Pages (acciones con Node 24).
  - [ ] **(TODO del usuario)** Settings → Pages → Build and deployment → Source: **GitHub Actions** (hoy
        publica la rama tal cual, que sirve el código sin compilar). Luego push a `main`.
- [x] **Puertas más visibles** (`src/world/doorMarkers.js`): luz que se cuela por debajo, charco de luz
      en el piso y marco con brillo cálido; se intensifican al acercarse y laten cuando son el objetivo
      de "Abrir". Hecho en código, sin regenerar las salas.
- [x] **Idiomas (español / inglés):** pantalla de elección en la primera visita, interfaz y datos
      traducidos, cambio desde el título, Opciones y modo lista, `?lang=` en la URL (ver §6.6).
  - [ ] **(TODO del usuario)** Revisar la traducción al inglés de `src/data/en/` (bio, proyectos y
        curiosidades) y ajustar el tono a tu gusto.
- [ ] **(TODO del usuario)** Enlazar la nueva versión desde el portafolio clásico (`About-Me-Website`, que
      Claude no edita): un botón o aviso hacia https://starmise.github.io/.

## 5. Pipeline del personaje

### Estado actual del modelo (`PSX_Char_Male_Base.fbx`, analizado el 2026-10-08)

- 283 vértices, 302 polígonos (mezcla de quads y tris), 1 malla, **UVs limpias** (1 isla por pieza, ocupan todo el espacio 0–1).
- Material `M_Char` **sin textura asignada**.
- Esqueleto de **19 huesos con nombres estilo Unreal** (`pelvis`, `spine_01`, `upper_arm_l`…), **no** `mixamorig:*`.
- Una animación (`mixamo.com`) de ~1.03 s (ciclo de caminata). Solo el nodo `Root` tiene traslación, con poco recorrido → parece *in place*; verificar en Blender. En código se ignorará la traslación horizontal del root.

### Pasos

1. **Textura.** Pintar sobre `art/character/PSX_Char_Male_UV_1024.png` (capa nueva encima de la
   plantilla). `PSX_Char_Male_Placeholder_1024.png` sirve como capa base ya alineada a las UVs. Exportar la final y reducir a **128×128 o 256×256** con
   *nearest neighbor*. Opcional, para mayor autenticidad: reducir a ≤ 256 colores. Guardar
   como `PSX_Char_Male_Diffuse.png`.
2. **Blender.** Importar el FBX → en `M_Char`, nodo *Image Texture* con la textura e
   **Interpolation = Closest** → conectar a *Base Color* (Roughness 1, Metallic 0).
3. **Más animaciones** (idle, correr, girar, examinar). ⚠️ Como el esqueleto actual **no** es de
   Mixamo, las animaciones nuevas de Mixamo no encajarán directamente. Opciones:
   - **(Recomendado)** Subir el personaje (FBX o la malla sola) a Mixamo para que lo re-riguee
     con su propio esqueleto y descargar *todas* las animaciones desde ahí (la primera "With
     Skin", el resto "Without Skin", todas *In Place*). Se pierde el rig actual, pero todo queda consistente.
   - Retargetear las animaciones de Mixamo al esqueleto actual en Blender (más trabajo).
4. Juntar todas las animaciones como *Actions* (NLA) con nombres claros: `Idle`, `Walk`, `Run`, `TurnL`, `TurnR`, `Examine`.
5. **Exportar** glTF Binary (`.glb`) con animaciones, `+Y Up`, transformaciones aplicadas,
   escala tal que el personaje mida ~1.75 unidades (1 unidad = 1 m) → `public/models/player.glb`.
6. Guardar el `.blend` en `art/character/` (fuente, no se publica).

## 6. Diseño técnico

### 6.1 Render PS1
- Renderizar la escena a un `WebGLRenderTarget` de **320×240** (o ancho variable a 240 px de alto) y escalarlo a pantalla con `NearestFilter`.
- **Vertex snapping:** en el vertex shader (vía `onBeforeCompile`), redondear la posición en *clip space* a la rejilla de la resolución interna.
- **Mapeo afín:** GLSL ES 3.0 no tiene `noperspective`; multiplicar las UV por `w` en el vertex shader y dividir en el fragment.
- Texturas con `NearestFilter`, sin mipmaps, 64–256 px.
- Post-proceso: reducción a color de 15 bits + **dithering** 4×4 (Bayer).
- Niebla lineal oscura para ocultar distancia; iluminación sencilla (Lambert/vertex colors horneados en Blender).
- Toggle en opciones para apagar los efectos.

### 6.2 Salas y convención de nombres en Blender
| Prefijo | Uso |
|---------|-----|
| `COL_*` | Colisión (invisible en el juego). |
| `CAM_<n>` | Cámara fija (posición, rotación, FOV). `<n>` solo letras/números. |
| `TRG_CAM_<n>` | Volumen que activa la cámara `<n>` cuando el jugador entra. Varios volúmenes para la misma cámara: `TRG_CAM_<n>_<sufijo>`. Solapar ~0.4 m con los vecinos (histéresis). |
| `INT_<id>` | Objeto examinable ligado a un proyecto, o a un documento del perfil: `about`, `contact`, `trivia`. Un hijo con el material `MAT_Cover` recibe la portada (reducida a 128×96 en el navegador). |
| `DOOR_<roomId>` | Puerta hacia otra sala. |
| `SPAWN_<fromRoomId>` | Punto de aparición al entrar desde esa sala (Empty; su flecha +Z indica hacia dónde mira). `SPAWN_default` para el inicio. |
| `DOORFRAME_*`, `DOORKNOB_*` | Marco y picaporte (hijos de `DOOR_`). El juego les da un brillo cálido para que la puerta se distinga (world/doorMarkers.js). |
| `Room_Shell*` | Piso, muros y techo. El juego los dibuja con *polygon offset* (un poco "detrás") para que lo pegado a ellos —cuadros, ventanas, alfombras— no parpadee con el *vertex snapping*. |

`INT_<id>` también acepta los documentos del perfil `about`, `contact`, `trivia` y `demoreel` (este
último convierte su `MAT_Cover` en una pantalla de TV animada). Cada sala de `rooms.json` define su
niebla (`fog: [cerca, lejos]`) y la intensidad de la luz ambiente (`ambient`).

Las luces puntuales de Blender se exportan con la sala (modo de iluminación **RAW**: la potencia en W
es directamente la intensidad en Three.js). Exportar con: GLB, +Y Up, Cameras y Punctual Lights activados.

### 6.3 Jugador
- Animación con `AnimationMixer` y *crossfade* entre `Idle`/`Walk`/`Run`.
- Colisión: cápsula contra `COL_*` usando `three-mesh-bvh` (o AABBs si basta).
- Al cambiar de cámara, mantener la dirección de input hasta soltar la tecla (evita el "giro brusco" típico de cámaras fijas).

### 6.3b Salas actuales (Fase 4)
Todas se generan con `art/rooms/build_rooms.py` (texturas procedurales de 64×64 a 15 bits).

| Sala | GLB | Contenido | Puerta al Hall |
|------|-----|-----------|----------------|
| Hall principal | `hall.glb` | 12×10 m: vitrina con los 4 destacados, escalera y vitral, diario (bio), TV (DemoReel), 4 cámaras | — |
| Ala Unreal | `unreal_wing.glb` | Galería 5×14 m con 5 cuadros (Death of Will al fondo) | muro N del Hall |
| Ala Unity | `unity_wing.glb` | Estudio 9×9 m, 6 escritorios con CRT, libreros | muro N del Hall |
| Laboratorio | `lab.glb` | 8×7 m, 3 estaciones CRT, servidores, planetario, pizarrón | muro O del Hall |
| Sala de juegos | `game_room.glb` | 10×8 m, 8 máquinas arcade, billar, estrella de neón | muro E del Hall |
| Sala de guardado | `save_room.glb` | 5×4 m, máquina de escribir (contacto) y libreta (curiosidades) | muro S del Hall |

Presupuesto: 600–2 700 triángulos por sala (35–137 draw calls); GLB de 150–400 kB. `npm run budget` lo
comprueba (y la carga inicial).

### 6.3c Arranque, modo lista y móvil (Fase 5)
- `src/main.js` es un arranque ligero (~13 kB con gzip, incluye los JSON): con `#lista` o sin WebGL 2
  abre el modo lista; si no, importa `src/game.js` (Three.js y todo el juego, ~190 kB con gzip).
  `src/shell.js` comparte entre ambos las capacidades del equipo y el modo lista.
- Modo lista: página HTML normal sobre el juego (el resto queda `inert`, el juego deja de dibujarse).
  Abrirlo desde el juego añade `#lista` al historial: "atrás" vuelve al juego. Con el mando se recorre
  como cualquier capa de la `UiStack`; con teclado las flechas desplazan la página (`nativeKeys`).
- Equipo lento: al arrancar se mira si hay WebGL 2, render por software, ≤ 2 GB de memoria o ≤ 2
  núcleos, o ahorro de datos (aviso en el título). Jugando, si dos ventanas de 4 s seguidas dan < 24 fps,
  un diálogo sugiere el modo lista una vez ("Seguir en 3D" lo desactiva; también en Opciones).
- Táctil: joystick flotante en la mitad izquierda (al borde = correr), botón de acción con el verbo
  del objeto al alcance, Mapa y ☰ arriba a la derecha. Aparece al tocar la pantalla (opción
  "Controles táctiles": Automático / Siempre / Nunca). En vertical las cámaras abren el FOV (hasta
  100°) para no perder ancho, y se sugiere girar el teléfono.
- Movimiento reducido (sistema u opción "Movimiento"): sin vertex snapping, puertas con fundido,
  TV sin estática/parpadeo y sin parpadeos en la interfaz (clase `reduce-motion` en `<html>`).

### 6.4 UI
- Capa HTML/CSS sobre el canvas (accesible, seleccionable, fácil de estilizar).
- Tipografía pixel/monoespaciada con licencia libre (p. ej. de Google Fonts), estilo "documento mecanografiado" para las fichas.

### 6.5 Audio (Fase 6)
Todo el audio es **original y se sintetiza en el navegador** con Web Audio: no hay archivos de sonido
(0 kB de descarga, ~14 kB de JS con gzip). `src/audio/`:

| Archivo | Qué hace |
|---------|----------|
| `audio.js` | Motor: crea el `AudioContext` en el primer gesto (tecla, clic o toque), buses música · ambiente · efectos · interfaz → limitador, volúmenes de Opciones (curva `v^1.6`), pausa (música con paso bajo y ambiente bajo), video del DemoReel (silencio), y suspende el contexto con la pestaña oculta, el modo lista o "Sonido: No". Programa con 1.2 s de antelación cada 200 ms. |
| `music.js` | "Nocturno de la mansión": Re menor, 56 pulsos/min, un acorde cada 8 pulsos (~8.6 s). Colchón de sierras con paso bajo, bajo que se desliza, tema de caja de música (campanas FM con temblor de cinta) en las vueltas impares y notas sueltas en las pares; en modo tenso, viento, golpes metálicos, roces y retumbos lejanos. Ánimo `calm` (Sala de guardado): progresión en Fa mayor sin texturas. El cambio entra en el acorde siguiente. |
| `ambience.js` | Ambientes por sala (`ambience` en `rooms.json`): `hall` (casa, viento, lluvia lejana, el reloj de pie, crujidos), `gallery`, `studio` (zumbido de 60 Hz y ventiladores de CRT), `lab` (servidores y discos duros), `arcade` (neón y arpegios lejanos en la escala de la música), `save` (lluvia). |
| `sfx.js` | Efectos calculados una vez a buffers: pasos por suelo (`floor`: stone, wood, carpet, metal; 4 variantes), picaporte, chirrido, portazo, puerta cerrada, reloj, crujidos y la interfaz (cursor, aceptar, volver, abrir/cerrar, papel, ficha, error, "Pulsa Start"). |
| `uiSounds.js` | Conecta la `UiStack` (abrir/cerrar capas, mover el cursor, pestañas) y los clics (`data-sfx` cambia el sonido de un botón). |
| `dsp.js` | Utilidades: PRNG con semilla, biquad, ruidos, reverberación sintética, envolventes. |

- Los **pasos** salen de la animación: `PlayerController` detecta en cada clip cuándo apoya cada pie
  (altura de los huesos `foot_l`/`foot_r`), así que el GLB final con `Walk`/`Run` funciona sin tocar nada.
- Las **puertas** lanzan sonidos en momentos de la animación (`DoorTransition.onCue`): picaporte,
  chirrido, portazo; si se salta la animación el chirrido se corta.
- Niveles por defecto (medidos): música ≈ -28 dBFS RMS, ambientes ≈ 12 dB por debajo, pasos con picos
  ≈ -17 dBFS. Para ajustar: `MUSIC_TRIM` y `ambBus` en `audio.js`, `MOODS` en `music.js`, `AMBIENCES`.
- Depuración: `__game.audio.state` (contexto, sala, ánimo, nivel) y F3 muestra el nivel de salida.
- Para escuchar la música fuera del juego se puede renderizar con un `OfflineAudioContext`
  (`new Score(ctx, ctx.destination).start(0); score.scheduleUntil(segundos)`).

### 6.6 Idiomas
- **Elección antes de construir nada.** `src/main.js` decide el idioma (`?lang=` en la URL →
  `settings.lang` guardado → pantalla de elección `ui/languageScreen.js`, que sugiere el idioma del
  navegador), carga su diccionario (`src/i18n/es.js` o `en.js`, cada uno en su propio bloque de JS) y
  solo entonces importa `boot.js` (el antiguo `main.js`). Así toda la UI se construye ya traducida.
- **Cambiar de idioma recarga la página** (`changeLanguage()` en `core/i18n.js`; quita `?lang=` de la
  URL y conserva `#lista`). Se eligió frente al repintado en caliente porque casi toda la UI arma su
  HTML una vez al crearse; recargar es simple, fiable y casi instantáneo (todo está en caché).
- **Interfaz:** `t('clave', { vars })`. Las claves viven en `src/i18n/<idioma>.js` (algunas son listas,
  como la tabla de controles). En desarrollo, una clave inexistente avisa en la consola.
- **Datos:** el español de `src/data/*.json` es la fuente única. `src/data/en/*.json` trae solo los
  textos (proyectos y salas por `id`; el perfil como objeto parcial, con las listas de objetos
  combinadas por posición) y `localizeData()` los aplica encima; lo no traducido queda en español.
  Todo el código importa los datos de `src/data/index.js`.
- `<html lang>`, `document.title` y la descripción se actualizan al idioma; las etiquetas de Open
  Graph (generadas en el build) quedan en español con `og:locale:alternate = en_US`.
- Coste: 2.7 kB (español) u 8 kB (inglés, con los datos) con gzip, más la pantalla de elección (~1 kB).

## 7. Estructura objetivo del repo

```
index.html
vite.config.js
scripts/          optimize-images.mjs (`npm run images`), make-icons.mjs (`npm run icons`), check-budgets.mjs
.github/workflows/deploy.yml   Publicación en GitHub Pages
public/
  img/            Imágenes WebP (≤1280 px) generadas desde art/img/; img/thumb/ miniaturas (≤256 px)
  models/         player.glb, salas *.glb
  favicon.svg, favicon-32.png, apple-touch-icon.png, icon-192/512.png, manifest.webmanifest
  og-image.jpg    Vista previa de enlaces (1200×630)
src/
  main.js         Elección de idioma → boot.js (modo lista o juego)
  i18n/           Textos de la interfaz por idioma (es.js, en.js)
  audio/          Motor, música, ambientes y efectos (todo sintetizado; sin archivos de audio)
  core/           Renderer, game loop, input, carga de assets
  render/         Materiales y post-proceso PS1
  world/          Salas, cámaras, triggers, puertas, colisiones
  player/         Controlador y animación
  ui/             Título, archivo, pausa, mapa, modo lista
  data/           projects.json, profile.json, rooms.json (español) + en/ (traducción) + index.js
art/              Fuentes (FBX, .blend, PSD, plantillas UV) — no se publican
  img/            Imágenes originales en alta (fuente de `npm run images`)
  rooms/          build_rooms.py (genera las seis salas) y los .blend de las salas
```

## 8. Riesgos

| Riesgo | Mitigación |
|--------|------------|
| Controles frustrantes con cámaras fijas | Controles modernos por defecto, modo tanque opcional, mapa siempre disponible. |
| Reclutadores sin tiempo | Modo lista y vitrina de destacados en el Hall; botón de Modo lista en el título. |
| Peso de carga | Texturas pequeñas, salas por separado, portadas en alta solo al abrir ficha. |
| Móvil lento | Detección + modo lista; controles táctiles. |
| Animaciones incompatibles con el rig actual | Re-riguear en Mixamo (§5.3). |
| Alcance demasiado grande | El prototipo de la Fase 2 es el punto de decisión; las salas se pueden lanzar de una en una. |

## 9. Preguntas abiertas
- Nombre del "juego" / título de la pantalla inicial.
- ~~Ambientación~~ Mansión clásica con alas temáticas (decidido en la Fase 4; ajustable).
- ~~¿El personaje representa a Starmise?~~ Sí: ropa de la foto de referencia (chaqueta acolchada con franjas roja y crema).
- ~~¿Música propia o CC0?~~ Propia: compuesta en código y sintetizada en el navegador (Fase 6).

## 10. Registro de decisiones
- **2026-10-10** — **Puertas más visibles**: el usuario notó que no se distinguían (hoja café oscuro
  sobre lambrín oscuro). Se resolvió en código (`world/doorMarkers.js`) para todas las salas sin
  regenerar los GLB: rendija de luz bajo la hoja, charco de luz aditivo en el piso (degradado en
  escalones, estilo de la época) y brillo emisivo en `DOORFRAME_*`/`DOORKNOB_*`. La intensidad sube al
  acercarse y late cuando la puerta es el objetivo de interacción (sin latido con movimiento reducido);
  las salas sin modelo darían una luz roja tenue. `room.update(dt, posiciónJugador, objetivo)`. Se
  añadió `clonePs1()` porque `Material.clone()` perdía los efectos PS1 (afectaba también a las portadas).
- **2026-10-10** — Portafolio **bilingüe (español / inglés)**, a petición del usuario: la primera
  visita muestra una pantalla de elección (bilingüe, con teclado, mando y táctil) y la elección se
  guarda en `settings.lang`. El idioma se decide antes de construir la UI (`main.js` → diccionario →
  `boot.js`, que es el antiguo `main.js`) y cambiarlo recarga la página en lugar de repintar en caliente.
  Textos de la interfaz en `src/i18n/` con `t()`; traducción de los datos en `src/data/en/` aplicada
  sobre el español (fuente única) por `src/data/index.js`. `?lang=en` en la URL fuerza el idioma (útil
  para enviar a reclutadores: `?lang=en#lista`). Las fichas usan `whatIDo: true` en lugar de comparar el
  texto del *kicker*. `npm run budget` cuenta ahora `boot.js` y el diccionario más pesado (787 kB).
- **2026-10-09** — Fase 6: el usuario propuso usar una pista de un OST comercial con copyright; se
  descartó (riesgo de DMCA y contradice la regla de PI) y se compuso música **original** generada en el
  navegador: sin archivos (0 kB), sin costuras de bucle y nunca suena igual. Una sola pista continua en
  toda la mansión (no se reinicia al cruzar puertas); cada sala cambia el ánimo (`mood`), el ambiente
  (`ambience`), el suelo de los pasos (`floor`) y la reverberación (`reverb`), todo en `rooms.json`.
  El `AudioContext` se crea en el primer gesto; con la pestaña oculta, el modo lista o "Sonido: No" se
  suspende. Opciones nuevas: `sound`, `music`, `sfx` (además de `volume`). Los textos para buscadores y
  vistas previas viven en `profile.site` y los inyecta un plugin de Vite (una sola fuente). El repo se
  renombró a `Starmise.github.io` y el workflow de Pages (que no estaba en el repo) se rehízo con
  `checkout@v5`, `setup-node@v5`, `configure-pages@v6`, `upload-pages-artifact@v5`, `deploy-pages@v5`.
  La imagen de Open Graph es una captura del título (rehacerla cuando esté el personaje final).
- **2026-10-09** — Fase 5: el JS se divide en arranque (`main.js` + `shell.js`) y juego (`game.js`,
  antes `main.js`), para que el modo lista y los equipos sin WebGL no descarguen Three.js. Las salas
  vecinas ya no se precargan en el título sino al empezar a jugar (carga inicial 2.1 MB → 767 kB).
  Modo lista con los mismos datos: proyectos agrupados por sala (`rooms.json`), destacados arriba,
  fichas completas en `<details>` y la numeración "Archivo Nº" del juego. Táctil con joystick virtual
  (sin "clic para caminar"). Opciones nuevas: Movimiento (Del sistema / Reducido / Completo), Controles
  táctiles y Sugerir modo lista; la animación de puertas ya no se fuerza a "Rápida" al guardar, sino
  que el movimiento reducido manda. F3 muestra fps, draw calls y triángulos (`__game.stats`).
  Nuevo `npm run budget` (`scripts/check-budgets.mjs`). Las fichas tienen botones ◂ ▸ para pasar de
  archivo con ratón o toque. Pendiente de verificar en hardware real: 60 fps en un portátil medio.
- **2026-10-09** — Fase 4: ambientación de **mansión** con alas temáticas. Las seis salas salen de un
  solo script de Blender (`art/rooms/build_rooms.py`, reemplaza a `build_test_room.py`; el hall pasa de
  `test_room.glb` a `hall.glb`). Cada sala tiene una puerta al Hall y su `SPAWN_hall`; el Hall tiene un
  `SPAWN_<sala>` frente a cada puerta. Los destacados aparecen dos veces (vitrina del Hall y su sala).
  Imágenes: los originales se movieron a `art/img/` (no se publican) y los JSON apuntan a
  `img/<nombre>.webp`; las texturas de portada usan `img/thumb/` (≤256 px) y se reducen a 128×96 en el
  navegador. Dependencia de desarrollo nueva: `sharp` (solo para `npm run images`). DemoReel: documento
  `demoreel` con miniatura y reproductor `youtube-nocookie` bajo demanda; en 3D la TV intenta usar la
  miniatura de YouTube (con CORS) y si no puede muestra una pantalla azul de VCR. `rooms.json` gana
  `fog` y `ambient` por sala. El cascarón de cada sala (`Room_Shell*`) usa *polygon offset* porque el
  *vertex snapping* hacía parpadear lo pegado a muros y piso. Catharsis gana galería con dos capturas que
  ya estaban en el repo (`Catharsis`, `CatharsisMap`); las fichas muestran `gallery` como miniaturas.
- **2026-10-09** — Fase 3: UI como pila de capas (`src/ui/uiStack.js`): título, pausa y fichas se
  apilan; con alguna abierta el juego se pausa y la capa de arriba recibe la navegación (teclado nativo
  + mando traducido a acciones). Opciones en `src/core/settings.js` (localStorage). Se quitaron los atajos
  `C`/`P` del prototipo (ahora en Opciones); quedan `Esc`/`Tab` menú, `M` mapa, `I` inventario y `F3`
  depuración. Puertas: transición 3D propia (`src/world/doorTransition.js`, ~2.3 s) o fundido corto;
  con `prefers-reduced-motion` la corta es la predeterminada. `INT_` acepta documentos del perfil
  (`about`, `contact`, `trivia`). Las salas sin modelo aparecen como "Próximamente" en el mapa y sus
  puertas dicen que están cerradas. El volumen se guarda pero aún no hay audio (Fase 6).
- **2026-10-09** — Fase 2 (prototipo): render PS1 en dos pasos (`src/render/`): escena a 240 px de alto
  (ancho según la ventana) en un render target *HalfFloat*, y post-proceso a 15 bits con el dithering 4×4
  de la consola; *vertex snapping* (rejilla = resolución/1.5) y mapeo afín inyectados con
  `onBeforeCompile` en materiales Lambert. Los materiales PBR del GLB se convierten a Lambert. Sombra
  "blob" bajo el personaje en lugar de shadow maps. La sala de prueba se genera con un script de Blender
  (`bpy`, Blender 5.2) para poder regenerarla; si se edita el `.blend` a mano, exportar el GLB a mano.
  Hall con dos cámaras + pasillo con una; las columnas se movieron a los muros porque tapaban al
  personaje. Teclas provisionales hasta el menú de pausa: `C` controles, `P` efectos PS1, `F3`/`º`
  depuración (muestra `COL_`/`TRG_`). Fuentes de la UI: VT323 y Courier Prime (Google Fonts, OFL).
  Dependencia nueva: `three-mesh-bvh`.
- **2026-10-08** — Fase 1: Vite 8 + Three.js r186. `player.glb` provisional generado del FBX para
  no bloquear la escena; el código (`src/player/loadPlayer.js`) quita la traslación horizontal del
  root y espera clips con los nombres de §5.4, así que el GLB final de Blender lo reemplaza sin cambios.
  Workflow con Node 22. El personaje representará a Starmise (referencia: foto en pose T).
- **2026-10-08** — Se elige tercera persona con cámaras fijas, Three.js vanilla, Vite (propuesto), salas en Blender con convención de nombres. Personaje: basemesh PSX con caminata de Mixamo.
