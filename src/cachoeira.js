import * as THREE from 'three';
import { carregarTextura } from './texturas.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { simplificar, simplificarIndices } from './simplificar.js';
import { geometriaParaBin, binParaGeometria } from './mapa.js';

// Cachoeira mágica (modelo do Meshy). O FBX original tem 74 MB e 636 mil triângulos soltos;
// ferramentas/converter-cachoeira.html gera assets/cachoeira/cachoeira.bin (mesmo formato do
// mapa.bin) com os vértices unidos, a malha simplificada e um nível de detalhe para longe.
// Poucas cópias (no máximo 5) compartilham a mesma geometria e o mesmo material.

const PASTA = new URL('../assets/cachoeira/', import.meta.url).href;
const PIXEL = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';
const PROPORCAO = 0.09; // ~57 mil triângulos: igual de perto, bem mais leve
const LOD_LONGE = [0.3, 0.01];

export async function converterCachoeira() {
  const gerente = new THREE.LoadingManager();
  gerente.setURLModifier(u => (/\.(png|jpe?g)$/i.test(u) ? PIXEL : u));
  const obj = await new FBXLoader(gerente).loadAsync(PASTA + 'cachoeira.fbx');
  obj.updateMatrixWorld(true);
  let malha;
  obj.traverse(o => { if (o.isMesh && !malha) malha = o; });
  const g = malha.geometry;
  g.applyMatrix4(malha.matrixWorld);
  g.deleteAttribute('normal');
  const unida = mergeVertices(g);
  g.dispose();
  unida.computeVertexNormals();
  const geo = await simplificar(unida, PROPORCAO, 0.004);
  const niveis = [geo.index.array, await simplificarIndices(geo, ...LOD_LONGE)];
  geo.setIndex(null);
  return geometriaParaBin(geo, niveis);
}

// Materiais por nível gráfico (as texturas seguem o mesmo padrão do mapa)
const TEXTURAS = {
  low: { cor: 'cachoeira_cor_1024.jpg' },
  medium: { cor: 'cachoeira_cor_2048.jpg', normal: 'cachoeira_normal_1024.png', rugosidade: 'cachoeira_rugosidade_1024.jpg' },
  high: { cor: 'cachoeira_cor_2048.jpg', normal: 'cachoeira_normal_1024.png', rugosidade: 'cachoeira_rugosidade_1024.jpg', metal: 'cachoeira_metal_512.jpg' },
};

