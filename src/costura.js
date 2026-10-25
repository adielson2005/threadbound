import * as THREE from 'three';

// Brisa, a boneca de pano, modelada por código e "costurada" no esqueleto da boneca do Meshy.
// Mantém o esqueleto e TODAS as animações (andar, correr, golpes, pulo, queda, morte); troca só o
// corpo: malha limpa (sem triângulos soltos nem partes atravessadas), proporções medidas da boneca
// antiga e pesos suaves nas articulações (cada vértice segue no máximo dois ossos vizinhos).
//
// Identidade preservada: pele marrom de tecido, cabeça grande, olhos castanhos grandes pintados,
// cabelo de lã escuro com franja e mechas longas, laço rosa, vestido lilás de bolinhas com mangas
// bufantes, gola e faixa brancas, laço no peito, babado branco, meias brancas e sapatinhos rosa.
//
// Tudo é construído na pose de repouso, em centímetros (a unidade do FBX), e preso aos ossos.

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const suave = (x, a, b) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// ---------------- texturas de tecido (canvas) ----------------
function canvas(w, h, desenhar) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  desenhar(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
  return t;
}
// trama do tecido: fios cruzados bem finos + leve irregularidade
function trama(g, w, h, forca = 0.1, passo = 3) {
  for (let y = 0; y < h; y += passo) { g.fillStyle = `rgba(0,0,0,${forca * (0.5 + Math.random() * 0.5)})`; g.fillRect(0, y, w, 1); }
  for (let x = 0; x < w; x += passo) { g.fillStyle = `rgba(255,255,255,${forca * 0.6 * (0.5 + Math.random() * 0.5)})`; g.fillRect(x, 0, 1, h); }
  for (let k = 0; k < w * h / 60; k++) { g.fillStyle = `rgba(0,0,0,${Math.random() * forca * 0.6})`; g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1); }
}
// costura tracejada (a "linha" que fecha cada peça)
function pesponto(g, x0, y0, x1, y1, cor = 'rgba(30,18,10,0.55)', tam = 6) {
  g.save(); g.strokeStyle = cor; g.lineWidth = 2; g.setLineDash([tam, tam * 0.8]);
  g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); g.restore();
}
function texturaPele() {
  return canvas(256, 256, (g, w, h) => {
    g.fillStyle = '#6f4129'; g.fillRect(0, 0, w, h);
    trama(g, w, h, 0.09);
    pesponto(g, w * 0.5, 0, w * 0.5, h, 'rgba(40,20,10,0.5)'); // costura nas costas de cada membro
  });
}
function texturaVestido() {
  return canvas(512, 512, (g, w, h) => {
    g.fillStyle = '#c4aceb'; g.fillRect(0, 0, w, h);
    trama(g, w, h, 0.07);
    g.fillStyle = '#fbf7ff';
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      g.beginPath(); g.arc((x + (y % 2) * 0.5 + 0.25) * w / 8, (y + 0.5) * h / 8, 7, 0, Math.PI * 2); g.fill();
    }
    pesponto(g, w * 0.5, 0, w * 0.5, h, 'rgba(90,60,140,0.6)');
  });
}
function texturaLisa(cor, forca = 0.07, costura = 'rgba(0,0,0,0.25)') {
  return canvas(256, 256, (g, w, h) => { g.fillStyle = cor; g.fillRect(0, 0, w, h); trama(g, w, h, forca); pesponto(g, w * 0.5, 0, w * 0.5, h, costura); });
}
function texturaCabelo() {
  return canvas(256, 512, (g, w, h) => {
    g.fillStyle = '#2a1812'; g.fillRect(0, 0, w, h);
    // fios de lã: listras verticais com brilho e sombra alternados
    for (let x = 0; x < w; x += 3) {
      const claro = Math.random();
      g.fillStyle = claro > 0.7 ? 'rgba(120,80,60,0.35)' : claro < 0.25 ? 'rgba(0,0,0,0.35)' : 'rgba(70,45,32,0.25)';
      g.fillRect(x, 0, 1 + Math.random() * 1.5, h);
    }
    for (let k = 0; k < 400; k++) { g.fillStyle = 'rgba(0,0,0,0.2)'; g.fillRect(Math.random() * w, Math.random() * h, 2, 6); }
  });
}
// rosto pintado na cabeça (mapa equirretangular: a frente da cabeça é u = 0,25)
function texturaRosto() {
  const t = canvas(1024, 512, (g, w, h) => {
    g.fillStyle = '#6f4129'; g.fillRect(0, 0, w, h);
    trama(g, w, h, 0.07);
    const cx = w * 0.25, olhoY = h * 0.565;
    for (const lado of [-1, 1]) {
      const ox = cx + lado * w * 0.072;
      // branco do olho
      g.fillStyle = '#fbf6f0'; g.beginPath(); g.ellipse(ox, olhoY, 33, 38, 0, 0, Math.PI * 2); g.fill();
      // íris castanha com anel escuro, pupila e dois brilhos
      const gr = g.createRadialGradient(ox, olhoY + 4, 4, ox, olhoY + 4, 28);
      gr.addColorStop(0, '#8a5228'); gr.addColorStop(0.7, '#5c3015'); gr.addColorStop(1, '#2a1408');
      g.fillStyle = gr; g.beginPath(); g.ellipse(ox, olhoY + 5, 26, 30, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#140a05'; g.beginPath(); g.ellipse(ox, olhoY + 6, 12, 14, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#ffffff'; g.beginPath(); g.ellipse(ox - 9, olhoY - 6, 8, 9, 0, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.arc(ox + 9, olhoY + 15, 4, 0, Math.PI * 2); g.fill();
      // contorno e cílios
      g.strokeStyle = '#1a0d06'; g.lineWidth = 5; g.beginPath(); g.ellipse(ox, olhoY, 34, 39, 0, Math.PI * 1.08, Math.PI * 1.92); g.stroke();
      g.lineWidth = 3;
      for (let k = 0; k < 4; k++) {
        const a = Math.PI * (1.15 + k * 0.08) + (lado > 0 ? 0.12 : 0) * 0;
        const ax = ox + Math.cos(a) * 34 * (lado > 0 ? -1 : 1) * -1, ay = olhoY + Math.sin(a) * 39;
        g.beginPath(); g.moveTo(ax, ay); g.lineTo(ax + lado * (6 + k * 2), ay - 9); g.stroke();
      }
      // sobrancelha
      g.strokeStyle = '#24130a'; g.lineWidth = 6; g.lineCap = 'round';
      g.beginPath(); g.moveTo(ox - 26, olhoY - 58); g.quadraticCurveTo(ox, olhoY - 68, ox + 26, olhoY - 58); g.stroke();
      // bochecha rosada
      const bg = g.createRadialGradient(cx + lado * w * 0.105, h * 0.665, 2, cx + lado * w * 0.105, h * 0.665, 30);
      bg.addColorStop(0, 'rgba(240,120,140,0.55)'); bg.addColorStop(1, 'rgba(240,120,140,0)');
      g.fillStyle = bg; g.fillRect(cx + lado * w * 0.105 - 32, h * 0.665 - 32, 64, 64);
    }
    // nariz (um pontinho bordado) e sorriso costurado
    g.fillStyle = '#4a2a18'; g.beginPath(); g.ellipse(cx, h * 0.655, 5, 4, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#3a1a10'; g.lineWidth = 4; g.lineCap = 'round';
    g.beginPath(); g.moveTo(cx - 20, h * 0.705); g.quadraticCurveTo(cx, h * 0.735, cx + 20, h * 0.705); g.stroke();
    g.lineWidth = 2;
    for (let k = -2; k <= 2; k++) { const x = cx + k * 9; g.beginPath(); g.moveTo(x, h * 0.708 + Math.abs(k) * -2); g.lineTo(x, h * 0.725 - Math.abs(k) * 2); g.stroke(); }
  });
  t.wrapS = THREE.ClampToEdgeWrapping; t.wrapT = THREE.ClampToEdgeWrapping;
  t.anisotropy = 8;
  return t;
}

// ---------------- montagem das malhas com pesos ----------------
class Peca {
  constructor() { this.pos = []; this.nrm = []; this.uv = []; this.si = []; this.sw = []; this.ind = []; }
  get n() { return this.pos.length / 3; }
  // pesos: Map/obj { indiceOsso: peso } (os dois maiores ficam)
  vert(p, nr, u, v, pesos) {
    this.pos.push(p.x, p.y, p.z); this.nrm.push(nr.x, nr.y, nr.z); this.uv.push(u, v);
    const lista = Object.entries(pesos).map(([k, w]) => [+k, w]).sort((a, b) => b[1] - a[1]).slice(0, 2);
    const soma = lista.reduce((s, [, w]) => s + w, 0) || 1;
    this.si.push(lista[0][0], lista[1]?.[0] ?? 0, 0, 0);
    this.sw.push(lista[0][1] / soma, (lista[1]?.[1] ?? 0) / soma, 0, 0);
    return this.n - 1;
  }
  geometria() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(this.si, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(this.sw, 4));
    g.setIndex(this.ind);
    g.computeBoundingSphere();
    return g;
  }
}
const misturaPesos = (a, b, t) => {
  const r = {};
  for (const [k, w] of Object.entries(a)) r[k] = (r[k] ?? 0) + w * (1 - t);
  for (const [k, w] of Object.entries(b)) r[k] = (r[k] ?? 0) + w * t;
  return r;
};

// tubo por uma lista de pontos { p, rx, rz, pesos }, com seção elíptica; "frente" orienta a elipse
function tubo(peca, pontos, { lados = 14, sub = 3, frente = V(0, 0, 1), tampaIni = true, tampaFim = true, onda = null, vRep = 1 } = {}) {
  // reamostra: "sub" anéis entre cada par de pontos
  const aneis = [];
  for (let i = 0; i < pontos.length - 1; i++) {
    const a = pontos[i], b = pontos[i + 1];
    for (let s = 0; s < sub; s++) {
      const t = s / sub;
      aneis.push({ p: a.p.clone().lerp(b.p, t), rx: THREE.MathUtils.lerp(a.rx, b.rx, t), rz: THREE.MathUtils.lerp(a.rz ?? a.rx, b.rz ?? b.rx, t), pesos: misturaPesos(a.pesos, b.pesos, suave(t, 0, 1)) });
    }
  }
  const ult = pontos[pontos.length - 1];
  aneis.push({ p: ult.p.clone(), rx: ult.rx, rz: ult.rz ?? ult.rx, pesos: ult.pesos });
  // comprimento acumulado (para a coordenada v da textura)
  let comp = 0; aneis.forEach((a, i) => { if (i) comp += a.p.distanceTo(aneis[i - 1].p); a.v = comp; });
  const base = peca.n;
  aneis.forEach((a, i) => {
    const t = (i < aneis.length - 1 ? aneis[i + 1].p.clone().sub(a.p) : a.p.clone().sub(aneis[i - 1].p)).normalize();
    let lado = new THREE.Vector3().crossVectors(t, frente);
    if (lado.lengthSq() < 1e-4) lado.crossVectors(t, V(1, 0, 0));
    lado.normalize();
    const fr = new THREE.Vector3().crossVectors(lado, t).normalize();
    for (let j = 0; j <= lados; j++) {
      const ang = (j / lados) * Math.PI * 2;
      const fator = onda ? onda(ang, i / (aneis.length - 1)) : 1;
      const dir = lado.clone().multiplyScalar(Math.cos(ang) * a.rx).addScaledVector(fr, Math.sin(ang) * a.rz);
      const nr = lado.clone().multiplyScalar(Math.cos(ang) / a.rx).addScaledVector(fr, Math.sin(ang) / a.rz).normalize();
      peca.vert(a.p.clone().addScaledVector(dir, fator), nr, j / lados, (a.v / Math.max(1, comp)) * vRep, a.pesos);
    }
  });
  for (let i = 0; i < aneis.length - 1; i++) for (let j = 0; j < lados; j++) {
    const a = base + i * (lados + 1) + j, b = a + 1, c = a + lados + 1, d = c + 1;
    peca.ind.push(a, c, b, b, c, d);
  }
  // tampas arredondadas (meia esfera achatada) nas pontas
  const tampa = (anel, sentido) => {
    const t = (sentido > 0 ? aneis[aneis.length - 1].p.clone().sub(aneis[aneis.length - 2].p) : aneis[0].p.clone().sub(aneis[1].p)).normalize();
    const c = peca.vert(anel.p.clone().addScaledVector(t, Math.min(anel.rx, anel.rz) * 0.8), t, 0.5, sentido > 0 ? 1 : 0, anel.pesos);
    const ini = sentido > 0 ? base + (aneis.length - 1) * (lados + 1) : base;
    for (let j = 0; j < lados; j++) sentido > 0 ? peca.ind.push(ini + j, c, ini + j + 1) : peca.ind.push(ini + j + 1, c, ini + j);
  };
  if (tampaIni) tampa(aneis[0], -1);
  if (tampaFim) tampa(aneis[aneis.length - 1], 1);
}

// elipsoide (esfera da three com UV) com pesos fixos ou por vértice
function elipsoide(peca, centro, raios, pesos, { quat = new THREE.Quaternion(), seg = [24, 16], theta = [0, Math.PI], phi = [0, Math.PI * 2], deformar = null } = {}) {
  const s = new THREE.SphereGeometry(1, seg[0], seg[1], phi[0], phi[1], theta[0], theta[1]);
  const p = s.attributes.position, nr = s.attributes.normal, uv = s.attributes.uv, base = peca.n;
  const v = V(), n = V();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i); n.fromBufferAttribute(nr, i);
    if (deformar) deformar(v);
    const local = v.clone().multiply(raios);
    const nl = n.clone().divide(raios).normalize().applyQuaternion(quat);
    const w = local.applyQuaternion(quat).add(centro);
    peca.vert(w, nl, uv.getX(i), uv.getY(i), typeof pesos === 'function' ? pesos(w) : pesos);
  }
  for (let i = 0; i < s.index.count; i++) peca.ind.push(s.index.getX(i) + base);
  s.dispose();
}

