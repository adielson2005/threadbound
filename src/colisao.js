import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';

// Colisão real dos objetos do mapa: os triângulos de cada objeto estático (oficina, âncoras,
// Coração do Fio, ruínas, cachoeiras das ilhas…) são somados à malha de colisão do terreno e a
// BVH é refeita. Assim tudo que usa a malha do mapa — a cápsula da personagem, o pouso, os pés,
// a câmera, a sombra-mancha e os inimigos — passa a enxergar a forma exata de cada objeto
// (pernas da mesa, carretéis, degraus do pedestal), sem colisores aproximados.
// Objetos que se mexem ou quebram (rochas flutuantes, cristais) continuam como cilindros em
// mapa.extras.

export function incorporarSolidos(mapa, malhas) {
  const geoMapa = mapa.geo;
  const posMapa = geoMapa.attributes.position, indMapa = geoMapa.index;
  let nV = posMapa.count, nI = indMapa.count;
  const partes = [];
  const v = new THREE.Vector3();
  for (const m of malhas) {
    const g = m.geometry, pos = g.attributes.position;
    if (!pos) continue;
    m.updateWorldMatrix(true, false);
    const p = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
      p[i * 3] = v.x; p[i * 3 + 1] = v.y; p[i * 3 + 2] = v.z;
    }
    const ind = g.index ? g.index.array : Uint32Array.from({ length: pos.count }, (_, i) => i);
    partes.push({ p, ind, base: nV });
    nV += pos.count; nI += ind.length;
  }
  if (!partes.length) return 0;

  const posicoes = new Float32Array(nV * 3);
  for (let i = 0; i < posMapa.count; i++) {
    posicoes[i * 3] = posMapa.getX(i); posicoes[i * 3 + 1] = posMapa.getY(i); posicoes[i * 3 + 2] = posMapa.getZ(i);
  }
  const indices = new Uint32Array(nI);
  indices.set(indMapa.array);
  let o = indMapa.count;
  for (const { p, ind, base } of partes) {
    posicoes.set(p, base * 3);
    for (let i = 0; i < ind.length; i++) indices[o + i] = ind[i] + base;
    o += ind.length;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(posicoes, 3));
  geo.setIndex(new THREE.BufferAttribute(indices, 1));
  // os limites continuam os do terreno (mar, nuvens e sombra são posicionados por eles)
  geo.boundingBox = geoMapa.boundingBox.clone();
  geo.boundingSphere = geo.boundingBox.getBoundingSphere(new THREE.Sphere());
  geo.boundsTree = new MeshBVH(geo);

  mapa.geo = geo;
  mapa.malha.geometry = geo;
  geoMapa.boundsTree = null; // a antiga (só do terreno) não é mais usada
  return partes.length;
}