export async function carregarCachoeira(renderer) {
  const r = await fetch(PASTA + 'cachoeira.bin');
  if (!r.ok) throw new Error('cachoeira.bin: ' + r.status);
  const { geo, niveis } = binParaGeometria(await r.arrayBuffer());
  geo.computeBoundingBox();
  // centra em x/z e apoia a base em y = 0; a altura vira 1 (cada cópia escolhe o tamanho)
  const b = geo.boundingBox.clone(), c = b.getCenter(new THREE.Vector3()), alt = b.max.y - b.min.y;
  const raioBase = Math.max(b.max.x - b.min.x, b.max.z - b.min.z) / alt / 2; // raio relativo à altura
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setXYZ(i, (pos.getX(i) - c.x) / alt, (pos.getY(i) - b.min.y) / alt, (pos.getZ(i) - c.z) / alt);
  geo.computeBoundingBox(); geo.computeBoundingSphere();
  // raio do "pé" (onde toca o chão/a água): o topo é bem mais largo que a base
  let raioPe = 0;
  for (let i = 0; i < pos.count; i++) if (pos.getY(i) < 0.08) raioPe = Math.max(raioPe, Math.hypot(pos.getX(i), pos.getZ(i)));
  const geos = niveis.map(ind => {
    const g = new THREE.BufferGeometry();
    for (const [n, a] of Object.entries(geo.attributes)) g.setAttribute(n, a);
    g.setIndex(new THREE.BufferAttribute(ind, 1));
    g.boundingBox = geo.boundingBox; g.boundingSphere = geo.boundingSphere;
    return g;
  });

  // texturas carregadas à parte (KTX2 comprimida quando dá, texturas.js): o material nasce com um
  // pixel neutro no lugar de cada uma (o shader já é o certo, nada recompila) e troca quando chega
  const pixel = (r, g, b) => { const t = new THREE.DataTexture(new Uint8Array([r, g, b, 255]), 1, 1); t.needsUpdate = true; return t; };
  const NEUTRAS = { map: pixel(255, 255, 255), normalMap: pixel(128, 128, 255), roughnessMap: pixel(255, 255, 255), metalnessMap: pixel(0, 0, 0) };
  const cache = new Map();
  const usar = (mat, campo, nome, cor) => {
    if (!nome) return;
    mat[campo] = NEUTRAS[campo];
    if (!cache.has(nome)) {
      const reg = { textura: null, usos: [] };
      cache.set(nome, reg);
      carregarTextura(renderer, PASTA + nome).then(t => {
        if (cor) t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = renderer.capabilities.getMaxAnisotropy() >= 4 ? 4 : 1;
        reg.textura = t;
        for (const [m, c] of reg.usos) m[c] = t;
      }).catch(e => console.warn('cachoeira: textura', nome, e.message));
    }
    const reg = cache.get(nome);
    if (reg.textura) mat[campo] = reg.textura; else reg.usos.push([mat, campo]);
  };
  let material = null;
  const tempo = { value: 0 };
  function materialPara(nomeNivel, simples) {
    const t = TEXTURAS[nomeNivel] ?? TEXTURAS.medium;
    material?.dispose();
    material = simples
      ? new THREE.MeshLambertMaterial()
      : new THREE.MeshStandardMaterial({ roughness: 1, metalness: t.metal ? 1 : 0 });
    usar(material, 'map', t.cor, true);
    if (!simples) { usar(material, 'normalMap', t.normal); usar(material, 'roughnessMap', t.rugosidade); usar(material, 'metalnessMap', t.metal); }
    aguaCorrendo(material, tempo);
    return material;
  }

  // uma cópia: LOD com a malha completa perto e a leve longe.
  // largura (opcional): escala horizontal — uma queda alta e estreita, como água caindo de um penhasco
  function criar(altura, largura = altura) {
    const lod = new THREE.LOD();
    const perto = new THREE.Mesh(geos[0]), longe = new THREE.Mesh(geos[1]);
    lod.addLevel(perto, 0); lod.addLevel(longe, Math.max(60, largura * 8));
    lod.scale.set(largura, altura, largura);
    lod.userData.malhas = [perto, longe];
    return lod;
  }

  return { criar, materialPara, raioBase, raioPe, atualizar: t => { tempo.value = t; } };
}

// A textura é um atlas de pedra (marrom/dourado) e água (azul/branco). Nas partes de água,
// faixas de brilho descem pela altura do modelo e um leve brilho próprio deixa a água "mágica";
// a pedra fica como está.
function aguaCorrendo(material, tempo) {
  material.onBeforeCompile = sh => {
    sh.uniforms.uTempo = tempo;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vPosModelo;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPosModelo = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uTempo;\nvarying vec3 vPosModelo;\nfloat ehAgua = 0.0;')
      .replace('#include <map_fragment>', `#include <map_fragment>
        ehAgua = smoothstep(0.06, 0.3, diffuseColor.b - diffuseColor.r);
        float fluxo = sin(vPosModelo.y * 70.0 + uTempo * 4.0 + sin(vPosModelo.x * 31.0 + vPosModelo.z * 27.0) * 3.0);
        diffuseColor.rgb += ehAgua * smoothstep(0.55, 1.0, fluxo) * 0.22;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += diffuseColor.rgb * ehAgua * 0.22;`);
  };
  material.customProgramCacheKey = () => 'cachoeira-agua';
}

