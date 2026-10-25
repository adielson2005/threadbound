import * as THREE from 'three';
import { fundirEstaticos } from './lotes.js';

// Construções da ilha gerada (ilha.js): a Vila de Maré Alta (casas abandonadas onde dá para entrar),
// o farol da ilhota alta e as ruínas do círculo de pedra. Peças paradas de cada construção viram
// um lote por material (lotes.js); as paredes marcadas como sólidas entram na malha de colisão.

const PASTA = new URL('../assets/efeitos/', import.meta.url).href;
function tex(nome, cor, rx = 1, ry = 1) {
  const t = new THREE.TextureLoader().load(PASTA + nome);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry);
  t.colorSpace = cor ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 8;
  return t;
}
let M = null;
function materiais() {
  if (M) return M;
  // as caixas têm UV em metros (caixa()): repeat = quantas vezes a textura cabe em 1 m
  const madeira = tex('madeira_cor.jpg', true, 0.9, 0.6), madeiraN = tex('madeira_normal.png', false, 0.9, 0.6);
  const pedra = tex('pedra_cor.jpg', true, 0.75, 0.75), pedraN = tex('pedra_normal.png', false, 0.75, 0.75);
  const telhas = texturaTelhas();
  M = {
    madeira: new THREE.MeshStandardMaterial({ map: madeira, normalMap: madeiraN, roughness: 0.85, color: '#c9a989' }),
    madeiraEscura: new THREE.MeshStandardMaterial({ map: madeira, normalMap: madeiraN, roughness: 0.85, color: '#6e5240' }),
    pedra: new THREE.MeshStandardMaterial({ map: pedra, normalMap: pedraN, roughness: 0.93, color: '#d6d2c8' }),
    pedraClara: new THREE.MeshStandardMaterial({ map: pedra, normalMap: pedraN, normalScale: new THREE.Vector2(0.6, 0.6), roughness: 0.88, color: '#f3ece0' }),
    reboco: ['#efe3c8', '#d9e3e6', '#f0d6cf', '#e8d49c'].map(c => new THREE.MeshStandardMaterial({ map: pedra, normalScale: new THREE.Vector2(0.3, 0.3), normalMap: pedraN, roughness: 0.97, color: c })),
    telhado: ['#d9a08a', '#a9b0bd', '#c9a07e'].map(c => new THREE.MeshStandardMaterial({ map: telhas, roughness: 0.85, color: c })),
    tecido: ['#b48fd6', '#d98fa8', '#8fb4d6'].map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 1 })),
    escuro: new THREE.MeshStandardMaterial({ color: '#1d1712', roughness: 1 }),
    vela: new THREE.MeshStandardMaterial({ color: '#e6dcc4', roughness: 1, side: THREE.DoubleSide }),
    corda: new THREE.MeshStandardMaterial({ color: '#8a7350', roughness: 1 }),
    calcario: new THREE.MeshStandardMaterial({ map: pedra, normalMap: pedraN, roughness: 0.95, color: '#e8dcc0' }),
    linha: ['#e05a6c', '#5a86e0', '#f2c24e', '#7cc47a', '#b48fe6'].map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9 })),
    metal: new THREE.MeshStandardMaterial({ color: '#d8dce6', metalness: 0.8, roughness: 0.3 }),
    vermelho: new THREE.MeshStandardMaterial({ map: pedra, normalMap: pedraN, roughness: 0.9, color: '#b8433a' }),
    vidro: new THREE.MeshStandardMaterial({ color: '#fff3c4', emissive: '#ffd77a', emissiveIntensity: 1.2, transparent: true, opacity: 0.55, roughness: 0.2 }),
    feixe: new THREE.MeshBasicMaterial({ color: '#fff1b8', transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }),
  };
  return M;
}
// Low: Lambert com a mesma cor e textura (o vidro e o feixe ficam como estão)
function trocarMateriais(grupo, simples, cache) {
  grupo.traverse(m => {
    if (!m.isMesh) return;
    const orig = m.userData.materialOriginal ?? m.material;
    if (!orig.isMeshStandardMaterial || orig === M.vidro) return;
    m.userData.materialOriginal = orig;
    if (!simples) { m.material = orig; return; }
    if (!cache.has(orig)) cache.set(orig, new THREE.MeshLambertMaterial({ map: orig.map, color: orig.color, emissive: orig.emissive, emissiveIntensity: orig.emissiveIntensity }));
    m.material = cache.get(orig);
  });
}

// telhas de barro: fileiras sobrepostas (a textura é girada para as fileiras seguirem o telhado)
function texturaTelhas() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#7a3a28'; g.fillRect(0, 0, 256, 256);
  for (let col = 0; col < 8; col++) for (let lin = -1; lin < 6; lin++) {
    const x = col * 32, y = lin * 44 + (col % 2) * 22;
    const gr = g.createLinearGradient(x, 0, x + 32, 0);
    gr.addColorStop(0, '#5a2a1c'); gr.addColorStop(0.25, '#b4614a'); gr.addColorStop(0.8, '#9a4e39'); gr.addColorStop(1, '#4a2216');
    g.fillStyle = gr; g.beginPath(); g.moveTo(x + 2, y); g.lineTo(x + 30, y); g.lineTo(x + 30, y + 40); g.quadraticCurveTo(x + 16, y + 47, x + 2, y + 40); g.closePath(); g.fill();
    g.fillStyle = 'rgba(0,0,0,' + (0.05 + Math.random() * 0.12) + ')'; g.fillRect(x + 2, y, 28, 40);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
  t.repeat.set(0.9, 0.9); t.rotation = Math.PI / 2;
  return t;
}

