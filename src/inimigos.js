import * as THREE from 'three';
import { RAIO, ALTURA } from './fisica.js';
import { linhaLivre } from './colisao.js';

// Retalhos Sombrios: scraps of fabric sewn with Void thread. Small, wobbly, with glowing eyes and
// loose dark threads. They patrol near their post, chase Brisa, telegraph a lunge (wind-up) so
// the player can react, get stunned and knocked back when hit, and dissolve into light when
// purified. They never walk off ledges.

const VIDA = 3;
const VISAO = 9, ALCANCE_ATAQUE = 1.25, VEL = 2.6;
// far from Brisa a Retalho is not drawn (it is tiny at that distance) and, while just patrolling,
// does not think either: no raycasts nor animation until she comes closer
const DESENHAR = 55, DORMIR = 32;

// Hitbox: the body is a lumpy blob wider than tall (≈0.88 m across, 0.76 m high — measured from
// geometriaCorpo), so it is an ellipsoid in the body's own frame: it follows the bob, the lean of
// the wind-up and the shrinking when purified. Used by the lunge, Brisa's strikes and the push
// between the two (combate.js, jogo.js).
export const RAIOS_CORPO = new THREE.Vector3(0.44, 0.38, 0.44);
// a lunge connects when the body gets this close to Brisa's capsule (m)
const CONTATO_INVESTIDA = 0.2;
// sphere that keeps a Retalho out of walls and props: as wide as the body, raised so that the
// ground on a gentle slope does not count as an obstacle
const RAIO_BLOQUEIO = 0.42, ALTURA_BLOQUEIO = 0.64;
const PASSO_MOVER = 0.2; // largest move per check (a knock-back at 6 m/s must not skip a 22 cm wall)
const INTERVALO_VISAO = 0.25; // line-of-sight raycast at most this often per Retalho

const _local = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3();
// approximate distance (m) from world point p to the body surface (negative inside)
function distanciaCorpo(e, p) { return distanciaLocal(e, _local.copy(p).applyMatrix4(e.inversa)); }
function distanciaLocal(e, q) {
  const r = q.length();
  const k = Math.hypot(q.x / RAIOS_CORPO.x, q.y / RAIOS_CORPO.y, q.z / RAIOS_CORPO.z); // 1 on the surface
  if (k < 1e-6) return -RAIOS_CORPO.y * e.g.scale.x;
  return (r - r / k) * e.g.scale.x;
}
// distance from the segment a–b (world) to the body surface: the closest point is found where
// the ellipsoid is a unit sphere
function distanciaSegmento(e, a, b) {
  _a.copy(a).applyMatrix4(e.inversa); _b.copy(b).applyMatrix4(e.inversa);
  const ax = _a.x / RAIOS_CORPO.x, ay = _a.y / RAIOS_CORPO.y, az = _a.z / RAIOS_CORPO.z;
  const dx = _b.x / RAIOS_CORPO.x - ax, dy = _b.y / RAIOS_CORPO.y - ay, dz = _b.z / RAIOS_CORPO.z - az;
  const l2 = dx * dx + dy * dy + dz * dz;
  const t = l2 > 1e-9 ? THREE.MathUtils.clamp(-(ax * dx + ay * dy + az * dz) / l2, 0, 1) : 0;
  return distanciaLocal(e, _local.lerpVectors(_a, _b, t));
}

let geoCorpo = null;
function geometriaCorpo() {
  if (geoCorpo) return geoCorpo;
  // lumpy patchwork blob
  const g = new THREE.IcosahedronGeometry(0.42, 2);
  const p = g.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = 1 + 0.12 * Math.sin(v.x * 9) * Math.cos(v.y * 7) + 0.08 * Math.sin(v.z * 11);
    v.multiplyScalar(n); v.y *= 0.85;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  geoCorpo = g;
  return g;
}

