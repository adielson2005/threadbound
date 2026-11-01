import * as THREE from 'three';
import { texturaDeCanvas } from './canvasTextura.js';

// Vegetação macia (arbustos, algas que balançam): não trava a Brisa como uma parede. Ela atravessa
// com dificuldade (fica mais lenta lá dentro) e as folhas caem por onde ela passa.
// Antes os arbustos tinham um cilindro sólido no meio (colisão): a cápsula enroscava nele e a
// personagem ficava presa na planta, o que não é normal numa moita.

const TAM_CELULA = 4; // grade para achar as plantas perto em O(1)
const MAX_FOLHAS = 90;

export function criarFolhas({ cena, plantas = [] }) {
  // grade: célula -> plantas que tocam nela
  const grade = new Map();
  const chave = (cx, cz) => cx * 73856093 ^ cz * 19349663;
  for (const p of plantas) {
    const x0 = Math.floor((p.x - p.r) / TAM_CELULA), x1 = Math.floor((p.x + p.r) / TAM_CELULA);
    const z0 = Math.floor((p.z - p.r) / TAM_CELULA), z1 = Math.floor((p.z + p.r) / TAM_CELULA);
    for (let cx = x0; cx <= x1; cx++) for (let cz = z0; cz <= z1; cz++) {
      const k = chave(cx, cz);
      if (!grade.has(k)) grade.set(k, []);
      grade.get(k).push(p);
    }
  }
  // quanto a posição está "dentro" de uma planta: 0 fora, 1 no meio (e a planta)
  function dentro(pos) {
    const lista = grade.get(chave(Math.floor(pos.x / TAM_CELULA), Math.floor(pos.z / TAM_CELULA)));
    if (!lista) return null;
    let melhor = null, k = 0;
    for (const p of lista) {
      if (pos.y < p.y - 0.5 || pos.y > p.y + p.alt) continue;
      const d = Math.hypot(pos.x - p.x, pos.z - p.z) / p.r;
      if (d < 1 && 1 - d > k) { k = 1 - d; melhor = p; }
    }
    return melhor ? { planta: melhor, k } : null;
  }

  // ---------- folhas caindo ----------
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const g = c.getContext('2d');
  g.fillStyle = '#fff';
  g.beginPath(); g.ellipse(16, 16, 6, 13, 0.6, 0, Math.PI * 2); g.fill();
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(MAX_FOLHAS * 3), cor = new Float32Array(MAX_FOLHAS * 3);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(cor, 3));
  const pontos = new THREE.Points(geo, new THREE.PointsMaterial({
    size: 0.16, map: texturaDeCanvas(c), vertexColors: true, alphaTest: 0.5, transparent: false, sizeAttenuation: true,
  }));
  pontos.frustumCulled = false;
  cena.add(pontos);
  const folhas = Array.from({ length: MAX_FOLHAS }, () => ({ vida: 0, x: 0, y: -999, z: 0, vx: 0, vy: 0, vz: 0, fase: 0 }));
  let proxima = 0, vivas = 0;
  const VERDES = [[0.36, 0.55, 0.22], [0.45, 0.62, 0.25], [0.55, 0.6, 0.28], [0.62, 0.5, 0.22]];
  function soltar(x, y, z, vx, vz, n) {
    for (let i = 0; i < n; i++) {
      const f = folhas[proxima]; proxima = (proxima + 1) % MAX_FOLHAS;
      f.vida = 1.6 + Math.random() * 1.2; f.fase = Math.random() * 6;
      f.x = x + (Math.random() - 0.5) * 0.7; f.y = y + 0.4 + Math.random() * 0.8; f.z = z + (Math.random() - 0.5) * 0.7;
      f.vx = vx * 0.25 + (Math.random() - 0.5) * 0.8; f.vy = 0.6 + Math.random() * 0.8; f.vz = vz * 0.25 + (Math.random() - 0.5) * 0.8;
      const v = VERDES[Math.floor(Math.random() * VERDES.length)];
      cor.set(v, ((proxima + MAX_FOLHAS - 1) % MAX_FOLHAS) * 3);
    }
    geo.attributes.color.needsUpdate = true;
  }
  function atualizar(dt, t) {
    vivas = 0;
    for (let i = 0; i < MAX_FOLHAS; i++) {
      const f = folhas[i];
      if (f.vida <= 0) { pos[i * 3 + 1] = -999; continue; }
      vivas++;
      f.vida -= dt;
      // cai devagar balançando (folha planando), freada pelo ar
      f.vy = Math.max(-0.7, f.vy - 2.2 * dt);
      f.vx *= 1 - dt * 1.5; f.vz *= 1 - dt * 1.5;
      f.x += (f.vx + Math.sin(t * 3 + f.fase) * 0.35) * dt; f.y += f.vy * dt; f.z += (f.vz + Math.cos(t * 2.6 + f.fase) * 0.35) * dt;
      pos[i * 3] = f.x; pos[i * 3 + 1] = f.vida > 0 ? f.y : -999; pos[i * 3 + 2] = f.z;
    }
    pontos.visible = vivas > 0;
    if (vivas) geo.attributes.position.needsUpdate = true;
  }
  return { dentro, soltar, atualizar, get total() { return plantas.length; } };
}
