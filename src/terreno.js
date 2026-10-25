import * as THREE from 'three';
import { moverComColisao } from './fisica.js';

// Velocidade de lançamento de um trampolim: arco que passa "folga" metros acima do ponto
// mais alto entre a saída e o pouso e cai exatamente no alvo.
export function calcularLancamento(de, para, gravidade, folga) {
  const g = -gravidade, apice = Math.max(de.y, para.y) + folga;
  const vy = Math.sqrt(2 * g * (apice - de.y));
  const t = vy / g + Math.sqrt(2 * (apice - para.y) / g);
  return new THREE.Vector3((para.x - de.x) / t, vy, (para.z - de.z) / t);
}

// Análise do mapa feita ao carregar: mapa de alturas, áreas andáveis, e onde faltam caminhos.
// Os platôs do mapa ficam separados por penhascos de 10–25 m, mais altos do que qualquer pulo,
// então trampolins são colocados automaticamente até que toda área grande dê para ir e voltar.

const PASSO = 1;          // resolução do mapa de alturas (m)
const DEGRAU = 0.6;       // diferença de altura que se vence andando entre células vizinhas
const ALCANCE_PULO = 4;   // distância horizontal de um pulo
const ALTURA_PULO = 3.8;  // altura alcançável com pulo + pulo duplo
const AREA_MIN = 25;      // platôs menores que isso não precisam ser alcançáveis

