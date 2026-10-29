import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { removerPicos, fecharCiclo, alinharGolpe, velocidadeNatural } from './reparos.js';
import { carregarTextura } from './texturas.js';
import { simplificarIndices } from './simplificar.js';
import { carregarBonecaNova, vestirBonecaNova, adaptarTrilhas, criarCabelo } from './bonecaNova.js';

// animações em ciclo (precisam terminar exatamente onde começam)
const CICLOS = ['andar', 'correr', 'parada', 'queda', 'guarda'];
// membros que acertam o golpe (para virar o golpe para a frente no momento do impacto)
const MEMBROS_GOLPE = {
  soco1: ['LeftHand', 'RightHand'], soco2: ['LeftHand', 'RightHand'], soco3: ['LeftHand', 'RightHand'],
  soco4: ['LeftHand', 'RightHand'], soco5: ['LeftHand', 'RightHand'],
  chute: ['LeftFoot', 'RightFoot'],
  golpeArma: ['LeftHand', 'RightHand'], // no "Attack" o pé só dá um passo; quem golpeia são os braços
};
// O Punch_Combo_3 são 5 golpes em sequência. Medindo, quadro a quadro, o quanto a pose se afasta
// da guarda (em relação ao quadril), aparecem 5 picos — 0,63, 1,00, 1,57, 2,13 e 2,87 s —
// separados por voltas em direção à guarda em 0,80, 1,33, 1,83 e 2,67 s.
const CORTES_COMBO = [['soco1', 0.15, 0.8], ['soco2', 0.8, 1.33], ['soco3', 1.33, 1.83], ['soco4', 1.83, 2.67], ['soco5', 2.67, 3.27]];

// Personagem: a boneca redesenhada (bonecaNova.js) no esqueleto da "Little Lavender Doll" (Meshy). Do FBX dela vêm andar, correr, a queda de
// morte e o combate: combo de socos (cortado em 5 golpes), chute giratório, guarda (defesa) e o
// "Attack", usado para bater com um objeto na mão.
// Parada, pulo, queda e aterrissagem vêm do Human Basic Motions e são transferidos para este esqueleto.

export const ALTURA = 1.7;
const TOM_BONECA = 0.8; // multiplica a cor da textura da boneca (ver aplicarQualidadeBoneca)
const PASTA = new URL('../assets/boneca/', import.meta.url).href;
const PASTA_HBM = new URL('../assets/animacoes/', import.meta.url).href;
const PIXEL = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';
const M = n => 'mixamorig' + n;

// Apenas locomoção estável do modelo -> nome usado no jogo.
const PROPRIAS = {
  Walking: 'andar',
  Running: 'correr',
  Fall_Dead_from_Abdominal_Injury: 'morte', // cai no chão quando a Linha Viva acaba
  Punch_Combo_3: 'soco',                     // cortado em soco1..soco5 (CORTES_COMBO)
  Roundhouse_Kick: 'chute',
  Combat_Idle_Turn_Left: 'guarda',           // defesa (o giro do corpo é retirado)
  Attack: 'golpeArma',                       // golpe com o objeto que ela segura
};

// animações do Human Basic Motions que completam o que falta
const EMPRESTADAS = {
  parada: 'Idle.fbx',
  puloInicio: 'PuloInicio.fbx',
  queda: 'Queda.fbx',
  aterrissar: 'PuloAterrissar.fbx',
};

// ossos do rig HBM -> ossos Mixamo (com o "filho" usado para saber para onde cada osso aponta)
const MAPA_OSSOS = [
  ['B-hips', 'Hips', 'B-spine', 'Spine'],
  ['B-spine', 'Spine', 'B-chest', 'Spine2'],
  ['B-chest', 'Spine2', 'B-neck', 'Neck'],
  ['B-neck', 'Neck', 'B-head', 'Head'],
  ['B-head', 'Head'],
  ...['L', 'R'].flatMap(l => {
    const lado = l === 'L' ? 'Left' : 'Right';
    return [
      [`B-shoulder${l}`, `${lado}Shoulder`, `B-upperArm${l}`, `${lado}Arm`],
      [`B-upperArm${l}`, `${lado}Arm`, `B-forearm${l}`, `${lado}ForeArm`],
      [`B-forearm${l}`, `${lado}ForeArm`, `B-hand${l}`, `${lado}Hand`],
      [`B-hand${l}`, `${lado}Hand`, `B-middleFinger01${l}`, `${lado}HandMiddle1`],
      [`B-thigh${l}`, `${lado}UpLeg`, `B-shin${l}`, `${lado}Leg`],
      [`B-shin${l}`, `${lado}Leg`, `B-foot${l}`, `${lado}Foot`],
      [`B-foot${l}`, `${lado}Foot`, `B-toe${l}`, `${lado}ToeBase`],
      [`B-toe${l}`, `${lado}ToeBase`],
    ];
  }),
].map(([s, d, sf, df]) => ({ src: s, dst: M(d), srcFilho: sf, dstFilho: df && M(df) }));

