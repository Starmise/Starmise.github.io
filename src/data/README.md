# Datos del portafolio

Toda la información del portafolio vive en estos JSON. La escena 3D y cualquier vista
alternativa deben **leer de aquí** (a través de `index.js`, que aplica el idioma elegido) en
lugar de tener textos escritos a mano en el código.

El **español** (los JSON de esta carpeta) es la fuente única. La traducción al **inglés** vive en
`en/` y solo trae los textos (ver [Traducción al inglés](#traducción-al-inglés)).

- `projects.json` — los proyectos (copiado del portafolio original `About-Me-Website`).
- `rooms.json` — salas del juego: `id`, `name`, `description`, `model` (GLB en `public/`,
  o `null` si la sala aún no está construida: el mapa la muestra como "Próximamente"), `fog`
  (`[cerca, lejos]` en metros) y `ambient` (intensidad de la luz ambiente, 0.75 por defecto).
  Sonido de cada sala: `ambience` (`hall`, `gallery`, `studio`, `lab`, `arcade` o `save`; ver
  `src/audio/ambience.js`), `floor` para los pasos (`stone`, `wood`, `carpet`, `metal`), `reverb`
  (segundos de reverberación, según el tamaño) y `mood` opcional (`calm` = la música se calma,
  como en la Sala de guardado; por defecto `tense`).
- `profile.json` — datos personales: bio, estudio, DemoReel, habilidades, "qué hago",
  curiosidades, galería y contacto (extraídos de `IndexP3.html` e `indexMin.html` del original).

Las rutas de imágenes son relativas a `public/` y apuntan a la versión web optimizada
(p. ej. `img/LucioGalaxyMain.webp`). La miniatura `img/thumb/<nombre>.webp` se usa sola donde hace
falta (texturas de las salas, galerías). Los originales en alta viven en `art/img/`.

## `projects.json`

Es un **array** de objetos:

| Campo           | Tipo       | Obligatorio | Descripción |
|-----------------|------------|-------------|-------------|
| `id`            | `string`   | Sí          | Identificador único en `kebab-case`. Sin espacios ni repeticiones. |
| `title`         | `string`   | Sí          | Nombre visible del proyecto. |
| `cover`         | `string`   | Sí          | Ruta de la portada (p. ej. `img/LucioGalaxyMain.webp`). |
| `room`          | `string`   | Sí          | Sala donde vive el proyecto (`id` de `rooms.json`). El mapa agrupa por este campo. |
| `tagline`       | `string`   | No          | Frase corta de gancho. |
| `tags`          | `string[]` | No          | Tecnologías/roles (chips, filtros). Puede ir vacío `[]`. |
| `description`   | `string`   | Sí          | Descripción del proyecto. |
| `process`       | `string`   | Sí          | Contexto de desarrollo y aportación personal. |
| `role`          | `string`   | No          | Resumen breve del rol, derivado de `process`. |
| `gallery`       | `string[]` | No          | Imágenes adicionales (miniaturas en la ficha; clic = tamaño completo). Puede ir vacío `[]`. |
| `externalLink`  | `string`   | No          | URL externa para jugar/ver el proyecto (itch.io, Drive, etc.). |
| `externalLabel` | `string`   | No          | Texto del botón hacia `externalLink`. |
| `featured`      | `boolean`  | No          | Si es `true`, el proyecto se destaca. Por defecto `false`. |

Los textos `description` y `process` se migraron verbatim de las páginas originales
(incluidas sus erratas); se pueden corregir libremente aquí.

## `profile.json`

| Campo         | Contenido |
|---------------|-----------|
| `name`, `alias`, `title`, `subtitle`, `logo` | Identidad y logo (`img/BMI.webp`). |
| `about`       | Párrafos de "¿Quién soy?". |
| `studio`      | Estudio actual (`Little Blossom Studio`) y su icono. |
| `demoReel`    | Video de YouTube (`youtubeId`, `embedUrl`). Opcional `thumbnail` (p. ej. `img/DemoReel.webp`) para la TV y la ficha; sin él se usa la miniatura de YouTube. |
| `skills`      | Lista de habilidades. |
| `whatIDo`     | Tarjetas `{ title, image, text }` de la versión corta. |
| `trivia`      | Curiosidades `{ image, items[] }`. |
| `gallery`     | Imágenes de la galería. **Ojo:** son marcadores de posición (`GalleryExample*`) heredados del original. |
| `contact`     | Enlaces `{ label, type, url }`. |
| `classicSite` | URL del portafolio original, para enlazarlo como "versión clásica". |
| `site`        | Datos del sitio para buscadores y vistas previas de enlaces: `url` (dirección pública), `title`, `description`, `image` (imagen de 1200×630 en `public/`) e `imageAlt`. `vite.config.js` genera con ellos el `<title>`, la descripción, Open Graph y schema.org (con `name`, `title`, `studio` y los enlaces de `contact`). |

## Objetos de las salas

En Blender, `INT_<id>` enlaza un objeto con un proyecto (`id` de `projects.json`) o con un
documento del perfil: `about` (diario/bio), `contact` (máquina de escribir), `trivia`
(curiosidades) o `demoreel` (TV con el DemoReel). Las puertas son `DOOR_<roomId>` con un `id` de `rooms.json`.

## Añadir o editar contenido

1. Copiar las imágenes nuevas (en alta) a `art/img/` y correr `npm run images`: genera
   `public/img/<nombre>.webp` y su miniatura. En el JSON se usa `img/<nombre>.webp`.
2. Editar el JSON correspondiente (sin comas finales; `id` único en `projects.json`).
3. Validar ambos archivos y que no falten imágenes:

```bash
node -e "const p=require('./src/data/projects.json'),f=require('./src/data/profile.json'),fs=require('fs');const r=[...p.flatMap(x=>[x.cover,...(x.gallery||[])]),f.logo,f.studio.icon,...f.whatIDo.map(w=>w.image),f.trivia.image,...f.gallery];console.log('faltantes:',r.filter(x=>!fs.existsSync('public/'+x)))"
```

4. Si cambiaste textos, actualiza también su traducción en `en/` (abajo).

## Traducción al inglés

El portafolio pregunta el idioma la primera vez (Español / English); se cambia después desde el
título, Opciones o el modo lista, y se puede forzar con `?lang=en` o `?lang=es` en la URL
(p. ej. `https://starmise.github.io/?lang=en#lista` para un reclutador que no hable español).

`en/` tiene un archivo por JSON, **solo con los campos traducidos**; lo que falte se muestra en
español. Las imágenes, enlaces, ids y números no se repiten:

| Archivo            | Forma |
|--------------------|-------|
| `en/projects.json` | Objeto `{ "<id del proyecto>": { tagline, tags, description, process, role, externalLabel } }`. También acepta `title` si algún día cambia el nombre. |
| `en/rooms.json`    | Objeto `{ "<id de la sala>": { name, description } }`. |
| `en/profile.json`  | Mismo esqueleto que `profile.json`, solo con los textos. Las listas de textos (`about`, `skills`, `trivia.items`) se reemplazan completas; las de objetos (`whatIDo`, `contact`) se combinan **por posición**, así que basta `{ "label": "Email" }` en el mismo orden (o `{}` si no cambia). |

Los textos de la interfaz (botones, menús, avisos) no están aquí sino en `src/i18n/es.js` y
`src/i18n/en.js` (mismas claves en ambos). Con `npm run dev` en inglés, la consola avisa de los
proyectos o salas sin traducir. Para comprobarlo a mano:

```bash
node -e "const p=require('./src/data/projects.json'),e=require('./src/data/en/projects.json'),r=require('./src/data/rooms.json'),er=require('./src/data/en/rooms.json');console.log('sin traducir:',[...p.filter(x=>!e[x.id]).map(x=>x.id),...r.filter(x=>!er[x.id]).map(x=>'sala '+x.id)])"
```