export function analisarTerreno(mapa, { gravidade, quantidadeEstrelas = 25 } = {}) {
  const { malha, geo, amostrar } = mapa;
  const box = geo.boundingBox;
  const x0 = Math.floor(box.min.x), z0 = Math.floor(box.min.z);
  const NX = Math.ceil((box.max.x - x0) / PASSO), NZ = Math.ceil((box.max.z - z0) / PASSO);
  const N = NX * NZ;
  const H = new Float32Array(N).fill(NaN), NY = new Float32Array(N), copa = new Uint8Array(N), grama = new Uint8Array(N);
  const rc = new THREE.Raycaster(); rc.firstHitOnly = true; rc.layers.enableAll();
  const baixo = new THREE.Vector3(0, -1, 0), cima = new THREE.Vector3(0, 1, 0), o = new THREE.Vector3();
  const topo = box.max.y + 5;

  const centro = (c) => new THREE.Vector3(x0 + (Math.floor(c / NZ) + 0.5) * PASSO, H[c], z0 + (c % NZ + 0.5) * PASSO);
  const ceuLivre = (p, altura) => {
    rc.set(o.set(p.x, p.y + 0.3, p.z), cima); rc.far = altura;
    const livre = rc.intersectObject(malha).length === 0;
    rc.far = Infinity;
    return livre;
  };

  for (let i = 0; i < NX; i++) for (let j = 0; j < NZ; j++) {
    rc.set(o.set(x0 + (i + 0.5) * PASSO, topo, z0 + (j + 0.5) * PASSO), baixo);
    const h = rc.intersectObject(malha)[0];
    if (!h) continue;
    const c = i * NZ + j;
    H[c] = h.point.y; NY[c] = h.face.normal.y;
    // construções, troncos e pedras da ilha gerada (uv −1): não são chão para a análise
    if (h.uv && h.uv.x < -0.5) { copa[c] = 1; continue; }
    const cor = h.uv && amostrar(h.uv);
    // copa de árvore: verde-escura (vermelho bem abaixo do verde); grama é oliva (vermelho ≈ verde)
    if (cor && cor[0] < 0.85 * cor[1] && cor[1] < 80) copa[c] = 1;
    // gramado: verde-oliva bem mais verde que azul (trilha é bege, rocha é cinza)
    else if (cor && cor[1] > 55 && cor[1] > cor[2] * 1.6 && cor[0] < cor[1] * 1.12 && NY[c] > 0.72) grama[c] = 1;
  }

  // ---------- áreas andáveis conectadas ----------
  const comp = new Int32Array(N).fill(-1);
  const andavel = c => !isNaN(H[c]) && NY[c] > 0.6;
  const vizinhos = c => {
    const i = Math.floor(c / NZ), j = c % NZ, r = [];
    if (i > 0) r.push(c - NZ); if (i < NX - 1) r.push(c + NZ);
    if (j > 0) r.push(c - 1); if (j < NZ - 1) r.push(c + 1);
    return r;
  };
  const comps = [];
  for (let s = 0; s < N; s++) {
    if (comp[s] >= 0 || !andavel(s)) continue;
    const id = comps.length, celulas = [], pilha = [s];
    comp[s] = id;
    while (pilha.length) {
      const c = pilha.pop(); celulas.push(c);
      for (const n of vizinhos(c)) {
        if (comp[n] < 0 && andavel(n) && Math.abs(H[n] - H[c]) <= DEGRAU) { comp[n] = id; pilha.push(n); }
      }
    }
    const nCopa = celulas.reduce((s, c) => s + copa[c], 0);
    comps.push({ id, celulas, chao: nCopa / celulas.length < 0.5 });
  }
  const importantes = comps.filter(c => c.chao && c.celulas.length >= AREA_MIN);
  const ehNo = new Set(importantes.map(c => c.id));
  // células "internas" (todos os vizinhos na mesma área): bons lugares para pousar e nascer
  const interna = c => vizinhos(c).every(n => comp[n] === comp[c]) && !copa[c] && NY[c] > 0.8;

  // ---------- quem alcança quem (andando, pulando ou caindo) ----------
  const arestas = new Map(importantes.map(c => [c.id, new Set()]));
  const R = Math.ceil(ALCANCE_PULO / PASSO);
  for (const a of importantes) for (const s of a.celulas) {
    const si = Math.floor(s / NZ), sj = s % NZ;
    for (let di = -R; di <= R; di++) for (let dj = -R; dj <= R; dj++) {
      if (di * di + dj * dj > R * R) continue;
      const ni = si + di, nj = sj + dj;
      if (ni < 0 || nj < 0 || ni >= NX || nj >= NZ) continue;
      const t = ni * NZ + nj, b = comp[t];
      if (b < 0 || b === a.id || !ehNo.has(b)) continue;
      if (H[t] - H[s] <= ALTURA_PULO) arestas.get(a.id).add(b);
    }
  }
  // áreas alcançáveis a partir de "inicio" (ou, no reverso, as que conseguem chegar até ele)
  const alcance = (inicio, reverso) => {
    const visto = new Set([inicio]), pilha = [inicio];
    while (pilha.length) {
      const c = pilha.pop();
      const proximos = reverso
        ? [...arestas].filter(([, bs]) => bs.has(c)).map(([a]) => a)
        : [...(arestas.get(c) || [])];
      for (const n of proximos) if (!visto.has(n)) { visto.add(n); pilha.push(n); }
    }
    return visto;
  };

  // ---------- nascimento: centro da maior área ----------
  const maior = importantes.reduce((a, b) => (b.celulas.length > a.celulas.length ? b : a));
  // o mapa pode pedir onde a protagonista acorda (a ilha gerada: a praça da vila)
  const media = mapa.nascimentoPreferido?.clone()
    ?? maior.celulas.reduce((m, c) => m.add(centro(c)), new THREE.Vector3()).divideScalar(maior.celulas.length);
  const nasc = maior.celulas.filter(interna).reduce((melhor, c) =>
    (!melhor || centro(c).distanceToSquared(media) < centro(melhor).distanceToSquared(media) ? c : melhor), null);
  const nascimento = centro(nasc ?? maior.celulas[0]);

  // ---------- trampolins ----------
  const trampolins = [];
  // confere o voo de verdade: simula a física do jogo (com colisão) e vê se pousa no alvo
  const vooChega = (de, para, folga) => {
    const pos = de.clone(), vel = calcularLancamento(de, para, gravidade, folga);
    const dt = 1 / 120;
    for (let k = 0; k < 8 * 120; k++) {
      vel.y += gravidade * dt;
      const r = moverComColisao(mapa, pos, vel, dt, false);
      if (r.noChao && k > 10) return Math.hypot(pos.x - para.x, pos.z - para.z) < 1.5 && Math.abs(pos.y - para.y) < 1;
      if (pos.y < box.min.y) return false;
    }
    return false;
  };
  let simulacoes = 0;
  const usadas = new Set();
  const colocar = (origens, destino) => {
    // pares (origem, destino) mais próximos primeiro, com espaço para o arco
    const cand = [];
    const dest = destino.celulas.filter(interna);
    const orig = origens.flatMap(o => o.celulas.filter(interna));
    for (let k = 0; k < dest.length; k += 2) for (let m = 0; m < orig.length; m += 2) {
      const a = centro(orig[m]), b = centro(dest[k]);
      const dh = Math.hypot(a.x - b.x, a.z - b.z);
      if (dh < 3 || dh > 30) continue;
      cand.push([Math.abs(dh - 8) + Math.abs(b.y - a.y) * 0.3, orig[m], dest[k]]);
    }
    cand.sort((p, q) => p[0] - q[0]);
    let tentativas = 0;
    for (const [, a, b] of cand.slice(0, 600)) {
      if ([...usadas].some(u => centro(u).distanceTo(centro(a)) < 3)) continue;
      const pa = centro(a), pb = centro(b);
      if (!ceuLivre(pa, 6)) continue;
      if (++tentativas > 40) break;
      // arco baixo primeiro; se bater em algo, tenta um mais alto
      const folga = [3, 6, 10].find(f => (simulacoes++, vooChega(pa, pb, f)));
      if (folga === undefined) continue;
      usadas.add(a);
      trampolins.push({ pos: pa, alvo: pb, folga, de: comp[a], para: destino.id });
      arestas.get(comp[a]).add(destino.id);
      return true;
    }
    return false;
  };
  const inicio = comp[nasc ?? maior.celulas[0]];
  for (let tentativa = 0; tentativa < 40; tentativa++) {
    const ida = alcance(inicio, false), volta = alcance(inicio, true);
    const semIda = importantes.filter(c => !ida.has(c.id)).sort((a, b) => b.celulas.length - a.celulas.length)[0];
    if (semIda) {
      // sem lugar para um trampolim até lá: a área deixa de ser obrigatória
      if (!colocar(importantes.filter(c => ida.has(c.id)), semIda)) importantes.splice(importantes.indexOf(semIda), 1);
      continue;
    }
    const semVolta = importantes.filter(c => !volta.has(c.id)).sort((a, b) => b.celulas.length - a.celulas.length)[0];
    if (semVolta) {
      // trampolim de volta: da área presa para qualquer área que já leva ao início
      const alvos = importantes.filter(c => volta.has(c.id));
      let ok = false;
      for (const alvo of alvos.sort((a, b) => b.celulas.length - a.celulas.length)) if ((ok = colocar([semVolta], alvo))) break;
      if (!ok) importantes.splice(importantes.indexOf(semVolta), 1);
      continue;
    }
    break;
  }

  // ---------- estrelas espalhadas pelo chão alcançável ----------
  const livres = importantes.flatMap(c => c.celulas.filter(interna)).map(centro).filter(p => ceuLivre(p, 3));
  const estrelas = [];
  if (livres.length) {
    estrelas.push(livres.reduce((a, b) => (b.distanceTo(nascimento) > a.distanceTo(nascimento) ? b : a)));
    const dist = livres.map(p => p.distanceTo(estrelas[0]));
    while (estrelas.length < quantidadeEstrelas) {
      let k = 0;
      for (let i = 1; i < livres.length; i++) if (dist[i] > dist[k]) k = i;
      if (dist[k] < 4) break;
      estrelas.push(livres[k]);
      for (let i = 0; i < livres.length; i++) dist[i] = Math.min(dist[i], livres[i].distanceTo(livres[k]));
    }
  }

  const gramado = [];
  for (let c = 0; c < N; c++) if (grama[c]) gramado.push(centro(c));

  // ---------- data for level design (story landmarks, enemies, floating rocks) ----------
  // reachable areas: size, a central free spot and height
  const areas = importantes.map(a => {
    const cel = a.celulas.filter(interna);
    const m = cel.reduce((s, c) => s.add(centro(c)), new THREE.Vector3()).divideScalar(Math.max(1, cel.length));
    const meio = cel.reduce((b, c) => (!b || centro(c).distanceToSquared(m) < centro(b).distanceToSquared(m) ? c : b), null);
    return { id: a.id, tamanho: a.celulas.length, centro: centro(meio ?? a.celulas[0]), livres: cel.map(centro).filter(p => ceuLivre(p, 4)) };
  }).filter(a => a.livres.length > 6);
  // cliff edges: flat ground with the void (no ground at all) right next to it
  const bordas = [];
  for (const a of importantes) for (const c of a.celulas) {
    if (!interna(c) || NY[c] < 0.85) continue;
    const i = Math.floor(c / NZ), j = c % NZ;
    for (const [di, dj] of [[3, 0], [-3, 0], [0, 3], [0, -3]]) {
      const ni = i + di, nj = j + dj;
      const fora = ni < 0 || nj < 0 || ni >= NX || nj >= NZ || isNaN(H[ni * NZ + nj]) || H[ni * NZ + nj] < H[c] - 12;
      if (fora) { bordas.push({ pos: centro(c), para: new THREE.Vector3(di, 0, dj).normalize(), area: a.id }); break; }
    }
  }

  return {
    nascimento,
    areaInicial: inicio,
    areas, bordas,
    trampolins,
    simulacoes,
    gramado, passo: PASSO,
    estrelas: estrelas.map(p => p.clone().add(new THREE.Vector3(0, 1, 0))),
    limiteQueda: box.min.y - 15,
  };
}