// Papéis de ossos usados pelos ajustes de postura e pés.
export const PAPEIS = {
  hips: M('Hips'), coluna: [M('Spine'), M('Spine1'), M('Spine2')], pescoco: M('Neck'), cabeca: M('Head'),
  ...Object.fromEntries(['L', 'R'].flatMap(l => {
    const lado = l === 'L' ? 'Left' : 'Right';
    return [
      [`ombro${l}`, M(`${lado}Shoulder`)], [`braco${l}`, M(`${lado}Arm`)], [`antebraco${l}`, M(`${lado}ForeArm`)], [`mao${l}`, M(`${lado}Hand`)],
      [`coxa${l}`, M(`${lado}UpLeg`)], [`canela${l}`, M(`${lado}Leg`)], [`pe${l}`, M(`${lado}Foot`)], [`dedos${l}`, M(`${lado}ToeBase`)],
    ];
  })),
};

const wq = o => o.getWorldQuaternion(new THREE.Quaternion());
const wp = o => o.getWorldPosition(new THREE.Vector3());

// Ossos em ordem pai -> filho
function ossosEmOrdem(raiz) {
  const lista = [];
  raiz.traverse(o => { if (o.isBone) lista.push(o); });
  return lista;
}

// ---------- limpeza das animações da boneca ----------
// tira o deslocamento horizontal do quadril (as animações devem ficar no lugar: quem anda é a física)
// e, na guarda, também o giro (a original vai virando para a esquerda)
function limparClipe(clipe, hips, tirarGiro) {
  const pai = hips.parent;
  const qPai = wq(pai), qPaiInv = qPai.clone().invert();
  const escala = pai.getWorldScale(new THREE.Vector3()).x;
  const trilhas = [];
  for (const t of clipe.tracks) {
    const [osso, prop] = t.name.split('.');
    if (prop === 'scale') continue;
    if (osso === hips.name && prop === 'position') {
      // horizontal preso na posição de repouso
      const v = t.values.slice(), v0 = hips.position.clone();
      const d = new THREE.Vector3();
      for (let i = 0; i < v.length; i += 3) {
        d.set(v[i], v[i + 1], v[i + 2]).sub(v0).multiplyScalar(escala).applyQuaternion(qPai); // no mundo
        d.x = 0; d.z = 0;
        d.applyQuaternion(qPaiInv).divideScalar(escala).add(v0);
        v[i] = d.x; v[i + 1] = d.y; v[i + 2] = d.z;
      }
      trilhas.push(new THREE.VectorKeyframeTrack(t.name, t.times, v));
    } else if (osso === hips.name && prop === 'quaternion' && tirarGiro) {
      const v = t.values.slice();
      const q0 = qPai.clone().multiply(new THREE.Quaternion().fromArray(v, 0));
      const q = new THREE.Quaternion(), rel = new THREE.Quaternion(), giro = new THREE.Quaternion(), cima = new THREE.Vector3(0, 1, 0);
      for (let i = 0; i < v.length; i += 4) {
        q.copy(qPai).multiply(rel.fromArray(v, i)); // rotação no mundo
        // quanto girou em volta do eixo vertical desde o primeiro quadro
        const frente = new THREE.Vector3(0, 0, 1).applyQuaternion(rel.copy(q).multiply(q0.clone().invert()));
        giro.setFromAxisAngle(cima, -Math.atan2(frente.x, frente.z));
        q.premultiply(giro);
        rel.copy(qPaiInv).multiply(q).toArray(v, i);
      }
      trilhas.push(new THREE.QuaternionKeyframeTrack(t.name, t.times, v));
    } else trilhas.push(t);
  }
  return new THREE.AnimationClip(clipe.name, clipe.duration, trilhas);
}