// UV em metros em cada face da caixa: a textura repete no tamanho certo (pedra, tábua, telha)
function uvEmMetros(geo, w, h, d) {
  const uv = geo.attributes.uv, dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) { const i = f * 4 + k; uv.setXY(i, uv.getX(i) * dims[f][0], uv.getY(i) * dims[f][1]); }
  return geo;
}
const caixa = (w, h, d, mat, x = 0, y = 0, z = 0, solido = true) => {
  const m = new THREE.Mesh(uvEmMetros(new THREE.BoxGeometry(w, h, d), w, h, d), mat);
  m.position.set(x, y, z); m.userData.solido = solido; m.castShadow = true; m.receiveShadow = true;
  return m;
};
// parede ao longo de x (de -c/2 a c/2), com vãos [{x, w, y0, y1}] (portas e janelas)
function parede(c, h, e, mat, vaos) {
  const g = new THREE.Group();
  const cortes = [...vaos].sort((a, b) => a.x - b.x);
  let x = -c / 2;
  for (const v of cortes) {
    const ini = v.x - v.w / 2;
    if (ini > x + 0.01) g.add(caixa(ini - x, h, e, mat, (x + ini) / 2, h / 2, 0));
    if (v.y0 > 0.01) g.add(caixa(v.w, v.y0, e, mat, v.x, v.y0 / 2, 0));
    if (v.y1 < h - 0.01) g.add(caixa(v.w, h - v.y1, e, mat, v.x, (h + v.y1) / 2, 0));
    x = v.x + v.w / 2;
  }
  if (x < c / 2 - 0.01) g.add(caixa(c / 2 - x, h, e, mat, (x + c / 2) / 2, h / 2, 0));
  return g;
}
function empena(largura, altura, e, mat) {
  const s = new THREE.Shape(); s.moveTo(-largura / 2, 0); s.lineTo(largura / 2, 0); s.lineTo(0, altura); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: e, bevelEnabled: false }).translate(0, 0, -e / 2);
  const m = new THREE.Mesh(g, mat); m.userData.solido = true; m.castShadow = true; m.receiveShadow = true;
  return m;
}