// ---------------- a boneca ----------------
export function costurarBoneca(fbx, metrosParaUnidade) {
  fbx.updateMatrixWorld(true);
  const lista = [];
  fbx.traverse(o => { if (o.isBone) lista.push(o); });
  const indice = new Map(lista.map((o, i) => [o.name.replace('mixamorig', ''), i]));
  const O = n => indice.get(n);
  const P = n => lista[O(n)].getWorldPosition(V());
  const M = metrosParaUnidade; // 1 m em unidades do FBX
  const m = x => x * M;
  const chao = Math.min(P('LeftToe_End')?.y ?? P('LeftToeBase').y, P('RightToeBase').y) - m(0.02);
  const Y = metros => chao + m(metros);
  const frente = P('LeftToeBase').sub(P('LeftFoot')).setY(0).normalize();
  const ladoE = new THREE.Vector3().crossVectors(V(0, 1, 0), frente).normalize(); // lado esquerdo da boneca
  const centroX = P('Hips');
  const quatFrente = new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), frente);
  const pt = (x, yM, z) => centroX.clone().addScaledVector(ladoE, m(x)).setY(Y(yM)).addScaledVector(frente, m(z));

  const pecas = { pele: new Peca(), rosto: new Peca(), cabelo: new Peca(), vestido: new Peca(), branco: new Peca(), rosa: new Peca(), lilas: new Peca() };
  const so = n => ({ [O(n)]: 1 });
  const par = (a, b, t) => ({ [O(a)]: 1 - t, [O(b)]: t });

  // ----- cabeça (rosto pintado), orelhas e pescoço -----
  const cabecaC = pt(0, 1.31, 0.005), cabecaR = V(m(0.25), m(0.285), m(0.235));
  elipsoide(pecas.rosto, cabecaC, cabecaR, so('Head'), { quat: quatFrente, seg: [48, 32] });
  for (const s of [-1, 1]) elipsoide(pecas.pele, pt(s * 0.245, 1.27, 0.0), V(m(0.035), m(0.05), m(0.03)), so('Head'), { quat: quatFrente, seg: [10, 8] });
  tubo(pecas.pele, [
    { p: pt(0, 0.88, -0.005), rx: m(0.045), pesos: so('Spine2') },
    { p: pt(0, 0.96, -0.005), rx: m(0.043), pesos: so('Neck') },
    { p: pt(0, 1.07, 0), rx: m(0.05), pesos: so('Head') },
  ], { lados: 12, sub: 2, tampaIni: false, tampaFim: false, frente });

  // ----- cabelo de lã: touca, franja, mechas compridas e o laço rosa -----
  const capR = cabecaR.clone().multiplyScalar(1.075);
  // touca: do topo até a altura da testa (na frente) e até a nuca (atrás)
  elipsoide(pecas.cabelo, cabecaC, capR, so('Head'), { quat: quatFrente, seg: [48, 24], theta: [0, Math.PI * 0.43] });
  elipsoide(pecas.cabelo, cabecaC, capR, so('Head'), { quat: quatFrente, seg: [36, 16], theta: [Math.PI * 0.42, Math.PI * 0.42], phi: [Math.PI * 0.5 + 1.0, Math.PI * 2 - 2.0] });
  // franja: mechas curtas e achatadas sobre a testa
  // ponto na superfície da touca, no ângulo "a" em volta da frente e na altura y (m), um pouco para fora
  const naTouca = (a, yM, fora = 0.006) => {
    const f = Math.sqrt(Math.max(0, 1 - ((Y(yM) - cabecaC.y) / capR.y) ** 2));
    return cabecaC.clone().addScaledVector(frente, Math.cos(a) * (capR.z * f + m(fora))).addScaledVector(ladoE, Math.sin(a) * (capR.x * f + m(fora))).setY(Y(yM));
  };
  for (let k = -3; k <= 3; k++) {
    const a = k * 0.19;
    tubo(pecas.cabelo, [
      { p: naTouca(a, 1.43, -0.01), rx: m(0.042), rz: m(0.012), pesos: so('Head') },
      { p: naTouca(a, 1.395), rx: m(0.04), rz: m(0.012), pesos: so('Head') },
      { p: naTouca(a * 1.02, 1.362 + Math.abs(k) * 0.008, 0.012), rx: m(0.03), rz: m(0.01), pesos: so('Head') },
    ], { lados: 8, sub: 2, frente, vRep: 0.4 });
  }
  // mechas compridas: duas de cada lado (caem na frente do ombro) e quatro nas costas
  const mechas = [[-1, 0.2, 0.86], [1, 0.2, 0.86], [-1, 0.0, 0.84], [1, 0.0, 0.84], [-0.55, -1, 0.82], [0.55, -1, 0.82], [-0.2, -1, 0.8], [0.2, -1, 0.8]];
  for (const [sx, fz, fimY] of mechas) {
    const ini = cabecaC.clone().addScaledVector(ladoE, sx * capR.x * (fz < 0 ? 0.8 : 0.95)).addScaledVector(frente, fz < 0 ? -capR.z * 0.85 : fz * capR.z);
    ini.y = Y(1.3);
    const meio = ini.clone().addScaledVector(ladoE, sx * m(0.03)).setY(Y(1.08));
    const fim = meio.clone().addScaledVector(ladoE, sx * m(0.02)).addScaledVector(frente, fz < 0 ? -m(0.02) : m(0.015)).setY(Y(fimY));
    tubo(pecas.cabelo, [
      { p: ini, rx: m(0.055), rz: m(0.035), pesos: so('Head') },
      { p: meio, rx: m(0.05), rz: m(0.03), pesos: par('Head', 'Neck', 0.4) },
      { p: fim, rx: m(0.035), rz: m(0.02), pesos: par('Head', 'Spine2', 0.6) },
    ], { lados: 10, sub: 4, frente: ladoE, vRep: 1.5 });
  }
  // laço rosa do lado direito, acima da orelha
  const laco = cabecaC.clone().addScaledVector(ladoE, -capR.x * 0.78).addScaledVector(frente, capR.z * 0.35).setY(Y(1.52));
  const qLaco = quatFrente.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -0.5)));
  for (const s of [-1, 1]) {
    const q = qLaco.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, s * 0.35)));
    elipsoide(pecas.rosa, laco.clone().add(new THREE.Vector3(s * m(0.055), 0, 0).applyQuaternion(qLaco)), V(m(0.055), m(0.035), m(0.022)), so('Head'), { quat: q, seg: [14, 10] });
  }
  elipsoide(pecas.rosa, laco, V(m(0.022), m(0.025), m(0.02)), so('Head'), { quat: qLaco, seg: [10, 8] });

  // ----- tronco (corpete do vestido), gola, faixa e laço do peito -----
  tubo(pecas.vestido, [
    { p: pt(0, 0.62, -0.01), rx: m(0.11), rz: m(0.09), pesos: so('Hips') },
    { p: pt(0, 0.71, -0.01), rx: m(0.105), rz: m(0.088), pesos: so('Spine') },
    { p: pt(0, 0.8, 0), rx: m(0.115), rz: m(0.095), pesos: so('Spine1') },
    { p: pt(0, 0.885, -0.005), rx: m(0.085), rz: m(0.07), pesos: so('Spine2') },
  ], { lados: 18, sub: 3, frente, tampaIni: false });
  // gola branca arredondada
  tubo(pecas.branco, Array.from({ length: 13 }, (_, k) => {
    const a = (k / 12) * Math.PI * 2;
    return { p: pt(Math.sin(a) * 0.072, 0.885, Math.cos(a) * 0.062 - 0.005), rx: m(0.022), rz: m(0.012), pesos: so('Spine2') };
  }), { lados: 8, sub: 2, frente: V(0, 1, 0), tampaIni: false, tampaFim: false });
  // faixa branca abaixo do peito
  tubo(pecas.branco, Array.from({ length: 17 }, (_, k) => {
    const a = (k / 16) * Math.PI * 2;
    return { p: pt(Math.sin(a) * 0.108, 0.75, Math.cos(a) * 0.091 - 0.01), rx: m(0.016), rz: m(0.006), pesos: par('Spine', 'Spine1', 0.45) };
  }), { lados: 8, sub: 2, frente: V(0, 1, 0), tampaIni: false, tampaFim: false });
  // laço lilás no peito
  const peito = pt(0, 0.765, 0.098);
  for (const s of [-1, 1]) elipsoide(pecas.lilas, peito.clone().addScaledVector(ladoE, s * m(0.03)), V(m(0.03), m(0.02), m(0.012)), so('Spine'), { quat: quatFrente.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, s * 0.3))), seg: [12, 8] });
  elipsoide(pecas.lilas, peito, V(m(0.012), m(0.014), m(0.012)), so('Spine'), { quat: quatFrente, seg: [8, 6] });
  for (const s of [-1, 1]) tubo(pecas.lilas, [
    { p: peito.clone(), rx: m(0.007), rz: m(0.003), pesos: so('Spine') },
    { p: peito.clone().addScaledVector(ladoE, s * m(0.02)).setY(Y(0.72)), rx: m(0.008), rz: m(0.003), pesos: so('Spine') },
  ], { lados: 6, sub: 1, frente });

  // ----- saia em "A" com babado branco (segue o quadril e um pouco cada coxa) -----
  const coxaE = O('LeftUpLeg'), coxaD = O('RightUpLeg'), quadril = O('Hips');
  const pesoSaia = (w) => {
    const rel = w.clone().sub(centroX), x = rel.dot(ladoE) / m(0.12), desce = suave(w.y, Y(0.66), Y(0.3));
    const k = desce * 0.42 * Math.min(1, Math.abs(x));
    return { [quadril]: 1 - k, [x > 0 ? coxaE : coxaD]: k };
  };
  const saiaPts = [];
  for (let k = 0; k <= 6; k++) {
    const t = k / 6, y = THREE.MathUtils.lerp(0.665, 0.3, t), abre = Math.sin(t * Math.PI * 0.5);
    saiaPts.push({ p: pt(0, y, -0.015), rx: m(0.112 + 0.19 * abre), rz: m(0.093 + 0.11 * abre), pesos: {} });
  }
  // a saia é um tubo vertical; os pesos de cada vértice vêm da posição (pesoSaia)
  {
    const pecaTmp = new Peca();
    tubo(pecaTmp, saiaPts.map(s => ({ ...s, pesos: { [quadril]: 1 } })), { lados: 28, sub: 2, frente, tampaIni: false, tampaFim: false, vRep: 2 });
    const pv = pecas.vestido, base = pv.n, w = V();
    for (let i = 0; i < pecaTmp.n; i++) {
      w.set(pecaTmp.pos[i * 3], pecaTmp.pos[i * 3 + 1], pecaTmp.pos[i * 3 + 2]);
      pv.vert(w, V(pecaTmp.nrm[i * 3], pecaTmp.nrm[i * 3 + 1], pecaTmp.nrm[i * 3 + 2]), pecaTmp.uv[i * 2] * 3, pecaTmp.uv[i * 2 + 1], pesoSaia(w));
    }
    for (const i of pecaTmp.ind) pv.ind.push(i + base);
  }
  // babado: anel ondulado na barra
  {
    const pecaTmp = new Peca(), hem = saiaPts[saiaPts.length - 1];
    tubo(pecaTmp, [
      { p: hem.p.clone().setY(Y(0.325)), rx: hem.rx * 1.005, rz: hem.rz * 1.01, pesos: {} },
      { p: hem.p.clone().setY(Y(0.275)), rx: hem.rx * 1.05, rz: hem.rz * 1.07, pesos: {} },
    ].map(s => ({ ...s, pesos: { [quadril]: 1 } })), { lados: 56, sub: 2, frente, tampaIni: false, tampaFim: false, onda: (a, t) => 1 + 0.035 * Math.sin(a * 18) * t });
    const pb = pecas.branco, base = pb.n, w = V();
    for (let i = 0; i < pecaTmp.n; i++) {
      w.set(pecaTmp.pos[i * 3], pecaTmp.pos[i * 3 + 1], pecaTmp.pos[i * 3 + 2]);
      pb.vert(w, V(pecaTmp.nrm[i * 3], pecaTmp.nrm[i * 3 + 1], pecaTmp.nrm[i * 3 + 2]), pecaTmp.uv[i * 2] * 4, pecaTmp.uv[i * 2 + 1], pesoSaia(w));
    }
    for (const i of pecaTmp.ind) pb.ind.push(i + base);
  }

  // ----- braços: manga bufante, braço de pano, mão de luva -----
  for (const L of ['Left', 'Right']) {
    const ombro = P(`${L}Arm`), cotovelo = P(`${L}ForeArm`), pulso = P(`${L}Hand`), dedos = P(`${L}HandMiddle1`);
    const dirMao = dedos.clone().sub(pulso).normalize();
    tubo(pecas.pele, [
      { p: ombro.clone(), rx: m(0.036), pesos: par(`${L}Shoulder`, `${L}Arm`, 0.6) },
      { p: ombro.clone().lerp(cotovelo, 0.5), rx: m(0.033), pesos: so(`${L}Arm`) },
      { p: cotovelo.clone(), rx: m(0.029), pesos: par(`${L}Arm`, `${L}ForeArm`, 0.5) },
      { p: cotovelo.clone().lerp(pulso, 0.5), rx: m(0.027), pesos: so(`${L}ForeArm`) },
      { p: pulso.clone(), rx: m(0.024), pesos: par(`${L}ForeArm`, `${L}Hand`, 0.5) },
    ], { lados: 12, sub: 3, frente, tampaIni: true, tampaFim: false });
    // manga bufante (lilás de bolinhas)
    const bufo = ombro.clone().lerp(cotovelo, 0.22);
    const qManga = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), cotovelo.clone().sub(ombro).normalize());
    elipsoide(pecas.vestido, bufo, V(m(0.07), m(0.065), m(0.068)), par(`${L}Shoulder`, `${L}Arm`, 0.75), { quat: qManga, seg: [18, 12] });
    tubo(pecas.branco, Array.from({ length: 11 }, (_, k) => {
      const a = (k / 10) * Math.PI * 2, eixo = cotovelo.clone().sub(ombro).normalize();
      const u = new THREE.Vector3().crossVectors(eixo, frente).normalize(), w2 = new THREE.Vector3().crossVectors(u, eixo);
      const c = ombro.clone().lerp(cotovelo, 0.42).addScaledVector(u, Math.cos(a) * m(0.045)).addScaledVector(w2, Math.sin(a) * m(0.045));
      return { p: c, rx: m(0.008), pesos: so(`${L}Arm`) };
    }), { lados: 6, sub: 1, frente, tampaIni: false, tampaFim: false });
    // mão: luva arredondada com polegar
    const qMao = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), dirMao);
    elipsoide(pecas.pele, pulso.clone().addScaledVector(dirMao, m(0.045)), V(m(0.034), m(0.055), m(0.022)), so(`${L}Hand`), { quat: qMao, seg: [14, 10] });
    const polegar = pulso.clone().addScaledVector(dirMao, m(0.03)).addScaledVector(frente, m(0.025));
    elipsoide(pecas.pele, polegar, V(m(0.013), m(0.025), m(0.013)), so(`${L}Hand`), { quat: qMao, seg: [8, 6] });
  }

  // ----- pernas: pano até o joelho (sob a saia), meias brancas e sapatinhos rosa -----
  for (const L of ['Left', 'Right']) {
    const quad = P(`${L}UpLeg`), joelho = P(`${L}Leg`), torn = P(`${L}Foot`), dedo = P(`${L}ToeBase`);
    tubo(pecas.pele, [
      { p: quad.clone().setY(quad.y + m(0.03)), rx: m(0.058), pesos: par('Hips', `${L}UpLeg`, 0.6) },
      { p: quad.clone().lerp(joelho, 0.5), rx: m(0.05), pesos: so(`${L}UpLeg`) },
      { p: joelho.clone(), rx: m(0.041), pesos: par(`${L}UpLeg`, `${L}Leg`, 0.5) },
      { p: joelho.clone().lerp(torn, 0.45), rx: m(0.037), pesos: so(`${L}Leg`) },
    ], { lados: 12, sub: 3, frente, tampaIni: true, tampaFim: false });
    tubo(pecas.branco, [
      { p: joelho.clone().lerp(torn, 0.45), rx: m(0.04), pesos: so(`${L}Leg`) },
      { p: torn.clone(), rx: m(0.036), pesos: par(`${L}Leg`, `${L}Foot`, 0.5) },
      { p: torn.clone().setY(torn.y - m(0.03)), rx: m(0.034), pesos: so(`${L}Foot`) },
    ], { lados: 12, sub: 3, frente, tampaIni: false, tampaFim: true });
    // borda dobrada da meia
    tubo(pecas.branco, Array.from({ length: 11 }, (_, k) => {
      const a = (k / 10) * Math.PI * 2, c = joelho.clone().lerp(torn, 0.45);
      return { p: c.addScaledVector(ladoE, Math.cos(a) * m(0.042)).addScaledVector(frente, Math.sin(a) * m(0.042)), rx: m(0.011), pesos: so(`${L}Leg`) };
    }), { lados: 6, sub: 1, frente: V(0, 1, 0), tampaIni: false, tampaFim: false });
    // sapato: bico arredondado, sola mais escura (cor por altura no próprio rosa)
    const centroSapato = torn.clone().lerp(dedo, 0.55).setY(Y(0.045));
    const dirPe = dedo.clone().sub(torn).setY(0).normalize();
    const qPe = new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), dirPe);
    elipsoide(pecas.rosa, centroSapato, V(m(0.05), m(0.045), m(0.09)), (w) => (w.y > Y(0.07) ? par(`${L}Foot`, `${L}Leg`, 0.1) : par(`${L}Foot`, `${L}ToeBase`, Math.max(0, w.clone().sub(centroSapato).dot(dirPe)) / m(0.09) * 0.6)),
      { quat: qPe, seg: [20, 14], deformar: v => { if (v.y < -0.4) v.y = -0.4 - (v.y + 0.4) * 0.3; } });
    // tirinha do sapato
    tubo(pecas.rosa, Array.from({ length: 7 }, (_, k) => {
      const a = (k / 6) * Math.PI;
      return { p: torn.clone().setY(Y(0.075)).addScaledVector(ladoE, Math.cos(a) * m(0.042)).addScaledVector(frente, m(0.01) + Math.sin(a) * m(0.01)), rx: m(0.008), pesos: so(`${L}Foot`) };
    }), { lados: 6, sub: 1, frente: V(0, 1, 0) });
  }

  // ----- malhas presas ao esqueleto -----
  const esqueleto = new THREE.Skeleton(lista);
  const grupo = new THREE.Group(); grupo.name = 'brisa';
  fbx.add(grupo);
  grupo.updateMatrixWorld(true);
  const paraLocal = grupo.matrixWorld.clone().invert();
  const texturas = {
    pele: texturaPele(), rosto: texturaRosto(), cabelo: texturaCabelo(), vestido: texturaVestido(),
    branco: texturaLisa('#f6f2ec', 0.06), rosa: texturaLisa('#f08fae', 0.06, 'rgba(120,30,60,0.3)'), lilas: texturaLisa('#9b7fd4', 0.06),
  };
  const config = {
    pele: { rug: 0.92, brilho: 0.35 }, rosto: { rug: 0.9, brilho: 0.3 }, cabelo: { rug: 0.85, brilho: 0.6 },
    vestido: { rug: 0.9, brilho: 0.5 }, branco: { rug: 0.9, brilho: 0.45 }, rosa: { rug: 0.6, brilho: 0.4 }, lilas: { rug: 0.8, brilho: 0.5 },
  };
  const malhas = [];
  for (const [nome, peca] of Object.entries(pecas)) {
    if (!peca.n) continue;
    const g = peca.geometria();
    g.applyMatrix4(paraLocal);
    g.computeBoundingSphere();
    const malha = new THREE.SkinnedMesh(g, new THREE.MeshStandardMaterial({ map: texturas[nome] }));
    malha.name = 'brisa-' + nome; malha.userData.tecido = nome;
    malha.frustumCulled = false; malha.castShadow = false;
    grupo.add(malha);
    malha.updateMatrixWorld(true);
    malha.bind(esqueleto, malha.matrixWorld);
    malhas.push(malha);
  }

  function materialPara(nome, nivel) {
    const c = config[nome], map = texturas[nome];
    if (nivel.materialSimples) return new THREE.MeshLambertMaterial({ map });
    return new THREE.MeshPhysicalMaterial({
      map, bumpMap: nome === 'rosto' ? null : map, bumpScale: 0.6, roughness: c.rug, metalness: 0,
      sheen: c.brilho, sheenRoughness: 0.65, sheenColor: new THREE.Color('#fff4ff'),
      envMapIntensity: nivel.efeitos ? 0.75 : 0.35,
    });
  }
  return {
    grupo, malhas, esqueleto,
    aplicarNivel(nivel, decorar = m => m) {
      for (const malha of malhas) {
        const antigo = malha.material;
        malha.material = decorar(materialPara(malha.userData.tecido, nivel), nivel);
        antigo?.dispose?.();
      }
    },
    triangulos: malhas.reduce((s, m2) => s + m2.geometry.index.count / 3, 0),
  };
}