// Recorta um trecho [t0, t1] (s) de um clipe e gira o trecho em volta do eixo vertical para que
// ele comece virado para o mesmo lado que o clipe original começava — assim cada golpe funciona
// sozinho, saindo da guarda, e a personagem soca para a frente.
function recortar(clipe, nome, t0, t1, hips) {
  const trilhas = [];
  for (const t of clipe.tracks) {
    const i0 = t.times.findIndex(x => x >= t0 - 1e-4);
    let i1 = t.times.findIndex(x => x > t1 + 1e-4);
    if (i1 < 0) i1 = t.times.length;
    if (i0 < 0 || i1 - i0 < 2) continue;
    const n = t.getValueSize();
    const tempos = t.times.slice(i0, i1).map(x => x - t.times[i0]);
    trilhas.push(new t.constructor(t.name, tempos, t.values.slice(i0 * n, i1 * n)));
  }
  const trecho = new THREE.AnimationClip(nome, -1, trilhas);
  const tq = trecho.tracks.find(t => t.name === `${hips.name}.quaternion`);
  const original = clipe.tracks.find(t => t.name === `${hips.name}.quaternion`);
  if (tq && original) {
    const qPai = wq(hips.parent), qPaiInv = qPai.clone().invert();
    const guinada = v => { // direção horizontal para onde o quadril aponta no mundo
      const f = new THREE.Vector3(0, 0, 1).applyQuaternion(qPai.clone().multiply(new THREE.Quaternion().fromArray(v)));
      return Math.atan2(f.x, f.z);
    };
    const giro = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0),
      guinada(original.values.slice(0, 4)) - guinada(tq.values.slice(0, 4)));
    const q = new THREE.Quaternion();
    for (let i = 0; i < tq.values.length; i += 4) {
      q.fromArray(tq.values, i).premultiply(qPai).premultiply(giro).premultiply(qPaiInv).toArray(tq.values, i);
    }
  }
  return trecho;
}

// ---------- pés no chão ----------
// Mede, quadro a quadro, o ponto mais baixo da malha deformada.
// e corrige a altura do quadril para que esse ponto fique exatamente no chão.
// "quadro": corrige cada quadro da pose parada;
// "ciclo": uma correção só para o ciclo todo (andar/correr mantêm o balanço natural);
// animações no ar não são corrigidas.
const ASSENTAR = { andar: 'ciclo', correr: 'ciclo', puloInicio: null, queda: null, aterrissar: 'quadro' };

