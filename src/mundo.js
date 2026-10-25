import * as THREE from 'three';
import { fundirEstaticos } from './lotes.js';

// First map, "A Oficina Esquecida": story landmarks and props built on top of the terrain
// analysis (terreno.js). Everything is placed procedurally on reachable ground, so it adapts if
// the map changes.
//
//  - oficina (workshop) where Brisa wakes up, at the spawn point
//  - 3 Âncoras de Fio: pillars whose thread was cut, held by Void crystals and guarded
//  - Coração do Fio: the island's main Sky Thread, restored once the anchors are lit
//  - ruins, floating rocks (bobbing platforms holding fragments), wind currents (launchers),
//    magical lights, falling debris, and the distant island + light bridge revealed at the end

import { CONFIG } from './capitulo.js';

const MARCOS = CONFIG.marcos; // como são os objetivos deste capítulo (capitulo.js)
const rnd = (() => { let s = 1234567; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })(); // deterministic layout

// ---------------- textures / materials ----------------
// stone and wood: tileable color + normal maps (assets/efeitos, generated offline)
const PASTA_EFEITOS = new URL('../assets/efeitos/', import.meta.url).href;
function texturaArquivo(nome, cor, rx, ry) {
  const t = new THREE.TextureLoader().load(PASTA_EFEITOS + nome);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = cor ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.repeat.set(rx, ry);
  t.anisotropy = 8; // three.js caps it to what the GPU supports
  return t;
}
function texturaFio() {
  // bright core fading to the edges, with moving "pulses" along the length (scrolled in update)
  const c = document.createElement('canvas'); c.width = 16; c.height = 128;
  const g = c.getContext('2d');
  for (let y = 0; y < 128; y++) {
    const pulso = 0.55 + 0.45 * Math.max(0, Math.sin((y / 128) * Math.PI * 6));
    g.fillStyle = `rgba(255,${200 + 40 * pulso | 0},${120 + 80 * pulso | 0},${pulso})`;
    g.fillRect(0, y, 16, 1);
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function texturaBrilho(cor) {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, cor); gr.addColorStop(0.35, cor.replace(/[\d.]+\)$/, '0.45)')); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const MAT = {};
function materiais() {
  if (MAT.pedra) return MAT;
  const pedra = texturaArquivo('pedra_cor.jpg', true, 1.5, 1.5), pedraN = texturaArquivo('pedra_normal.png', false, 1.5, 1.5);
  const madeira = texturaArquivo('madeira_cor.jpg', true, 1, 2), madeiraN = texturaArquivo('madeira_normal.png', false, 1, 2);
  MAT.pedra = new THREE.MeshStandardMaterial({ map: pedra, normalMap: pedraN, roughness: 0.92, color: '#e2e5ec' });
  MAT.pedraClara = new THREE.MeshStandardMaterial({ map: pedra, normalMap: pedraN, normalScale: new THREE.Vector2(0.7, 0.7), roughness: 0.85, color: '#fff6e2' });
  MAT.madeira = new THREE.MeshStandardMaterial({ map: madeira, normalMap: madeiraN, roughness: 0.78 });
  MAT.ouro = new THREE.MeshStandardMaterial({ color: '#e8c060', metalness: 0.75, roughness: 0.32, emissive: '#3a2600' });
  MAT.cristal = new THREE.MeshStandardMaterial({ color: '#2a1140', emissive: '#6a1fb0', emissiveIntensity: 0.9, roughness: 0.25, metalness: 0.2, flatShading: true });
  MAT.fioApagado = new THREE.MeshBasicMaterial({ color: '#6b5a7a', transparent: true, opacity: 0.55 });
  MAT.fio = new THREE.MeshBasicMaterial({ map: texturaFio(), color: '#ffe6a8', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  MAT.tecido = ['#c9a7f2', '#f2a7c9', '#a7d8f2', '#f2e2a7'].map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.95 }));
  MAT.brilhoOuro = new THREE.SpriteMaterial({ map: texturaBrilho('rgba(255,230,160,1)'), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  MAT.brilhoVazio = new THREE.SpriteMaterial({ map: texturaBrilho('rgba(170,80,255,1)'), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  MAT.vento = new THREE.MeshBasicMaterial({ color: '#d9f4ff', transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
  return MAT;
}

function sombra(o, projeta = true) { o.traverse(m => { if (m.isMesh) { m.castShadow = projeta; m.receiveShadow = true; } }); return o; }
// static props that block for real: their actual triangles are merged into the map's collision
// mesh (colisao.js), so Brisa collides with the exact shape (table legs, spools, pillars…)
function solido(o, sim = true) { o.traverse(m => { if (m.isMesh) m.userData.solido = sim; }); return o; }

// ---------------- props ----------------
function pilar(altura, raio, quebrado) {
  const g = new THREE.Group(), M = materiais();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(raio * 1.35, raio * 1.45, 0.35, 10), M.pedra); base.position.y = 0.17;
  const corpo = new THREE.Mesh(new THREE.CylinderGeometry(raio, raio * 1.08, altura, 10, 1), M.pedraClara); corpo.position.y = 0.35 + altura / 2;
  g.add(base, corpo);
  if (!quebrado) {
    const topo = new THREE.Mesh(new THREE.CylinderGeometry(raio * 1.4, raio * 1.2, 0.3, 10), M.pedra); topo.position.y = 0.35 + altura + 0.15;
    g.add(topo);
  } else {
    // jagged top
    const lasca = new THREE.Mesh(new THREE.ConeGeometry(raio, raio * 1.6, 5), M.pedraClara); lasca.position.set(raio * 0.3, 0.35 + altura + raio * 0.6, 0); lasca.rotation.z = 0.4;
    g.add(lasca);
  }
  sombra(g); fundirEstaticos(g);
  return g;
}

function cristais(n = 5, escala = 1) {
  const g = new THREE.Group(), M = materiais();
  for (let i = 0; i < n; i++) {
    const h = (0.6 + rnd() * 0.9) * escala;
    const c = new THREE.Mesh(new THREE.OctahedronGeometry(0.22 * escala, 0), M.cristal);
    c.scale.set(1, h / (0.22 * escala), 1);
    c.position.set((rnd() - 0.5) * 0.7 * escala, h * 0.45, (rnd() - 0.5) * 0.7 * escala);
    c.rotation.set((rnd() - 0.5) * 0.6, rnd() * 3, (rnd() - 0.5) * 0.6);
    g.add(c);
  }
  sombra(g, false); // crystals break: they must not leave a baked shadow behind
  fundirEstaticos(g); // the cluster breaks as a whole: one mesh
  return g;
}

function curvaFio(de, para, arco) {
  const meio = de.clone().lerp(para, 0.5); meio.y += arco;
  return new THREE.QuadraticBezierCurve3(de, meio, para);
}

function rochaFlutuante(raio) {
  const g = new THREE.Group(), M = materiais();
  const topo = new THREE.Mesh(new THREE.CylinderGeometry(raio, raio * 0.9, 0.35, 9), M.pedra);
  topo.position.y = -0.17;
  const fundo = new THREE.Mesh(new THREE.ConeGeometry(raio * 0.9, raio * 1.8, 9), M.pedra);
  fundo.rotation.x = Math.PI; fundo.position.y = -0.35 - raio * 0.9;
  const musgo = new THREE.Mesh(new THREE.CylinderGeometry(raio * 1.01, raio * 1.01, 0.06, 9), new THREE.MeshStandardMaterial({ color: '#6f8f3a', roughness: 1 }));
  musgo.position.y = -0.02;
  g.add(topo, fundo, musgo);
  sombra(g, false); // bobbing: no baked shadow
  fundirEstaticos(g); // the rock bobs as a whole
  return g;
}

function ilhaDistante() {
  const g = new THREE.Group();
  const terra = new THREE.Mesh(new THREE.ConeGeometry(30, 55, 11), new THREE.MeshStandardMaterial({ color: '#7d8796', roughness: 1, flatShading: true }));
  terra.rotation.x = Math.PI; terra.position.y = -27;
  const topo = new THREE.Mesh(new THREE.CylinderGeometry(31, 30, 4, 11), new THREE.MeshStandardMaterial({ color: '#7fa34a', roughness: 1, flatShading: true }));
  g.add(terra, topo);
  // a few "needles" (the Ilha das Agulhas)
  const metal = new THREE.MeshStandardMaterial({ color: '#d8dce6', metalness: 0.6, roughness: 0.3 });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2, r = 8 + rnd() * 14;
    const ag = new THREE.Mesh(new THREE.ConeGeometry(1.2, 18 + rnd() * 16, 6), metal);
    ag.position.set(Math.cos(a) * r, 10, Math.sin(a) * r);
    g.add(ag);
  }
  fundirEstaticos(g);
  return g;
}

function oficina() {
  // Brisa's workshop: worktable, spools of thread, a giant needle, the open box she wakes up in,
  // a broken wooden frame and a lantern
  const g = new THREE.Group(), M = materiais();
  const mesa = new THREE.Group();
  const tampo = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.12, 0.9), M.madeira); tampo.position.y = 0.95;
  mesa.add(tampo);
  for (const [x, z] of [[-0.8, -0.38], [0.8, -0.38], [-0.8, 0.38], [0.8, 0.38]]) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.9, 0.1), M.madeira); p.position.set(x, 0.45, z); mesa.add(p);
  }
  for (let i = 0; i < 4; i++) { // spools on the table
    const s = new THREE.Group();
    const nucleo = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.22, 12), M.tecido[i]);
    const aba1 = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.03, 12), M.madeira); aba1.position.y = 0.12;
    const aba2 = aba1.clone(); aba2.position.y = -0.12;
    s.add(nucleo, aba1, aba2); s.position.set(-0.6 + i * 0.4, 1.13, (rnd() - 0.5) * 0.4);
    mesa.add(s);
  }
  mesa.position.set(-2.4, 0, 1.2); mesa.rotation.y = 0.3;
  g.add(mesa);
  // giant spools on the ground (can be climbed)
  for (const [x, z, r, i] of [[2.4, -1.6, 0.55, 0], [3.4, 0.2, 0.45, 2]]) {
    const s = new THREE.Group();
    const nucleo = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.8, r * 0.8, r * 1.4, 16), M.tecido[i]); nucleo.position.y = r * 0.8;
    const a1 = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.1, 16), M.madeira); a1.position.y = 0.05;
    const a2 = a1.clone(); a2.position.y = r * 1.55;
    s.add(nucleo, a1, a2); s.position.set(x, 0, z);
    g.add(s);
  }
  // the box she wakes up in (open, with a little fabric pillow)
  const caixa = new THREE.Group();
  for (const [w, h, d, x, y, z] of [[1.0, 0.08, 0.6, 0, 0.04, 0], [1.0, 0.3, 0.06, 0, 0.18, 0.3], [1.0, 0.3, 0.06, 0, 0.18, -0.3], [0.06, 0.3, 0.6, 0.5, 0.18, 0], [0.06, 0.3, 0.6, -0.5, 0.18, 0]]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), M.madeira); b.position.set(x, y, z); caixa.add(b);
  }
  const travesseiro = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.1, 0.45), M.tecido[1]); travesseiro.position.set(-0.25, 0.12, 0);
  caixa.add(travesseiro);
  caixa.position.set(0, 0, -1.6); caixa.rotation.y = -0.2;
  g.add(caixa);
  // giant needle stuck in the ground
  const agulha = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.005, 3.2, 8), new THREE.MeshStandardMaterial({ color: '#dfe5ef', metalness: 0.9, roughness: 0.2 }));
  agulha.position.set(1.6, 1.3, 2.4); agulha.rotation.set(0.25, 0, -0.35);
  g.add(agulha);
  // broken workshop frame
  for (const [x, z, h] of [[-3.6, -1.8, 2.8], [-3.6, 2.2, 2.2]]) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.22, h, 0.22), M.madeira); p.position.set(x, h / 2, z); g.add(p);
  }
  const viga = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 4.4), M.madeira); viga.position.set(-3.6, 2.55, 0.1); viga.rotation.x = 0.13; g.add(viga);
  // lantern
  const lanterna = new THREE.Sprite(M.brilhoOuro.clone()); lanterna.scale.setScalar(0.9); lanterna.position.set(-2.4, 1.45, 1.2);
  g.add(lanterna);
  solido(sombra(g));
  fundirEstaticos(g); // ~30 pieces → one mesh per material
  return { grupo: g };
}

