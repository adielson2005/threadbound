import * as THREE from 'three';

// Retalhos Sombrios: scraps of fabric sewn with Void thread. Small, wobbly, with glowing eyes and
// loose dark threads. They patrol near their post, chase Numi, telegraph a lunge (wind-up) so
// the player can react, get stunned and knocked back when hit, and dissolve into light when
// purified. They never walk off ledges.

const VIDA = 3;
const VISAO = 9, ALCANCE_ATAQUE = 1.25, VEL = 2.6;
// far from Numi a Retalho is not drawn (it is tiny at that distance) and, while just patrolling,
// does not think either: no raycasts nor animation until she comes closer
const DESENHAR = 55, DORMIR = 32;

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
  // body sphere a bit above the ground: touching anything there means a wall or a prop
  const esfera = new THREE.Sphere(new THREE.Vector3(), 0.36);
  const bloqueado = (x, y, z) => {
    esfera.center.set(x, y + 0.62, z);
    if (mapa.geo.boundsTree?.intersectsSphere(esfera)) return true;
    return (mapa.extras ?? []).some(c => c.solido !== false && Math.hypot(x - c.x, z - c.z) < c.raio + 0.36 && y + 0.9 > c.base && y < c.topo);
  };

  const lista = posicoes.map(p => {
    const m = criarModelo();
    m.g.position.copy(p.pos);
    grupo.add(m.g);
    return {
      ...m, casa: p.pos.clone(), pos: m.g.position, vel: new THREE.Vector3(), vida: VIDA, estado: 'patrulha',
      tempo: Math.random() * 3, alvo: p.pos.clone(), ancora: p.ancora, coracao: p.coracao, ativo: true,
      flash: 0, atordoado: 0, fase: Math.random() * 6, viu: false,
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

  // player: { pos, vivo }, aoAcertarJogadora(e) -> called when a lunge connects
  function atualizar(dt, t, jogadora, aoAcertarJogadora) {
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
      const enxerga = jogadora.vivo && dh < VISAO && dy < 2.5 && e.pos.distanceTo(e.casa) < 14;
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
        if (dh < ALCANCE_ATAQUE && dy < 1.2 && !e.acertou) { e.acertou = true; aoAcertarJogadora(e); }
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

      // move, never stepping off a ledge nor into walls/props (the map mesh includes the props)
      const novo = e.pos.clone().addScaledVector(e.vel, dt);
      const y = chao(novo.x, e.pos.y, novo.z);
      // (if it is already touching something, e.g. on a steep slope, it may still move to get out)
      const livre = y !== null && Math.abs(y - e.pos.y) < 0.9 && (!bloqueado(novo.x, y, novo.z) || bloqueado(e.pos.x, e.pos.y, e.pos.z));
      if (livre) { e.pos.set(novo.x, y, novo.z); }
      else { e.vel.set(0, 0, 0); if (e.estado === 'patrulha') e.tempo = 0; }

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
    }
    for (const s of [...particulas]) {
      const u = s.userData; u.vida -= dt;
      s.position.addScaledVector(u.v, dt); u.v.multiplyScalar(1 - dt);
      s.material.opacity = Math.max(0, u.vida);
      if (u.vida <= 0) { grupo.remove(s); particulas.splice(particulas.indexOf(s), 1); }
    }
  }

  return { lista, grupo, atingir, purificar, atualizar, get vivos() { return lista.filter(e => e.ativo); } };
}