function assentarNoChao(clipes, fbx, malha, hips, chao) {
  // vértices amostrados: todos os de baixo (pés) e uma fração do resto do corpo
  const pos = malha.geometry.attributes.position, v = new THREE.Vector3();
  fbx.updateMatrixWorld(true);
  const alturaRepouso = [];
  for (let i = 0; i < pos.count; i++) alturaRepouso.push(v.fromBufferAttribute(pos, i).applyMatrix4(malha.matrixWorld).y);
  const corte = chao + (Math.max(...alturaRepouso) - chao) * 0.08;
  const amostra = [];
  for (let i = 0; i < pos.count; i++) if (alturaRepouso[i] < corte ? i % 2 === 0 : i % 40 === 0) amostra.push(i);

  const qPaiInv = wq(hips.parent).invert(), escPai = hips.parent.getWorldScale(new THREE.Vector3()).x;
  const mixer = new THREE.AnimationMixer(fbx);
  const FPS = 12;
  for (const [nome, clipe] of Object.entries(clipes)) {
    const modo = nome in ASSENTAR ? ASSENTAR[nome] : 'quadro';
    if (!modo) continue;
    const trilha = clipe.tracks.find(t => t.name === `${hips.name}.position`);
    if (!trilha) continue;
    const acao = mixer.clipAction(clipe);
    acao.play();
    const n = Math.max(2, Math.ceil(clipe.duration * FPS) + 1), tempos = [], minimos = [];
    for (let k = 0; k < n; k++) {
      const t = Math.min(clipe.duration, k / FPS);
      // never sample at exactly the clip duration: a looping action wraps back to frame 0 there
      mixer.setTime(Math.min(t, clipe.duration - 1e-4));
      fbx.updateMatrixWorld(true);
      let m = Infinity;
      for (const i of amostra) { malha.getVertexPosition(i, v); v.applyMatrix4(malha.matrixWorld); if (v.y < m) m = v.y; }
      tempos.push(t); minimos.push(m);
    }
    acao.stop();
    mixer.uncacheClip(clipe);
    // correção vertical (unidades do FBX) em cada amostra; suavizada para não tremer
    let corr = minimos.map(m => chao - m);
    if (modo === 'ciclo') { const c = chao - Math.min(...minimos); corr = corr.map(() => c); }
    else corr = corr.map((c, i) => (corr[Math.max(0, i - 1)] + 2 * c + corr[Math.min(corr.length - 1, i + 1)]) / 4);
    const emT = t => {
      const f = Math.min(corr.length - 1, t * FPS), i = Math.floor(f), r = f - i;
      return corr[i] + ((corr[Math.min(corr.length - 1, i + 1)] ?? corr[i]) - corr[i]) * r;
    };
    const d = new THREE.Vector3();
    for (let k = 0; k < trilha.times.length; k++) {
      d.set(0, emT(trilha.times[k]), 0).applyQuaternion(qPaiInv).divideScalar(escPai);
      trilha.values[k * 3] += d.x; trilha.values[k * 3 + 1] += d.y; trilha.values[k * 3 + 2] += d.z;
    }
  }
}

// ---------- retarget HBM -> Mixamo ----------
// Cada osso de destino recebe, no espaço do mundo, a mesma rotação que o osso de origem sofreu
// a partir da pose de repouso. Como as poses de repouso são diferentes (HBM em T, boneca com os
// braços para baixo), o repouso da boneca é antes "alinhado" para apontar como o do HBM.
function prepararRetarget(fonte, destinoRaiz, chao) {
  // o rig HBM fica com Z para cima no mundo; gira para Y para cima, como a boneca
  const suporte = new THREE.Group();
  suporte.rotation.x = -Math.PI / 2;
  suporte.add(fonte);
  suporte.updateMatrixWorld(true);
  destinoRaiz.updateMatrixWorld(true);

  const src = n => fonte.getObjectByName(n), dst = n => destinoRaiz.getObjectByName(n);
  const info = new Map();
  for (const m of MAPA_OSSOS) {
    const s = src(m.src), d = dst(m.dst);
    if (!s || !d) continue;
    const alinhamento = new THREE.Quaternion();
    if (m.srcFilho && src(m.srcFilho) && dst(m.dstFilho)) {
      const dirS = wp(src(m.srcFilho)).sub(wp(s)).normalize();
      const dirD = wp(dst(m.dstFilho)).sub(wp(d)).normalize();
      alinhamento.setFromUnitVectors(dirD, dirS);
    }
    info.set(m.dst, {
      src: s,
      repousoSrcInv: wq(s).invert(),
      refDst: alinhamento.multiply(wq(d)), // repouso da boneca alinhado ao do HBM
    });
  }
  const hipsS = src('B-hips'), hipsD = dst(M('Hips'));
  const escalaQuadril = (wp(hipsD).y - chao) / wp(hipsS).y;
  return { suporte, info, hipsS, hipsD, repousoHipsS: wp(hipsS), escalaQuadril };
}