// Chegada dos Caps. 2–4 (no lugar da oficina): o barco a remo em que Brisa chegou ao recife, ou o
// fio dourado do carretel de Aurélia descendo do céu até o chão, com o carretel ao lado.
function chegada(tipo) {
  const g = new THREE.Group(), M = materiais();
  if (tipo === 'barco') {
    const casco = new THREE.Group();
    for (const lado of [-1, 1]) { const t = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.5, 3.0), M.madeira); t.position.set(lado * 0.55, 0.3, 0); t.rotation.z = -lado * 0.25; casco.add(t); }
    const fundo = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.08, 2.8), M.madeira); fundo.position.y = 0.06; casco.add(fundo);
    const banco = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.06, 0.3), M.madeira); banco.position.y = 0.42; casco.add(banco);
    const remo = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.04, 2.4), M.madeira); remo.position.set(0.9, 0.1, 0.3); remo.rotation.y = 0.3; casco.add(remo);
    casco.position.set(-2.2, 0, 1.2); casco.rotation.set(0, 0.5, 0.12);
    g.add(casco);
  } else {
    const fio = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 90, 6, 1, true), M.fio.clone());
    fio.material.map = M.fio.map.clone(); fio.material.map.repeat.set(1, 20); fio.material.map.needsUpdate = true;
    fio.position.set(-2.2, 45, 1.2); g.add(fio);
    g.userData.fio = fio;
  }
  // o carretel de Aurélia (Caps. 3 e 4) ou o de Brisa (Cap. 2), deitado
  const nucleo = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.6, 16), M.tecido[0]);
  const a1 = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.06, 16), M.madeira); a1.position.y = 0.32;
  const a2 = a1.clone(); a2.position.y = -0.32;
  const carretel = new THREE.Group(); carretel.add(nucleo, a1, a2); carretel.rotation.z = Math.PI / 2; carretel.position.set(1.8, 0.42, -1.2);
  g.add(carretel);
  const lanterna = new THREE.Sprite(M.brilhoOuro.clone()); lanterna.scale.setScalar(0.9); lanterna.position.set(-2.2, 1.2, 1.2); g.add(lanterna);
  const fio = g.userData.fio;
  solido(sombra(g)); if (fio) solido(fio, false);
  fundirEstaticos(g, fio ? [fio] : []);
  return { grupo: g, fio };
}