// ---------------- casa abandonada ----------------
function casa(rnd, { largura = 5, fundo = 4.6, caida = false, corParede = 0, corTelhado = 0 } = {}) {
  const A = materiais(), g = new THREE.Group();
  const hp = 2.7, e = 0.22, reb = A.reboco[corParede % A.reboco.length], tel = A.telhado[corTelhado % A.telhado.length];
  // alicerce de pedra (entra um pouco no chão para não flutuar em terreno torto)
  g.add(caixa(largura + 0.5, 0.9, fundo + 0.5, A.pedra, 0, -0.3, 0));
  const piso = caixa(largura - 0.1, 0.08, fundo - 0.1, A.madeira, 0, 0.19, 0); g.add(piso);
  const y0 = 0.15;
  // frente (+z) com porta; fundos com janela; laterais com janela
  const frente = parede(largura, hp, e, reb, [{ x: -0.4, w: 1.15, y0: 0, y1: 2.1 }, { x: largura * 0.3, w: 0.85, y0: 1.0, y1: 1.85 }]);
  frente.position.set(0, y0, fundo / 2); g.add(frente);
  const fundos = parede(largura, hp, e, reb, [{ x: 0.6, w: 0.9, y0: 1.0, y1: 1.85 }]);
  fundos.position.set(0, y0, -fundo / 2); g.add(fundos);
  for (const lado of [-1, 1]) {
    const l = parede(fundo - e, hp, e, reb, [{ x: 0, w: 0.9, y0: 1.0, y1: 1.85 }]);
    l.rotation.y = Math.PI / 2; l.position.set(lado * largura / 2, y0, 0); g.add(l);
  }
  // enxaimel: esteios nos cantos e vigas no topo (madeira escura)
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) g.add(caixa(0.26, hp, 0.26, A.madeiraEscura, x * largura / 2, y0 + hp / 2, z * fundo / 2));
  g.add(caixa(largura + 0.3, 0.22, 0.28, A.madeiraEscura, 0, y0 + hp, fundo / 2));
  g.add(caixa(largura + 0.3, 0.22, 0.28, A.madeiraEscura, 0, y0 + hp, -fundo / 2));
  // empenas e telhado de duas águas (inclinação forte: não dá para "andar" no telhado)
  const alturaTelhado = largura * 0.62;
  for (const z of [fundo / 2, -fundo / 2]) { const em = empena(largura, alturaTelhado, e, reb); em.position.set(0, y0 + hp, z); g.add(em); }
  const ang = Math.atan2(alturaTelhado, largura / 2), compAgua = Math.hypot(largura / 2, alturaTelhado) + 0.45;
  for (const lado of [-1, 1]) {
    if (caida && lado === 1) continue; // telhado desabado de um lado
    const agua = caixa(compAgua, 0.14, fundo + 0.9, tel, 0, 0, 0);
    agua.rotation.z = -lado * ang;
    agua.position.set(lado * (largura / 4 + 0.12), y0 + hp + alturaTelhado / 2 + 0.08, 0);
    g.add(agua);
  }
  if (caida) {
    // vigas caídas lá dentro e telhas pelo chão
    const viga = caixa(0.18, 0.18, fundo * 0.9, A.madeiraEscura, largura * 0.2, 0.9, 0.2); viga.rotation.x = 0.35; viga.rotation.z = 0.5; g.add(viga);
    for (let k = 0; k < 4; k++) { const t = caixa(0.9, 0.08, 0.6, tel, (rnd() - 0.2) * largura * 0.5, 0.3, (rnd() - 0.5) * fundo * 0.6, false); t.rotation.set(rnd() * 0.6, rnd() * 3, rnd() * 0.5); g.add(t); }
  }
  // chaminé
  g.add(caixa(0.6, 2.2, 0.6, A.pedra, -largura * 0.28, y0 + hp + alturaTelhado * 0.55, -fundo * 0.2));
  // porta entreaberta, presa na dobradiça
  const porta = caixa(1.05, 2.0, 0.06, A.madeira, 0.52, 1.0, 0, false);
  const dobradica = new THREE.Group(); dobradica.add(porta); dobradica.position.set(-0.4 - 0.57, y0, fundo / 2 + 0.05); dobradica.rotation.y = -1.1 - rnd() * 0.5; g.add(dobradica);
  // janelas: moldura e uma veneziana pendurada
  for (const [x, z, ry] of [[largura * 0.3, fundo / 2 + 0.12, 0], [0.6, -fundo / 2 - 0.12, Math.PI]]) {
    const v = caixa(0.5, 0.95, 0.05, A.madeiraEscura, 0, 0, 0, false);
    v.position.set(x + 0.7, y0 + 1.4, z); v.rotation.y = ry + 0.4; v.rotation.z = rnd() < 0.5 ? 0.3 : 0; g.add(v);
  }
  // por dentro: cama, mesa, banco e uma estante (o que ficou de quem morava ali)
  g.add(caixa(1.0, 0.35, 2.0, A.madeira, largura / 2 - 0.75, y0 + 0.2, -fundo / 2 + 1.2));
  g.add(caixa(0.9, 0.12, 1.8, A.tecido[Math.floor(rnd() * 3)], largura / 2 - 0.75, y0 + 0.43, -fundo / 2 + 1.2, false));
  g.add(caixa(1.2, 0.08, 0.8, A.madeira, -largura / 2 + 1.1, y0 + 0.78, -0.2));
  for (const [x, z] of [[-0.5, -0.32], [0.5, -0.32], [-0.5, 0.32], [0.5, 0.32]]) g.add(caixa(0.07, 0.75, 0.07, A.madeira, -largura / 2 + 1.1 + x, y0 + 0.38, -0.2 + z, false));
  g.add(caixa(0.9, 1.6, 0.35, A.madeiraEscura, -largura / 2 + 0.55, y0 + 0.8, -fundo / 2 + 0.45));
  g.add(caixa(0.55, 0.45, 0.35, A.madeira, -largura / 2 + 1.1, y0 + 0.22, 0.5, false));
  return g;
}

function cerca(comprimento, A, rnd) {
  const g = new THREE.Group(), n = Math.max(2, Math.round(comprimento / 1.6));
  for (let k = 0; k <= n; k++) {
    if (rnd() < 0.15) continue; // estaca que caiu
    const x = -comprimento / 2 + (k / n) * comprimento;
    const p = caixa(0.12, 1.0, 0.12, A.madeiraEscura, x, 0.5, 0); p.rotation.z = (rnd() - 0.5) * 0.15; g.add(p);
  }
  for (const y of [0.45, 0.85]) { const t = caixa(comprimento, 0.08, 0.06, A.madeira, 0, y, 0.07); t.rotation.z = (rnd() - 0.5) * 0.04; g.add(t); }
  return g;
}

// antiga: a vila de antes da subida (Cap. 3), no fundo do mar que secou: mais casas desabadas
export function construirVila({ centro, raio, alturaEm, rnd, nomes, antiga = false }) {
  const A = materiais(), grupo = new THREE.Group(); grupo.name = 'vila';
  const casas = [];
  const n = nomes.length;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + 0.4;
    const r = raio * 0.82;
    const x = centro.x + Math.cos(a) * r, z = centro.z + Math.sin(a) * r;
    const y = Math.min(alturaEm(x, z) ?? centro.y, centro.y);
    const c = casa(rnd, { largura: 4.6 + rnd() * 1.4, fundo: 4.2 + rnd() * 1.0, caida: antiga ? k % 2 === 0 : k === 2, corParede: antiga ? 3 : k, corTelhado: antiga ? 2 : k });
    c.position.set(x, y, z);
    c.rotation.y = Math.atan2(centro.x - x, centro.z - z); // porta virada para a praça
    fundirEstaticos(c);
    grupo.add(c);
    casas.push({ nome: nomes[k], pos: new THREE.Vector3(x, y, z), frente: new THREE.Vector3(centro.x - x, 0, centro.z - z).normalize() });
  }
  // cercas quebradas entre as casas
  for (let k = 0; k < n; k++) {
    const a = ((k + 0.5) / n) * Math.PI * 2 + 0.4, r = raio * 0.95;
    const x = centro.x + Math.cos(a) * r, z = centro.z + Math.sin(a) * r;
    const f = cerca(4 + rnd() * 2, A, rnd);
    f.position.set(x, alturaEm(x, z) ?? centro.y, z); f.rotation.y = -a + Math.PI / 2;
    fundirEstaticos(f); grupo.add(f);
  }
  const cache = new Map();
  return { grupo, casas, aplicarNivel: nivel => trocarMateriais(grupo, nivel.materialSimples, cache) };
}

