import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { MeshBVH, acceleratedRaycast } from 'three-mesh-bvh';
import { montarBlocos, CAMADA_SOMBRA } from './mapa.js';
import { construirVila, construirFarol, construirRuinas } from './casas.js';

// Arquipélago gerado por código (substitui o mapa.fbx do Meshy, que segue disponível em ?mapa=antigo).
// Devolve o mesmo formato de carregarMapa() (mapa.js): malha de colisão com BVH, blocos com LOD,
// amostra de cor para a análise do terreno. Assim colisão, sombra fixa, grama, cachoeiras, mar e
// praia funcionam sem mudança.
//
//  - Ilha principal (~230 m): campina com morros em terraços, floresta, a Vila de Maré Alta com
//    casas abandonadas, trilhas de terra, borda arredondada, falésias em camadas e a base de rocha
//    pendurada embaixo (ilha flutuante).
//  - Três ilhotas: a do Farol (alta), a das Ruínas e a do Pomar (baixa), ligadas por correntes de vento
//    (posicionadas pela análise do terreno).
//  - Vegetação variada (pinheiros, árvores frondosas, bétulas, arbustos, flores, pedras), agrupada em
//    setores de 48 m: um desenho por setor e um nível leve para longe; balança com o vento no shader.
//
// Tudo é determinístico (semente fixa): o mesmo mapa toda vez.