function retargetar(clipe, prep, fonte, destinoRaiz, fps = 30) {
  const ossos = ossosEmOrdem(destinoRaiz);
  const repousoLocal = new Map(ossos.map(o => [o, o.quaternion.clone()]));
  const paiHips = prep.hipsD.parent, qPaiHips = wq(paiHips), escPai = paiHips.getWorldScale(new THREE.Vector3()).x;
  const mixer = new THREE.AnimationMixer(fonte);
  // sem as trilhas do B-root: elas giram o rig inteiro e não fazem parte do movimento
  const semRaiz = new THREE.AnimationClip(clipe.name, clipe.duration, clipe.tracks.filter(t => !t.name.startsWith('B-root.')));
  mixer.clipAction(semRaiz).play();
  const n = Math.max(2, Math.round(clipe.duration * fps) + 1);
  const tempos = new Float32Array(n);
  const valores = new Map(ossos.map(o => [o, new Float32Array(n * 4)]));
  const posQuadril = new Float32Array(n * 3);
  const mundo = new Map(), delta = new THREE.Quaternion(), local = new THREE.Quaternion();
  const repousoHipsLocal = prep.hipsD.position.clone();

  for (let k = 0; k < n; k++) {
    const t = Math.min(clipe.duration, (k / (n - 1)) * clipe.duration);
    tempos[k] = t;
    // the last sample at exactly t = duration made the mixer wrap to frame 0: every borrowed
    // clip ended with a copy of its first frame (visible snap at the end of jump start/landing)
    mixer.setTime(Math.min(t, clipe.duration - 1e-4));
    prep.suporte.updateMatrixWorld(true);
    mundo.clear();
    for (const o of ossos) {
      const pai = o.parent;
      const qPai = mundo.get(pai) ?? wq(pai);
      const i = prep.info.get(o.name);
      let q;
      if (i) {
        delta.copy(wq(i.src)).multiply(i.repousoSrcInv);
        q = delta.clone().multiply(i.refDst);
        local.copy(qPai).invert().multiply(q);
      } else {
        local.copy(repousoLocal.get(o)); // ossos sem par (dedos, cabelo, Spine1): ficam como no repouso
        q = qPai.clone().multiply(local);
      }
      mundo.set(o, q);
      local.toArray(valores.get(o), k * 4);
    }
    // altura do quadril (agachar, subir no pulo), proporcional às pernas da boneca
    const d = wp(prep.hipsS).sub(prep.repousoHipsS).multiplyScalar(prep.escalaQuadril);
    d.x = 0; d.z = 0;
    d.applyQuaternion(qPaiHips.clone().invert()).divideScalar(escPai).add(repousoHipsLocal);
    d.toArray(posQuadril, k * 3);
  }
  mixer.stopAllAction();
  const trilhas = ossos.map(o => new THREE.QuaternionKeyframeTrack(`${o.name}.quaternion`, tempos, valores.get(o)));
  trilhas.push(new THREE.VectorKeyframeTrack(`${prep.hipsD.name}.position`, tempos, posQuadril));
  return new THREE.AnimationClip(clipe.name, clipe.duration, trilhas);
}