// ---------------- farol ----------------
export function construirFarol({ centro, alturaEm, rnd, evitar }) {
  const A = materiais(), grupo = new THREE.Group(); grupo.name = 'farol';
  const g = new THREE.Group(); g.position.copy(centro); grupo.add(g);
  // a casinha (+x local) fica do lado de fora, longe da Âncora de Fio no meio da ilhota
  if (evitar) g.rotation.y = -Math.atan2(centro.z - evitar.z, centro.x - evitar.x);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.6, 1.2, 10), A.pedra); base.position.y = 0.2; base.userData.solido = true; g.add(base);
  // torre em faixas brancas e vermelhas
  const H = 15, faixas = 5;
  for (let k = 0; k < faixas; k++) {
    const r0 = THREE.MathUtils.lerp(2.3, 1.55, k / faixas), r1 = THREE.MathUtils.lerp(2.3, 1.55, (k + 1) / faixas);
    const f = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, H / faixas, 12), k % 2 ? A.vermelho : A.pedraClara);
    f.position.y = 0.8 + (k + 0.5) * (H / faixas); f.userData.solido = true; f.castShadow = true; g.add(f);
  }
  const topo = 0.8 + H;
  const galeria = new THREE.Mesh(new THREE.CylinderGeometry(2.3, 2.3, 0.25, 14), A.pedra); galeria.position.y = topo; galeria.userData.solido = true; g.add(galeria);
  for (let k = 0; k < 16; k++) { const a = (k / 16) * Math.PI * 2; g.add(caixa(0.07, 0.9, 0.07, A.madeiraEscura, Math.cos(a) * 2.15, topo + 0.55, Math.sin(a) * 2.15, false)); }
  const corrimao = new THREE.Mesh(new THREE.TorusGeometry(2.15, 0.05, 6, 32), A.madeiraEscura); corrimao.rotation.x = Math.PI / 2; corrimao.position.y = topo + 1.0; g.add(corrimao);
  const lanterna = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 1.8, 10, 1, true), A.vidro); lanterna.position.y = topo + 1.05; g.add(lanterna);
  const cupula = new THREE.Mesh(new THREE.ConeGeometry(1.55, 1.5, 10), A.vermelho); cupula.position.y = topo + 2.7; g.add(cupula);
  // porta de ferro (fechada) e casinha do faroleiro
  g.add(caixa(1.0, 1.9, 0.12, A.madeiraEscura, 0, 1.75, 2.27, false));
  const cabana = casa(rnd, { largura: 4, fundo: 3.6, corParede: 1, corTelhado: 1 });
  cabana.position.set(6.2, 0, -1.5); cabana.rotation.y = -Math.PI / 2;
  g.add(cabana);
  // feixe de luz girando (anima sempre; à noite aparece mais)
  const feixe = new THREE.Group(); feixe.position.y = topo + 1.05; g.add(feixe);
  for (const lado of [0, Math.PI]) {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(2.6, 26, 16, 1, true).rotateZ(-Math.PI / 2).translate(13, 0, 0), A.feixe);
    cone.rotation.y = lado; feixe.add(cone);
  }
  fundirEstaticos(g, [lanterna, ...feixe.children]);
  const cache = new Map();
  return {
    grupo, topo: new THREE.Vector3(centro.x, centro.y + topo + 1, centro.z),
    // o feixe gira sempre, mas só aparece com pouca luz (entardecer e noite)
    atualizar(t, noite = 0) {
      feixe.rotation.y = t * 0.6;
      A.feixe.opacity = 0.18 * noite; feixe.visible = noite > 0.02;
      A.vidro.emissiveIntensity = 0.4 + 1.4 * noite;
    },
    aplicarNivel: nivel => trocarMateriais(grupo, nivel.materialSimples, cache),
  };
}