// Onde ficam as cachoeiras, como na natureza: a água corre pelo terreno até a beira de um
// penhasco e despenca. Todas as bordas da ilha (terreno.bordas) são avaliadas:
//  - queda livre: da beira até o mar, sem rocha no caminho (raios para baixo em volta da coluna);
//  - cai no mar: não na areia da praia nem na água rasa da beira;
//  - água chegando: o terreno sobe para dentro da ilha (a chuva escorre para essa borda) e a
//    borda é mais baixa que os lados (um vale/canal) — é onde um rio sairia;
//  - longe dos pontos do jogo (âncoras, Coração, início, inimigos, correntes, rochas, fragmentos).
// As melhores são escolhidas bem espalhadas em volta da ilha. Cada cachoeira é o modelo esticado
// na vertical: a pedra de cima na beira do penhasco e a coluna de água até o mar, com espuma e
// spray lá embaixo e um pouco de névoa na beira.
const MAX_CACHOEIRAS = 3;
const LARGURA = 13;          // escala horizontal do modelo (a pedra do topo fica com ~2,5 m de raio)
export function posicionarCachoeiras({ cena, mapa, terreno, mundo, agua, nevoa, modelo, praia }) {
  const grupo = new THREE.Group(); grupo.name = 'cachoeiras';
  cena.add(grupo);
  const copias = [], solidos = [];
  const rc = new THREE.Raycaster(); rc.firstHitOnly = true; rc.layers.enableAll();
  const baixo = new THREE.Vector3(0, -1, 0), o3 = new THREE.Vector3();
  const chaoEm = (x, z, yRef, alcance = 8) => { rc.set(o3.set(x, yRef + 3, z), baixo); rc.far = alcance + 3; const h = rc.intersectObject(mapa.malha)[0]; return h ? h.point.y : null; };
  // primeiro chão abaixo de um ponto, até o nível do mar (null = cai direto no mar)
  const abaixo = (x, z, yTopo) => { rc.set(o3.set(x, yTopo, z), baixo); rc.far = yTopo - agua.nivel; return rc.intersectObject(mapa.malha)[0] ?? null; };

  const ocupados = [
    { p: terreno.nascimento, r: 12 },
    { p: mundo.coracao.pos, r: 11 },
    ...mundo.ancoras.map(a => ({ p: a.pos, r: 10 })),
    ...mundo.posicoesInimigos.map(e => ({ p: e.pos, r: 4 })),
    ...mundo.fragmentos.map(f => ({ p: f.pos, r: 3 })),
    ...mundo.correntes.map(c => ({ p: c.pos, r: 6 })),
    ...mundo.rochas.map(r => ({ p: r.base, r: 6 })),
  ];
  const longeDoJogo = p => ocupados.every(o => Math.hypot(o.p.x - p.x, o.p.z - p.z) > o.r + 3 || Math.abs(o.p.y - p.y) > 8);
  const c0 = agua.centro;
  const raioColuna = 1.4; // a coluna de água tem ~1 m de raio: a queda precisa desse espaço livre

  // ----- avaliação de cada borda -----
  const candidatos = [];
  const rejeitadas = { semBeira: 0, quedaBloqueada: 0, praia: 0, pertoDoJogo: 0, semTerreno: 0 };
  for (const b of terreno.bordas) {
    const fora = new THREE.Vector3(b.para.x, 0, b.para.z).normalize();
    const lado = new THREE.Vector3(-fora.z, 0, fora.x);
    // anda para fora até o chão acabar (ou cair mais de 2 m): a beira do penhasco
    let beira = null, yBeira = b.pos.y;
    for (let s = 0; s <= 12; s += 0.5) {
      const x = b.pos.x + fora.x * s, z = b.pos.z + fora.z * s;
      const y = chaoEm(x, z, yBeira, 4);
      if (y === null || yBeira - y > 2) break;
      beira = new THREE.Vector3(x, y, z); yBeira = y;
    }
    if (!beira) { rejeitadas.semBeira++; continue; }
    // a coluna cai logo depois da beira. Dois jeitos certos de cair:
    //  - no mar, direto (nada embaixo até a água);
    //  - em cascata, num patamar mais baixo da ilha: chão plano pelo menos 10 m abaixo, e a
    //    coluna livre até ele (vira uma piscina natural onde a água bate)
    // o penhasco quase nunca é vertical: a água sai em arco da beira, então a coluna pode ficar
    // a 1,4 m, 2,5 m ou 4 m dela — vale a primeira distância em que a queda é limpa
    const topoColuna = yBeira - 0.6;
    let queda = null, pouso = null; // pouso: y do chão onde a cascata bate (null = mar)
    for (const afastar of [1.4, 2.5, 4]) {
      const q = beira.clone().addScaledVector(fora, afastar);
      const centro = abaixo(q.x, q.z, topoColuna);
      let p = null;
      if (centro) {
        if (centro.face.normal.y <= 0.65 || topoColuna - centro.point.y < 10) continue;
        p = centro.point.y;
      }
      let livre = true;
      for (let k = 0; k < 6 && livre; k++) {
        const a = (k / 6) * Math.PI * 2;
        const h = abaixo(q.x + Math.cos(a) * raioColuna, q.z + Math.sin(a) * raioColuna, topoColuna - 1.5);
        // a borda da coluna também precisa cair sem bater em nada antes do pouso
        if (p === null ? h !== null : (!h || Math.abs(h.point.y - p) > 2.5)) livre = false;
      }
      if (livre) { queda = q; pouso = p; break; }
    }
    if (!queda) { rejeitadas.quedaBloqueada++; continue; }
    // no mar: longe da areia da praia (nem a menos de 4 m da beira dela)
    if (pouso === null && praia) {
      let naPraia = praia.alturaEm(queda.x, queda.z) !== null;
      for (let k = 0; k < 8 && !naPraia; k++) {
        const a = (k / 8) * Math.PI * 2;
        if (praia.alturaEm(queda.x + Math.cos(a) * 4, queda.z + Math.sin(a) * 4) !== null) naPraia = true;
      }
      if (naPraia) { rejeitadas.praia++; continue; }
    }
    const pontoPouso = new THREE.Vector3(queda.x, pouso ?? agua.nivel, queda.z);
    if (!longeDoJogo(beira) || (pouso !== null && !longeDoJogo(pontoPouso))) { rejeitadas.pertoDoJogo++; continue; }
    // água chegando: terreno mais alto para dentro (escorre para cá) e nas laterais (um vale)
    const alt = (dx, dz) => chaoEm(beira.x + dx, beira.z + dz, yBeira + 6, 14);
    const dentro = [6, 12].map(d => alt(-fora.x * d, -fora.z * d)).filter(v => v !== null);
    const lados = [-6, 6].map(d => alt(lado.x * d - fora.x * 2, lado.z * d - fora.z * 2)).filter(v => v !== null);
    if (!dentro.length) { rejeitadas.semTerreno++; continue; }
    const escorre = Math.max(0, Math.min(6, dentro.reduce((s, v) => s + v, 0) / dentro.length - yBeira));
    const vale = lados.length ? Math.max(0, Math.min(4, lados.reduce((s, v) => s + v, 0) / lados.length - yBeira)) : 0;
    const altura = yBeira - (pouso ?? agua.nivel);
    const nota = escorre * 1.5 + vale * 1.2 + Math.min(altura, 90) / 30;
    candidatos.push({ beira, queda, fora, yBeira, pouso, altura, nota, escorre, vale, ang: Math.atan2(queda.z - c0.z, queda.x - c0.x) });
  }

  // ----- as melhores, bem espalhadas em volta da ilha -----
  candidatos.sort((a, b) => b.nota - a.nota);
  const escolhidos = [];
  for (const c of candidatos) {
    if (escolhidos.length >= MAX_CACHOEIRAS) break;
    const separadas = escolhidos.every(e => {
      const dAng = Math.abs(Math.atan2(Math.sin(e.ang - c.ang), Math.cos(e.ang - c.ang)));
      return dAng > THREE.MathUtils.degToRad(70) && e.queda.distanceTo(c.queda) > 30;
    });
    if (separadas) escolhidos.push(c);
  }

  // ----- montagem: da beira do penhasco até a água (o mar ou a piscina da cascata) -----
  const piscinas = [];
  for (const e of escolhidos) {
    const noMar = e.pouso === null;
    const base = noMar ? agua.nivel - 2.5 : e.pouso - 0.6;
    const altura = e.yBeira + 1.2 - base; // a pedra do topo um pouco acima da beira
    const c = modelo.criar(altura, LARGURA);
    c.position.set(e.queda.x, base, e.queda.z);
    c.rotation.y = Math.atan2(e.fora.x, e.fora.z);
    grupo.add(c); copias.push(c);
    solidos.push(c.userData.malhas[0]); // a pedra da beira bloqueia de verdade (colisao.js)
    const pe = modelo.raioPe * LARGURA;
    const yAgua = noMar ? agua.nivel : e.pouso;
    if (noMar) agua.adicionarContato(e.queda.x, e.queda.z, pe + 0.5, 1);
    else piscinas.push(criarPiscina(e.queda.x, e.pouso + 0.06, e.queda.z, pe * 1.9));
    nevoa?.adicionarSpray(new THREE.Vector3(e.queda.x, yAgua + 0.5, e.queda.z), pe * (noMar ? 2.2 : 1.2), noMar ? 7 : 4); // embaixo
    nevoa?.adicionarSpray(new THREE.Vector3(e.queda.x, e.yBeira - 1.5, e.queda.z), 1.2, 2);                              // na beira
  }

  // piscina natural onde a cascata bate num patamar: água turquesa com ondinhas saindo do centro
  function criarPiscina(x, y, z, raio) {
    const textura = (() => {
      const cv = document.createElement('canvas'); cv.width = cv.height = 128;
      const g = cv.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(225,248,250,0.9)'); gr.addColorStop(0.45, 'rgba(90,205,215,0.85)');
      gr.addColorStop(0.9, 'rgba(60,170,190,0.8)'); gr.addColorStop(1, 'rgba(60,170,190,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
      return new THREE.CanvasTexture(cv);
    })();
    textura.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(new THREE.CircleGeometry(raio, 40).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ map: textura, transparent: true, roughness: 0.12, metalness: 0.05, depthWrite: false }));
    m.position.set(x, y, z);
    m.renderOrder = 1;
    m.receiveShadow = true;
    grupo.add(m);
    // anel de espuma pulsando
    const anel = new THREE.Mesh(new THREE.RingGeometry(raio * 0.35, raio * 0.5, 40).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: '#f2fbff', transparent: true, opacity: 0.6, depthWrite: false }));
    anel.position.set(x, y + 0.02, z);
    anel.renderOrder = 2;
    grupo.add(anel);
    return { anel, fase: Math.random() * 6 };
  }
  const diagnostico = {
    bordas: terreno.bordas.length, candidatas: candidatos.length, rejeitadas,
    todas: candidatos.map(e => `${e.pouso === null ? 'mar' : 'cascata'} nota ${e.nota.toFixed(1)} queda ${e.altura.toFixed(0)}m ângulo ${Math.round(THREE.MathUtils.radToDeg(e.ang))}°`),
    escolhidas: escolhidos.map(e => ({ x: +e.queda.x.toFixed(1), z: +e.queda.z.toFixed(1), cai: e.pouso === null ? 'mar' : 'cascata', beira: +e.yBeira.toFixed(1), queda: +e.altura.toFixed(0), escorre: +e.escorre.toFixed(1), vale: +e.vale.toFixed(1), nota: +e.nota.toFixed(2) })),
  };

  function aplicarMaterial(material) {
    for (const c of copias) for (const m of c.userData.malhas) { m.material = material; m.receiveShadow = true; }
  }
  grupo.updateMatrixWorld(true);
  // a espuma das piscinas abre e fecha devagar
  function atualizar(t) {
    for (const p of piscinas) {
      const k = (t * 0.6 + p.fase) % 1;
      p.anel.scale.setScalar(0.8 + k * 0.9);
      p.anel.material.opacity = 0.6 * (1 - k);
    }
  }
  return { grupo, copias, solidos, aplicarMaterial, atualizar, diagnostico };
}
