import * as THREE from 'three';

// Boneca redesenhada (Meshy, 28/10/2026), vestida no esqueleto e nas animações da boneca antiga.
//
// O modelo novo veio sem ossos e com 1,1 milhão de triângulos. Fora do jogo ele foi reduzido para
// 50 mil e ganhou pesos de ossos calculados por região (ver docs/PROGRESSO.md): cabeça, cabelo,
// braços, pernas, tronco e saia, com as mesmas juntas do esqueleto Mixamo da boneca antiga, só que
// nas posições do corpo novo. Tudo isso vem pronto em boneca_nova.bin/.json (posições já em
// unidades do FBX antigo, mesma altura e centro).
//
// Aqui o esqueleto antigo é "ajustado" ao corpo novo: cada junta vai para a posição nova e cada
// osso gira o mínimo para apontar para o filho novo. As animações gravam a rotação de cada osso em
// relação ao pai, então, presa a ossos que apontam ao longo do corpo novo, a malha nova se move como
// a antiga se movia. O que muda é só a posição das juntas: as trilhas de posição das animações são
// ajustadas para isso (adaptarTrilhas).

const PASTA = new URL('../assets/boneca/', import.meta.url).href;
const M = n => 'mixamorig' + n;

// osso -> filho para onde ele aponta (o quadril não gira: é a referência das animações)
const APONTA = {
  Spine: 'Spine1', Spine1: 'Spine2', Spine2: 'Neck', Neck: 'Head', Head: 'HeadTop_End',
  ...Object.fromEntries(['Left', 'Right'].flatMap(l => [
    [`${l}Shoulder`, `${l}Arm`], [`${l}Arm`, `${l}ForeArm`], [`${l}ForeArm`, `${l}Hand`], [`${l}Hand`, `${l}HandMiddle1`],
    [`${l}UpLeg`, `${l}Leg`], [`${l}Leg`, `${l}Foot`], [`${l}Foot`, `${l}ToeBase`], [`${l}ToeBase`, `${l}Toe_End`],
  ])),
};

export async function carregarBonecaNova(aoProgredir) {
  const [info, bin] = await Promise.all([
    fetch(PASTA + 'boneca_nova.json').then(r => r.json()),
    fetch(PASTA + 'boneca_nova.bin').then(r => r.arrayBuffer()),
  ]);
  aoProgredir?.({ loaded: 1, total: 1 });
  const n = info.vertices;
  let o = 0;
  const pega = (Tipo, k) => { const a = new Tipo(bin, o, k); o += k * Tipo.BYTES_PER_ELEMENT; return a; };
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pega(Float32Array, n * 3), 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(pega(Float32Array, n * 3), 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(pega(Float32Array, n * 2), 2));
  geo.setAttribute('skinIndex', new THREE.BufferAttribute(pega(Uint8Array, n * 4), 4));
  geo.setAttribute('skinWeight', new THREE.BufferAttribute(pega(Uint8Array, n * 4), 4, true));
  geo.setIndex(new THREE.BufferAttribute(pega(Uint16Array, info.indices), 1));
  return { info, geo };
}