// ---------------- ruínas ----------------
export function construirRuinas({ centro, alturaEm, rnd, evitar }) {
  // nada perto do meio da ilhota (onde fica a Âncora de Fio)
  const livre = (x, z) => !evitar || Math.hypot(centro.x + x - evitar.x, centro.z + z - evitar.z) > 7;
  const A = materiais(), grupo = new THREE.Group(); grupo.name = 'ruinas';
  const g = new THREE.Group(); g.position.copy(centro); grupo.add(g);
  // plataforma central (o "altar") em degraus
  for (const [r, h, y] of [[5.5, 0.4, 0.0], [4.2, 0.4, 0.4], [2.2, 0.9, 0.95]]) {
    const d = new THREE.Mesh(new THREE.CylinderGeometry(r, r + 0.15, h, 18), A.pedraClara); d.position.y = y; d.userData.solido = true; d.castShadow = true; g.add(d);
  }
  // anel de colunas: algumas inteiras com capitel, outras quebradas
  const N = 9, R = 7.2;
  for (let k = 0; k < N; k++) {
    const a = (k / N) * Math.PI * 2 + 0.2, x = Math.cos(a) * R, z = Math.sin(a) * R;
    if (!livre(x, z)) continue;
    const y = (alturaEm(centro.x + x, centro.z + z) ?? centro.y) - centro.y;
    const inteira = k % 3 === 0, h = inteira ? 5.2 : 1.2 + rnd() * 2.8;
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.52, h, 10), A.pedraClara); col.position.set(x, y + h / 2, z); col.userData.solido = true; col.castShadow = true; g.add(col);
    g.add(Object.assign(caixa(1.3, 0.35, 1.3, A.pedra, x, y + 0.17, z)));
    if (inteira) g.add(caixa(1.3, 0.4, 1.3, A.pedra, x, y + h + 0.2, z));
    else { const lasca = new THREE.Mesh(new THREE.ConeGeometry(0.45, 0.7, 6), A.pedraClara); lasca.position.set(x + 0.1, y + h + 0.3, z); lasca.rotation.z = 0.5; g.add(lasca); }
    // pedaço caído ao lado
    if (!inteira && rnd() < 0.6) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 1.6, 10), A.pedraClara); p.rotation.z = Math.PI / 2; p.rotation.y = rnd() * 3; p.position.set(x * 0.86, y + 0.45, z * 0.86); p.userData.solido = true; g.add(p); }
  }
  // arco de entrada voltado para a ilha principal
  const arco = new THREE.Group();
  for (const lado of [-1, 1]) arco.add(caixa(0.9, 4.2, 0.9, A.pedra, lado * 1.8, 2.1, 0));
  const meia = new THREE.Mesh(new THREE.TorusGeometry(1.8, 0.45, 8, 16, Math.PI), A.pedra); meia.position.y = 4.2; arco.add(meia);
  // de lado para quem chega da ilha principal (o meio da ilhota fica livre)
  const dirPrincipal = Math.atan2(-centro.x, -centro.z) + Math.PI / 2;
  arco.position.set(Math.sin(dirPrincipal) * (R + 3.5), (alturaEm(centro.x + Math.sin(dirPrincipal) * (R + 3.5), centro.z + Math.cos(dirPrincipal) * (R + 3.5)) ?? centro.y) - centro.y, Math.cos(dirPrincipal) * (R + 3.5));
  arco.rotation.y = dirPrincipal;
  g.add(arco);
  // muros caídos
  for (let k = 0; k < 4; k++) {
    const a = rnd() * Math.PI * 2, r = R + 1.5 + rnd() * 3, x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (!livre(x, z)) continue;
    const y = (alturaEm(centro.x + x, centro.z + z) ?? centro.y) - centro.y;
    const muro = new THREE.Group();
    const comp = 2 + rnd() * 2.5;
    for (let b = 0; b < 4; b++) { const alt = 0.4 + rnd() * 1.6; muro.add(caixa(comp / 4, alt, 0.6, A.pedra, -comp / 2 + (b + 0.5) * comp / 4, alt / 2, 0)); }
    muro.position.set(x, y, z); muro.rotation.y = -a; g.add(muro);
  }
  fundirEstaticos(g);
  const cache = new Map();
  return { grupo, aplicarNivel: nivel => trocarMateriais(grupo, nivel.materialSimples, cache) };
}


// ---------------- Cap. 2: cascos de barco presos no recife ----------------
// Casco aberto em cima, com o costado de tábuas e um rombo de um lado (dá para entrar), o fundo
// plano, cavernas (costelas) quebradas aparecendo e um toco de mastro. Inclinado, como encalhado.
function casco(rnd, comprimento = 9, largura = 3.4, altura = 1.7) {
  const A = materiais(), g = new THREE.Group();
  const L = comprimento, n = 9;
  // largura ao longo do comprimento: afina na proa (+z) e um pouco na popa
  const meiaLargura = z => { const t = z / (L / 2); return (largura / 2) * (t > 0 ? 1 - Math.pow(t, 2.2) * 0.92 : 1 - Math.pow(-t, 3) * 0.3); };
  g.add(caixa(largura * 0.62, 0.14, L * 0.92, A.madeira, 0, 0.07, -L * 0.03)); // fundo
  g.add(caixa(0.22, 0.3, L, A.madeiraEscura, 0, -0.08, 0)); // quilha
  const rombo = 3 + Math.floor(rnd() * 3);
  for (const lado of [-1, 1]) for (let k = 0; k < n; k++) {
    if (lado === 1 && (k === rombo || k === rombo + 1)) continue; // o rombo: a entrada
    const z0 = -L / 2 + (k / n) * L, z1 = -L / 2 + ((k + 1) / n) * L;
    const x0 = lado * meiaLargura(z0), x1 = lado * meiaLargura(z1);
    const comp = Math.hypot(x1 - x0, z1 - z0), alt = altura * (0.75 + rnd() * 0.3) + (k === n - 1 ? 0.4 : 0);
    const t = caixa(0.12, alt, comp + 0.04, k % 2 ? A.madeira : A.madeiraEscura, (x0 + x1) / 2, alt / 2, (z0 + z1) / 2);
    t.rotation.y = Math.atan2(x1 - x0, z1 - z0);
    t.rotation.z = -lado * 0.12; // o costado abre para fora
    g.add(t);
  }
  // cavernas quebradas por cima do costado
  for (let k = 0; k < 4; k++) {
    const z = -L * 0.3 + k * L * 0.18, w = meiaLargura(z);
    const arco = new THREE.Mesh(new THREE.TorusGeometry(w, 0.08, 5, 10, Math.PI * (0.5 + rnd() * 0.4)), A.madeiraEscura);
    arco.position.set(0, 0.2, z); arco.rotation.z = Math.PI * 0.05; arco.castShadow = true; g.add(arco);
  }
  // toco de mastro e um banco de remador
  const mastro = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 3.2 + rnd() * 2, 8), A.madeiraEscura);
  mastro.position.set(0, 1.7, L * 0.1); mastro.rotation.z = 0.15; mastro.userData.solido = true; mastro.castShadow = true; g.add(mastro);
  g.add(caixa(largura * 0.8, 0.1, 0.4, A.madeira, 0, 0.75, -L * 0.25));
  return g;
}