// Figura simples de quem aparece na história (Tomé, Aurélia): corpo, cabeça, chapéu ou coque.
// Aurélia (Cap. 4) é de névoa: translúcida, brilhando, com a agulha na mão.
function figura(tipo) {
  const g = new THREE.Group();
  const nevoa = tipo === 'aurelia';
  const mat = c => nevoa
    ? new THREE.MeshStandardMaterial({ color: '#e9e0ff', emissive: '#8f7ac0', emissiveIntensity: 0.6, transparent: true, opacity: 0.6, roughness: 1, depthWrite: false })
    : new THREE.MeshStandardMaterial({ color: c, roughness: 0.9 });
  const escala = nevoa ? 2.2 : 1;
  const corpo = new THREE.Mesh(new THREE.LatheGeometry([[0, 0], [0.42, 0.02], [0.36, 0.7], [0.26, 1.15], [0.12, 1.32], [0, 1.34]].map(([x, y]) => new THREE.Vector2(x, y)), 14), mat(tipo === 'tome' ? '#e0b43a' : '#7a6aa0'));
  const cabeca = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 10), mat('#e8c4a0')); cabeca.position.y = 1.5;
  g.add(corpo, cabeca);
  if (tipo === 'tome') {
    const chapeu = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.26, 14), mat('#d8a82e')); chapeu.position.y = 1.72;
    const barba = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), mat('#eeeeee')); barba.position.set(0, 1.4, 0.11); barba.scale.set(1, 0.8, 0.6);
    const lanterna = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.22, 0.16), new THREE.MeshStandardMaterial({ color: '#ffe9a8', emissive: '#ffb52e', emissiveIntensity: 1.5 }));
    lanterna.position.set(0.42, 0.85, 0.1);
    g.add(chapeu, barba, lanterna);
  } else {
    const coque = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), mat('#cfc8e0')); coque.position.set(0, 1.66, -0.08);
    const agulha = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.005, 1.4, 6), new THREE.MeshStandardMaterial({ color: '#f4f6ff', emissive: '#c8d0ff', emissiveIntensity: 0.8 }));
    agulha.position.set(0.45, 1.0, 0.1); agulha.rotation.z = 0.5;
    g.add(coque, agulha);
  }
  g.scale.setScalar(escala);
  g.traverse(m => { if (m.isMesh) { m.castShadow = !nevoa; m.receiveShadow = true; } });
  return g;
}