function texturaRetalho() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const cores = ['#2b1a3d', '#3a2150', '#1f1530', '#4a2a5c'];
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { g.fillStyle = cores[(i + j * 3) % 4]; g.fillRect(i * 32, j * 32, 32, 32); }
  // stitches
  g.strokeStyle = '#b58cff'; g.lineWidth = 2; g.setLineDash([4, 4]);
  for (let i = 1; i < 4; i++) { g.beginPath(); g.moveTo(i * 32, 0); g.lineTo(i * 32, 128); g.stroke(); g.beginPath(); g.moveTo(0, i * 32); g.lineTo(128, i * 32); g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

let MATS = null;
function materiais() {
  if (MATS) return MATS;
  MATS = {
    corpo: new THREE.MeshStandardMaterial({ map: texturaRetalho(), roughness: 0.9, emissive: '#2a0a45', emissiveIntensity: 0.6 }),
    olho: new THREE.MeshBasicMaterial({ color: '#ff8cf0' }),
    fio: new THREE.MeshBasicMaterial({ color: '#7a3cc8' }),
    luz: (() => {
      const c = document.createElement('canvas'); c.width = c.height = 64;
      const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, 'rgba(255,240,190,1)'); gr.addColorStop(1, 'rgba(255,240,190,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
      return new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    })(),
  };
  return MATS;
}

function criarModelo() {
  const M = materiais();
  const g = new THREE.Group();
  const corpo = new THREE.Mesh(geometriaCorpo(), M.corpo.clone());
  corpo.position.y = 0.45; // no cast shadow: the map shadow is baked once, moving things would leave a ghost
  g.add(corpo);
  for (const x of [-0.14, 0.14]) {
    const o = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), M.olho); o.position.set(x, 0.55, 0.36); o.scale.set(1, 1.4, 0.5);
    g.add(o);
  }
  // loose threads (tentacles) that sway
  const fios = [];
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2;
    const f = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.03, 0.5, 4), M.fio);
    f.geometry.translate(0, -0.25, 0);
    f.position.set(Math.cos(a) * 0.3, 0.3, Math.sin(a) * 0.3);
    f.rotation.set(0.6 * Math.sin(a), 0, -0.6 * Math.cos(a));
    g.add(f); fios.push({ f, a });
  }
  return { g, corpo, fios };
}

