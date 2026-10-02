import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Low-poly characters built from primitives, merged into one geometry each with
// vertex colors, so every soldier/zombie of a type is a single instanced draw call.

function part(geo, color, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  geo = geo.index ? geo.toNonIndexed() : geo;
  geo.rotateX(rx);
  geo.rotateY(ry);
  geo.rotateZ(rz);
  geo.translate(x, y, z);
  const c = new THREE.Color(color);
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'color'].includes(k)) geo.deleteAttribute(k);
  return geo;
}

const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (rt, rb, h, s = 8) => new THREE.CylinderGeometry(rt, rb, h, s);
const sph = (r, w = 8, h = 6) => new THREE.SphereGeometry(r, w, h);

function merge(parts) {
  const g = mergeGeometries(parts, false);
  g.computeBoundingSphere();
  return g;
}

// Characters face -Z. Feet at y=0, hips at y≈0.8 (the walk shader swings everything below the hips).
export function soldierGeometry(uniform = 0x4f6b35) {
  const skin = 0xd9a27a;
  const dark = 0x1d2219;
  const boots = 0x2a2018;
  const vest = 0x39452a;
  return merge([
    // legs
    part(box(0.2, 0.78, 0.24), uniform, -0.13, 0.42, 0),
    part(box(0.2, 0.78, 0.24), uniform, 0.13, 0.42, 0),
    part(box(0.22, 0.12, 0.32), boots, -0.13, 0.06, -0.04),
    part(box(0.22, 0.12, 0.32), boots, 0.13, 0.06, -0.04),
    // torso + vest
    part(box(0.56, 0.62, 0.32), uniform, 0, 1.12, 0),
    part(box(0.6, 0.42, 0.36), vest, 0, 1.15, 0),
    part(box(0.4, 0.42, 0.18), 0x2c3320, 0, 1.1, 0.24), // backpack
    // arms holding rifle forward
    part(box(0.16, 0.5, 0.16), uniform, -0.36, 1.12, -0.12, -0.9),
    part(box(0.16, 0.5, 0.16), uniform, 0.36, 1.12, -0.12, -0.9),
    part(box(0.14, 0.14, 0.14), skin, -0.24, 1.0, -0.42),
    part(box(0.14, 0.14, 0.14), skin, 0.18, 1.0, -0.4),
    // rifle
    part(box(0.1, 0.14, 0.9), dark, -0.04, 1.05, -0.55),
    part(box(0.06, 0.06, 0.3), dark, -0.04, 1.08, -1.12),
    part(box(0.08, 0.2, 0.1), dark, -0.04, 0.92, -0.42),
    // head + helmet
    part(box(0.3, 0.3, 0.3), skin, 0, 1.6, 0),
    part(sph(0.24, 8, 5), 0x3d4a2c, 0, 1.72, 0.01),
    part(box(0.52, 0.04, 0.52), 0x3d4a2c, 0, 1.66, 0),
    part(box(0.24, 0.06, 0.02), 0x111111, 0, 1.62, -0.16), // goggles band
  ]);
}

export function heroGeometry(color) {
  const skin = 0xd9a27a;
  const dark = 0x15161a;
  return merge([
    part(box(0.22, 0.8, 0.26), 0x22262c, -0.14, 0.42, 0),
    part(box(0.22, 0.8, 0.26), 0x22262c, 0.14, 0.42, 0),
    part(box(0.24, 0.14, 0.34), 0x111111, -0.14, 0.07, -0.04),
    part(box(0.24, 0.14, 0.34), 0x111111, 0.14, 0.07, -0.04),
    part(box(0.62, 0.68, 0.36), color, 0, 1.14, 0),
    part(box(0.68, 0.18, 0.4), 0x222222, 0, 0.88, 0),
    part(box(0.7, 0.16, 0.44), color, 0, 1.44, 0), // pauldrons
    part(box(0.18, 0.52, 0.18), color, -0.4, 1.12, -0.14, -0.9),
    part(box(0.18, 0.52, 0.18), color, 0.4, 1.12, -0.14, -0.9),
    part(box(0.14, 0.18, 1.1), dark, 0, 1.05, -0.6),
    part(box(0.2, 0.2, 0.3), dark, 0, 1.05, -1.2),
    part(box(0.32, 0.32, 0.32), skin, 0, 1.66, 0),
    part(box(0.36, 0.14, 0.36), 0x1a1a1a, 0, 1.86, 0.02),
    part(box(0.3, 0.07, 0.04), 0xff3b2f, 0, 1.68, -0.17), // red visor
    part(box(0.08, 0.5, 0.08), 0x1a1a1a, 0.18, 1.85, 0.2, 0.3), // antenna
  ]);
}

export function zombieGeometry() {
  const skin = 0x8fae7a;
  const shirt = 0x6d5a4a;
  const pants = 0x3c4150;
  const blood = 0x6a0f0f;
  return merge([
    part(box(0.22, 0.8, 0.24), pants, -0.13, 0.42, 0),
    part(box(0.22, 0.8, 0.24), pants, 0.13, 0.42, 0),
    part(box(0.22, 0.1, 0.3), 0x2b2520, -0.13, 0.05, -0.03),
    part(box(0.22, 0.1, 0.3), 0x2b2520, 0.13, 0.05, -0.03),
    // hunched torso
    part(box(0.58, 0.66, 0.34), shirt, 0, 1.12, -0.06, -0.25),
    part(box(0.3, 0.2, 0.36), blood, 0.12, 1.2, -0.1, -0.25),
    // reaching arms
    part(box(0.15, 0.15, 0.7), skin, -0.36, 1.32, -0.44, 0.15),
    part(box(0.15, 0.15, 0.7), skin, 0.36, 1.28, -0.44, 0.25),
    // head tilted
    part(box(0.32, 0.34, 0.32), skin, 0.04, 1.62, -0.2, -0.2, 0, 0.25),
    part(box(0.06, 0.06, 0.03), 0xffe14a, -0.04, 1.66, -0.37), // eyes (tinted bright for glow)
    part(box(0.06, 0.06, 0.03), 0xffe14a, 0.11, 1.68, -0.36),
    part(box(0.16, 0.05, 0.03), 0x2a0a0a, 0.05, 1.53, -0.36),
  ]);
}