export function construirNaufragios({ centro, raio, alturaEm, rnd, nomes }) {
  const grupo = new THREE.Group(); grupo.name = 'naufragios';
  const casas = [];
  nomes.forEach((nome, k) => {
    const a = (k / nomes.length) * Math.PI * 2 + 0.9, r = raio * 0.85;
    const x = centro.x + Math.cos(a) * r, z = centro.z + Math.sin(a) * r;
    const y = Math.min(alturaEm(x, z) ?? centro.y, centro.y) + 0.05;
    const c = casco(rnd, 8 + rnd() * 3, 3 + rnd() * 0.8);
    c.position.set(x, y, z);
    // o rombo (+x local) virado para a praça; o casco encalhado meio de lado
    c.rotation.y = Math.atan2(centro.x - x, centro.z - z) - Math.PI / 2;
    c.rotation.z = (rnd() - 0.5) * 0.12; c.rotation.x = (rnd() - 0.5) * 0.08;
    fundirEstaticos(c);
    grupo.add(c);
    casas.push({ nome, pos: new THREE.Vector3(x, y + 0.1, z), frente: new THREE.Vector3(centro.x - x, 0, centro.z - z).normalize() });
  });
  // boias velhas e redes pela praça
  const A = materiais();
  for (let k = 0; k < 6; k++) {
    const a = rnd() * Math.PI * 2, r = raio * (0.3 + rnd() * 0.4), x = centro.x + Math.cos(a) * r, z = centro.z + Math.sin(a) * r;
    const boia = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.16, 8, 16), k % 2 ? A.vermelho : A.pedraClara);
    boia.rotation.x = Math.PI / 2 + (rnd() - 0.5) * 0.6; boia.position.set(x, (alturaEm(x, z) ?? centro.y) + 0.15, z); boia.castShadow = true;
    grupo.add(boia);
  }
  const cache = new Map();
  return { grupo, casas, aplicarNivel: nivel => trocarMateriais(grupo, nivel.materialSimples, cache) };
}