// ---------------- ruído ----------------
function hash(i, j, s) {
  let h = (Math.imul(i, 374761393) + Math.imul(j, 668265263) + Math.imul(s, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function ruido(x, z, s = 0) {
  const i = Math.floor(x), j = Math.floor(z), fx = x - i, fz = z - j;
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = hash(i, j, s), b = hash(i + 1, j, s), c = hash(i, j + 1, s), d = hash(i + 1, j + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, z, oitavas = 4, s = 0) {
  let v = 0, a = 0.5, f = 1, t = 0;
  for (let k = 0; k < oitavas; k++) { v += a * ruido(x * f, z * f, s + k * 31); t += a; f *= 2.03; a *= 0.5; }
  return v / t; // 0..1
}
const suave = (x, a, b) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const gauss = (x, z, cx, cz, r) => Math.exp(-((x - cx) ** 2 + (z - cz) ** 2) / (2 * r * r));
const misturar = (a, b, t) => a + (b - a) * t;
// as cores foram escolhidas em sRGB; o three.js trata cor de vértice como linear
function paraLinear(arr) { for (let i = 0; i < arr.length; i++) arr[i] = Math.pow(arr[i], 2.2); return arr; }
function aleatorio(semente) { let s = semente >>> 0 || 1; return () => ((s = Math.imul(s, 1664525) + 1013904223 >>> 0) / 4294967296); }

// ---------------- desenho do arquipélago ----------------
const VILA = { x: 34, z: 30, r: 15 };      // praça da Vila de Maré Alta (onde a protagonista acorda)
const MORRO = { x: -28, z: -22 };          // morro dos terraços (mirante)
const PRINCIPAL = { nome: 'principal', cx: 0, cz: 0, R: 105, prof: 62, semente: 11 };
// ilhotas: direção a partir do centro, raio, altura do topo e vão até a ilha principal
let TODAS = []; // principal + ilhotas (preenchido em gerarIlha)
const ILHOTAS = [
  { nome: 'farol', ang: -0.5, R: 24, topo: 15, vao: 12, prof: 30, semente: 23 },
  { nome: 'ruinas', ang: 2.68, R: 30, topo: 5, vao: 13, prof: 36, semente: 37 },
  { nome: 'pomar', ang: 1.29, R: 23, topo: -5, vao: 11, prof: 28, semente: 41 },
];

// borda irregular da ilha (função periódica no ângulo)
function raioBorda(ilha, th) {
  const s = ilha.semente;
  return ilha.R * (1 + 0.06 * Math.sin(3 * th + s) + 0.04 * Math.sin(5 * th + s * 0.7) + 0.025 * Math.sin(9 * th + s * 1.3) + 0.015 * Math.sin(14 * th + s * 2.1));
}

// caminhos de terra (coordenadas do mundo), montados depois que as ilhotas têm posição
let CAMINHOS = [];
function distCaminho(x, z) {
  let d = Infinity;
  for (const c of CAMINHOS) for (let k = 0; k < c.length - 1; k++) {
    const [ax, az] = c[k], [bx, bz] = c[k + 1];
    const vx = bx - ax, vz = bz - az, l2 = vx * vx + vz * vz;
    const t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / l2));
    d = Math.min(d, Math.hypot(x - ax - vx * t, z - az - vz * t));
  }
  return d;
}

function alturaBasePrincipal(x, z, d) {
  let h = (fbm(x * 0.016 + 3, z * 0.016 - 7, 4, 11) - 0.5) * 14;
  h += 24 * gauss(x, z, MORRO.x, MORRO.z, 30) + 10 * gauss(x, z, 52, -42, 20) + 7 * gauss(x, z, -58, 52, 22);
  // terraços no morro: degraus de 3,4 m (a borda de cada degrau dá para escalar)
  const kt = suave(h, 5, 13), q = 3.4;
  h += (Math.round(h / q) * q - h) * 0.5 * kt;
  h -= suave(d, 0.84, 1.0) * 4; // borda arredondada
  return h;
}
let alturaVila = 0;
function alturaTopo(ilha, x, z, d) {
  // x, z: mundo; d: distância ao centro / raio da borda (0..1)
  if (ilha === PRINCIPAL) {
    let h = alturaBasePrincipal(x, z, d);
    const kv = 1 - suave(Math.hypot(x - VILA.x, z - VILA.z), VILA.r + 2, VILA.r + 14);
    h = misturar(h, alturaVila, kv);
    const kp = 1 - suave(distCaminho(x, z), 1.4, 3.2);
    return h - kp * 0.12;
  }
  const lx = x - ilha.cx, lz = z - ilha.cz;
  let h = ilha.topo + (fbm(lx * 0.05 + ilha.semente, lz * 0.05, 3, ilha.semente) - 0.5) * 5;
  h += (ilha.nome === 'farol' ? 4 : 2) * gauss(lx, lz, 0, 0, ilha.R * 0.35);
  // dois lugares planos: o centro (onde fica a Âncora de Fio) e o da construção, mais para fora
  const plano = ilha.topo + (ilha.nome === 'farol' ? 4 : 2);
  h = misturar(h, plano, 1 - suave(Math.hypot(lx, lz), 5, 9));
  if (ilha.obra) h = misturar(h, plano, 1 - suave(Math.hypot(lx - ilha.obra.x, lz - ilha.obra.z), ilha.obra.r, ilha.obra.r + 5));
  return h - suave(d, 0.8, 1.0) * 2.5;
}

// qual ilha tem chão neste ponto (topo), e a que fração do raio ele está
function localizar(x, z) {
  for (const ilha of TODAS) {
    const lx = x - ilha.cx, lz = z - ilha.cz, r = Math.hypot(lx, lz);
    if (r > ilha.R * 1.2) continue;
    const d = r / raioBorda(ilha, Math.atan2(lz, lx));
    if (d <= 1) return { ilha, d };
  }
  return null;
}
export function alturaEm(x, z) {
  const l = localizar(x, z);
  return l ? alturaTopo(l.ilha, x, z, l.d) : null;
}
function inclinacao(x, z) {
  const e = 0.8, h = alturaEm(x, z), hx = alturaEm(x + e, z), hz = alturaEm(x, z + e);
  if (h === null || hx === null || hz === null) return 1;
  return Math.hypot(hx - h, hz - h) / e; // tangente da inclinação
}

// ---------------- cores do chão ----------------
const C = (r, g, b) => [r, g, b];
const GRAMA = [C(0.42, 0.62, 0.24), C(0.53, 0.69, 0.29), C(0.35, 0.55, 0.24), C(0.64, 0.67, 0.34)];
const TERRA = C(0.62, 0.52, 0.37), TRILHA = C(0.74, 0.64, 0.45), ROCHA = C(0.53, 0.5, 0.46), MUSGO = C(0.33, 0.45, 0.22);
function lerpCor(a, b, t, out) { out[0] = misturar(a[0], b[0], t); out[1] = misturar(a[1], b[1], t); out[2] = misturar(a[2], b[2], t); return out; }
const _c1 = [0, 0, 0], _c2 = [0, 0, 0];
function corTopo(x, z, d, out) {
  const n1 = fbm(x * 0.035, z * 0.035, 3, 5), n2 = fbm(x * 0.11 + 9, z * 0.11, 2, 6);
  lerpCor(GRAMA[0], GRAMA[1], suave(n1, 0.35, 0.7), _c1);
  lerpCor(_c1, GRAMA[2], suave(n2, 0.55, 0.85) * 0.8, _c1);
  lerpCor(_c1, GRAMA[3], suave(fbm(x * 0.012 + 40, z * 0.012, 2, 7), 0.62, 0.8) * 0.7, _c1); // campos secos
  // praça e ruas da vila: terra batida com grama nas frestas
  const dv = Math.hypot(x - VILA.x, z - VILA.z);
  if (dv < VILA.r + 6) lerpCor(_c1, TERRA, (1 - suave(dv, VILA.r - 4, VILA.r + 6)) * (0.55 + 0.35 * n2), _c1);
  // trilhas: borda irregular
  const dc = distCaminho(x, z) + (n2 - 0.5) * 1.2;
  if (dc < 3) lerpCor(_c1, TRILHA, 1 - suave(dc, 0.9, 2.6), _c1);
  // borda da ilha: terra escura e capim ralo
  lerpCor(_c1, TERRA, suave(d, 0.9, 1.0) * 0.6, _c1);
  out[0] = _c1[0]; out[1] = _c1[1]; out[2] = _c1[2];
  return out;
}
// falésia e base: camadas de rocha (estratos), musgo perto do topo, mais escuro na ponta
function corRocha(x, y, z, topoY, fundoY, out) {
  const n = fbm(x * 0.08, z * 0.08 + y * 0.05, 3, 9);
  const estrato = 0.5 + 0.5 * Math.sin(y * 0.85 + n * 4);
  lerpCor(C(0.6, 0.51, 0.4), C(0.47, 0.42, 0.37), estrato, _c2);
  lerpCor(_c2, C(0.66, 0.58, 0.47), suave(n, 0.6, 0.8) * 0.6, _c2);
  const desce = suave(y, topoY, fundoY); // 0 no topo, 1 na ponta
  lerpCor(_c2, C(0.29, 0.27, 0.26), desce * 0.75, _c2);
  lerpCor(_c2, MUSGO, (1 - suave(topoY - y, 0, 5)) * 0.6, _c2);
  out[0] = _c2[0]; out[1] = _c2[1]; out[2] = _c2[2];
  return out;
}

// ---------------- malha de uma ilha ----------------
// Malha polar contínua: anéis do centro até a borda (topo), depois a falésia descendo e a base de
// rocha afunilando até a ponta. Os níveis de detalhe pulam anéis e setores (passo 1, 2, 4).
const ANEIS_FALESIA = 6, ANEIS_BASE = 16;
function malhaIlha(ilha, dados) {
  const NS = Math.max(64, Math.round((2 * Math.PI * ilha.R) / 1.6 / 4) * 4);
  const NA = Math.max(12, Math.round(ilha.R / 1.25));
  const aneis = []; // cada anel: lista de índices de vértice (NS)
  const { pos, cor, uv, caixa } = dados;
  const base = pos.length / 3;
  const corTmp = [0, 0, 0];
  const add = (x, y, z, c) => {
    pos.push(x, y, z); cor.push(c[0], c[1], c[2]);
    uv.push((x - caixa.minX) / caixa.tam, (z - caixa.minZ) / caixa.tam);
    return pos.length / 3 - 1;
  };
  // centro
  const cy = alturaTopo(ilha, ilha.cx, ilha.cz, 0);
  const centro = add(ilha.cx, cy, ilha.cz, corTopo(ilha.cx, ilha.cz, 0, corTmp));
  const bordaY = new Float32Array(NS), bordaR = new Float32Array(NS);
  for (let i = 1; i <= NA; i++) {
    const f = i / NA, anel = [];
    for (let j = 0; j < NS; j++) {
      const th = (j / NS) * Math.PI * 2, R = raioBorda(ilha, th);
      const r = R * f, x = ilha.cx + Math.cos(th) * r, z = ilha.cz + Math.sin(th) * r;
      const y = alturaTopo(ilha, x, z, f);
      if (i === NA) { bordaY[j] = y; bordaR[j] = R; }
      anel.push(add(x, y, z, corTopo(x, z, f, corTmp)));
    }
    aneis.push(anel);
  }
  const topoNivel = aneis.length; // anéis do topo: 0 .. NA-1
  // falésia: desce quase reta, com ressaltos de rocha
  const descidaFalesia = 2.4;
  for (let k = 1; k <= ANEIS_FALESIA; k++) {
    const anel = [];
    for (let j = 0; j < NS; j++) {
      const th = (j / NS) * Math.PI * 2, ct = Math.cos(th), st = Math.sin(th);
      const y = bordaY[j] - k * descidaFalesia;
      const ressalto = 1 + 0.05 * (fbm(ct * 6 + y * 0.12, st * 6 - y * 0.12, 3, ilha.semente + 3) - 0.5) - 0.012 * k;
      const r = bordaR[j] * ressalto;
      const x = ilha.cx + ct * r, z = ilha.cz + st * r;
      anel.push(add(x, y, z, corRocha(x, y, z, bordaY[j], bordaY[j] - ilha.prof, corTmp)));
    }
    aneis.push(anel);
  }
  // base pendurada: afunila até a ponta, com saliências
  const yIni = (j) => bordaY[j] - ANEIS_FALESIA * descidaFalesia;
  for (let m = 1; m <= ANEIS_BASE; m++) {
    const t = m / (ANEIS_BASE + 1), anel = [];
    for (let j = 0; j < NS; j++) {
      const th = (j / NS) * Math.PI * 2, ct = Math.cos(th), st = Math.sin(th);
      const y = yIni(j) - ilha.prof * Math.pow(t, 0.9);
      const bossa = 1 + 0.16 * (fbm(ct * 3 + t * 4, st * 3 - t * 4, 3, ilha.semente + 7) - 0.5);
      const r = bordaR[j] * 0.93 * Math.pow(1 - t, 1.2) * bossa;
      const x = ilha.cx + ct * r, z = ilha.cz + st * r;
      anel.push(add(x, y, z, corRocha(x, y, z, bordaY[j], bordaY[j] - ilha.prof, corTmp)));
    }
    aneis.push(anel);
  }
  const yPonta = Math.min(...bordaY) - ANEIS_FALESIA * descidaFalesia - ilha.prof * 1.02;
  const ponta = add(ilha.cx, yPonta, ilha.cz, corRocha(ilha.cx, yPonta, ilha.cz, cy, cy - 1, corTmp));

  // índices por nível de detalhe
  const niveis = [1, 2, 4].map(passo => {
    const ind = [];
    // anéis usados neste nível: o topo pula de "passo" em "passo"; sempre a borda, a falésia e a base
    const usados = [];
    for (let i = passo - 1; i < topoNivel; i += passo) usados.push(i);
    if (usados[usados.length - 1] !== topoNivel - 1) usados.push(topoNivel - 1);
    for (let i = topoNivel; i < aneis.length; i += (i < topoNivel + ANEIS_FALESIA ? 1 : Math.min(passo, 2))) usados.push(i);
    if (usados[usados.length - 1] !== aneis.length - 1) usados.push(aneis.length - 1);
    const seg = (j) => j % NS;
    // leque do centro
    const a0 = aneis[usados[0]];
    for (let j = 0; j < NS; j += passo) ind.push(centro, a0[seg(j + passo)], a0[j]);
    for (let u = 0; u < usados.length - 1; u++) {
      const A = aneis[usados[u]], B = aneis[usados[u + 1]];
      for (let j = 0; j < NS; j += passo) {
        const j2 = seg(j + passo);
        ind.push(A[j], A[j2], B[j]);
        ind.push(A[j2], B[j2], B[j]);
      }
    }
    const ult = aneis[usados[usados.length - 1]];
    for (let j = 0; j < NS; j += passo) ind.push(ponta, ult[j], ult[seg(j + passo)]);
    return ind;
  });
  dados.niveis.forEach((lista, k) => { for (const v of niveis[k]) lista.push(v); });
  return { base, ponta };
}

// ---------------- vegetação e pedras ----------------
// Cada peça é uma geometria não indexada com posição, normal, cor e "balanco" (0 no chão, 1 nas
// pontas das folhas: quanto o vento mexe). As peças de um setor viram uma malha só.
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
function preparar(geo, cor, opcoes = {}) {
  const { balanco = 0, liso = false, variar = 0.08, sombraBaixo = 0.35, semente = 1 } = opcoes;
  let g = geo;
  if (liso) { g.deleteAttribute('uv'); g.deleteAttribute('normal'); g = mergeVertices(g); g.computeVertexNormals(); }
  g = g.index ? g.toNonIndexed() : g;
  if (!liso) g.computeVertexNormals();
  if (g.attributes.uv) g.deleteAttribute('uv');
  g.computeBoundingBox();
  const p = g.attributes.position, n = p.count, cores = new Float32Array(n * 3), bal = new Float32Array(n);
  const y0 = g.boundingBox.min.y, y1 = g.boundingBox.max.y, rnd = aleatorio(semente);
  for (let i = 0; i < n; i++) {
    const k = (p.getY(i) - y0) / Math.max(1e-3, y1 - y0);
    const f = (1 - sombraBaixo * (1 - k)) * (1 + (rnd() - 0.5) * variar * 2);
    cores[i * 3] = cor[0] * f; cores[i * 3 + 1] = cor[1] * f; cores[i * 3 + 2] = cor[2] * f;
    bal[i] = typeof balanco === 'function' ? balanco(k) : balanco * k;
  }
  g.setAttribute('color', new THREE.BufferAttribute(cores, 3));
  g.setAttribute('balanco', new THREE.BufferAttribute(bal, 1));
  return g;
}
function deformar(geo, amp, freq, semente) {
  const p = geo.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = fbm(v.x * freq + semente, v.y * freq + v.z * freq * 0.7, 2, semente) - 0.5;
    v.multiplyScalar(1 + n * amp);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  return geo;
}
function posicionar(g, x, y, z, rotY, sx, sy = sx, sz = sx) {
  _q.setFromEuler(_e.set(0, rotY, 0));
  return g.applyMatrix4(_m.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz)));
}