// ---------- texturas / material ----------
// Luz de contorno (rim): a borda da silhueta, vista de lado, acende um pouco — destaca a boneca
// do cenário e dá o ar de personagem "de animação". Vale para o Lambert (Low) e o PBR.
function contorno(material, forca) {
  material.onBeforeCompile = sh => {
    sh.uniforms.uContorno = { value: forca };
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uContorno;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float bordaRim = 1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);
        // (na cor da própria superfície: em branco a borda virava um halo em volta da boneca)
        totalEmissiveRadiance += vec3(0.92, 0.86, 1.0) * pow(bordaRim, 3.0) * uContorno * (0.2 + 0.8 * diffuseColor.rgb);`);
  };
  material.customProgramCacheKey = () => 'boneca-contorno2';
  return material;
}
const cacheTexturas = new Map();
function textura(renderer, nome, cor) {
  if (!nome) return Promise.resolve(null);
  if (!cacheTexturas.has(nome)) {
    cacheTexturas.set(nome, carregarTextura(renderer, PASTA + nome).then(t => {
      t.colorSpace = cor ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      t.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
      return t;
    }).catch(() => null));
  }
  return cacheTexturas.get(nome);
}

export async function aplicarQualidadeBoneca(boneca, renderer, nivel) {
  const t = nivel.texturaBoneca;
  const [cor, normal, rugosidade, metal] = await Promise.all([
    textura(renderer, t.cor, true), textura(renderer, t.normal), textura(renderer, t.rugosidade), textura(renderer, t.metal),
  ]);
  const antigo = boneca.malha.material;
  const anisotropia = nivel.nome === 'High' ? renderer.capabilities.getMaxAnisotropy() : Math.min(4, renderer.capabilities.getMaxAnisotropy());
  for (const texturaAtual of [cor, normal, rugosidade, metal]) if (texturaAtual) {
    texturaAtual.anisotropy = anisotropia;
    texturaAtual.needsUpdate = true;
  }
  // PBR com "sheen" (o brilho macio de tecido, visto de lado): roupa, laço e cabelo de boneca de pano.
  // Algodão é fosco: o brilho de tecido branco e forte (0,45), o reflexo especular cheio e o reflexo
  // do céu (0,8 no High) somavam luz branca por cima do vestido lilás, e o bloom do High ainda
  // espalhava em halo: a boneca aparecia branca e brilhante. Agora o brilho de tecido é fraco e da
  // cor do vestido, o especular é de tecido (0,35) e o reflexo do céu é pouco
  // (a textura do modelo é clara, com luz já pintada nela: com o sol do jogo o vestido lilás e a
  // pele estouravam para quase branco; TOM_BONECA traz de volta a cor da textura)
  const tom = new THREE.Color().setScalar(TOM_BONECA);
  boneca.malha.material = nivel.materialSimples
    ? contorno(new THREE.MeshLambertMaterial({ map: cor, color: tom }), 0.14)
    : contorno(new THREE.MeshPhysicalMaterial({
      map: cor, color: tom, normalMap: normal, roughnessMap: rugosidade, metalnessMap: metal,
      normalScale: new THREE.Vector2(0.7, 0.7), roughness: 0.82, metalness: 0,
      specularIntensity: 0.35,
      sheen: 0.18, sheenRoughness: 0.8, sheenColor: new THREE.Color('#b9a3d6'),
      envMapIntensity: nivel.nome === 'High' ? 0.3 : 0.25,
    }), nivel.nome === 'High' ? 0.16 : 0.14);
  antigo?.dispose?.();
}

// ---------- montagem ----------
export async function criarBoneca(renderer, nivel, aoProgredir) {
  const gerente = new THREE.LoadingManager();
  gerente.setURLModifier(u => (/\.(png|jpe?g|tga)$/i.test(u) ? PIXEL : u)); // texturas vêm à parte, no tamanho do nível gráfico
  const loader = new FBXLoader(gerente);
  const [fbx, ref, dadosNova, ...hbm] = await Promise.all([
    loader.loadAsync(PASTA + 'boneca.fbx', aoProgredir),
    loader.loadAsync(PASTA_HBM + 'HumanF_Model.fbx'),
    carregarBonecaNova(),
    ...Object.values(EMPRESTADAS).map(a => loader.loadAsync(PASTA_HBM + a)),
  ]);

  // o FBX traz só o esqueleto e as animações (ferramentas/fbx-so-esqueleto.py); a malha é a da
  // boneca redesenhada, no esqueleto ajustado ao corpo dela (bonecaNova.js)
  const ajuste = vestirBonecaNova(fbx, dadosNova);
  const malha = ajuste.malha;
  for (const c of fbx.animations) adaptarTrilhas(c, ajuste);
  malha.frustumCulled = false; // a caixa da malha não acompanha a animação
  malha.castShadow = false;    // usa sombra-mancha (a sombra do mapa é fixa)

  fbx.updateMatrixWorld(true);
  const hips = fbx.getObjectByName(M('Hips'));
  // caixa da boneca em repouso (a malha está na origem do FBX, sem transformação)
  malha.geometry.computeBoundingBox();
  const caixa = malha.geometry.boundingBox.clone();

  // pose de repouso no espaço da boneca
  const ossos = ossosEmOrdem(fbx);
  const ligacao = new Map();
  for (const o of [hips.parent, ...ossos]) ligacao.set(o.name, { q: o.quaternion.clone(), p: o.position.clone(), qModelo: wq(o) });

  // animações
  const clipes = {};
  for (const c of fbx.animations) {
    const nome = PROPRIAS[c.name];
    if (nome) {
      clipes[nome] = limparClipe(c, hips, nome === 'guarda');
    }
  }
  // o combo de socos vira 5 golpes separados
  if (clipes.soco) {
    for (const [nome, t0, t1] of CORTES_COMBO) clipes[nome] = recortar(clipes.soco, nome, t0, t1, hips);
    delete clipes.soco;
  }
  const prep = prepararRetarget(ref, fbx, caixa.min.y);
  Object.keys(EMPRESTADAS).forEach((nome, i) => { clipes[nome] = retargetar(hbm[i].animations[0], prep, ref, fbx); });

  // reparos nos clipes (diagnóstico e causas em reparos.js)
  const metrosPorUnidade = ALTURA / (caixa.max.y - caixa.min.y);
  const diagnostico = { picos: {}, alinhamento: {} };
  for (const [nome, c] of Object.entries(clipes)) diagnostico.picos[nome] = removerPicos(c);
  // cada golpe virado para a frente no momento em que acerta (as animações originais apontam para lados diferentes)
  for (const [nome, membros] of Object.entries(MEMBROS_GOLPE)) {
    if (clipes[nome]) diagnostico.alinhamento[nome] = Math.round(alinharGolpe(clipes[nome], fbx, membros));
  }
  assentarNoChao(clipes, fbx, malha, hips, caixa.min.y);
  for (const nome of CICLOS) if (clipes[nome]) fecharCiclo(clipes[nome]);
  const velocidades = {
    andar: velocidadeNatural(clipes.andar, fbx, metrosPorUnidade),
    correr: velocidadeNatural(clipes.correr, fbx, metrosPorUnidade),
  };
  // volta a boneca ao repouso (o retarget só lê a pose dela)
  for (const o of ossos) { const l = ligacao.get(o.name); o.quaternion.copy(l.q); o.position.copy(l.p); }

  // hierarquia: raiz (posição e direção) -> corpo (pivô) -> modelo
  const escala = ALTURA / (caixa.max.y - caixa.min.y);
  const pivo = ALTURA * 0.5;
  const modelo = new THREE.Group();
  modelo.add(fbx);
  modelo.scale.setScalar(escala);
  modelo.position.set(-(caixa.min.x + caixa.max.x) / 2 * escala, -caixa.min.y * escala - pivo, -(caixa.min.z + caixa.max.z) / 2 * escala);
  const corpo = new THREE.Group();
  corpo.position.y = pivo;
  corpo.add(modelo);
  const raiz = new THREE.Group();
  raiz.add(corpo);

  const mixer = new THREE.AnimationMixer(fbx);
  const acoes = Object.fromEntries(Object.entries(clipes).map(([k, c]) => [k, mixer.clipAction(c)]));
  const perna = l => ({ coxa: fbx.getObjectByName(M(`${l}UpLeg`)), canela: fbx.getObjectByName(M(`${l}Leg`)), pe: fbx.getObjectByName(M(`${l}Foot`)) });
  // (sem contorno de desenho animado: o "casco invertido" de 2,7 cm, feito para a boneca antiga,
  // atravessava o rosto, os braços e as dobras do vestido da boneca nova e virava manchas escuras)
  // nível de detalhe: com a câmera a mais de ~4,5 m (o jogo quase todo) ela fica com metade dos
  // triângulos. São só outros índices sobre os mesmos vértices e pesos dos ossos: a animação é a
  // mesma e trocar não envia nada de novo para a GPU (os dois índices ficam lá)
  let ajustarDetalhe = () => {};
  if (malha.geometry.index) {
    const g = malha.geometry, completo = g.index;
    const leve = new THREE.BufferAttribute(await simplificarIndices(g, 0.5, 0.004), 1);
    let usandoLeve = false;
    ajustarDetalhe = distancia => {
      const querLeve = usandoLeve ? distancia > 4.0 : distancia > 4.5; // folga: não fica trocando na borda
      if (querLeve !== usandoLeve) { usandoLeve = querLeve; g.setIndex(querLeve ? leve : completo); }
    };
  }
  const rigOssos = Object.fromEntries(ossos.map(o => [o.name, o]));
  // cabelo solto balançando por cima da animação (chamado por jogo.js depois da postura)
  const cabelo = criarCabelo(ajuste.cadeias, rigOssos, JSON.parse(new URLSearchParams(location.search).get('cabeloOpcoes') || '{}'));
  const boneca = { raiz, corpo, malha, cabelo, mixer, acoes, velocidades, diagnostico, ajustarDetalhe, pernas: [perna('Left'), perna('Right')], rig: { ossos: rigOssos, lista: ossos, ligacao, papeis: PAPEIS } };
  await aplicarQualidadeBoneca(boneca, renderer, nivel);
  return boneca;
}