// ---------------- the world ----------------
export function criarMundo({ cena, mapa, terreno }) {
  const M = materiais();
  const raiz = new THREE.Group(); raiz.name = 'mundo';
  cena.add(raiz);
  const extras = []; // colliders for physics (shared with mapa.extras)
  mapa.extras = extras;
  const animados = []; // (dt, t) => void

  const rc = new THREE.Raycaster(); rc.firstHitOnly = true; rc.layers.enableAll();
  const chaoEm = (x, z, y) => { rc.set(new THREE.Vector3(x, y + 4, z), new THREE.Vector3(0, -1, 0)); rc.far = 10; const h = rc.intersectObject(mapa.malha)[0]; return h ? h.point.y : null; };

  // ----- choose landmark areas -----
  const areas = [...terreno.areas].sort((a, b) => b.tamanho - a.tamanho);
  const inicial = areas.find(a => a.id === terreno.areaInicial) ?? areas[0];
  const nasc = terreno.nascimento.clone();
  // anchors: the 3 largest other areas, far enough from each other and from the spawn;
  // Heart: the highest remaining large area (or the farthest point of the spawn area)
  const outras = areas.filter(a => a !== inicial && a.tamanho > 60);
  const escolhidas = [];
  for (const a of outras) {
    if (escolhidas.length === 3) break;
    if (escolhidas.every(e => e.centro.distanceTo(a.centro) > 18) && a.centro.distanceTo(nasc) > 15) escolhidas.push(a);
  }
  while (escolhidas.length < 3) { // small map fallback: spread inside the spawn area
    const p = inicial.livres.reduce((b, q) => (!b || Math.min(q.distanceTo(nasc), ...escolhidas.map(e => q.distanceTo(e.centro))) > Math.min(b.distanceTo(nasc), ...escolhidas.map(e => b.distanceTo(e.centro))) ? q : b), null);
    escolhidas.push({ id: inicial.id, centro: p, livres: inicial.livres });
  }
  // each islet holds one of the three objectives: the terrain analysis can rank a terrace of the hill
  // above a small islet, and then the islet would be left empty (changes nothing when it already does)
  const ilhotas = mapa.pontos?.ilhotas ?? [];
  const naIlhota = a => ilhotas.find(i => Math.hypot(a.centro.x - i.x, a.centro.z - i.z) < 32);
  for (const il of ilhotas) {
    if (escolhidas.some(a => naIlhota(a) === il)) continue;
    const candidata = outras.find(a => naIlhota(a) === il && !escolhidas.includes(a));
    const troca = escolhidas.findIndex(a => !naIlhota(a));
    if (candidata && troca >= 0) escolhidas[troca] = candidata;
  }
  const restantes = outras.filter(a => !escolhidas.includes(a));
  const areaCoracao = restantes.sort((a, b) => b.centro.y - a.centro.y)[0]
    ?? { centro: inicial.livres.reduce((b, q) => (q.distanceTo(nasc) > b.distanceTo(nasc) ? q : b), nasc), livres: inicial.livres };

  // ----- workshop (Cap. 1) or the chapter's arrival point -----
  const of = MARCOS.chegada === 'oficina' ? oficina() : chegada(MARCOS.chegada);
  if (of.fio) animados.push(dt => { of.fio.material.map.offset.y -= dt * 0.5; });
  of.grupo.position.copy(nasc);
  const yOf = chaoEm(nasc.x, nasc.z, nasc.y) ?? nasc.y;
  of.grupo.position.y = yOf;
  // turn the workshop to face the island center
  const centroMapa = mapa.geo.boundingBox.getCenter(new THREE.Vector3());
  of.grupo.rotation.y = Math.atan2(centroMapa.x - nasc.x, centroMapa.z - nasc.z);
  raiz.add(of.grupo);

  // ----- Heart of the Thread -----
  const coracao = { pos: areaCoracao.centro.clone(), restaurado: false, grupo: new THREE.Group(), area: areaCoracao };
  {
    const g = coracao.grupo; g.position.copy(coracao.pos);
    const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 2.0, 0.6, 16), M.pedraClara); pedestal.position.y = 0.3;
    const degrau = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.6, 0.25, 16), M.pedra); degrau.position.y = 0.12;
    const fuso = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.38, 2.6, 12), M.madeira); fuso.position.y = 1.9;
    const aro = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.07, 8, 32), M.ouro); aro.position.y = 2.2; aro.rotation.x = Math.PI / 2;
    const aro2 = aro.clone(); aro2.position.y = 1.4; aro2.scale.setScalar(1.25);
    // the Sky Thread itself: dim and broken until restored
    const fioCeu = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 140, 8, 1, true), M.fioApagado.clone());
    fioCeu.position.y = 3.2 + 70;
    const brilho = new THREE.Sprite(M.brilhoOuro.clone()); brilho.scale.setScalar(2.5); brilho.position.y = 3.3; brilho.material.opacity = 0.25;
    g.add(pedestal, degrau, fuso, aro, aro2, fioCeu, brilho);
    // ring of ruined pillars
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.3, r = 4.2;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const y = chaoEm(coracao.pos.x + x, coracao.pos.z + z, coracao.pos.y);
      if (y === null || Math.abs(y - coracao.pos.y) > 1.5) continue;
      const pl = pilar(1.6 + rnd() * 1.4, 0.32, i % 2 === 1);
      pl.position.set(x, y - coracao.pos.y, z); g.add(pl);
    }
    // o objetivo final de cada capítulo veste o pedestal (capitulo.js: marcos.coracao)
    if (MARCOS.coracao !== 'coracao') coracaoDoCapitulo(g, { pedestal, fuso });
    sombra(g);
    solido(g); solido(fioCeu, false); // the 140 m Sky Thread is light, not a wall
    fundirEstaticos(g, [aro, aro2, fioCeu, ...(coracao.moveis ?? [])]); // pedestal + ring of pillars: one mesh per material
    raiz.add(g);
    Object.assign(coracao, { fioCeu, brilho, aro, aro2 });
    animados.push((dt, t) => {
      aro.rotation.z += dt * (coracao.restaurado ? 1.2 : 0.15);
      aro2.rotation.z -= dt * (coracao.restaurado ? 0.8 : 0.1);
      if (coracao.restaurado) { fioCeu.material.map.offset.y -= dt * 0.6; brilho.material.opacity = 0.75 + Math.sin(t * 3) * 0.2; }
      else fioCeu.material.opacity = 0.35 + (Math.sin(t * 7) > 0.6 ? 0.25 : 0) * Math.random(); // flickering, damaged
    });
  }

  // Caps. 2–4: o casco de Tomé (com Tomé, que aparece quando os sinos tocam), o jardim de Aurélia
  // (árvore de pedra com a fita de Ilma) e a silhueta de névoa de Aurélia com a agulha
  function coracaoDoCapitulo(g, { pedestal, fuso }) {
    if (MARCOS.coracao === 'casaBarco') {
      fuso.visible = false;
      const casa = new THREE.Group();
      const casco = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 1.6, 5.5, 10, 1, true, 0, Math.PI * 1.4), M.madeira);
      casco.material = M.madeira.clone(); casco.material.side = THREE.DoubleSide;
      casco.rotation.z = Math.PI / 2; casco.rotation.y = 0.4; casco.position.set(0, 2.4, -3.6);
      const cabine = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.6, 1.8), M.madeira); cabine.position.set(0.4, 4.6, -3.6);
      const luz = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, 0.05), new THREE.MeshStandardMaterial({ color: '#3a3020', emissive: '#000000' }));
      luz.position.set(0.4, 4.7, -2.68);
      casa.add(casco, cabine, luz);
      g.add(casa);
      const tome = figura('tome'); tome.position.set(1.6, 0.6, 1.2); tome.rotation.y = -0.5; tome.visible = false; g.add(tome);
      coracao.moveis = [tome];
      coracao.aoRestaurar = () => { tome.visible = true; luz.material.color.set('#ffe9a8'); luz.material.emissive.set('#ffb52e'); luz.material.emissiveIntensity = 1.5; };
    } else if (MARCOS.coracao === 'jardim') {
      pedestal.scale.set(0.8, 0.6, 0.8);
      fuso.visible = false;
      // árvore de pedra (coral petrificado) com a fita azul de Ilma amarrada num galho
      const tronco = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.55, 4.2, 9), M.pedraClara); tronco.position.set(0, 2.2, -2.6);
      g.add(tronco);
      for (let k = 0; k < 5; k++) {
        const galho = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.2, 2.2, 6), M.pedraClara);
        const a = (k / 5) * Math.PI * 2; galho.position.set(Math.cos(a) * 0.7, 4.4, -2.6 + Math.sin(a) * 0.7); galho.rotation.set(Math.sin(a) * 0.8, 0, -Math.cos(a) * 0.8);
        g.add(galho);
      }
      const fita = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 1.2), new THREE.MeshStandardMaterial({ color: '#7fb0e8', side: THREE.DoubleSide, roughness: 1 }));
      fita.position.set(0.9, 4.0, -2.4); g.add(fita);
      coracao.moveis = [fita];
      animados.push((dt, t) => { fita.rotation.y = Math.sin(t * 1.7) * 0.5; });
      // banco de pedra onde fica o bilhete
      const banco = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.12, 0.55), M.pedra); banco.position.set(0, 0.5, 0.9);
      for (const sx of [-0.7, 0.7]) { const pe = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.45, 0.45), M.pedra); pe.position.set(sx, 0.22, 0.9); g.add(pe); }
      g.add(banco);
    } else if (MARCOS.coracao === 'aurelia') {
      fuso.visible = false;
      const aurelia = figura('aurelia'); aurelia.position.set(0, 0.6, -1.4); g.add(aurelia);
      solido(aurelia, false); // é névoa: não bloqueia
      coracao.aurelia = aurelia; coracao.moveis = [aurelia];
      animados.push((dt, t) => {
        aurelia.position.y = 0.6 + Math.sin(t * 1.1) * 0.15;
        if (coracao.restaurado) aurelia.traverse(m => { if (m.isMesh) m.material.opacity = Math.max(0, m.material.opacity - dt * 0.08); });
      });
    }
  }

  // Caps. 2–4: o Sino de Boia (balança e toca quando reacende), a Flor de Pedra (as pétalas abrem)
  // e o Nó da Costura (o nó afrouxa e some). A gema continua sendo a luz que acende.
  function ancoraDoCapitulo(g, coluna, gema, anel) {
    if (MARCOS.ancora === 'sino') {
      coluna.scale.set(0.6, 1, 0.6);
      const trave = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.16, 0.16), M.madeira); trave.position.y = 2.55; g.add(trave);
      const sino = new THREE.Group(); sino.position.set(0.55, 2.47, 0);
      const corpo = new THREE.Mesh(new THREE.LatheGeometry([[0.05, 0], [0.18, -0.05], [0.24, -0.35], [0.36, -0.62], [0.38, -0.66]].map(([x, y]) => new THREE.Vector2(x, y)), 14), M.ouro);
      corpo.material = M.ouro.clone(); corpo.material.side = THREE.DoubleSide;
      const badalo = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), M.pedra); badalo.position.y = -0.56;
      sino.add(corpo, badalo); g.add(sino);
      return { restaurada: (desde, t) => { sino.rotation.z = Math.sin(t * 4) * 0.5 * Math.exp(-desde * 0.25) + Math.sin(t * 1.3) * 0.06; } };
    }
    if (MARCOS.ancora === 'flor') {
      coluna.material = M.pedra;
      const petalas = [];
      for (let k = 0; k < 6; k++) {
        const pivo = new THREE.Group(); pivo.position.y = 2.6; pivo.rotation.y = (k / 6) * Math.PI * 2;
        const p = new THREE.Mesh(new THREE.SphereGeometry(0.45, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), M.pedraClara);
        p.scale.set(0.5, 1.4, 0.18); p.position.set(0, 0.45, 0.22);
        pivo.add(p); pivo.rotation.x = -0.15; g.add(pivo); petalas.push(pivo);
      }
      return { restaurada: desde => { const k = Math.min(1, desde / 2.5); for (const p of petalas) p.rotation.x = -0.15 + k * 1.05; } };
    }
    if (MARCOS.ancora === 'no') {
      coluna.scale.set(0.8, 1, 0.8);
      const no = new THREE.Mesh(new THREE.TorusKnotGeometry(0.75, 0.2, 80, 10, 2, 3), new THREE.MeshStandardMaterial({ color: '#c9a7f2', roughness: 0.9, emissive: '#2a1440' }));
      no.position.y = 2.95; g.add(no);
      anel.visible = false;
      return { restaurada: (desde, t) => { const k = Math.max(0, 1 - desde / 3); no.scale.setScalar(0.05 + k * 0.95); no.rotation.y = t * (1 + (1 - k) * 4); no.visible = k > 0.01; } };
    }
    return null;
  }

  // ----- anchors -----
  const ancoras = escolhidas.map((a, i) => {
    const pos = a.centro.clone();
    const g = new THREE.Group(); g.position.copy(pos);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.1, 0.4, 12), M.pedra); base.position.y = 0.2;
    const coluna = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 2.2, 10), M.pedraClara); coluna.position.y = 1.5;
    const gema = new THREE.Mesh(new THREE.OctahedronGeometry(0.32, 0), new THREE.MeshStandardMaterial({ color: '#6b5a7a', emissive: '#000000', roughness: 0.3, metalness: 0.3 }));
    gema.position.y = 2.95;
    const anel = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.05, 6, 24), M.ouro); anel.position.y = 2.95; anel.rotation.x = Math.PI / 2;
    // cut thread: a short frayed piece hanging from the top
    const pedaco = new THREE.Mesh(new THREE.TubeGeometry(curvaFio(new THREE.Vector3(0, 3.1, 0), new THREE.Vector3(0.9, 2.2, 0.4), 0.6), 12, 0.035, 6), M.fioApagado);
    g.add(base, coluna, gema, anel, pedaco);
    const enfeite = MARCOS.ancora !== 'ancora' ? ancoraDoCapitulo(g, coluna, gema, anel) : null;
    sombra(g); solido(g); solido(pedaco, false); raiz.add(g);
    // ruins around
    for (let k = 0; k < 2; k++) {
      const ang = rnd() * Math.PI * 2, r = 3.4 + rnd() * 1.5;
      const x = Math.cos(ang) * r, z = Math.sin(ang) * r;
      const y = chaoEm(pos.x + x, pos.z + z, pos.y);
      if (y === null || Math.abs(y - pos.y) > 1.2) continue;
      const pl = pilar(1 + rnd() * 1.8, 0.28, true); pl.position.set(pos.x + x, y, pos.z + z); pl.rotation.y = rnd() * 3;
      raiz.add(solido(pl));
    }
    // Void crystals holding the anchor
    const listaCristais = [];
    for (let k = 0; k < 3; k++) {
      const ang = (k / 3) * Math.PI * 2 + rnd(), r = 2.1 + rnd() * 0.6;
      const x = pos.x + Math.cos(ang) * r, z = pos.z + Math.sin(ang) * r;
      const y = chaoEm(x, z, pos.y);
      if (y === null) continue;
      const cr = cristais(5, 1.1); cr.position.set(x, y, z); raiz.add(cr);
      const aura = new THREE.Sprite(M.brilhoVazio.clone()); aura.scale.setScalar(2.2); aura.position.set(x, y + 0.6, z); aura.material.opacity = 0.5; raiz.add(aura);
      const cristal = { grupo: cr, aura, pos: new THREE.Vector3(x, y + 0.5, z), vida: 3, quebrado: false, flash: 0 };
      listaCristais.push(cristal);
      // breakable, so not part of the static mesh: a cylinder that stops blocking once it breaks
      extras.push({ x, z, raio: 0.45, base: y - 0.2, topo: y + 1.3, get solido() { return !cristal.quebrado; } });
    }
    const ancora = { indice: i, pos, grupo: g, gema, anel, pedaco, cristais: listaCristais, guardas: [], restaurada: false, area: a, fio: null, requer: [4, 8, 12][i], enfeite, desde: 0 };
    animados.push((dt, t) => {
      if (enfeite && ancora.restaurada) { ancora.desde += dt; enfeite.restaurada?.(ancora.desde, t); }
      anel.rotation.z += dt * (ancora.restaurada ? 1.5 : 0.2);
      gema.rotation.y += dt * (ancora.restaurada ? 2 : 0.3);
      if (ancora.fio) ancora.fio.material.map.offset.y -= dt * 0.8;
      for (const c of listaCristais) {
        if (c.quebrado) continue;
        c.aura.material.opacity = 0.35 + Math.sin(t * 2 + c.pos.x) * 0.15 + c.flash;
        c.flash = Math.max(0, c.flash - dt * 3);
        c.grupo.scale.setScalar(1 + c.flash * 0.25);
      }
    });
    return ancora;
  });

  ancoras.restaurar = ancora => {
    ancora.enfeite?.aoRestaurar?.();
    ancora.restaurada = true;
    ancora.pedaco.visible = false;
    ancora.gema.material.color.set('#ffe9a8'); ancora.gema.material.emissive.set('#ffb52e'); ancora.gema.material.emissiveIntensity = 1.4;
    // golden thread from the anchor to the Heart
    const de = ancora.pos.clone().add(new THREE.Vector3(0, 2.95, 0)), para = coracao.pos.clone().add(new THREE.Vector3(0, 2.4, 0));
    const curva = curvaFio(de, para, 6 + de.distanceTo(para) * 0.15);
    const fio = new THREE.Mesh(new THREE.TubeGeometry(curva, 64, 0.06, 6), M.fio.clone());
    fio.material.map = M.fio.map.clone(); fio.material.map.repeat.set(1, de.distanceTo(para) / 3); fio.material.map.needsUpdate = true;
    raiz.add(fio); ancora.fio = fio;
    const luz = new THREE.Sprite(M.brilhoOuro.clone()); luz.scale.setScalar(3); luz.position.copy(de); raiz.add(luz);
  };

  coracao.restaurar = () => {
    coracao.restaurado = true;
    coracao.fioCeu.material = M.fio.clone();
    coracao.fioCeu.material.map = M.fio.map.clone(); coracao.fioCeu.material.map.repeat.set(1, 30); coracao.fioCeu.material.map.needsUpdate = true;
    coracao.fioCeu.scale.set(2.2, 1, 2.2);
    ponte.visible = MARCOS.coracao !== 'aurelia'; ilha.visible = MARCOS.coracao === 'coracao'; bilhete.visible = true;
    coracao.aoRestaurar?.();
  };

  // ----- distant island + light bridge (revealed at the end) -----
  const dirFora = coracao.pos.clone().sub(centroMapa).setY(0);
  if (dirFora.lengthSq() < 1) dirFora.set(1, 0, 0);
  dirFora.normalize();
  const ilha = ilhaDistante();
  ilha.position.copy(coracao.pos).addScaledVector(dirFora, 210); ilha.position.y = coracao.pos.y + 6;
  ilha.visible = false; raiz.add(ilha);
  const inicioPonte = coracao.pos.clone().addScaledVector(dirFora, 6).add(new THREE.Vector3(0, 0.3, 0));
  // no fim: Cap. 1, a ponte de luz até a ilha distante; Cap. 2, o fio do carretel descendo até o
  // fundo; Cap. 3, o fio subindo em direção ao olho da tempestade; Cap. 4, nada (a costura se desfaz)
  const fimPonte = MARCOS.coracao === 'casaBarco' ? inicioPonte.clone().addScaledVector(dirFora, 70).setY(inicioPonte.y - 140)
    : MARCOS.coracao === 'jardim' ? inicioPonte.clone().addScaledVector(dirFora, 50).setY(inicioPonte.y + 150)
      : ilha.position.clone().addScaledVector(dirFora, -28).add(new THREE.Vector3(0, 1, 0));
  const meioPonte = inicioPonte.clone().lerp(fimPonte, 0.5); meioPonte.y += 14;
  const ponte = new THREE.Mesh(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(inicioPonte, meioPonte, fimPonte), 120, 0.7, 4), M.fio.clone());
  ponte.material.map = M.fio.map.clone(); ponte.material.map.repeat.set(1, 60); ponte.material.map.needsUpdate = true;
  ponte.scale.y = 1; ponte.visible = false; raiz.add(ponte);
  animados.push(dt => { if (ponte.visible) ponte.material.map.offset.y -= dt * 0.5; });
  // the note pinned to the spindle
  const bilhete = new THREE.Mesh(new THREE.PlaneGeometry(0.35, 0.45), new THREE.MeshStandardMaterial({ color: '#f5ead2', side: THREE.DoubleSide, emissive: '#3a3020' }));
  bilhete.position.copy(coracao.pos).add(new THREE.Vector3(0, 1.6, 0.4)); bilhete.visible = false; raiz.add(bilhete);
  coracao.bilhete = bilhete;

  // ----- wind currents (the launchers computed by the terrain analysis) -----
  const correntes = terreno.trampolins.map(t => {
    const g = new THREE.Group(); g.position.copy(t.pos);
    const anelBase = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.08, 6, 24), M.pedraClara); anelBase.rotation.x = Math.PI / 2; anelBase.position.y = 0.05;
    const espiral = [];
    for (let k = 0; k < 3; k++) {
      const pts = [];
      for (let s = 0; s <= 40; s++) { const u = s / 40, a = u * Math.PI * 5 + k * 2.1, r = 0.35 + u * 0.55; pts.push(new THREE.Vector3(Math.cos(a) * r, u * 4.2, Math.sin(a) * r)); }
      const fita = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 60, 0.03, 4), M.vento);
      g.add(fita); espiral.push(fita);
    }
    // a soft arrow of light hinting where the wind goes
    const dir = t.alvo.clone().sub(t.pos).setY(0).normalize();
    const seta = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.5, 8), new THREE.MeshBasicMaterial({ color: '#fff2b0' }));
    seta.position.set(dir.x * 0.4, 4.6, dir.z * 0.4); seta.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().setY(1.2).normalize());
    g.add(anelBase, seta);
    sombra(anelBase, false);
    raiz.add(g);
    const c = { ...t, grupo: g, espiral, seta, mola: 0 };
    animados.push((dt, tt) => {
      g.children.forEach((f, k) => { if (espiral.includes(f)) f.rotation.y += dt * (2.2 + k * 0.4 + c.mola * 8); });
      seta.position.y = 4.6 + Math.sin(tt * 3) * 0.12;
      c.mola = Math.max(0, c.mola - dt * 2);
    });
    return c;
  });

  // ----- floating rocks (bobbing platforms over the void, each holding a fragment) -----
  const rochas = [];
  const bordas = [...terreno.bordas].sort(() => rnd() - 0.5);
  for (const b of bordas) {
    if (rochas.length >= 5) break;
    const centro = b.pos.clone().addScaledVector(b.para, 2.7);
    centro.y += 0.9;
    if (rochas.some(r => r.base.distanceTo(centro) < 14)) continue;
    if (correntes.some(c => c.pos.distanceTo(centro) < 6)) continue;
    if (centro.distanceTo(nasc) < 8) continue;
    // nothing solid where the rock goes
    rc.set(centro.clone().add(new THREE.Vector3(0, 3, 0)), new THREE.Vector3(0, -1, 0)); rc.far = 6;
    if (rc.intersectObject(mapa.malha).length) continue;
    const r = 1.05;
    const malha = rochaFlutuante(r); malha.position.copy(centro); raiz.add(malha);
    const col = { x: centro.x, z: centro.z, raio: r, base: centro.y - 1.6, topo: centro.y, movel: true, dy: 0 };
    extras.push(col);
    const rocha = { base: centro.clone(), malha, col, fase: rnd() * 6 };
    rochas.push(rocha);
  }
  animados.push((dt, t) => {
    for (const r of rochas) {
      const y = r.base.y + Math.sin(t * 1.4 + r.fase) * 0.28;
      r.col.dy = y - r.col.topo;
      r.col.topo = y; r.col.base = y - 1.6;
      r.malha.position.y = y;
      r.malha.rotation.y += dt * 0.08;
    }
  });

  // ----- magical lights and floating debris -----
  const luzes = new THREE.Group(); raiz.add(luzes);
  const pontosLuz = [nasc, coracao.pos, ...ancoras.map(a => a.pos)];
  for (const p of pontosLuz) {
    for (let k = 0; k < 6; k++) {
      const s = new THREE.Sprite(M.brilhoOuro.clone());
      s.scale.setScalar(0.35 + rnd() * 0.3);
      s.userData = { base: p.clone().add(new THREE.Vector3((rnd() - 0.5) * 9, 1 + rnd() * 3, (rnd() - 0.5) * 9)), fase: rnd() * 6 };
      luzes.add(s);
    }
  }
  // floating debris: one instanced mesh (a single draw call for all the rocks)
  const caixaMapa = mapa.geo.boundingBox;
  const N_DESTROCOS = 34;
  const destrocos = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), M.pedra, N_DESTROCOS);
  destrocos.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  destrocos.frustumCulled = false; // the rocks orbit the whole island
  raiz.add(destrocos);
  const dadosDestrocos = [];
  for (let k = 0; k < N_DESTROCOS; k++) {
    const r = 0.4 + rnd() * 1.6;
    const ang = rnd() * Math.PI * 2, dist = 30 + rnd() * 65;
    dadosDestrocos.push({ r, ang, dist, y: caixaMapa.min.y + 5 + rnd() * (caixaMapa.max.y - caixaMapa.min.y), vel: (0.01 + rnd() * 0.02) * (rnd() < 0.5 ? 1 : -1), giro: (rnd() - 0.5) * 0.6, rot: new THREE.Euler() });
  }
  const mD = new THREE.Matrix4(), qD = new THREE.Quaternion(), pD = new THREE.Vector3(), sD = new THREE.Vector3();
  animados.push((dt, t) => {
    for (const s of luzes.children) {
      const u = s.userData;
      s.position.set(u.base.x + Math.sin(t * 0.4 + u.fase) * 0.6, u.base.y + Math.sin(t * 0.9 + u.fase) * 0.35, u.base.z + Math.cos(t * 0.35 + u.fase) * 0.6);
      s.material.opacity = 0.55 + Math.sin(t * 2 + u.fase) * 0.35;
    }
    dadosDestrocos.forEach((u, k) => {
      u.ang += u.vel * dt;
      pD.set(centroMapa.x + Math.cos(u.ang) * u.dist, u.y + Math.sin(t * 0.5 + u.ang * 3) * 0.6, centroMapa.z + Math.sin(u.ang) * u.dist);
      u.rot.x += u.giro * dt; u.rot.y += u.giro * 0.7 * dt;
      destrocos.setMatrixAt(k, mD.compose(pD, qD.setFromEuler(u.rot), sD.setScalar(u.r)));
    });
    destrocos.instanceMatrix.needsUpdate = true;
  });

  // falling pebbles during tremors: real gravity, they hit the ground, bounce, roll and settle
  const poeira = new THREE.Group(); raiz.add(poeira);
  const GRAVIDADE = 9.8, RESTITUICAO = 0.35, ATRITO = 0.6;
  const geoPedrinha = new THREE.DodecahedronGeometry(1, 0); // shared: a tremor uploads nothing new
  const sacudir = (centro) => {
    for (let k = 0; k < 14; k++) {
      const r = 0.06 + rnd() * 0.1;
      // (o mesmo material das outras pedras no nível atual: nenhum shader novo para compilar)
      const p = new THREE.Mesh(geoPedrinha, destrocos.material); p.scale.setScalar(r);
      p.position.copy(centro).add(new THREE.Vector3((rnd() - 0.5) * 14, 4 + rnd() * 5, (rnd() - 0.5) * 14));
      // the ground under each pebble is measured once (it falls almost straight down)
      const chao = chaoEm(p.position.x, p.position.z, p.position.y - 4);
      p.userData = { v: new THREE.Vector3((rnd() - 0.5) * 0.6, -1 - rnd() * 2, (rnd() - 0.5) * 0.6), giro: new THREE.Vector3(rnd() * 6, rnd() * 6, rnd() * 6), r, chao, vida: 5 };
      poeira.add(p);
    }
  };
  animados.push(dt => {
    for (const p of [...poeira.children]) {
      const u = p.userData;
      u.v.y -= GRAVIDADE * dt;
      p.position.addScaledVector(u.v, dt);
      p.rotation.x += u.giro.x * dt; p.rotation.y += u.giro.y * dt; p.rotation.z += u.giro.z * dt;
      if (u.chao !== null && p.position.y - u.r < u.chao) {
        p.position.y = u.chao + u.r;
        if (u.v.y < 0) u.v.y = -u.v.y * RESTITUICAO; // bounce, losing energy
        if (u.v.y < 0.4) u.v.y = 0;
        u.v.x *= 1 - ATRITO * dt * 4; u.v.z *= 1 - ATRITO * dt * 4;
        u.giro.multiplyScalar(1 - dt * 3);
      }
      u.vida -= dt;
      if (u.vida < 1) p.scale.setScalar(u.r * Math.max(0.01, u.vida)); // shrink away instead of popping
      if (u.vida <= 0) poeira.remove(p);
    }
  });

  // static solid meshes (merged into the collision mesh once everything is placed)
  const solidos = () => {
    const lista = [];
    raiz.updateMatrixWorld(true);
    raiz.traverse(m => { if (m.isMesh && m.userData.solido) lista.push(m); });
    return lista;
  };

  // positions for guardians and wandering enemies
  const posicoesInimigos = [];
  for (const a of ancoras) {
    const perto = a.area.livres.filter(p => p.distanceTo(a.pos) > 3.5 && p.distanceTo(a.pos) < 8 && Math.abs(p.y - a.pos.y) < 1.5);
    for (let k = 0; k < 3 && perto.length; k++) posicoesInimigos.push({ pos: perto.splice(Math.floor(rnd() * perto.length), 1)[0], ancora: a });
  }
  {
    const perto = coracao.area.livres.filter(p => p.distanceTo(coracao.pos) > 4 && p.distanceTo(coracao.pos) < 9);
    for (let k = 0; k < 2 && perto.length; k++) posicoesInimigos.push({ pos: perto.splice(Math.floor(rnd() * perto.length), 1)[0], coracao: true });
  }
  // a couple of wanderers on the spawn island (first fights, away from the workshop)
  {
    const perto = inicial.livres.filter(p => p.distanceTo(nasc) > 12 && p.distanceTo(nasc) < 30);
    for (let k = 0; k < 2 && perto.length; k++) posicoesInimigos.push({ pos: perto.splice(Math.floor(rnd() * perto.length), 1)[0] });
  }

  // fragments: the ones spread by the terrain analysis + one on each floating rock
  // (the rock ones are the memory fragments: the hardest to reach)
  const fragmentos = terreno.estrelas.slice(0, 25 - rochas.length).map(p => ({ pos: p.clone(), memoria: false }));
  rochas.forEach(r => fragmentos.push({ pos: r.base.clone().add(new THREE.Vector3(0, 1, 0)), memoria: true, rocha: r }));
  // if there are fewer rocks than memories, mark the farthest regular fragments as memories
  const nMem = fragmentos.filter(f => f.memoria).length;
  if (nMem < 5) fragmentos.filter(f => !f.memoria).sort((a, b) => b.pos.distanceTo(nasc) - a.pos.distanceTo(nasc)).slice(0, 5 - nMem).forEach(f => { f.memoria = true; });

  function atualizar(dt, t) { for (const f of animados) f(dt, t); }

  // Low: props trocam o material PBR (normal map, rugosidade) por Lambert com a mesma textura e
  // cor — bem mais barato por pixel em GPU integrada. As gemas das âncoras ficam como estão
  // (a restauração muda a cor delas).
  const gemas = new Set(ancoras.map(a => a.gema));
  const simples = new Map();
  function aplicarNivel(nivel) {
    raiz.traverse(m => {
      if (!m.isMesh || gemas.has(m)) return;
      const orig = m.userData.materialOriginal ?? m.material;
      if (!orig.isMeshStandardMaterial) return;
      m.userData.materialOriginal = orig;
      if (!nivel.materialSimples) { m.material = orig; return; }
      if (!simples.has(orig)) {
        simples.set(orig, new THREE.MeshLambertMaterial({
          map: orig.map, color: orig.color, emissive: orig.emissive, emissiveIntensity: orig.emissiveIntensity,
          flatShading: orig.flatShading, transparent: orig.transparent, opacity: orig.opacity, side: orig.side,
        }));
      }
      m.material = simples.get(orig);
    });
  }

  return { raiz, extras, ancoras, coracao, correntes, rochas, fragmentos, posicoesInimigos, sacudir, atualizar, solidos, oficina: of.grupo, ilha, ponte, luzes, aplicarNivel };
}