export function criarInimigos({ cena, mapa, posicoes }) {
  const grupo = new THREE.Group(); grupo.name = 'inimigos';
  cena.add(grupo);
  const rc = new THREE.Raycaster(); rc.firstHitOnly = true; rc.layers.enableAll();
  const chao = (x, y, z) => { rc.set(new THREE.Vector3(x, y + 1.2, z), new THREE.Vector3(0, -1, 0)); rc.far = 3; const h = rc.intersectObject(mapa.malha)[0]; return h ? h.point.y : null; };
  // room left around the blocking sphere (m): negative = touching a wall, a prop or a rock
  const centro = new THREE.Vector3(), maisPerto = { point: new THREE.Vector3(), distance: 0, faceIndex: 0 };
  const folga = (x, y, z) => {
    centro.set(x, y + ALTURA_BLOQUEIO, z);
    let f = Infinity;
    const h = mapa.geo.boundsTree?.closestPointToPoint(centro, maisPerto, 0, RAIO_BLOQUEIO + 0.5);
    if (h) f = h.distance - RAIO_BLOQUEIO;
    for (const c of mapa.extras ?? []) {
      if (c.solido === false || y + 0.9 <= c.base || y >= c.topo) continue;
      f = Math.min(f, Math.hypot(x - c.x, z - c.z) - c.raio - RAIO_BLOQUEIO);
    }
    return f;
  };
  const olhoE = new THREE.Vector3(), peitoJ = new THREE.Vector3();

  const lista = posicoes.map(p => {
    const m = criarModelo();
    m.g.position.copy(p.pos);
    grupo.add(m.g);
    return {
      ...m, casa: p.pos.clone(), pos: m.g.position, vel: new THREE.Vector3(), vida: VIDA, estado: 'patrulha',
      tempo: Math.random() * 3, alvo: p.pos.clone(), ancora: p.ancora, coracao: p.coracao, ativo: true,
      flash: 0, atordoado: 0, fase: Math.random() * 6, viu: false,
      inversa: new THREE.Matrix4(), veJogadora: false, proximaVisao: Math.random() * INTERVALO_VISAO,
    };
  });

  const particulas = [];
  function purificar(e) {
    e.ativo = false; e.estado = 'morrendo'; e.tempo = 0;
    for (let k = 0; k < 10; k++) {
      const s = new THREE.Sprite(materiais().luz.clone()); s.scale.setScalar(0.3 + Math.random() * 0.3);
      s.position.copy(e.pos).add(new THREE.Vector3((Math.random() - 0.5) * 0.6, 0.4 + Math.random() * 0.4, (Math.random() - 0.5) * 0.6));
      s.userData = { v: new THREE.Vector3((Math.random() - 0.5) * 1.5, 1.5 + Math.random() * 2, (Math.random() - 0.5) * 1.5), vida: 1.4 };
      grupo.add(s); particulas.push(s);
    }
  }

  // Kept for compatibility with older saves; the current game purifies by interaction.
  function atingir(e, dano, de, empurraoVel = 4) {
    if (!e.ativo) return false;
    e.vida -= dano; e.flash = 1; e.atordoado = 0.5;
    const empurrao = e.pos.clone().sub(de).setY(0);
    if (empurrao.lengthSq() < 1e-6) empurrao.set(0, 0, 1);
    e.vel.copy(empurrao.normalize().multiplyScalar(empurraoVel));
    e.estado = 'atordoado';
    if (e.vida <= 0) purificar(e);
    return true;
  }

  // body frame for the hitbox, taken after the animation of the frame (combat and the push between
  // Brisa and the Retalhos read it in the physics steps of the next frame)
  function atualizarHitbox(e) {
    e.corpo.updateWorldMatrix(true, false);
    e.inversa.copy(e.corpo.matrixWorld).invert();
  }
  const segA = new THREE.Vector3(), segB = new THREE.Vector3();
  // gap (m) between Brisa's capsule (feet at pos) and the body of e
  function distanciaJogadora(e, pos) {
    segA.set(pos.x, pos.y + RAIO, pos.z); segB.set(pos.x, pos.y + ALTURA - RAIO, pos.z);
    return distanciaSegmento(e, segA, segB) - RAIO;
  }
  // nothing solid between the body of e and the point p (Brisa's chest, a fist…)
  function alcanca(e, p) { return linhaLivre(mapa, olhoE.setFromMatrixPosition(e.corpo.matrixWorld), p); }

  // player: { pos, vivo }, aoAcertarJogadora(e) -> called when a lunge connects
  function atualizar(dt, t, jogadora, aoAcertarJogadora) {
    peitoJ.copy(jogadora.pos).y += ALTURA * 0.7;
    for (const e of lista) {
      if (e.estado === 'morrendo') {
        e.tempo += dt;
        const s = Math.max(0, 1 - e.tempo * 2);
        e.g.scale.setScalar(s);
        e.corpo.material.emissiveIntensity = 0.6 + e.tempo * 6;
        if (s <= 0) e.g.visible = false;
        continue;
      }
      if (!e.ativo) continue;
      const d2 = e.pos.distanceToSquared(jogadora.pos);
      e.g.visible = d2 < DESENHAR * DESENHAR;
      if (d2 > DORMIR * DORMIR && e.estado === 'patrulha') continue;
      const paraJog = jogadora.pos.clone().sub(e.pos);
      const dh = Math.hypot(paraJog.x, paraJog.z), dy = Math.abs(paraJog.y);
      // it only sees her if nothing stands in between (a house wall, a rock…)
      const perto = jogadora.vivo && dh < VISAO && dy < 2.5 && e.pos.distanceTo(e.casa) < 14;
      e.proximaVisao -= dt;
      if (!perto) e.veJogadora = false;
      else if (e.proximaVisao <= 0) { e.proximaVisao = INTERVALO_VISAO; e.veJogadora = alcanca(e, peitoJ); }
      const enxerga = perto && e.veJogadora;
      if (enxerga && !e.viu) e.viu = true;
      let desejado = new THREE.Vector3();

      if (e.estado === 'atordoado') {
        e.atordoado -= dt;
        if (e.atordoado <= 0) e.estado = 'persegue';
      } else if (e.estado === 'preparando') {
        // wind-up: shakes and leans back (readable tell)
        e.tempo -= dt;
        e.corpo.rotation.x = -0.35;
        if (e.tempo <= 0) {
          e.estado = 'investida'; e.tempo = 0.3;
          e.vel.copy(paraJog.setY(0).normalize().multiplyScalar(7));
        }
      } else if (e.estado === 'investida') {
        e.tempo -= dt;
        // connects on real contact between the body and her capsule, never through a wall
        if (!e.acertou && distanciaJogadora(e, jogadora.pos) < CONTATO_INVESTIDA && alcanca(e, peitoJ)) { e.acertou = true; aoAcertarJogadora(e); }
        if (e.tempo <= 0) { e.estado = 'recuperando'; e.tempo = 0.8; e.acertou = false; }
      } else if (e.estado === 'recuperando') {
        e.tempo -= dt;
        if (e.tempo <= 0) e.estado = enxerga ? 'persegue' : 'patrulha';
      } else if (enxerga) {
        e.estado = 'persegue';
        if (dh < ALCANCE_ATAQUE + 0.25) { e.estado = 'preparando'; e.tempo = 0.55; }
        else desejado.copy(paraJog).setY(0).normalize().multiplyScalar(VEL);
      } else {
        e.estado = 'patrulha';
        e.tempo -= dt;
        if (e.tempo <= 0) {
          e.tempo = 2 + Math.random() * 3;
          const a = Math.random() * Math.PI * 2, r = Math.random() * 4;
          e.alvo.set(e.casa.x + Math.cos(a) * r, e.casa.y, e.casa.z + Math.sin(a) * r);
        }
        const p = e.alvo.clone().sub(e.pos).setY(0);
        if (p.length() > 0.3) desejado.copy(p.normalize().multiplyScalar(VEL * 0.4));
        // drift back home if pushed far away
        if (e.pos.distanceTo(e.casa) > 10) desejado.copy(e.casa.clone().sub(e.pos).setY(0).normalize().multiplyScalar(VEL));
      }

      if (e.estado !== 'investida' && e.estado !== 'atordoado') e.vel.lerp(desejado, Math.min(1, dt * 6));
      else e.vel.multiplyScalar(Math.max(0, 1 - dt * 4));

      // move, never stepping off a ledge nor into walls/props (the map mesh includes the props),
      // in short steps so that a fast lunge or knock-back cannot skip a thin wall
      const passos = Math.max(1, Math.ceil(Math.hypot(e.vel.x, e.vel.z) * dt / PASSO_MOVER));
      for (let i = 0; i < passos; i++) {
        const nx = e.pos.x + e.vel.x * dt / passos, nz = e.pos.z + e.vel.z * dt / passos;
        const y = chao(nx, e.pos.y, nz);
        let livre = y !== null && Math.abs(y - e.pos.y) < 0.9;
        if (livre) {
          // already touching something (pushed against a wall, a steep slope): it may only move
          // away from it, never further in
          const f = folga(nx, y, nz);
          livre = f >= 0 || f > folga(e.pos.x, e.pos.y, e.pos.z) + 1e-4;
        }
        if (livre) { e.pos.set(nx, y, nz); continue; }
        e.vel.set(0, 0, 0); if (e.estado === 'patrulha') e.tempo = 0;
        break;
      }

      // face movement or the player
      const olhar = (e.estado === 'patrulha' ? e.vel : paraJog).clone().setY(0);
      if (olhar.lengthSq() > 1e-4) {
        let d = Math.atan2(olhar.x, olhar.z) - e.g.rotation.y;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        e.g.rotation.y += d * Math.min(1, dt * 8);
      }
      // body wobble, swaying threads, hit flash
      const vel = e.vel.length();
      e.corpo.position.y = 0.45 + Math.abs(Math.sin(t * 9 + e.fase)) * 0.06 * Math.min(1, vel);
      if (e.estado !== 'preparando') e.corpo.rotation.x += (Math.min(0.3, vel * 0.06) - e.corpo.rotation.x) * Math.min(1, dt * 8);
      e.corpo.rotation.z = Math.sin(t * 4 + e.fase) * 0.08 + (e.estado === 'preparando' ? Math.sin(t * 50) * 0.08 : 0);
      for (const { f, a } of e.fios) f.rotation.set(0.6 * Math.sin(a) + Math.sin(t * 3 + a) * 0.25, 0, -0.6 * Math.cos(a) + Math.cos(t * 2.6 + a) * 0.25);
      e.flash = Math.max(0, e.flash - dt * 4);
      e.corpo.material.emissive.setRGB(0.16 + e.flash, 0.04 + e.flash * 0.9, 0.27 + e.flash * 0.8);
      atualizarHitbox(e);
    }
    for (const s of [...particulas]) {
      const u = s.userData; u.vida -= dt;
      s.position.addScaledVector(u.v, dt); u.v.multiplyScalar(1 - dt);
      s.material.opacity = Math.max(0, u.vida);
      if (u.vida <= 0) { grupo.remove(s); particulas.splice(particulas.indexOf(s), 1); }
    }
  }

  for (const e of lista) atualizarHitbox(e);
  return {
    lista, grupo, atingir, purificar, atualizar, get vivos() { return lista.filter(e => e.ativo); },
    distanciaCorpo, distanciaSegmento, distanciaJogadora, alcanca,
  };
}