// ---------------- marcos das ilhotas (Caps. 2–4) ----------------
// mastro: mastro quebrado com a vela rasgada e um pedaço de casco (Cap. 2)
// arco: arco de calcário com cântaros caídos (Cap. 3)
// carreteis: pilha de carretéis e um botão gigante para subir (Cap. 4)
export function construirMarcoIlhota({ tipo, centro, alturaEm, rnd, evitar }) {
  const A = materiais(), grupo = new THREE.Group(); grupo.name = 'marco-' + tipo;
  const g = new THREE.Group(); g.position.copy(centro); grupo.add(g);
  if (evitar) g.rotation.y = -Math.atan2(centro.z - evitar.z, centro.x - evitar.x);
  if (tipo === 'mastro') {
    const pedaco = casco(rnd, 6, 2.6, 1.3); pedaco.position.set(2, 0, 0); pedaco.rotation.set(0.05, 1.2, 0.25); g.add(pedaco);
    const mastro = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.2, 7, 8), A.madeiraEscura); mastro.position.set(-1.5, 3.4, 0); mastro.rotation.z = -0.2; mastro.userData.solido = true; mastro.castShadow = true; g.add(mastro);
    const verga = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 4, 6), A.madeiraEscura); verga.rotation.z = Math.PI / 2 - 0.2; verga.position.set(-0.6, 5.6, 0); g.add(verga);
    const vela = new THREE.PlaneGeometry(3.6, 2.6, 6, 4);
    const p = vela.attributes.position;
    for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getX(i) * 1.3) * 0.35 + (p.getY(i) < -0.8 ? (rnd() - 0.5) * 0.5 : 0)); // rasgada embaixo
    vela.computeVertexNormals();
    const m = new THREE.Mesh(vela, A.vela); m.position.set(-0.5, 4.2, 0.1); m.rotation.z = -0.2; m.castShadow = true; g.add(m);
  } else if (tipo === 'arco') {
    for (const lado of [-1, 1]) { const p = caixa(0.9, 3.6, 0.9, A.calcario, lado * 1.6, 1.8, 0); p.rotation.z = lado * 0.04; g.add(p); }
    const meia = new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.45, 8, 16, Math.PI), A.calcario); meia.position.y = 3.6; meia.userData.solido = true; meia.castShadow = true; g.add(meia);
    for (let k = 0; k < 4; k++) {
      const c = new THREE.Mesh(new THREE.LatheGeometry([[0, 0], [0.28, 0.05], [0.36, 0.35], [0.2, 0.7], [0.14, 0.82], [0.18, 0.9]].map(([x, y]) => new THREE.Vector2(x, y)), 10), A.vermelho);
      c.position.set(1 + rnd() * 2.5, 0.25, -2 + rnd() * 4); c.rotation.set(rnd() < 0.5 ? Math.PI / 2 : 0, rnd() * 3, 0); c.castShadow = true; g.add(c);
    }
  } else if (tipo === 'carreteis') {
    let y = 0;
    for (let k = 0; k < 3; k++) {
      const r = 1.3 - k * 0.3, h = 1.1 - k * 0.15;
      const nucleo = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.78, r * 0.78, h, 16), A.linha[(k + Math.floor(rnd() * 5)) % 5]); nucleo.position.set(1.5, y + h / 2 + 0.1, 0);
      const a1 = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.12, 16), A.madeira); a1.position.set(1.5, y + 0.06, 0);
      const a2 = a1.clone(); a2.position.y = y + h + 0.16;
      for (const m of [nucleo, a1, a2]) { m.userData.solido = true; m.castShadow = true; g.add(m); }
      y += h + 0.22;
    }
    // botão gigante deitado: um degrau para subir na pilha
    const botao = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 0.3, 20), A.linha[2]); botao.position.set(-0.4, 0.15, 1.2); botao.userData.solido = true; botao.castShadow = true; g.add(botao);
    for (const [dx, dz] of [[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]]) { const f = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.32, 8), A.escuro); f.position.set(-0.4 + dx, 0.16, 1.2 + dz); g.add(f); }
  }
  fundirEstaticos(g);
  const cache = new Map();
  return { grupo, aplicarNivel: nivel => trocarMateriais(grupo, nivel.materialSimples, cache) };
}

// ---------------- Cap. 3: o jardim de Aurélia, em volta do alto da ilha ----------------
// canteiros de pedra com flores de pano e de verdade, um banco, um poço com telhadinho e um
// caramanchão. Tudo do lado de fora da clareira do meio (lá fica o objetivo final).
export function construirJardim({ centro, alturaEm, rnd }) {
  const A = materiais(), grupo = new THREE.Group(); grupo.name = 'jardim';
  const noChao = (x, z) => (alturaEm(centro.x + x, centro.z + z) ?? centro.y) - centro.y;
  const g = new THREE.Group(); g.position.copy(centro); grupo.add(g);
  const cores = ['#e06a8a', '#f2c24e', '#b48fe6', '#ffffff', '#ff8a5c'].map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9 }));
  const caule = new THREE.MeshStandardMaterial({ color: '#4d7a3a', roughness: 1 });
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2 + 0.3, r = 13 + rnd() * 2, x = Math.cos(a) * r, z = Math.sin(a) * r, y = noChao(x, z);
    const canteiro = new THREE.Group(); canteiro.position.set(x, y, z); canteiro.rotation.y = -a;
    for (const [w, d, cx, cz] of [[3, 0.3, 0, 0.75], [3, 0.3, 0, -0.75], [0.3, 1.2, 1.35, 0], [0.3, 1.2, -1.35, 0]]) canteiro.add(caixa(w, 0.35, d, A.pedra, cx, 0.17, cz));
    canteiro.add(caixa(2.7, 0.2, 1.2, A.escuro, 0, 0.12, 0, false)); // terra
    for (let f = 0; f < 10; f++) {
      const fx = (rnd() - 0.5) * 2.4, fz = (rnd() - 0.5) * 0.9, h = 0.3 + rnd() * 0.3;
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.02, h, 3), caule); c.position.set(fx, 0.2 + h / 2, fz);
      const flor = new THREE.Mesh(new THREE.IcosahedronGeometry(0.09, 0), cores[(k + f) % cores.length]); flor.position.set(fx, 0.2 + h, fz); flor.scale.y = 0.6;
      canteiro.add(c, flor);
    }
    g.add(canteiro);
  }
  // banco de madeira e poço
  { const a = 0.95, r = 10.5, x = Math.cos(a) * r, z = Math.sin(a) * r, y = noChao(x, z);
    const b = new THREE.Group(); b.position.set(x, y, z); b.rotation.y = -a + Math.PI / 2;
    b.add(caixa(1.8, 0.1, 0.5, A.madeira, 0, 0.48, 0), caixa(1.8, 0.5, 0.08, A.madeira, 0, 0.85, -0.24));
    for (const s of [-0.75, 0.75]) b.add(caixa(0.1, 0.45, 0.45, A.madeiraEscura, s, 0.22, 0));
    g.add(b); }
  { const a = 3.6, r = 12, x = Math.cos(a) * r, z = Math.sin(a) * r, y = noChao(x, z);
    const p = new THREE.Group(); p.position.set(x, y, z);
    const borda = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.2, 0.9, 16), A.pedra); borda.position.y = 0.45; borda.userData.solido = true;
    const agua = new THREE.Mesh(new THREE.CircleGeometry(0.95, 16), A.escuro); agua.rotation.x = -Math.PI / 2; agua.position.y = 0.91;
    p.add(borda, agua);
    for (const s of [-1, 1]) p.add(caixa(0.14, 2.2, 0.14, A.madeiraEscura, s * 1.0, 1.1, 0));
    const telhado = new THREE.Mesh(new THREE.ConeGeometry(1.6, 0.8, 4), A.telhado[0]); telhado.position.y = 2.5; telhado.rotation.y = Math.PI / 4; p.add(telhado);
    g.add(p); }
  // caramanchão de entrada (arco de madeira com trepadeira)
  { const a = 5.2, r = 11, x = Math.cos(a) * r, z = Math.sin(a) * r, y = noChao(x, z);
    const c = new THREE.Group(); c.position.set(x, y, z); c.rotation.y = -a + Math.PI / 2;
    for (const s of [-1, 1]) c.add(caixa(0.16, 2.6, 0.16, A.madeira, s * 1.1, 1.3, 0));
    const topo = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.08, 5, 14, Math.PI), A.madeira); topo.position.y = 2.6; c.add(topo);
    for (let k = 0; k < 12; k++) { const t = k / 11 * Math.PI, f = new THREE.Mesh(new THREE.IcosahedronGeometry(0.14, 0), k % 3 ? caule : cores[0]); f.position.set(Math.cos(t) * 1.1, 2.6 + Math.sin(t) * 1.1, (rnd() - 0.5) * 0.2); c.add(f); }
    g.add(c); }
  g.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
  fundirEstaticos(g);
  const cache = new Map();
  return { grupo, aplicarNivel: nivel => trocarMateriais(grupo, nivel.materialSimples, cache) };
}

