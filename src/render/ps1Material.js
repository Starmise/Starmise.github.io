import * as THREE from 'three';

/**
 * Efectos de vértice de PS1 inyectados en los materiales estándar de Three.js:
 *
 * - Vertex snapping: la posición en pantalla se redondea a la rejilla de la resolución
 *   interna → los polígonos "tiemblan" al moverse la cámara o el personaje.
 * - Mapeo afín: la PS1 no corregía la perspectiva de las texturas. GLSL ES 3.0 no tiene
 *   `noperspective`, así que se multiplica la UV por w en el vértice y se divide en el
 *   fragmento (la interpolación correcta de uv·w y w da como resultado uv afín).
 *
 * Los uniforms son compartidos por todos los materiales: cambiar `ps1Uniforms` afecta a
 * toda la escena al instante (útil para el toggle de efectos y para el redimensionado).
 */
export const ps1Uniforms = {
  uPs1Snap: { value: new THREE.Vector2(320, 240) }, // rejilla de snapping (px)
  uPs1SnapOn: { value: 1 },
  uPs1Affine: { value: 1 }, // 0 = perspectiva correcta, 1 = afín total
};

const VERTEX_HEAD = /* glsl */ `
uniform vec2 uPs1Snap;
uniform float uPs1SnapOn;
uniform float uPs1Affine;
varying float vPs1W;
`;

const VERTEX_BODY = /* glsl */ `
#include <project_vertex>
{
  float ps1W = mix(1.0, gl_Position.w, uPs1Affine);
  vPs1W = ps1W;
  #ifdef USE_MAP
    vMapUv *= ps1W;
  #endif
  if (uPs1SnapOn > 0.5 && gl_Position.w > 0.0) {
    vec2 grid = uPs1Snap * 0.5;
    vec2 ndc = gl_Position.xy / gl_Position.w;
    ndc = floor(ndc * grid + 0.5) / grid;
    gl_Position.xy = ndc * gl_Position.w;
  }
}
`;

const FRAGMENT_HEAD = /* glsl */ `
varying float vPs1W;
`;

const MAP_FRAGMENT = THREE.ShaderChunk.map_fragment.replace(
  'texture2D( map, vMapUv )',
  'texture2D( map, vMapUv / vPs1W )',
);

/**
 * Aplica los efectos de vértice PS1 a un material (MeshLambert/Standard/Basic…).
 * Idempotente: llamarlo dos veces sobre el mismo material no hace nada.
 */
export function applyPs1(material) {
  if (material.userData.ps1) return material;
  material.userData.ps1 = true;
  const previous = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    previous?.call(material, shader, renderer);
    Object.assign(shader.uniforms, ps1Uniforms);
    shader.vertexShader = VERTEX_HEAD + shader.vertexShader.replace('#include <project_vertex>', VERTEX_BODY);
    shader.fragmentShader = FRAGMENT_HEAD + shader.fragmentShader.replace('#include <map_fragment>', MAP_FRAGMENT);
  };
  // Mismo programa para todos los materiales PS1 del mismo tipo.
  material.customProgramCacheKey = () => 'ps1';
  material.needsUpdate = true;
  return material;
}

/**
 * Copia un material PS1 conservando sus efectos. `Material.clone()` copia `userData` (la marca
 * `ps1`) pero no `onBeforeCompile`, así que la copia se quedaría sin snapping ni mapeo afín.
 */
export function clonePs1(material) {
  const copy = material.clone();
  delete copy.userData.ps1;
  return applyPs1(copy);
}

/** Texturas nítidas como en la consola: sin filtrado bilineal ni mipmaps. */
export function makeTextureCrisp(texture) {
  if (!texture) return;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.anisotropy = 1;
  texture.needsUpdate = true;
}

/**
 * Convierte los materiales PBR que exporta Blender a Lambert (más barato y con el
 * sombreado plano de la época), con texturas nítidas y efectos PS1.
 */
export function toPs1Material(source) {
  const mat = new THREE.MeshLambertMaterial({
    name: source.name,
    map: source.map ?? null,
    color: source.color ?? 0xffffff,
    emissive: source.emissive ?? 0x000000,
    emissiveMap: source.emissiveMap ?? null,
    emissiveIntensity: source.emissiveIntensity ?? 1,
    transparent: source.transparent,
    alphaTest: source.alphaTest,
    side: source.side,
    vertexColors: source.vertexColors,
  });
  makeTextureCrisp(mat.map);
  makeTextureCrisp(mat.emissiveMap);
  return applyPs1(mat);
}
