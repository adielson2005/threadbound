import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { MeshBVH, acceleratedRaycast } from 'three-mesh-bvh';
import { montarBlocos, CAMADA_SOMBRA } from './mapa.js';
import { construirVila, construirFarol, construirRuinas, construirGruta, construirCais, construirNaufragios, construirMarcoIlhota, construirJardim, construirCostura } from './casas.js';
import { CONFIG } from './capitulo.js';
import { CASAS } from './historia.js';

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
// Cada capítulo tem o seu arquipélago (capitulo.js): o mesmo gerador com outro desenho, outras
// cores, outra vegetação e outras construções.

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
const MAPA = CONFIG.mapa;
const VILA = MAPA.praca;                   // praça (no Cap. 1, a da Vila de Maré Alta): onde a protagonista acorda
const MORRO = MAPA.morro;                  // o ponto alto da ilha principal (mirante)
const PRINCIPAL = { nome: 'principal', cx: 0, cz: 0, ...MAPA.principal };
// ilhotas: direção a partir do centro, raio, altura do topo e vão até a ilha principal
let TODAS = []; // principal + ilhotas (preenchido em gerarIlha)
const ILHOTAS = MAPA.ilhotas.map(i => ({ ...i, fora: i.obra, obra: null }));

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

// enseada de areia (Cap. 1): quanto um ponto está dentro dela (0 fora, 1 no meio da areia)
const PRAIA = MAPA.praia;
function naPraia(x, z, d) {
  if (!PRAIA) return 0;
  let da = Math.atan2(z, x) - PRAIA.ang; da = Math.atan2(Math.sin(da), Math.cos(da));
  return (1 - suave(Math.abs(da), PRAIA.largura * 0.55, PRAIA.largura)) * suave(d, 0.6, 0.8);
}
function alturaBasePrincipal(x, z, d) {
  let h = (fbm(x * 0.016 + 3, z * 0.016 - 7, 4, 11) - 0.5) * 14;
  h += MORRO.altura * gauss(x, z, MORRO.x, MORRO.z, 30) + 10 * gauss(x, z, 52, -42, 20) + 7 * gauss(x, z, -58, 52, 22);
  // terraços no morro: degraus de 3,4 m (a borda de cada degrau dá para escalar)
  const kt = suave(h, 5, 13), q = 3.4;
  h += (Math.round(h / q) * q - h) * 0.5 * kt;
  h -= suave(d, 0.84, 1.0) * 4; // borda arredondada
  // a enseada desce em rampa suave até a borda, quase plana (areia não segura barranco)
  const kp = naPraia(x, z, d);
  if (kp > 0) h = misturar(h, misturar(1.5, -2.5, suave(d, 0.6, 1.0)) + (fbm(x * 0.06, z * 0.06, 2, 13) - 0.5) * 0.6, kp);
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
  // a primeira ilhota é a mais alta (no Cap. 1, a do farol)
  const alta = ilha === ILHOTAS[0];
  h += (alta ? 4 : 2) * gauss(lx, lz, 0, 0, ilha.R * 0.35);
  // dois lugares planos: o centro (onde fica a Âncora de Fio) e o da construção, mais para fora
  const plano = ilha.topo + (alta ? 4 : 2);
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
// tons naturais (menos saturados): verde de campo, verde-claro, verde-escuro úmido e capim seco
// (no Cap. 1; os outros capítulos trazem as suas em capitulo.js)
const PALETA = MAPA.paleta;
const GRAMA = PALETA.grama;
const TERRA = PALETA.terra, TRILHA = PALETA.trilha, ROCHA = PALETA.rocha, MUSGO = PALETA.musgo, ESTRATOS = PALETA.estratos;
function lerpCor(a, b, t, out) { out[0] = misturar(a[0], b[0], t); out[1] = misturar(a[1], b[1], t); out[2] = misturar(a[2], b[2], t); return out; }
const _c1 = [0, 0, 0], _c2 = [0, 0, 0];
function corTopo(x, z, d, out) {
  const n1 = fbm(x * 0.035, z * 0.035, 3, 5), n2 = fbm(x * 0.11 + 9, z * 0.11, 2, 6);
  if (PALETA.retalhos) retalho(x, z, n1, _c1);
  else {
    lerpCor(GRAMA[0], GRAMA[1], suave(n1, 0.35, 0.7), _c1);
    lerpCor(_c1, GRAMA[2], suave(n2, 0.55, 0.85) * 0.8, _c1);
    lerpCor(_c1, GRAMA[3], suave(fbm(x * 0.012 + 40, z * 0.012, 2, 7), 0.62, 0.8) * 0.7, _c1); // campos secos
  }
  // praça e ruas da vila: terra batida com grama nas frestas
  const dv = Math.hypot(x - VILA.x, z - VILA.z);
  if (dv < VILA.r + 6) lerpCor(_c1, TERRA, (1 - suave(dv, VILA.r - 4, VILA.r + 6)) * (0.55 + 0.35 * n2), _c1);
  // trilhas: borda irregular
  const dc = distCaminho(x, z) + (n2 - 0.5) * 1.2;
  if (dc < 3) lerpCor(_c1, TRILHA, 1 - suave(dc, 0.9, 2.6), _c1);
  // borda da ilha: terra escura e capim ralo
  lerpCor(_c1, TERRA, suave(d, 0.9, 1.0) * 0.6, _c1);
  // areia da enseada: clara, com a faixa úmida e mais escura perto da borda
  const kp = naPraia(x, z, d);
  if (kp > 0) {
    lerpCor(_c1, C(0.86, 0.78, 0.6), suave(kp, 0.15, 0.6), _c1);
    lerpCor(_c1, C(0.7, 0.63, 0.5), suave(d, 0.9, 0.99) * kp * 0.7, _c1);
  }
  out[0] = _c1[0]; out[1] = _c1[1]; out[2] = _c1[2];
  return out;
}
// Cap. 4: o chão é uma colcha de retalhos gigantes (quadrados tortos de 7 m), cada um de uma cor,
// com a trama do tecido e uma linha de pontos de costura nas emendas
const RETALHO = 7;
function retalho(x, z, n1, out) {
  // a grade é entortada pelo ruído, para as emendas não ficarem retas demais
  const wx = x + (fbm(x * 0.05, z * 0.05, 2, 21) - 0.5) * 4, wz = z + (fbm(x * 0.05 + 7, z * 0.05, 2, 22) - 0.5) * 4;
  const i = Math.floor(wx / RETALHO), j = Math.floor(wz / RETALHO);
  const base = GRAMA[Math.floor(hash(i, j, 31) * GRAMA.length) % GRAMA.length];
  const trama = 0.92 + 0.08 * Math.sin(wx * 9) * Math.sin(wz * 9) + (n1 - 0.5) * 0.12;
  out[0] = base[0] * trama; out[1] = base[1] * trama; out[2] = base[2] * trama;
  const fx = wx / RETALHO - i, fz = wz / RETALHO - j;
  const emenda = Math.min(fx, 1 - fx, fz, 1 - fz) * RETALHO; // metros até a emenda mais perto
  if (emenda < 0.5) {
    // pontos de costura: tracinhos claros ao longo da emenda, com um vinco escuro embaixo
    const ao = fx < 0.5 / RETALHO || fx > 1 - 0.5 / RETALHO ? wz : wx;
    const ponto = emenda < 0.22 && Math.sin(ao * 3.2) > 0.2;
    lerpCor(out, ponto ? C(0.98, 0.95, 0.86) : C(0.25, 0.2, 0.3), ponto ? 0.85 : (1 - emenda / 0.5) * 0.45, out);
  }
  return out;
}
// falésia e base: camadas de rocha (estratos), musgo perto do topo, mais escuro na ponta
function corRocha(x, y, z, topoY, fundoY, out) {
  const n = fbm(x * 0.08, z * 0.08 + y * 0.05, 3, 9);
  const estrato = 0.5 + 0.5 * Math.sin(y * 0.85 + n * 4);
  lerpCor(ESTRATOS[0], ESTRATOS[1], estrato, _c2);
  lerpCor(_c2, ESTRATOS[2], suave(n, 0.6, 0.8) * 0.6, _c2);
  const desce = suave(y, topoY, fundoY); // 0 no topo, 1 na ponta
  lerpCor(_c2, ESTRATOS[3], desce * 0.75, _c2);
  lerpCor(_c2, MUSGO, (1 - suave(topoY - y, 0, 5)) * 0.6, _c2);
  out[0] = _c2[0]; out[1] = _c2[1]; out[2] = _c2[2];
  return out;
}

// ---------------- malha de uma ilha ----------------
// Malha polar contínua: anéis do centro até a borda (topo), depois a falésia descendo e a base de
// rocha afunilando até a ponta. Os níveis de detalhe pulam anéis e setores (passo 1, 2, 4).
const ANEIS_FALESIA = 6, ANEIS_BASE = 16;
function malhaIlha(ilha, dados) {
  const NS = Math.max(64, Math.round((2 * Math.PI * ilha.R) / 1.9 / 4) * 4);
  const NA = Math.max(12, Math.round(ilha.R / 1.5));
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
  // um nível só: blocos vizinhos com detalhes diferentes deixavam fendas na falésia (a malha já é leve)
  const niveis = [1].map(passo => {
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
// Realismo barato: as copas são "cartões" (planos com textura de folhas e transparência) em volta
// de um núcleo opaco, com a normal apontando para fora do centro da copa (a luz trata a copa como
// um volume); o pinheiro tem galhos-cartão com textura de agulhas. Casca, folhas, agulhas e capim
// vêm de um único atlas pintado em canvas: um material e uma chamada de desenho por setor.
// Cada peça tem posição, normal, uv (no atlas), cor (tinta e oclusão) e "balanco" (o vento).
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();

// regiões do atlas (u0, v0, u1, v1) e um quadradinho branco para peças só com cor de vértice
const REG = { folhas: [0, 0.5, 0.5, 1], agulhas: [0.5, 0.5, 1, 1], casca: [0.02, 0.02, 0.48, 0.44], capim: [0.5, 0, 1, 0.5] };
const UV_BRANCO = [16 / 1024, 1 - 1000 / 1024];
let ATLAS = null;
function atlasVegetacao() {
  if (ATLAS) return ATLAS;
  const c = document.createElement('canvas'); c.width = c.height = 1024;
  const g = c.getContext('2d'), r = aleatorio(777);
  const verde = (l) => `hsl(${88 + r() * 30}, ${35 + r() * 25}%, ${l}%)`;
  // folhas (canto superior esquerdo): cachos de folhas ovais, mais densos no meio
  for (let k = 0; k < 900; k++) {
    const a = r() * Math.PI * 2, d = Math.pow(r(), 0.65) * 240;
    const x = 256 + Math.cos(a) * d, y = 256 + Math.sin(a) * d * 0.95;
    const tam = 9 + r() * 12, ang = r() * Math.PI;
    g.save(); g.translate(x, y); g.rotate(ang);
    g.fillStyle = verde(20 + r() * 26 + (1 - d / 240) * 6);
    g.beginPath(); g.ellipse(0, 0, tam, tam * 0.45, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 1; g.beginPath(); g.moveTo(-tam, 0); g.lineTo(tam, 0); g.stroke();
    g.restore();
  }
  // agulhas (canto superior direito): galho com agulhas finas saindo para os lados
  for (let b = 0; b < 3; b++) {
    const y0 = 120 + b * 140;
    g.strokeStyle = '#3b2a1c'; g.lineWidth = 4; g.beginPath(); g.moveTo(520, y0); g.lineTo(1010, y0 + 20); g.stroke();
    for (let k = 0; k < 260; k++) {
      const t = r(), x = 520 + t * 490, y = y0 + t * 20, l = 30 + r() * 55 * (1 - t * 0.5), a = (r() < 0.5 ? -1 : 1) * (0.5 + r() * 0.9);
      g.strokeStyle = `hsl(${120 + r() * 25}, ${30 + r() * 20}%, ${14 + r() * 18}%)`; g.lineWidth = 2 + r() * 1.5;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l * 0.35, y + Math.sin(a) * l); g.stroke();
    }
  }
  // casca (canto inferior esquerdo): veios verticais e rachaduras
  g.fillStyle = '#5a4434'; g.fillRect(0, 512, 512, 512);
  for (let k = 0; k < 500; k++) { const x = r() * 512, w = 1 + r() * 4; g.fillStyle = r() < 0.5 ? `rgba(30,20,12,${0.2 + r() * 0.4})` : `rgba(140,115,90,${0.1 + r() * 0.25})`; g.fillRect(x, 512 + r() * 80, w, 120 + r() * 400); }
  for (let k = 0; k < 60; k++) { g.fillStyle = 'rgba(15,10,6,0.6)'; g.fillRect(r() * 512, 512 + r() * 512, 2 + r() * 3, 30 + r() * 90); }
  g.fillStyle = '#ffffff'; g.fillRect(0, 984, 34, 40); // quadrado branco (uv fixo)
  // capim (canto inferior direito): lâminas finas afinando para cima, pontas mais claras
  for (let k = 0; k < 420; k++) {
    const x = 540 + r() * 460, h = 160 + r() * 300, curva = (r() - 0.5) * 90, w = 3 + r() * 5;
    const gr = g.createLinearGradient(0, 1024, 0, 1024 - h);
    gr.addColorStop(0, `hsl(${85 + r() * 20}, 40%, 18%)`); gr.addColorStop(1, `hsl(${60 + r() * 35}, ${40 + r() * 20}%, ${42 + r() * 18}%)`);
    g.fillStyle = gr; g.beginPath(); g.moveTo(x - w, 1024); g.quadraticCurveTo(x + curva * 0.5, 1024 - h * 0.6, x + curva, 1024 - h); g.quadraticCurveTo(x + curva * 0.5 + w * 0.3, 1024 - h * 0.6, x + w, 1024); g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  ATLAS = t;
  return t;
}

// acumula triângulos de uma peça (não indexada) e devolve a geometria com todos os atributos
class Peca {
  constructor() { this.p = []; this.n = []; this.uv = []; this.c = []; this.b = []; }
  vert(x, y, z, nx, ny, nz, u, v, cor, bal) { this.p.push(x, y, z); this.n.push(nx, ny, nz); this.uv.push(u, v); this.c.push(cor[0], cor[1], cor[2]); this.b.push(bal); }
  geometria() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setAttribute('balanco', new THREE.Float32BufferAttribute(this.b, 1));
    return g;
  }
}
// cartão: quadrado de lado "tam" centrado em "c", virado para "normalPlano"; normal de luz radial
// a partir de "centroLuz" (copa como volume). uv cobre a região "reg" do atlas.
const _a = new THREE.Vector3(), _b2 = new THREE.Vector3(), _nl = new THREE.Vector3(), _v = new THREE.Vector3();
function cartao(peca, c, normalPlano, tam, reg, centroLuz, cor, balFn, giro = 0) {
  _a.set(0, 1, 0); if (Math.abs(normalPlano.y) > 0.9) _a.set(1, 0, 0);
  const lado = new THREE.Vector3().crossVectors(_a, normalPlano).normalize();
  const cima = new THREE.Vector3().crossVectors(normalPlano, lado).normalize();
  if (giro) { lado.applyAxisAngle(normalPlano, giro); cima.applyAxisAngle(normalPlano, giro); }
  const h = tam / 2, cantos = [[-1, -1], [1, -1], [1, 1], [-1, 1]], uvs = [[reg[0], reg[1]], [reg[2], reg[1]], [reg[2], reg[3]], [reg[0], reg[3]]];
  const ps = cantos.map(([sx, sy]) => c.clone().addScaledVector(lado, sx * h).addScaledVector(cima, sy * h));
  for (const k of [0, 1, 2, 0, 2, 3]) {
    _nl.subVectors(ps[k], centroLuz).normalize();
    peca.vert(ps[k].x, ps[k].y, ps[k].z, _nl.x, _nl.y, _nl.z, uvs[k][0], uvs[k][1], cor, balFn(ps[k]));
  }
}
// sólido (tronco, núcleo da copa, pedra, flor): uv vindo da geometria (dentro de "reg") ou fixo no branco
function solida(peca, geo, cor, { reg = null, bal = () => 0, liso = false, oclusao = 0.35, variar = 0.08, semente = 1 } = {}) {
  let g = geo;
  if (liso) { g.deleteAttribute('uv'); g.deleteAttribute('normal'); g = mergeVertices(g); g.computeVertexNormals(); }
  g = g.index ? g.toNonIndexed() : g;
  if (!liso) g.computeVertexNormals();
  g.computeBoundingBox();
  const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv, rnd = aleatorio(semente);
  const y0 = g.boundingBox.min.y, y1 = g.boundingBox.max.y;
  for (let i = 0; i < p.count; i++) {
    const k = (p.getY(i) - y0) / Math.max(1e-3, y1 - y0), f = (1 - oclusao * (1 - k)) * (1 + (rnd() - 0.5) * variar * 2);
    const u = reg && uv ? reg[0] + uv.getX(i) * (reg[2] - reg[0]) : UV_BRANCO[0];
    const v = reg && uv ? reg[1] + uv.getY(i) * (reg[3] - reg[1]) : UV_BRANCO[1];
    _v.fromBufferAttribute(p, i);
    peca.vert(_v.x, _v.y, _v.z, n.getX(i), n.getY(i), n.getZ(i), u, v, [cor[0] * f, cor[1] * f, cor[2] * f], bal(_v));
  }
  g.dispose();
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
// direção aleatória (uniforme na esfera)
const direcao = (rnd) => { const z = rnd() * 2 - 1, a = rnd() * Math.PI * 2, s = Math.sqrt(1 - z * z); return new THREE.Vector3(Math.cos(a) * s, z, Math.sin(a) * s); };
// copa de cartões em volta de um núcleo opaco
function copa(peca, rnd, centro, raios, n, tamanho, tinta, longe, reg = REG.folhas) {
  const balFn = p => 0.3 + Math.min(0.7, Math.max(0, p.y - centro.y + raios.y) / (raios.y * 2) * 0.7);
  // núcleo opaco verde-escuro (sombra de dentro da copa), menor que a copa: os cartões o cobrem
  const nucleo = deformar(new THREE.IcosahedronGeometry(1, longe ? 0 : 1), 0.3, 1.2, rnd() * 100).scale(raios.x * 0.58, raios.y * 0.58, raios.z * 0.58).translate(centro.x, centro.y, centro.z);
  solida(peca, nucleo, [0.2 * tinta[0], 0.32 * tinta[1], 0.13 * tinta[2]], { liso: true, oclusao: 0.5, bal: balFn, semente: rnd() * 1e6 });
  for (let k = 0; k < n; k++) {
    // direções bem espalhadas (sequência de Fibonacci na esfera + um pouco de acaso): sem buracos na copa
    const fi = Math.acos(1 - 2 * (k + 0.5) / n), te = k * 2.399963 + rnd() * 0.6;
    const d = new THREE.Vector3(Math.sin(fi) * Math.cos(te), Math.cos(fi), Math.sin(fi) * Math.sin(te)).lerp(direcao(rnd), 0.2).normalize();
    const fora = 0.5 + rnd() * 0.5;
    const pos = centro.clone().add(new THREE.Vector3(d.x * raios.x * fora, d.y * raios.y * fora, d.z * raios.z * fora));
    // de dentro para fora: as folhas de dentro ficam mais escuras (oclusão)
    const luz = 0.6 + 0.45 * fora + 0.15 * Math.max(0, d.y);
    const cor = [tinta[0] * luz * (0.9 + rnd() * 0.2), tinta[1] * luz * (0.9 + rnd() * 0.2), tinta[2] * luz];
    const plano = d.clone().lerp(direcao(rnd), 0.55).normalize();
    cartao(peca, pos, plano, tamanho * (0.8 + rnd() * 0.4), reg, centro.clone().setY(centro.y - raios.y * 0.3), cor, balFn, rnd() * Math.PI * 2);
  }
}

// modelos (perto = completo; longe = leve). Devolvem a geometria e o colisor (tronco/pedra).
const MODELOS = {
  pinheiro(rnd, longe) {
    const peca = new Peca(), h = 2.2 + rnd() * 1.2, alturaTotal = h + 2.6;
    solida(peca, new THREE.CylinderGeometry(0.05, 0.26, alturaTotal, 7).translate(0, alturaTotal / 2, 0), [1, 1, 1], { reg: REG.casca, semente: rnd() * 1e6 });
    // (agulhas um pouco mais claras e quentes: o pinheiro lia como uma mancha quase preta)
    const tinta = rnd() < 0.5 ? [0.86, 0.98, 0.84] : [0.96, 1.06, 0.84];
    const camadas = longe ? 3 : 5;
    for (let k = 0; k < camadas; k++) {
      const f = k / (camadas - 1), y = h * 0.55 + f * 3.6, r = misturar(2.1, 0.55, f) * (0.9 + rnd() * 0.2);
      const balFn = p => Math.min(1, 0.2 + Math.hypot(p.x, p.z) / 2.2) * (0.5 + f * 0.5);
      // núcleo escuro em cone (preenche: não se vê através do pinheiro)
      const cone = new THREE.ConeGeometry(r * 0.45, 1.3, longe ? 6 : 8).translate(0, y + 0.35, 0);
      solida(peca, cone, [0.12, 0.22, 0.13], { oclusao: 0.4, semente: rnd() * 1e6, bal: balFn });
      // galhos-cartão caindo para fora, com agulhas
      const galhos = longe ? 6 : 11;
      for (let g = 0; g < galhos; g++) {
        const a = (g / galhos) * Math.PI * 2 + rnd() * 0.5, cai = 0.35 + rnd() * 0.2;
        const dir = new THREE.Vector3(Math.cos(a), -cai, Math.sin(a)).normalize();
        const meio = new THREE.Vector3(0, y + 0.35, 0).addScaledVector(dir, r * 0.55);
        const normal = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(-Math.sin(a), 0, Math.cos(a))).normalize();
        if (normal.y < 0) normal.negate();
        const luz = 0.75 + 0.35 * f;
        cartao(peca, meio, normal, r * 1.15, REG.agulhas, new THREE.Vector3(0, y - 1, 0), [tinta[0] * luz, tinta[1] * luz, tinta[2] * luz], balFn);
      }
    }
    return { geo: peca.geometria(), colisor: new THREE.CylinderGeometry(0.26, 0.3, h + 1, 6).translate(0, (h + 1) / 2, 0) };
  },
  frondosa(rnd, longe, fruto = false) {
    const peca = new Peca(), h = 2.4 + rnd() * 1.4;
    solida(peca, new THREE.CylinderGeometry(0.18, 0.32, h + 0.8, 8).translate(0, (h + 0.8) / 2, 0), [1, 1, 1], { reg: REG.casca, semente: rnd() * 1e6 });
    for (let k = 0; k < (longe ? 0 : 3); k++) {
      const galho = new THREE.CylinderGeometry(0.05, 0.11, 1.5, 5).translate(0, 0.75, 0).rotateZ(0.7 + rnd() * 0.4).translate(0, h * (0.65 + k * 0.1), 0).rotateY(rnd() * 6.28);
      solida(peca, galho, [1, 1, 1], { reg: REG.casca, semente: rnd() * 1e6 });
    }
    const outono = !fruto && rnd() < 0.1;
    const tinta = outono ? [1.25, 0.82, 0.42] : rnd() < 0.5 ? [0.85, 1.0, 0.82] : [1.0, 1.05, 0.85];
    const R = 1.8 + rnd() * 0.6;
    copa(peca, rnd, new THREE.Vector3((rnd() - 0.5) * 0.4, h + 1.3, (rnd() - 0.5) * 0.4), new THREE.Vector3(R, R * 0.8, R), longe ? 9 : 26, 2.1, tinta, longe);
    if (fruto && !longe) for (let k = 0; k < 9; k++) {
      const a = rnd() * Math.PI * 2, y = h + 0.6 + rnd() * 1.4;
      const fr = new THREE.IcosahedronGeometry(0.12, 0).translate(Math.cos(a) * R * 0.85, y, Math.sin(a) * R * 0.85);
      solida(peca, fr, rnd() < 0.7 ? C(0.8, 0.14, 0.12) : C(0.92, 0.6, 0.14), { oclusao: 0, bal: () => 0.8 });
    }
    return { geo: peca.geometria(), colisor: new THREE.CylinderGeometry(0.32, 0.36, h + 0.8, 6).translate(0, (h + 0.8) / 2, 0) };
  },
  betula(rnd, longe) {
    const peca = new Peca(), h = 3.4 + rnd() * 1.6;
    // casca clara com manchas: a textura de casca, clareada pela cor do vértice
    const tronco = new THREE.CylinderGeometry(0.09, 0.15, h + 1.2, 7).translate(0, (h + 1.2) / 2, 0);
    solida(peca, tronco, [1.75, 1.7, 1.6], { reg: REG.casca, semente: rnd() * 1e6, oclusao: 0.2 });
    copa(peca, rnd, new THREE.Vector3(0, h + 0.9, 0), new THREE.Vector3(1.25, 1.7, 1.25), longe ? 7 : 20, 1.5, [1.12, 1.18, 0.86], longe);
    return { geo: peca.geometria(), colisor: new THREE.CylinderGeometry(0.18, 0.2, h, 6).translate(0, h / 2, 0) };
  },
  arbusto(rnd, longe) {
    const peca = new Peca(), r = 0.7 + rnd() * 0.4;
    copa(peca, rnd, new THREE.Vector3(0, r * 0.65, 0), new THREE.Vector3(r * 1.2, r * 0.75, r * 1.2), longe ? 4 : 10, 1.0, rnd() < 0.5 ? [0.75, 0.9, 0.7] : [0.9, 1.0, 0.78], longe);
    return { geo: peca.geometria() };
  },
  capim(rnd, longe) {
    if (longe) return { geo: null };
    const peca = new Peca(), n = 3 + Math.floor(rnd() * 4);
    for (let k = 0; k < n; k++) {
      const x = (rnd() - 0.5) * 2.4, z = (rnd() - 0.5) * 2.4, l = 0.5 + rnd() * 0.35, a0 = rnd() * Math.PI;
      const tinta = [0.95 + rnd() * 0.2, 1.0 + rnd() * 0.1, 0.8 + rnd() * 0.15];
      for (let q = 0; q < 2; q++) {
        const a = a0 + q * Math.PI / 2, ca = Math.cos(a) * l / 2, sa = Math.sin(a) * l / 2, alt = l * 0.75;
        const ps = [[x - ca, 0, z - sa], [x + ca, 0, z + sa], [x + ca, alt, z + sa], [x - ca, alt, z - sa]];
        const uvs = [[REG.capim[0], REG.capim[1]], [REG.capim[2], REG.capim[1]], [REG.capim[2], REG.capim[3]], [REG.capim[0], REG.capim[3]]];
        for (const i of [0, 1, 2, 0, 2, 3]) peca.vert(ps[i][0], ps[i][1], ps[i][2], 0, 1, 0, uvs[i][0], uvs[i][1], ps[i][1] > 0 ? tinta : [tinta[0] * 0.6, tinta[1] * 0.6, tinta[2] * 0.6], ps[i][1] > 0 ? 1 : 0);
      }
    }
    return { geo: peca.geometria() };
  },
  flores(rnd, longe) {
    if (longe) return { geo: null };
    const peca = new Peca(), cores = [C(0.78, 0.62, 0.95), C(0.98, 0.62, 0.76), C(0.98, 0.86, 0.3), C(0.97, 0.97, 0.93), C(0.9, 0.3, 0.28)];
    const corTufo = cores[Math.floor(rnd() * cores.length)];
    const n = 5 + Math.floor(rnd() * 5);
    for (let k = 0; k < n; k++) {
      const x = (rnd() - 0.5) * 1.6, z = (rnd() - 0.5) * 1.6, h = 0.22 + rnd() * 0.25;
      solida(peca, new THREE.CylinderGeometry(0.012, 0.018, h, 3).translate(x, h / 2, z), C(0.3, 0.5, 0.2), { bal: p => p.y / 0.5, oclusao: 0.2 });
      const flor = new THREE.IcosahedronGeometry(0.06 + rnd() * 0.03, 0).scale(1, 0.55, 1).translate(x, h, z);
      solida(peca, flor, rnd() < 0.8 ? corTufo : cores[Math.floor(rnd() * cores.length)], { bal: () => 1, oclusao: 0 });
    }
    return { geo: peca.geometria() };
  },
  pedra(rnd, longe, grande = false) {
    const peca = new Peca(), r = grande ? 1.6 + rnd() * 1.6 : 0.35 + rnd() * 0.7;
    const g = deformar(new THREE.IcosahedronGeometry(r, longe ? 1 : 2), 0.4, 0.8 / r, rnd() * 100);
    g.scale(1 + rnd() * 0.5, 0.55 + rnd() * 0.35, 1 + rnd() * 0.3).translate(0, r * 0.25, 0);
    // cor por vértice: cinza com veios, musgo no que fica para cima, base escura (oclusão)
    const tmp = g.clone(); tmp.computeVertexNormals();
    const pos = tmp.attributes.position, nrm = tmp.attributes.normal, base = peca.p.length / 3;
    solida(peca, g.clone(), C(0.55, 0.53, 0.5), { oclusao: 0.45, variar: 0.14, semente: rnd() * 1e6 });
    const cor = peca.c, n2 = peca.n;
    for (let i = base; i < peca.p.length / 3; i++) {
      const veio = 0.85 + 0.3 * fbm(peca.p[i * 3] * 2.1, peca.p[i * 3 + 1] * 3.3 + peca.p[i * 3 + 2] * 2.1, 2, 9);
      cor[i * 3] *= veio; cor[i * 3 + 1] *= veio; cor[i * 3 + 2] *= veio;
      if (n2[i * 3 + 1] > 0.7) { const m = (n2[i * 3 + 1] - 0.7) / 0.3; cor[i * 3] = misturar(cor[i * 3], MUSGO[0], m * 0.8); cor[i * 3 + 1] = misturar(cor[i * 3 + 1], MUSGO[1], m * 0.8); cor[i * 3 + 2] = misturar(cor[i * 3 + 2], MUSGO[2], m * 0.8); }
    }
    tmp.dispose();
    return { geo: peca.geometria(), colisor: r > 0.5 ? g : null };
  },
  // ---- Cap. 2 (recife) e Cap. 3 (fundo do mar seco) ----
  // coral ramificado: galhos afinando, que se dividem em dois; petrificado = cor de pedra, parado
  coral(rnd, longe, petrificado = false) {
    const peca = new Peca();
    const cores = petrificado ? [C(0.78, 0.74, 0.66), C(0.7, 0.67, 0.6)] : [C(0.95, 0.52, 0.5), C(0.98, 0.7, 0.42), C(0.72, 0.5, 0.86), C(0.96, 0.84, 0.72)];
    const cor = cores[Math.floor(rnd() * cores.length)];
    const grande = rnd() < 0.35, nivelMax = longe ? 2 : 3;
    const galho = (base, dir, comp, raio, nivel) => {
      const fim = base.clone().addScaledVector(dir, comp);
      const g = new THREE.CylinderGeometry(raio * 0.62, raio, comp, longe ? 4 : 6).translate(0, comp / 2, 0);
      g.applyQuaternion(_q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir)).translate(base.x, base.y, base.z);
      solida(peca, g, cor, { oclusao: 0.4, variar: 0.12, semente: rnd() * 1e6, bal: p => petrificado ? 0 : Math.min(0.5, p.y * 0.12) });
      if (nivel >= nivelMax) { solida(peca, new THREE.IcosahedronGeometry(raio * 0.9, 0).translate(fim.x, fim.y, fim.z), cor, { oclusao: 0 }); return; }
      for (let k = 0; k < 2; k++) {
        const d = dir.clone().add(new THREE.Vector3((rnd() - 0.5) * 1.3, 0.25, (rnd() - 0.5) * 1.3)).normalize();
        galho(fim, d, comp * (0.62 + rnd() * 0.2), raio * 0.66, nivel + 1);
      }
    };
    const escala = grande ? 1.9 : 1;
    for (let k = 0, n = 1 + Math.floor(rnd() * 3); k < n; k++)
      galho(new THREE.Vector3((rnd() - 0.5) * 0.6, 0, (rnd() - 0.5) * 0.6), new THREE.Vector3((rnd() - 0.5) * 0.5, 1, (rnd() - 0.5) * 0.5).normalize(), 0.7 * escala, 0.13 * escala, 1);
    return { geo: peca.geometria(), colisor: grande ? new THREE.CylinderGeometry(0.3, 0.4, 1.6, 6).translate(0, 0.8, 0) : null };
  },
  // alga: fitas altas e onduladas que balançam; petrificada = coluna de calcário, parada
  alga(rnd, longe, petrificada = false) {
    const peca = new Peca(), n = longe ? 2 : 3 + Math.floor(rnd() * 3);
    const cor = petrificada ? C(0.74, 0.69, 0.58) : rnd() < 0.5 ? C(0.36, 0.55, 0.36) : C(0.48, 0.5, 0.26);
    for (let k = 0; k < n; k++) {
      const h = (petrificada ? 2.2 : 1.6) + rnd() * 2.2, x0 = (rnd() - 0.5) * 0.9, z0 = (rnd() - 0.5) * 0.9, fase = rnd() * 6;
      const pts = [];
      for (let i = 0; i <= 6; i++) { const t = i / 6; pts.push(new THREE.Vector3(x0 + Math.sin(t * 4 + fase) * 0.22 * t, t * h, z0 + Math.cos(t * 3 + fase) * 0.18 * t)); }
      const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), longe ? 4 : 8, petrificada ? 0.11 : 0.06, longe ? 3 : 5);
      // afina para cima
      const pp = g.attributes.position;
      for (let i = 0; i < pp.count; i++) { const t = pp.getY(i) / h, cx = x0 + Math.sin(t * 4 + fase) * 0.22 * t, cz = z0 + Math.cos(t * 3 + fase) * 0.18 * t, f = 1 - t * 0.6; pp.setXYZ(i, cx + (pp.getX(i) - cx) * f, pp.getY(i), cz + (pp.getZ(i) - cz) * f); }
      solida(peca, g, cor, { oclusao: 0.45, variar: 0.1, semente: rnd() * 1e6, bal: p => petrificada ? 0 : Math.min(1, p.y / h) });
    }
    return { geo: peca.geometria(), colisor: petrificada ? new THREE.CylinderGeometry(0.35, 0.45, 2.2, 6).translate(0, 1.1, 0) : null };
  },
  concha(rnd, longe) {
    if (longe) return { geo: null };
    const peca = new Peca();
    for (let k = 0, n = 2 + Math.floor(rnd() * 3); k < n; k++) {
      const r = 0.12 + rnd() * 0.14, x = (rnd() - 0.5) * 1.4, z = (rnd() - 0.5) * 1.4;
      const g = new THREE.ConeGeometry(r, r * 2.2, 7).rotateZ(Math.PI / 2 - 0.3).rotateY(rnd() * 6).translate(x, r * 0.6, z);
      solida(peca, g, rnd() < 0.5 ? C(0.96, 0.86, 0.78) : C(0.93, 0.7, 0.62), { oclusao: 0.5 });
    }
    return { geo: peca.geometria() };
  },
  // ---- Cap. 4 (a costura no céu): carretéis, novelos e agulhas gigantes ----
  carretel(rnd, longe) {
    const peca = new Peca(), r = 0.7 + rnd() * 0.7, h = r * 1.6;
    const linha = [C(0.86, 0.36, 0.42), C(0.36, 0.52, 0.86), C(0.95, 0.78, 0.32), C(0.5, 0.78, 0.5), C(0.78, 0.6, 0.92)][Math.floor(rnd() * 5)];
    solida(peca, new THREE.CylinderGeometry(r * 0.78, r * 0.78, h, longe ? 8 : 16).translate(0, h / 2 + 0.1, 0), linha, { oclusao: 0.2, semente: rnd() * 1e6 });
    for (const y of [0.05, h + 0.15]) solida(peca, new THREE.CylinderGeometry(r, r, 0.12, longe ? 8 : 16).translate(0, y, 0), C(0.66, 0.5, 0.34), { reg: REG.casca, oclusao: 0.1 });
    return { geo: peca.geometria(), colisor: new THREE.CylinderGeometry(r, r, h + 0.2, 8).translate(0, (h + 0.2) / 2, 0) };
  },
  novelo(rnd, longe) {
    const peca = new Peca(), r = 0.5 + rnd() * 0.6;
    const cor = [C(0.9, 0.5, 0.62), C(0.56, 0.72, 0.92), C(0.96, 0.86, 0.5), C(0.7, 0.58, 0.9)][Math.floor(rnd() * 4)];
    const g = new THREE.IcosahedronGeometry(r, longe ? 1 : 3).translate(0, r * 0.9, 0);
    solida(peca, g, cor, { oclusao: 0.35, variar: 0.04, semente: rnd() * 1e6 });
    // voltas de linha por cima (anéis inclinados)
    if (!longe) for (let k = 0; k < 4; k++) solida(peca, new THREE.TorusGeometry(r * 1.01, 0.035, 4, 24).rotateX(rnd() * 3).rotateY(rnd() * 3).translate(0, r * 0.9, 0), cor.map(c => c * 0.8), { oclusao: 0 });
    return { geo: peca.geometria(), colisor: new THREE.IcosahedronGeometry(r, 1).translate(0, r * 0.9, 0) };
  },
  agulha(rnd, longe) {
    const peca = new Peca(), h = 4 + rnd() * 4, inc = 0.25 + rnd() * 0.3;
    const g = new THREE.CylinderGeometry(0.09, 0.02, h, longe ? 5 : 8).translate(0, h / 2 - 0.4, 0).rotateZ(inc);
    solida(peca, g, C(0.86, 0.88, 0.94), { oclusao: 0.2 });
    const olho = new THREE.TorusGeometry(0.16, 0.05, 5, 12).translate(0, h - 0.5, 0).rotateZ(inc);
    solida(peca, olho, C(0.86, 0.88, 0.94), { oclusao: 0 });
    return { geo: peca.geometria(), colisor: new THREE.CylinderGeometry(0.12, 0.12, h, 5).translate(0, h / 2 - 0.4, 0).rotateZ(inc) };
  },
};

// ---------------- material da vegetação (atlas + vento no shader) ----------------
function materialVegetacao(simples, tempo, foco) {
  const comum = { vertexColors: true, map: atlasVegetacao(), alphaTest: 0.42, side: THREE.DoubleSide };
  const m = simples
    ? new THREE.MeshLambertMaterial(comum)
    : new THREE.MeshStandardMaterial({ ...comum, roughness: 0.88, metalness: 0 });
  m.onBeforeCompile = sh => {
    sh.uniforms.uTempo = tempo;
    sh.uniforms.uFoco = foco;
    sh.vertexShader = 'uniform float uTempo;\nattribute float balanco;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      vec3 raizV = (modelMatrix * vec4(position, 1.0)).xyz;
      float vento = sin(uTempo * 1.3 + raizV.x * 0.21 + raizV.z * 0.17) * 0.6 + sin(uTempo * 2.9 + raizV.x * 0.9) * 0.25;
      transformed.x += vento * balanco * 0.18;
      transformed.z += vento * balanco * 0.11;`)
      .replace('#include <project_vertex>', '#include <project_vertex>\n      vDistCamVeg = -mvPosition.z;\n      vMundoVeg = (modelMatrix * vec4(transformed, 1.0)).xyz;')
      .replace('#include <common>', '#include <common>\nvarying float vDistCamVeg;\nvarying vec3 vMundoVeg;');
    // folhagem colada na câmera some aos poucos, com pontilhado (dither): sem isso as copas tampam
    // a tela na floresta. Descartar pixels é barato (já há alphaTest) e não precisa ordenar nada
    // E a "janela": folhagem no caminho entre a câmera e a Brisa (um cilindro estreito em volta
    // dessa linha, só na frente dela) some com o mesmo pontilhado: ela nunca fica escondida atrás
    // de uma árvore na floresta
    sh.fragmentShader = 'varying float vDistCamVeg;\nvarying vec3 vMundoVeg;\nuniform vec3 uFoco;\n' + sh.fragmentShader.replace('#include <alphatest_fragment>', `#include <alphatest_fragment>
      {
        vec2 q = mod(floor(gl_FragCoord.xy), 4.0);
        float limiar = (mod(q.x * 2.0 + q.y * 3.0, 4.0) + mod(q.y, 2.0) * 0.5 + 0.25) / 4.5; // grade 4×4 espalhada
        float fica = smoothstep(1.4, 4.2, vDistCamVeg);
        vec3 aFoco = uFoco - cameraPosition;
        float L = length(aFoco);
        vec3 dirFoco = aFoco / max(L, 1e-3), w = vMundoVeg - cameraPosition;
        float tFoco = dot(w, dirFoco);
        if (tFoco > 0.0 && tFoco < L - 0.5) {
          float perp = length(w - dirFoco * tFoco);
          float raioJanela = mix(0.5, 1.5, tFoco / L); // mais larga perto da Brisa
          fica = min(fica, mix(0.15, 1.0, smoothstep(raioJanela * 0.55, raioJanela, perp)));
        }
        if (fica < limiar) discard;
      }`);
  };
  m.customProgramCacheKey = () => 'vegetacao4-' + (simples ? 's' : 'p');
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
    if (il.fora) il.obra = { x: Math.cos(il.ang) * il.fora, z: Math.sin(il.ang) * il.fora, r: il.obraR ?? 7 };
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
  const dados = { pos: [], cor: [], uv: [], niveis: [[]], caixa };
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
  // encostas: terra e rocha aparecem onde o chão inclina (a grama não segura em barranco)
  {
    const nr = base.attributes.normal, cr = base.attributes.color, rocha = paraLinear([...ROCHA]), terra = paraLinear([...TERRA]);
    for (let i = 0; i < nr.count; i++) {
      const ny = nr.getY(i);
      if (ny < 0.3 || ny > 0.86) continue;
      const k = suave(ny, 0.86, 0.6), alvo = ny < 0.7 ? rocha : terra;
      cr.setXYZ(i, misturar(cr.getX(i), alvo[0], k), misturar(cr.getY(i), alvo[1], k), misturar(cr.getZ(i), alvo[2], k));
    }
  }
  base.setIndex(null);
  base.computeBoundingBox();
  const niveis = dados.niveis.map(l => new Uint32Array(l));

  // ---------- vegetação e pedras, por setor ----------
  const rnd = aleatorio(MAPA.semente);
  const TAM_SETOR = 48;
  const setores = new Map(); // chave -> { perto: [], longe: [] }
  const colisores = []; // geometrias (mundo) que entram na malha de colisão
  const oclusores = []; // [x, z, y, raio, força]: escurecem o chão em volta
  const colocar = (x, z, tipo, extra) => colocarCom(rnd, x, z, tipo, extra);
  const rndCapim = aleatorio(MAPA.semente ^ 0x5f3759d);
  function colocarCom(rnd, x, z, tipo, extra) {
    const y = alturaEm(x, z);
    if (y === null) return false;
    const chave = `${Math.floor(x / TAM_SETOR)},${Math.floor(z / TAM_SETOR)}`;
    if (!setores.has(chave)) setores.set(chave, { perto: [], longe: [] });
    const s = setores.get(chave), rot = rnd() * Math.PI * 2, esc = 0.85 + rnd() * 0.4;
    const semente = rnd() * 1e9;
    const perto = MODELOS[tipo](aleatorio(semente), false, extra);
    const longe = MODELOS[tipo](aleatorio(semente), true, extra);
    if (perto.geo) s.perto.push(posicionar(perto.geo, x, y - 0.05, z, rot, esc));
    if (longe.geo) s.longe.push(posicionar(longe.geo, x, y - 0.05, z, rot, esc));
    if (perto.colisor) colisores.push(posicionar(perto.colisor, x, y - 0.05, z, rot, esc));
    // sombra suave no chão em volta (oclusão de ambiente feita uma vez, na geração)
    const raioSombra = { pinheiro: 3.2, frondosa: 3.6, betula: 2.4, arbusto: 1.4, pedra: extra ? 3 : 1.1, coral: 1.6, alga: 1.2, carretel: 1.8, novelo: 1.4 }[tipo];
    if (raioSombra) oclusores.push([x, z, y, raioSombra * esc, tipo === 'pedra' ? 0.35 : 0.5]);
    return true;
  };
  const livreDe = [];
  const longeDeConstrucoes = (x, z, folga) => livreDe.every(([cx, cz, r]) => Math.hypot(x - cx, z - cz) > r + folga);
  livreDe.push([VILA.x, VILA.z, VILA.r + 6]);
  livreDe.push([MORRO.x, MORRO.z, 11]); // clareira no topo do morro (onde fica o Coração do Fio)
  if (MAPA.gruta) livreDe.push([MAPA.gruta.x, MAPA.gruta.z, 6]);
  for (const il of ILHOTAS) {
    livreDe.push([il.cx, il.cz, 7]);
    if (il.obra) livreDe.push([il.cx + il.obra.x, il.cz + il.obra.z, il.obra.r + 4]);
  }

  // o que cresce em cada capítulo (no Cap. 1, 'campo': o laço abaixo)
  const VEG = MAPA.vegetacao;
  function vegetarCapitulo(x, z, l, r, floresta, campina) {
    const borda = l.d > 0.84;
    if (VEG === 'recife') {
      // bancos de coral onde no Cap. 1 seria floresta, algas entre eles, capim-marinho e conchas
      if (r < floresta * 0.5 + 0.035) colocar(x, z, 'coral');
      else if (r < floresta * 0.5 + 0.035 + 0.05 + floresta * 0.1) colocar(x, z, 'alga');
      else if (r > 0.975 || (borda && r > 0.93)) colocar(x, z, 'pedra', borda && rnd() < 0.35);
      if (rnd() < 0.12 + campina * 0.35) colocar(x + (rnd() - 0.5) * 1.5, z + (rnd() - 0.5) * 1.5, 'capim');
      if (rnd() < 0.05) colocar(x + (rnd() - 0.5) * 2, z + (rnd() - 0.5) * 2, 'concha');
    } else if (VEG === 'fundo') {
      // o fundo do mar que secou: florestas de algas petrificadas, corais de pedra, conchas na areia
      if (r < floresta * 0.42 + 0.025) colocar(x, z, 'alga', true);
      else if (r < floresta * 0.42 + 0.025 + 0.04 + floresta * 0.06) colocar(x, z, 'coral', true);
      else if (r < 0.1 + campina * 0.2) colocar(x, z, 'flores'); // sementes do jardim de Aurélia, espalhadas
      else if (r > 0.975 || (borda && r > 0.93)) colocar(x, z, 'pedra', borda && rnd() < 0.3);
      if (rnd() < 0.08) colocar(x + (rnd() - 0.5) * 2, z + (rnd() - 0.5) * 2, 'concha');
      if (rnd() < 0.08 + campina * 0.25) colocar(x + (rnd() - 0.5) * 1.5, z + (rnd() - 0.5) * 1.5, 'capim');
    } else if (VEG === 'costura') {
      // a colcha: carretéis e novelos gigantes, agulhas espetadas, poucas flores de pano
      if (r < floresta * 0.12 + 0.012) colocar(x, z, 'carretel');
      else if (r < floresta * 0.12 + 0.012 + 0.014) colocar(x, z, 'novelo');
      else if (r < floresta * 0.12 + 0.026 + 0.006) colocar(x, z, 'agulha');
      else if (r < 0.06 + campina * 0.12) colocar(x, z, 'flores');
      else if (r > 0.988) colocar(x, z, 'pedra');
    }
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
      // na areia só conchas e um capim ralo de restinga
      if (il === PRINCIPAL && naPraia(x, z, l.d) > 0.4) {
        if (r < 0.08) colocar(x, z, 'concha'); else if (r < 0.12) colocar(x, z, 'capim'); else if (r > 0.985) colocar(x, z, 'pedra');
        continue;
      }
      if (VEG !== 'campo') { vegetarCapitulo(x, z, l, r, floresta, campina); continue; }
      if (il.nome === 'pomar') { continue; }
      if (r < floresta * 0.62 + 0.025) {
        const tipo = h > 11 || fbm(x * 0.05, z * 0.05, 2, 4) > 0.62 ? 'pinheiro' : rnd() < 0.22 ? 'betula' : 'frondosa';
        colocar(x, z, tipo);
      } else if (r < floresta * 0.62 + 0.025 + 0.06 + floresta * 0.12) colocar(x, z, 'arbusto');
      else if (r < 0.2 + campina * 0.5) colocar(x, z, 'flores');
      else if (r > 0.985 || (l.d > 0.84 && r > 0.94)) colocar(x, z, 'pedra', l.d > 0.86 && rnd() < 0.3);
      // capim alto: muito nas campinas, pouco dentro da floresta (dois sorteios por célula: o campo
      // ganha volume de verdade; o capim só existe no nível de detalhe de perto, então o custo fica
      // em volta da câmera)
      // (o segundo vem de outro gerador: o resto do mapa, que é sorteado depois, fica idêntico e os
      // saves continuam valendo)
      if (rnd() < 0.18 + campina * 0.55 - floresta * 0.12) colocar(x + (rnd() - 0.5) * 1.5, z + (rnd() - 0.5) * 1.5, 'capim');
      if (rndCapim() < 0.18 + campina * 0.55 - floresta * 0.12) colocarCom(rndCapim, x + (rndCapim() - 0.5) * 2.6, z + (rndCapim() - 0.5) * 2.6, 'capim');
    }
  }
  // pomar: fileiras de árvores frutíferas na ilhota baixa
  const pomar = ILHOTAS.find(i => i.nome === 'pomar');
  if (pomar) for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) {
    if (Math.abs(a) <= 1 && Math.abs(b) <= 1) continue; // o meio do pomar fica livre
    colocar(pomar.cx + a * 5.2 + (rnd() - 0.5), pomar.cz + b * 5.2 + (rnd() - 0.5), 'frondosa', true);
  }
  await passo(0.6);

  // ---------- oclusão no chão: o terreno escurece em volta de árvores e pedras ----------
  {
    const pos = base.attributes.position, cor = base.attributes.color, CEL = 2, grade = new Map();
    for (let i = 0; i < pos.count; i++) { const k = Math.floor(pos.getX(i) / CEL) + ',' + Math.floor(pos.getZ(i) / CEL); let l = grade.get(k); if (!l) grade.set(k, (l = [])); l.push(i); }
    const fator = new Float32Array(pos.count).fill(1);
    for (const [x, z, y, r, f] of oclusores) {
      for (let a = Math.floor((x - r) / CEL); a <= Math.floor((x + r) / CEL); a++) for (let b = Math.floor((z - r) / CEL); b <= Math.floor((z + r) / CEL); b++) {
        for (const i of grade.get(a + ',' + b) ?? []) {
          if (Math.abs(pos.getY(i) - y) > 2.5) continue;
          const d = Math.hypot(pos.getX(i) - x, pos.getZ(i) - z) / r;
          if (d < 1) fator[i] *= 1 - f * (1 - d) * (1 - d);
        }
      }
    }
    for (let i = 0; i < pos.count; i++) if (fator[i] < 1) cor.setXYZ(i, cor.getX(i) * fator[i], cor.getY(i) * fator[i], cor.getZ(i) * fator[i]);
  }

  // ---------- construções (casas.js): as de cada capítulo ----------
  // Cap. 1: vila, farol e ruínas. Cap. 2: cascos de barco e mastros. Cap. 3: a vila velha, o
  // jardim de Aurélia e marcos nas ilhotas. Cap. 4: pontos de costura gigantes e carretéis.
  const construcoes = new THREE.Group(); construcoes.name = 'construcoes';
  const naObra = il => { const x = il.cx + il.obra.x, z = il.cz + il.obra.z; return new THREE.Vector3(x, alturaEm(x, z), z); };
  const centroIlhota = il => new THREE.Vector3(il.cx, 0, il.cz);
  const centroPraca = new THREE.Vector3(VILA.x, alturaVila, VILA.z);
  const pontoMorro = new THREE.Vector3(MORRO.x, alturaEm(MORRO.x, MORRO.z), MORRO.z);
  const obras = []; // { grupo, casas?, topo?, atualizar?, aplicarNivel? }
  if (MAPA.construcoes === 'vila') {
    const farolI = ILHOTAS.find(i => i.nome === 'farol'), ruinasI = ILHOTAS.find(i => i.nome === 'ruinas');
    obras.push(construirVila({ centro: centroPraca, raio: VILA.r, alturaEm, rnd, nomes: CASAS }));
    obras.push(construirFarol({ centro: naObra(farolI), alturaEm, rnd, evitar: centroIlhota(farolI) }));
    obras.push(construirRuinas({ centro: naObra(ruinasI), alturaEm, rnd, evitar: centroIlhota(ruinasI) }));
    if (MAPA.gruta) { const { x, z } = MAPA.gruta; obras.push(construirGruta({ centro: new THREE.Vector3(x, alturaEm(x, z), z), alturaEm, rnd, nome: 'Gruta dos Recados' })); }
    if (PRAIA) {
      // o cais sai da areia e avança sobre a borda (o mar fica lá embaixo)
      const r = raioBorda(PRINCIPAL, PRAIA.ang) * 0.9, x = Math.cos(PRAIA.ang) * r, z = Math.sin(PRAIA.ang) * r;
      obras.push(construirCais({ inicio: new THREE.Vector3(x, alturaEm(x, z), z), direcao: new THREE.Vector3(Math.cos(PRAIA.ang), 0, Math.sin(PRAIA.ang)), alturaEm, rnd }));
    }
  } else if (MAPA.construcoes === 'naufragios') {
    obras.push(construirNaufragios({ centro: centroPraca, raio: VILA.r, alturaEm, rnd, nomes: CASAS }));
    for (const il of ILHOTAS) obras.push(construirMarcoIlhota({ tipo: 'mastro', centro: naObra(il), alturaEm, rnd, evitar: centroIlhota(il) }));
  } else if (MAPA.construcoes === 'vilaAntiga') {
    obras.push(construirVila({ centro: centroPraca, raio: VILA.r, alturaEm, rnd, nomes: CASAS, antiga: true }));
    obras.push(construirJardim({ centro: pontoMorro, alturaEm, rnd }));
    for (const il of ILHOTAS) obras.push(construirMarcoIlhota({ tipo: 'arco', centro: naObra(il), alturaEm, rnd, evitar: centroIlhota(il) }));
  } else if (MAPA.construcoes === 'costura') {
    obras.push(construirCostura({ centro: centroPraca, raio: VILA.r, alturaEm, rnd }));
    for (const il of ILHOTAS) obras.push(construirMarcoIlhota({ tipo: 'carreteis', centro: naObra(il), alturaEm, rnd, evitar: centroIlhota(il) }));
  }
  for (const o of obras) construcoes.add(o.grupo);
  const casas = obras.flatMap(o => o.casas ?? []);
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
  const foco = { value: new THREE.Vector3(0, -1e4, 0) }; // a Brisa (jogo.js atualiza): a "janela" na folhagem
  let matVeg = materialVegetacao(false, tempo, foco);
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
    setores: setoresLod, // setores de vegetação (occlusion culling: oclusao.js)
    focoVegetacao: foco.value,
    nascimentoPreferido: new THREE.Vector3(VILA.x, alturaVila, VILA.z),
    pontos: { vila: VILA, morro: MORRO, ilhotas: ILHOTAS.map(i => ({ nome: i.nome, x: i.cx, z: i.cz, topo: alturaEm(i.cx, i.cz) })), casas },
    alturaEm,
    atualizarEnfeites(t, camera, noite = 0) {
      tempo.value = t;
      for (const o of obras) o.atualizar?.(t, noite);
    },
    aoMudarQualidade(nivel) {
      const novo = materialVegetacao(nivel.materialSimples, tempo, foco);
      vegetacao.traverse(o => { if (o.isMesh) o.material = novo; });
      matVeg.dispose(); matVeg = novo;
      const longe = nivel.vegetacaoLonge ?? (nivel.materialSimples ? 38 : nivel.efeitos ? 85 : 60);
      for (const l of setoresLod) if (l.levels[1]) l.levels[1].distance = longe;
      for (const o of obras) o.aplicarNivel?.(nivel);
    },
  };
  await passo(1);
  return mapa;
}