// Veste a malha nova no esqueleto do FBX (ainda na origem, sem pai). Devolve as posições locais dos
// ossos antes e depois do ajuste e a razão entre as alturas do quadril.
export function vestirBonecaNova(fbx, { info, geo }) {
  fbx.updateMatrixWorld(true);
  const ossos = [];
  fbx.traverse(b => { if (b.isBone) ossos.push(b); });
  const antigas = new Map(ossos.map(b => [b.name, b.position.clone()]));
  const mundoAntigo = new Map(ossos.map(b => [b.name, b.getWorldPosition(new THREE.Vector3())]));
  const giroAntigo = new Map(ossos.map(b => [b.name, b.getWorldQuaternion(new THREE.Quaternion())]));
  const juntas = new Map(Object.entries(info.juntas).map(([k, v]) => [k, new THREE.Vector3(...v)]));

  // ossos sem junta própria (dedos, mechas da boneca antiga) encolhem junto com o pai
  const proporcao = (a, b) => juntas.get(M(b)).distanceTo(juntas.get(M(a))) / mundoAntigo.get(M(b)).distanceTo(mundoAntigo.get(M(a)));
  const escalaMao = { Left: proporcao('LeftHand', 'LeftHandMiddle1'), Right: proporcao('RightHand', 'RightHandMiddle1') };
  const escalaCabeca = proporcao('Head', 'HeadTop_End');

  const q = new THREE.Quaternion(), pai = new THREE.Quaternion();
  for (const b of ossos) { // pai antes do filho
    b.parent.updateMatrixWorld(true);
    const nome = b.name.replace('mixamorig', '');
    const alvo = juntas.get(b.name);
    if (alvo) b.position.copy(b.parent.worldToLocal(alvo.clone()));
    else b.position.multiplyScalar(nome.includes('Hand') ? escalaMao[nome.startsWith('Left') ? 'Left' : 'Right'] : escalaCabeca);
    const filho = APONTA[nome];
    if (alvo && filho && juntas.has(M(filho))) {
      const dirAntiga = mundoAntigo.get(M(filho)).clone().sub(mundoAntigo.get(b.name)).normalize();
      const dirNova = juntas.get(M(filho)).clone().sub(alvo).normalize();
      q.setFromUnitVectors(dirAntiga, dirNova).multiply(giroAntigo.get(b.name));
      b.parent.getWorldQuaternion(pai);
      b.quaternion.copy(pai.invert().multiply(q));
    }
    b.updateMatrixWorld(true);
  }
  fbx.updateMatrixWorld(true);

  // cabelo solto: três cadeias de ossos novos presas à cabeça (centro, esquerda, direita), que
  // balançam com a física de criarCabelo; no repouso têm a mesma orientação da cabeça
  const cabeca = ossos.find(b => b.name === M('Head'));
  const cadeias = Object.entries(info.cabelo).map(([lado, pontos]) => {
    let pai = cabeca;
    const cadeia = [];
    for (let i = 0; i < pontos.length - 1; i++) {
      const b = new THREE.Bone();
      b.name = `Cabelo${lado}${i + 1}`;
      pai.add(b);
      pai.updateMatrixWorld(true);
      b.position.copy(pai.worldToLocal(new THREE.Vector3(...pontos[i])));
      b.updateMatrixWorld(true);
      ossos.push(b); cadeia.push(b); pai = b;
    }
    const ponta = new THREE.Object3D(); // só marca onde termina o último osso
    pai.add(ponta);
    ponta.position.copy(pai.worldToLocal(new THREE.Vector3(...pontos.at(-1))));
    return { ossos: cadeia, ponta };
  });

  const porNome = new Map(ossos.map(b => [b.name, b]));
  const esqueleto = new THREE.Skeleton(info.ossos.map(nome => porNome.get(nome)));
  const malha = new THREE.SkinnedMesh(geo, new THREE.MeshBasicMaterial()); // material: aplicarQualidadeBoneca
  malha.name = 'boneca_nova';
  // as posições da malha (e as juntas) estão no espaço do mundo com o FBX na origem; a raiz do FBX
  // pode ter escala própria, então a malha leva a transformação inversa da raiz
  fbx.add(malha);
  fbx.matrixWorld.clone().invert().decompose(malha.position, malha.quaternion, malha.scale);
  malha.updateMatrixWorld(true);
  malha.bind(esqueleto, malha.matrixWorld);

  const hips = porNome.get(M('Hips'));
  // altura do quadril acima da ponta do pé, no esqueleto novo e no antigo
  const pe = M('LeftToe_End');
  const razaoQuadril = (hips.getWorldPosition(new THREE.Vector3()).y - juntas.get(pe).y) / (mundoAntigo.get(hips.name).y - mundoAntigo.get(pe).y);
  const novas = new Map(ossos.map(b => [b.name, b.position.clone()]));
  return { malha, antigas, novas, razaoQuadril, hips: hips.name, cadeias };
}

// Trilhas de posição das animações da boneca antiga -> juntas novas. Nos ossos comuns a posição é
// fixa (o comprimento do osso): passa a ser a nova. No quadril o balanço (subir e descer ao andar,
// agachar) cresce na proporção das pernas.
export function adaptarTrilhas(clipe, { antigas, novas, razaoQuadril, hips }) {
  for (const t of clipe.tracks) {
    const [nome, prop] = t.name.split('.');
    if (prop !== 'position' || !novas.has(nome)) continue;
    const a = antigas.get(nome), n = novas.get(nome), k = nome === hips ? razaoQuadril : 1;
    for (let i = 0; i < t.values.length; i += 3) {
      t.values[i] = n.x + (t.values[i] - a.x) * k;
      t.values[i + 1] = n.y + (t.values[i + 1] - a.y) * k;
      t.values[i + 2] = n.z + (t.values[i + 2] - a.z) * k;
    }
  }
}