export function bruteGeometry() {
  const skin = 0x6f8f62;
  const pants = 0x3a2c25;
  return merge([
    part(box(0.34, 0.8, 0.34), pants, -0.22, 0.42, 0),
    part(box(0.34, 0.8, 0.34), pants, 0.22, 0.42, 0),
    part(box(0.95, 0.9, 0.62), skin, 0, 1.3, 0, -0.2),
    part(box(1.0, 0.25, 0.66), 0x4a3a2f, 0, 0.9, 0),
    part(box(0.4, 0.3, 0.4), 0x7c2020, 0.2, 1.45, -0.2, -0.2), // wound
    part(box(0.3, 0.85, 0.3), skin, -0.66, 1.05, -0.2, -0.5),
    part(box(0.3, 0.85, 0.3), skin, 0.66, 1.05, -0.2, -0.5),
    part(box(0.4, 0.4, 0.4), 0x5d7a52, -0.7, 0.62, -0.42),
    part(box(0.4, 0.4, 0.4), 0x5d7a52, 0.7, 0.62, -0.42),
    part(box(0.42, 0.4, 0.4), skin, 0, 1.92, -0.3),
    part(box(0.08, 0.08, 0.03), 0xff4020, -0.1, 1.96, -0.51),
    part(box(0.08, 0.08, 0.03), 0xff4020, 0.1, 1.96, -0.51),
    // spikes on back
    part(cyl(0, 0.1, 0.4, 4), 0xcfc8b0, -0.2, 1.7, 0.3, 0.6),
    part(cyl(0, 0.1, 0.4, 4), 0xcfc8b0, 0.2, 1.75, 0.3, 0.6),
    part(cyl(0, 0.1, 0.35, 4), 0xcfc8b0, 0, 1.5, 0.36, 0.9),
  ]);
}

export function bossGeometry() {
  const skin = 0x7b6a8f;
  const armor = 0x2b2833;
  const glow = 0xff3020;
  return merge([
    part(box(0.36, 0.8, 0.36), armor, -0.25, 0.42, 0),
    part(box(0.36, 0.8, 0.36), armor, 0.25, 0.42, 0),
    part(box(1.1, 1.0, 0.7), skin, 0, 1.35, 0, -0.18),
    part(box(1.2, 0.3, 0.8), armor, 0, 1.75, 0.05, -0.18),
    part(box(0.5, 0.5, 0.2), glow, 0, 1.35, -0.38, -0.18), // glowing core
    part(box(0.34, 1.0, 0.34), skin, -0.78, 1.1, -0.1, -0.35),
    part(box(0.34, 1.0, 0.34), skin, 0.78, 1.1, -0.1, -0.35),
    part(box(0.55, 0.5, 0.55), armor, -0.8, 0.52, -0.38),
    part(box(0.55, 0.5, 0.55), armor, 0.8, 0.52, -0.38),
    part(box(0.48, 0.44, 0.44), skin, 0, 2.08, -0.25),
    part(box(0.1, 0.08, 0.03), glow, -0.12, 2.12, -0.48),
    part(box(0.1, 0.08, 0.03), glow, 0.12, 2.12, -0.48),
    part(cyl(0, 0.12, 0.6, 4), 0xd8d0b8, -0.55, 2.0, 0.05, 0, 0, 0.5),
    part(cyl(0, 0.12, 0.6, 4), 0xd8d0b8, 0.55, 2.0, 0.05, 0, 0, -0.5),
    part(cyl(0, 0.14, 0.5, 4), 0xd8d0b8, -0.3, 1.9, 0.4, 0.8),
    part(cyl(0, 0.14, 0.5, 4), 0xd8d0b8, 0.3, 1.9, 0.4, 0.8),
  ]);
}

export function barrelGeometry() {
  return merge([
    part(cyl(0.42, 0.42, 1.05, 12), 0xb3261e, 0, 0.53, 0),
    part(cyl(0.44, 0.44, 0.08, 12), 0x5a1410, 0, 0.3, 0),
    part(cyl(0.44, 0.44, 0.08, 12), 0x5a1410, 0, 0.78, 0),
    part(box(0.5, 0.3, 0.02), 0xf2d22e, 0, 0.55, -0.42), // hazard label
  ]);
}

// Material that makes legs swing while walking/running. Each instance carries
// a phase (aPhase) and a speed (aStride) so crowds don't march in lockstep.
export function walkerMaterial(opts = {}) {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0.05, ...opts });
  mat.userData.uniforms = { uTime: { value: 0 } };
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = mat.userData.uniforms.uTime;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uTime;
        attribute float aPhase;
        attribute float aStride;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        if (transformed.y < 0.82) {
          float side = sign(transformed.x);
          float ang = sin(uTime * aStride + aPhase) * 0.6 * side * min(aStride, 1.0);
          float dy = transformed.y - 0.82;
          float c = cos(ang), s = sin(ang);
          float z0 = transformed.z;
          transformed.z = z0 * c - dy * s;
          transformed.y = 0.82 + z0 * s + dy * c;
        }
        transformed.y += abs(sin(uTime * aStride + aPhase)) * 0.06 * min(aStride, 1.0);`,
      );
  };
  return mat;
}