// modelos (perto = completo; longe = leve). Devolvem peças e o colisor (tronco/pedra).
const MODELOS = {
  pinheiro(rnd, longe) {
    const h = 2.2 + rnd() * 1.2, pecas = [];
    pecas.push(preparar(new THREE.CylinderGeometry(0.16, 0.26, h, 6).translate(0, h / 2, 0), C(0.36, 0.25, 0.17), { semente: rnd() * 1e6 }));
    const camadas = longe ? 2 : 4, verde = rnd() < 0.5 ? C(0.17, 0.36, 0.22) : C(0.21, 0.41, 0.25);
    for (let k = 0; k < camadas; k++) {
      const f = k / camadas, r = misturar(2.0, 0.7, f) * (0.9 + rnd() * 0.2), ch = misturar(2.6, 1.6, f);
      const cone = new THREE.ConeGeometry(r, ch, longe ? 6 : 8).translate(0, h * 0.55 + f * 3.4 + ch / 2, 0).rotateY(rnd() * 3);
      pecas.push(preparar(cone, verde, { balanco: k => 0.25 + 0.75 * k, semente: rnd() * 1e6, sombraBaixo: 0.45 }));
    }
    return { pecas, colisor: new THREE.CylinderGeometry(0.26, 0.3, h + 1, 6).translate(0, (h + 1) / 2, 0) };
  },
  frondosa(rnd, longe, fruto = false) {
    const h = 2.4 + rnd() * 1.4, pecas = [];
    pecas.push(preparar(new THREE.CylinderGeometry(0.2, 0.32, h, 7).translate(0, h / 2, 0), C(0.4, 0.29, 0.2), { semente: rnd() * 1e6 }));
    if (!longe) {
      const galho = new THREE.CylinderGeometry(0.07, 0.12, 1.4, 5).translate(0, 0.7, 0).rotateZ(0.9).translate(0, h * 0.7, 0).rotateY(rnd() * 6);
      pecas.push(preparar(galho, C(0.4, 0.29, 0.2), { semente: rnd() * 1e6 }));
    }
    const outono = !fruto && rnd() < 0.12;
    const verde = outono ? C(0.78, 0.52, 0.2) : rnd() < 0.5 ? C(0.3, 0.52, 0.22) : C(0.38, 0.58, 0.24);
    const blobs = longe ? 1 : 3;
    for (let k = 0; k < blobs; k++) {
      const r = (longe ? 2.1 : 1.3 + rnd() * 0.6);
      const b = deformar(new THREE.IcosahedronGeometry(r, longe ? 0 : 1), 0.35, 0.9, rnd() * 100);
      b.translate((rnd() - 0.5) * 1.6 * (blobs > 1), h + 0.6 + rnd() * 1.1, (rnd() - 0.5) * 1.6 * (blobs > 1));
      pecas.push(preparar(b, verde, { balanco: k => 0.35 + 0.65 * k, liso: true, semente: rnd() * 1e6, sombraBaixo: 0.5 }));
    }
    if (fruto && !longe) for (let k = 0; k < 9; k++) {
      const a = rnd() * Math.PI * 2, y = h + 0.4 + rnd() * 1.6;
      const fr = new THREE.IcosahedronGeometry(0.13, 0).translate(Math.cos(a) * 1.55, y, Math.sin(a) * 1.55);
      pecas.push(preparar(fr, rnd() < 0.7 ? C(0.85, 0.16, 0.14) : C(0.95, 0.62, 0.15), { balanco: 0.8, sombraBaixo: 0 }));
    }
    return { pecas, colisor: new THREE.CylinderGeometry(0.32, 0.36, h + 0.8, 6).translate(0, (h + 0.8) / 2, 0) };
  },
  betula(rnd, longe) {
    const h = 3.4 + rnd() * 1.6, pecas = [];
    const tronco = preparar(new THREE.CylinderGeometry(0.1, 0.15, h, 6).translate(0, h / 2, 0), C(0.88, 0.86, 0.8), { semente: rnd() * 1e6 });
    // manchas escuras da casca
    const c = tronco.attributes.color, p = tronco.attributes.position;
    for (let i = 0; i < p.count; i++) if (Math.sin(p.getY(i) * 7.3 + p.getX(i) * 20) > 0.7) c.setXYZ(i, 0.25, 0.24, 0.22);
    pecas.push(tronco);
    const verde = C(0.56, 0.72, 0.33);
    for (let k = 0; k < (longe ? 1 : 2); k++) {
      const b = deformar(new THREE.IcosahedronGeometry(1.0 + rnd() * 0.3, longe ? 0 : 1), 0.4, 1.1, rnd() * 100);
      b.scale(1, 1.4, 1).translate((rnd() - 0.5) * 0.7, h - 0.2 + k * 1.1, (rnd() - 0.5) * 0.7);
      pecas.push(preparar(b, verde, { balanco: k => 0.4 + 0.6 * k, liso: true, semente: rnd() * 1e6 }));
    }
    return { pecas, colisor: new THREE.CylinderGeometry(0.18, 0.2, h, 6).translate(0, h / 2, 0) };
  },
  arbusto(rnd, longe) {
    const pecas = [], verde = rnd() < 0.5 ? C(0.27, 0.47, 0.2) : C(0.36, 0.54, 0.22);
    for (let k = 0; k < (longe ? 1 : 3); k++) {
      const r = 0.45 + rnd() * 0.4;
      const b = deformar(new THREE.IcosahedronGeometry(r, longe ? 0 : 1), 0.35, 1.6, rnd() * 100).scale(1, 0.75, 1);
      b.translate((rnd() - 0.5) * 0.9, r * 0.6, (rnd() - 0.5) * 0.9);
      pecas.push(preparar(b, verde, { balanco: k => 0.15 + 0.5 * k, liso: true, semente: rnd() * 1e6, sombraBaixo: 0.5 }));
    }
    return { pecas };
  },
  flores(rnd, longe) {
    if (longe) return { pecas: [] };
    const pecas = [], cores = [C(0.78, 0.62, 0.95), C(0.98, 0.62, 0.76), C(0.98, 0.86, 0.3), C(0.97, 0.97, 0.93), C(0.9, 0.3, 0.28)];
    const corTufo = cores[Math.floor(rnd() * cores.length)];
    const n = 5 + Math.floor(rnd() * 5);
    for (let k = 0; k < n; k++) {
      const x = (rnd() - 0.5) * 1.6, z = (rnd() - 0.5) * 1.6, h = 0.22 + rnd() * 0.25;
      pecas.push(preparar(new THREE.CylinderGeometry(0.012, 0.018, h, 3).translate(x, h / 2, z), C(0.3, 0.5, 0.2), { balanco: k => k, sombraBaixo: 0.2 }));
      const flor = new THREE.IcosahedronGeometry(0.06 + rnd() * 0.03, 0).scale(1, 0.55, 1).translate(x, h, z);
      pecas.push(preparar(flor, rnd() < 0.8 ? corTufo : cores[Math.floor(rnd() * cores.length)], { balanco: 1, sombraBaixo: 0 }));
    }
    return { pecas };
  },
  pedra(rnd, longe, grande = false) {
    const r = grande ? 1.6 + rnd() * 1.6 : 0.35 + rnd() * 0.7;
    const g = deformar(new THREE.IcosahedronGeometry(r, longe ? 0 : 1), 0.45, 0.8 / r, rnd() * 100);
    g.scale(1 + rnd() * 0.5, 0.55 + rnd() * 0.35, 1 + rnd() * 0.3).translate(0, r * 0.25, 0);
    const peca = preparar(g.clone(), C(0.55, 0.53, 0.5), { sombraBaixo: 0.3, variar: 0.12, semente: rnd() * 1e6 });
    // musgo no que fica virado para cima
    const nrm = peca.attributes.normal, cor = peca.attributes.color;
    for (let i = 0; i < nrm.count; i++) if (nrm.getY(i) > 0.75) cor.setXYZ(i, MUSGO[0] * 1.1, MUSGO[1] * 1.1, MUSGO[2]);
    return { pecas: [peca], colisor: r > 0.5 ? g : null };
  },
};