// ---------- cabelo que balança ----------
// Cada junta das cadeias de cabelo é uma partícula (Verlet) no mundo: tem inércia (fica para trás
// quando a Brisa corre ou vira, e balança depois), é puxada de volta à pose de repouso (a que a
// cabeça leva) por uma mola e cai um pouco com a gravidade. O comprimento de cada osso é mantido,
// e as partículas não entram no tronco (uma cápsula do quadril ao pescoço). No fim cada osso gira
// para apontar para a partícula seguinte. Roda depois da animação e dos ajustes de postura.
export function criarCabelo(cadeias, ossos, opcoes = {}) {
  const { mola = 0.12, amortecimento = 0.86, gravidade = 2.5, raioTronco = 0.155, anguloMax = 1.1 } = opcoes;
  const quadril = ossos[M('Hips')], pescoco = ossos[M('Neck')];
  const repouso = cadeias.map(c => c.ossos.map(b => b.quaternion.clone()));
  const pontos = c => [...c.ossos.slice(1), c.ponta];
  let estado = null;
  const v = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3(), d = new THREE.Vector3();
  const qMundo = new THREE.Quaternion(), qPai = new THREE.Quaternion(), giro = new THREE.Quaternion();

  function poseRepouso(ci) {
    cadeias[ci].ossos.forEach((o, k) => o.quaternion.copy(repouso[ci][k]));
    cadeias[ci].ossos[0].updateMatrixWorld(true);
    return pontos(cadeias[ci]).map(p => p.getWorldPosition(new THREE.Vector3()));
  }
  function foraDoTronco(p) {
    quadril.getWorldPosition(a); pescoco.getWorldPosition(b);
    d.subVectors(b, a);
    const t = THREE.MathUtils.clamp(v.subVectors(p, a).dot(d) / d.lengthSq(), 0, 1);
    const c = a.clone().addScaledVector(d, t), dist = p.distanceTo(c);
    if (dist < raioTronco && dist > 1e-6) p.sub(c).multiplyScalar(raioTronco / dist).add(c);
  }
  return {
    reiniciar() { estado = null; },
    atualizar(dt) {
      if (!(dt > 0)) return;
      const passo = Math.min(dt, 1 / 30) * 60; // mesma resposta em 30 ou 60 quadros por segundo
      const novo = !estado;
      if (novo) estado = cadeias.map(() => null);
      cadeias.forEach((cadeia, ci) => {
        const alvo = poseRepouso(ci);
        const raiz = cadeia.ossos[0].getWorldPosition(new THREE.Vector3());
        const comprimentos = alvo.map((p, k) => p.distanceTo(k ? alvo[k - 1] : raiz));
        let e = estado[ci];
        // primeira vez, ou um salto grande (teleporte, renascer): começa em repouso
        if (!e || e.atual[0].distanceTo(alvo[0]) > 1.5) e = estado[ci] = { atual: alvo.map(p => p.clone()), antes: alvo.map(p => p.clone()) };
        for (let k = 0; k < alvo.length; k++) {
          const p = e.atual[k], ant = e.antes[k];
          v.subVectors(p, ant).multiplyScalar(Math.pow(amortecimento, passo));
          ant.copy(p);
          p.add(v).addScaledVector(d.subVectors(alvo[k], p), 1 - Math.pow(1 - mola, passo));
          p.y -= gravidade * (dt * dt);
        }
        // comprimentos, ângulo máximo em relação ao repouso e o tronco
        let anterior = raiz, alvoAnterior = raiz;
        for (let k = 0; k < alvo.length; k++) {
          const p = e.atual[k];
          const dirRepouso = a.subVectors(alvo[k], alvoAnterior).normalize();
          const dir = b.subVectors(p, anterior).normalize();
          const ang = dir.angleTo(dirRepouso);
          if (ang > anguloMax) {
            const eixo = d.crossVectors(dirRepouso, dir).normalize();
            if (eixo.lengthSq() > 0) dir.copy(dirRepouso).applyAxisAngle(eixo, anguloMax);
          }
          p.copy(anterior).addScaledVector(dir, comprimentos[k]);
          foraDoTronco(p);
          p.sub(anterior).setLength(comprimentos[k]).add(anterior);
          anterior = p; alvoAnterior = alvo[k];
        }
        // ossos apontando para as partículas (do primeiro ao último)
        let base = raiz;
        cadeia.ossos.forEach((o, k) => {
          const pontaRepouso = pontos(cadeia)[k].getWorldPosition(a);
          const origem = o.getWorldPosition(b);
          giro.setFromUnitVectors(d.subVectors(pontaRepouso, origem).normalize(), v.subVectors(e.atual[k], base).normalize());
          o.getWorldQuaternion(qMundo).premultiply(giro);
          o.parent.getWorldQuaternion(qPai);
          o.quaternion.copy(qPai.invert().multiply(qMundo));
          o.updateMatrixWorld(true);
          base = e.atual[k];
        });
      });
    },
  };
}