// ---------------- Cap. 4: pontos de costura gigantes em volta da praça ----------------
// Cada ponto é uma linha grossa que sai da colcha, faz um arco e volta a entrar (dá para passar
// por baixo e subir em cima); um dedal gigante tombado serve de abrigo; um botão serve de palco.
export function construirCostura({ centro, raio, alturaEm, rnd }) {
  const A = materiais(), grupo = new THREE.Group(); grupo.name = 'costura';
  const noChao = (x, z) => alturaEm(x, z) ?? centro.y;
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2 + 0.2, r = raio * (0.95 + rnd() * 0.15);
    const x = centro.x + Math.cos(a) * r, z = centro.z + Math.sin(a) * r;
    const vao = 2.6 + rnd() * 1.2, alt = 1.8 + rnd() * 1.4;
    const t = -a + Math.PI / 2, dx = Math.cos(t) * vao, dz = -Math.sin(t) * vao;
    const p0 = new THREE.Vector3(x - dx, noChao(x - dx, z - dz) - 0.3, z - dz), p2 = new THREE.Vector3(x + dx, noChao(x + dx, z + dz) - 0.3, z + dz);
    const p1 = new THREE.Vector3(x, Math.max(p0.y, p2.y) + alt * 2, z);
    const ponto = new THREE.Mesh(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(p0, p1, p2), 24, 0.32, 8), A.linha[k % 5]);
    ponto.userData.solido = true; ponto.castShadow = true; ponto.receiveShadow = true;
    grupo.add(ponto);
  }
  // dedal tombado (abrigo): copo de metal aberto de um lado
  {
    const a = 2.3, r = raio * 0.55, x = centro.x + Math.cos(a) * r, z = centro.z + Math.sin(a) * r;
    const d = new THREE.Mesh(new THREE.CylinderGeometry(2.0, 2.4, 3.6, 20, 1, true, 0.6, Math.PI * 2 - 1.2), A.metal);
    d.material = A.metal.clone(); d.material.side = THREE.DoubleSide;
    d.rotation.z = Math.PI / 2; d.rotation.y = a; d.position.set(x, noChao(x, z) + 2.0, z);
    d.userData.solido = true; d.castShadow = true; d.receiveShadow = true;
    const fundo = new THREE.Mesh(new THREE.CircleGeometry(2.0, 20), d.material); fundo.position.copy(d.position); fundo.rotation.copy(d.rotation); fundo.translateY(1.8); fundo.rotateX(-Math.PI / 2); fundo.userData.solido = true;
    grupo.add(d, fundo);
  }
  // botão gigante deitado, um palco baixo
  {
    const a = 4.4, r = raio * 0.5, x = centro.x + Math.cos(a) * r, z = centro.z + Math.sin(a) * r;
    const b = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.3, 0.45, 24), A.linha[1]); b.position.set(x, noChao(x, z) + 0.15, z); b.userData.solido = true; b.castShadow = true; b.receiveShadow = true;
    grupo.add(b);
  }
  fundirEstaticos(grupo);
  const cache = new Map();
  return { grupo, casas: [], aplicarNivel: nivel => trocarMateriais(grupo, nivel.materialSimples, cache) };
}