// ---------------- material da vegetação (vento no shader) ----------------
function materialVegetacao(simples, tempo) {
  const m = simples
    ? new THREE.MeshLambertMaterial({ vertexColors: true })
    : new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 });
  m.onBeforeCompile = sh => {
    sh.uniforms.uTempo = tempo;
    sh.vertexShader = 'uniform float uTempo;\nattribute float balanco;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      vec3 raizV = (modelMatrix * vec4(position, 1.0)).xyz;
      float vento = sin(uTempo * 1.3 + raizV.x * 0.21 + raizV.z * 0.17) * 0.6 + sin(uTempo * 2.9 + raizV.x * 0.9) * 0.25;
      transformed.x += vento * balanco * 0.18;
      transformed.z += vento * balanco * 0.11;`);
  };
  m.customProgramCacheKey = () => 'vegetacao-' + (simples ? 's' : 'p');
  return m;
}

// ---------------- geração ----------------
export async function gerarIlha(renderer, aoProgredir = () => {}) {
  const passo = async (k) => { aoProgredir({ loaded: k, total: 1 }); await new Promise(r => setTimeout(r, 0)); };
  // posiciona as ilhotas junto à borda da principal, com um vão que a corrente de vento atravessa
  for (const il of ILHOTAS) {
    const rp = raioBorda(PRINCIPAL, il.ang);
    const dist = rp + il.R * 1.12 + il.vao;
    il.cx = Math.cos(il.ang) * dist; il.cz = Math.sin(il.ang) * dist;
    // construção da ilhota (farol, ruínas) do lado de fora: o centro fica livre para a Âncora de Fio
    const fora = { farol: 10, ruinas: 11 }[il.nome];
    if (fora) il.obra = { x: Math.cos(il.ang) * fora, z: Math.sin(il.ang) * fora, r: il.nome === 'ruinas' ? 9 : 7 };
  }
  TODAS = [PRINCIPAL, ...ILHOTAS];
  // trilhas: da praça para o morro e para a borda voltada a cada ilhota
  const pontoBorda = (ang, k = 0.9) => { const r = raioBorda(PRINCIPAL, ang) * k; return [Math.cos(ang) * r, Math.sin(ang) * r]; };
  const curva = (de, para, desvio) => {
    const pts = [];
    for (let k = 0; k <= 6; k++) {
      const t = k / 6, ox = -(para[1] - de[1]), oz = para[0] - de[0], l = Math.hypot(ox, oz) || 1;
      const s = Math.sin(t * Math.PI) * desvio;
      pts.push([misturar(de[0], para[0], t) + ox / l * s, misturar(de[1], para[1], t) + oz / l * s]);
    }
    return pts;
  };
  const praca = [VILA.x, VILA.z];
  CAMINHOS = [
    curva(praca, [MORRO.x + 6, MORRO.z + 4], 10),
    ...ILHOTAS.map((il, i) => curva(praca, pontoBorda(il.ang), [8, -12, 6][i])),
  ];
  alturaVila = alturaBasePrincipal(VILA.x, VILA.z, Math.hypot(VILA.x, VILA.z) / raioBorda(PRINCIPAL, Math.atan2(VILA.z, VILA.x)));

  // caixa para as UVs (só servem para a amostra de cor da análise)
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const il of TODAS) { minX = Math.min(minX, il.cx - il.R * 1.2); maxX = Math.max(maxX, il.cx + il.R * 1.2); minZ = Math.min(minZ, il.cz - il.R * 1.2); maxZ = Math.max(maxZ, il.cz + il.R * 1.2); }
  const caixa = { minX, minZ, tam: Math.max(maxX - minX, maxZ - minZ) };
  const dados = { pos: [], cor: [], uv: [], niveis: [[], [], []], caixa };
  for (const il of TODAS) malhaIlha(il, dados);
  await passo(0.3);

  const base = new THREE.BufferGeometry();
  base.setAttribute('position', new THREE.Float32BufferAttribute(dados.pos, 3));
  base.setAttribute('color', new THREE.Float32BufferAttribute(paraLinear(dados.cor), 3));
  base.setAttribute('uv', new THREE.Float32BufferAttribute(dados.uv, 2));
  base.setIndex(dados.niveis[0]);
  base.computeVertexNormals();
  // confere a orientação (o centro da ilha principal tem de apontar para cima); se não, vira tudo
  if (base.attributes.normal.getY(0) < 0) {
    for (const l of dados.niveis) for (let k = 0; k < l.length; k += 3) { const a = l[k + 1]; l[k + 1] = l[k + 2]; l[k + 2] = a; }
    base.setIndex(dados.niveis[0]); base.computeVertexNormals();
  }
  base.setIndex(null);
  base.computeBoundingBox();
  const niveis = dados.niveis.map(l => new Uint32Array(l));

  // ---------- vegetação e pedras, por setor ----------
  const rnd = aleatorio(20241024);
  const TAM_SETOR = 48;
  const setores = new Map(); // chave -> { perto: [], longe: [] }
  const colisores = []; // geometrias (mundo) que entram na malha de colisão
  const colocar = (x, z, tipo, extra) => {
    const y = alturaEm(x, z);
    if (y === null) return false;
    const chave = `${Math.floor(x / TAM_SETOR)},${Math.floor(z / TAM_SETOR)}`;
    if (!setores.has(chave)) setores.set(chave, { perto: [], longe: [] });
    const s = setores.get(chave), rot = rnd() * Math.PI * 2, esc = 0.85 + rnd() * 0.4;
    const semente = rnd() * 1e9;
    const perto = MODELOS[tipo](aleatorio(semente), false, extra);
    const longe = MODELOS[tipo](aleatorio(semente), true, extra);
    for (const g of perto.pecas) s.perto.push(posicionar(g, x, y - 0.05, z, rot, esc));
    for (const g of longe.pecas) s.longe.push(posicionar(g, x, y - 0.05, z, rot, esc));
    if (perto.colisor) colisores.push(posicionar(perto.colisor, x, y - 0.05, z, rot, esc));
    return true;
  };
  const livreDe = [];
  const longeDeConstrucoes = (x, z, folga) => livreDe.every(([cx, cz, r]) => Math.hypot(x - cx, z - cz) > r + folga);
  livreDe.push([VILA.x, VILA.z, VILA.r + 6]);
  livreDe.push([MORRO.x, MORRO.z, 11]); // clareira no topo do morro (onde fica o Coração do Fio)
  for (const il of ILHOTAS) {
    livreDe.push([il.cx, il.cz, 7]);
    if (il.obra) livreDe.push([il.cx + il.obra.x, il.cz + il.obra.z, il.obra.r + 4]);
  }

  const G = 3.1;
  for (const il of TODAS) {
    const R = il.R * 1.15;
    for (let gx = il.cx - R; gx < il.cx + R; gx += G) for (let gz = il.cz - R; gz < il.cz + R; gz += G) {
      const x = gx + (rnd() - 0.5) * G * 0.9, z = gz + (rnd() - 0.5) * G * 0.9;
      const l = localizar(x, z);
      if (!l || l.ilha !== il || l.d > 0.93) continue;
      const incl = inclinacao(x, z), dc = distCaminho(x, z);
      const h = alturaEm(x, z);
      const floresta = il === PRINCIPAL ? suave(fbm(x * 0.022 + 100, z * 0.022, 3, 3), 0.5, 0.68) : 0;
      const campina = suave(fbm(x * 0.03 - 50, z * 0.03, 3, 8), 0.55, 0.72) * (1 - floresta);
      const r = rnd();
      if (incl > 0.55) { if (r < 0.1) colocar(x, z, 'pedra'); continue; }
      if (dc < 2.6 || !longeDeConstrucoes(x, z, 2)) continue;
      if (il.nome === 'pomar') { continue; }
      if (r < floresta * 0.62 + 0.025) {
        const tipo = h > 11 || fbm(x * 0.05, z * 0.05, 2, 4) > 0.62 ? 'pinheiro' : rnd() < 0.22 ? 'betula' : 'frondosa';
        colocar(x, z, tipo);
      } else if (r < floresta * 0.62 + 0.025 + 0.06 + floresta * 0.12) colocar(x, z, 'arbusto');
      else if (r < 0.2 + campina * 0.5) colocar(x, z, 'flores');
      else if (r > 0.985 || (l.d > 0.84 && r > 0.94)) colocar(x, z, 'pedra', l.d > 0.86 && rnd() < 0.3);
    }
  }
  // pomar: fileiras de árvores frutíferas na ilhota baixa
  const pomar = ILHOTAS.find(i => i.nome === 'pomar');
  for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) {
    if (Math.abs(a) <= 1 && Math.abs(b) <= 1) continue; // o meio do pomar fica livre
    colocar(pomar.cx + a * 5.2 + (rnd() - 0.5), pomar.cz + b * 5.2 + (rnd() - 0.5), 'frondosa', true);
  }
  await passo(0.6);

  // ---------- construções (casas.js): vila, farol, ruínas ----------
  const construcoes = new THREE.Group(); construcoes.name = 'construcoes';
  const vila = construirVila({ centro: new THREE.Vector3(VILA.x, alturaVila, VILA.z), raio: VILA.r, alturaEm, rnd });
  const farolI = ILHOTAS.find(i => i.nome === 'farol'), ruinasI = ILHOTAS.find(i => i.nome === 'ruinas');
  const naObra = il => { const x = il.cx + il.obra.x, z = il.cz + il.obra.z; return new THREE.Vector3(x, alturaEm(x, z), z); };
  const farol = construirFarol({ centro: naObra(farolI), alturaEm, rnd, evitar: new THREE.Vector3(farolI.cx, 0, farolI.cz) });
  const ruinas = construirRuinas({ centro: naObra(ruinasI), alturaEm, rnd, evitar: new THREE.Vector3(ruinasI.cx, 0, ruinasI.cz) });
  construcoes.add(vila.grupo, farol.grupo, ruinas.grupo);
  construcoes.updateMatrixWorld(true);
  construcoes.traverse(o => { if (o.isMesh && o.userData.solido) colisores.push(o.geometry.clone().applyMatrix4(o.matrixWorld)); });

  // ---------- malha de colisão: terreno + troncos, pedras e paredes ----------
  // as peças extras têm uv (-1, -1): a análise do terreno não conta elas como chão
  const nTerreno = base.attributes.position.count;
  let nExtra = 0, iExtra = 0;
  for (const g of colisores) { nExtra += g.attributes.position.count; iExtra += g.index ? g.index.count : g.attributes.position.count; }
  const extras = colisores;
  const posCol = new Float32Array((nTerreno + nExtra) * 3), uvCol = new Float32Array((nTerreno + nExtra) * 2);
  posCol.set(base.attributes.position.array);
  uvCol.set(base.attributes.uv.array);
  const indCol = new Uint32Array(niveis[0].length + iExtra);
  indCol.set(niveis[0]);
  let ov = nTerreno, oi = niveis[0].length;
  for (const g of extras) {
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { posCol[(ov + i) * 3] = p.getX(i); posCol[(ov + i) * 3 + 1] = p.getY(i); posCol[(ov + i) * 3 + 2] = p.getZ(i); uvCol[(ov + i) * 2] = -1; uvCol[(ov + i) * 2 + 1] = -1; }
    if (g.index) for (let i = 0; i < g.index.count; i++) indCol[oi + i] = g.index.getX(i) + ov;
    else for (let i = 0; i < p.count; i++) indCol[oi + i] = ov + i;
    oi += g.index ? g.index.count : p.count; ov += p.count;
    g.dispose();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(posCol, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvCol, 2));
  geo.setIndex(new THREE.BufferAttribute(indCol, 1));
  geo.boundingBox = base.boundingBox.clone();
  geo.boundingSphere = geo.boundingBox.getBoundingSphere(new THREE.Sphere());
  geo.boundsTree = new MeshBVH(geo);
  const malha = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }));
  malha.raycast = acceleratedRaycast;
  malha.castShadow = true;
  malha.layers.set(CAMADA_SOMBRA);
  await passo(0.8);

  // ---------- blocos de terreno com LOD (mapa.js) ----------
  const { grupo, lods } = montarBlocos(base, niveis, 40);

  // ---------- setores de vegetação ----------
  const tempo = { value: 0 };
  let matVeg = materialVegetacao(false, tempo);
  const vegetacao = new THREE.Group(); vegetacao.name = 'vegetacao';
  const setoresLod = [];
  for (const s of setores.values()) {
    const perto = s.perto.length ? mergeGeometries(s.perto) : null;
    const longe = s.longe.length ? mergeGeometries(s.longe) : null;
    for (const g of [perto, longe]) if (g) paraLinear(g.attributes.color.array);
    s.perto.forEach(g => g.dispose()); s.longe.forEach(g => g.dispose());
    if (!perto) continue;
    perto.computeBoundingSphere();
    const lod = new THREE.LOD();
    const c = perto.boundingSphere.center.clone();
    lod.position.copy(c);
    for (const [g, dist] of [[perto, 0], [longe, 60]]) {
      if (!g) continue;
      g.translate(-c.x, -c.y, -c.z); g.computeBoundingSphere();
      const m = new THREE.Mesh(g, matVeg);
      m.castShadow = true; m.receiveShadow = true;
      lod.addLevel(m, dist);
    }
    vegetacao.add(lod); setoresLod.push(lod);
  }

  // amostra de cor para a análise (grama x trilha x construções)
  const corAmostra = [0, 0, 0];
  const amostrar = uv => {
    if (uv.x < -0.5) return null;
    const x = caixa.minX + uv.x * caixa.tam, z = caixa.minZ + uv.y * caixa.tam;
    const l = localizar(x, z);
    if (!l) return [90, 85, 80];
    corTopo(x, z, l.d, corAmostra);
    return [corAmostra[0] * 255, corAmostra[1] * 255, corAmostra[2] * 255];
  };

  const mapa = {
    malha, geo, grupo, lods, renderer, texturas: new Map(), amostrar, qualidade: null, procedural: true,
    enfeites: [vegetacao, construcoes],
    nascimentoPreferido: new THREE.Vector3(VILA.x, alturaVila, VILA.z),
    pontos: { vila: VILA, morro: MORRO, ilhotas: ILHOTAS.map(i => ({ nome: i.nome, x: i.cx, z: i.cz, topo: alturaEm(i.cx, i.cz) })), casas: vila.casas, farol: farol.topo },
    alturaEm,
    atualizarEnfeites(t, camera) {
      tempo.value = t;
      farol.atualizar?.(t);
    },
    aoMudarQualidade(nivel) {
      const novo = materialVegetacao(nivel.materialSimples, tempo);
      vegetacao.traverse(o => { if (o.isMesh) o.material = novo; });
      matVeg.dispose(); matVeg = novo;
      const longe = nivel.materialSimples ? 38 : nivel.efeitos ? 85 : 60;
      for (const l of setoresLod) if (l.levels[1]) l.levels[1].distance = longe;
      vila.aplicarNivel?.(nivel); farol.aplicarNivel?.(nivel); ruinas.aplicarNivel?.(nivel);
    },
  };
  await passo(1);
  return mapa;
}
