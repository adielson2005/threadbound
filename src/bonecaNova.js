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

export const querBonecaNova = () => !['antiga', 'costurada'].includes(new URLSearchParams(location.search).get('boneca'));

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

// Troca a malha antiga pela nova no FBX (ainda na origem, sem pai). Devolve as posições locais dos
// ossos antes e depois do ajuste e a razão entre as alturas do quadril.
export function vestirBonecaNova(fbx, malhaAntiga, { info, geo }) {
  fbx.updateMatrixWorld(true);
  const ossos = [];
  fbx.traverse(b => { if (b.isBone) ossos.push(b); });
  const antigas = new Map(ossos.map(b => [b.name, b.position.clone()]));
  const mundoAntigo = new Map(ossos.map(b => [b.name, b.getWorldPosition(new THREE.Vector3())]));
  const giroAntigo = new Map(ossos.map(b => [b.name, b.getWorldQuaternion(new THREE.Quaternion())]));
  const juntas = new Map(Object.entries(info.juntas).map(([k, v]) => [k, new THREE.Vector3(...v)]));
  const caixaAntiga = new THREE.Box3().setFromObject(fbx);

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

  const porNome = new Map(ossos.map(b => [b.name, b]));
  const esqueleto = new THREE.Skeleton(info.ossos.map(nome => porNome.get(nome)));
  const malha = new THREE.SkinnedMesh(geo, malhaAntiga.material);
  malha.name = 'boneca_nova';
  fbx.add(malha);
  malha.updateMatrixWorld(true);
  malha.bind(esqueleto, malha.matrixWorld);
  malhaAntiga.parent.remove(malhaAntiga);
  malhaAntiga.geometry.dispose();

  const hips = porNome.get(M('Hips'));
  const caixaNova = new THREE.Box3().setFromObject(fbx);
  const razaoQuadril = (hips.getWorldPosition(new THREE.Vector3()).y - caixaNova.min.y) / (mundoAntigo.get(hips.name).y - caixaAntiga.min.y);
  const novas = new Map(ossos.map(b => [b.name, b.position.clone()]));
  return { malha, antigas, novas, razaoQuadril, hips: hips.name };
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
