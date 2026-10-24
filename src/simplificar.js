import * as THREE from 'three';
import { MeshoptSimplifier } from 'meshoptimizer/simplifier';

// Índices simplificados (meshoptimizer) que continuam apontando para os mesmos vértices,
// mantendo bordas e costuras de UV no lugar para não abrir buracos.
export async function simplificarIndices(geo, proporcao, erro = 0.002) {
  await MeshoptSimplifier.ready;
  const pos = geo.attributes.position;
  const posicoes = pos.array instanceof Float32Array ? pos.array : new Float32Array(pos.array);
  const indices = new Uint32Array(geo.index.array);
  const alvo = Math.floor((indices.length * proporcao) / 3) * 3;
  const [novos] = MeshoptSimplifier.simplify(indices, posicoes, 3, alvo, erro, ['LockBorder']);
  return novos;
}

// Geometria nova, simplificada e só com os vértices ainda usados (atributos como uv e pesos ficam iguais).
export async function simplificar(geo, proporcao, erro = 0.002) {
  const novos = await simplificarIndices(geo, proporcao, erro);
  const pos = geo.attributes.position;
  const mapa = new Int32Array(pos.count).fill(-1);
  let n = 0;
  for (let i = 0; i < novos.length; i++) if (mapa[novos[i]] < 0) mapa[novos[i]] = n++;
  const saida = new THREE.BufferGeometry();
  for (const [nome, attr] of Object.entries(geo.attributes)) {
    const tam = attr.itemSize, arr = new attr.array.constructor(n * tam);
    for (let v = 0; v < pos.count; v++) {
      const d = mapa[v];
      if (d >= 0) for (let k = 0; k < tam; k++) arr[d * tam + k] = attr.array[v * tam + k];
    }
    saida.setAttribute(nome, new THREE.BufferAttribute(arr, tam, attr.normalized));
  }
  const ind = new Uint32Array(novos.length);
  for (let i = 0; i < novos.length; i++) ind[i] = mapa[novos[i]];
  saida.setIndex(new THREE.BufferAttribute(ind, 1));
  return saida;
}
