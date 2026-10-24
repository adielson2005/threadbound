import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Static batching: the pieces of a prop that never move relative to it (table legs, spools, pillar
// parts, crystal clusters…) are merged into one mesh per material. Each prop then costs one draw
// call per material instead of one per piece. The group itself keeps its transform, so a prop that
// moves as a whole (a floating rock) still moves. Visually identical: same geometry, same materials.
//
// excluir: meshes that animate on their own or get toggled (rings, gems, threads) stay separate.
// Merged meshes keep castShadow / receiveShadow / layers / userData.solido of their sources, so
// the baked shadow and the collision mesh (colisao.js) see exactly the same triangles.

const ATRIBUTOS = ['position', 'normal', 'uv'];

export function fundirEstaticos(grupo, excluir = []) {
  const fora = new Set(excluir);
  grupo.updateMatrixWorld(true);
  const inversa = grupo.matrixWorld.clone().invert();
  const lotes = new Map();
  grupo.traverse(m => {
    if (!m.isMesh || m.isInstancedMesh || m.isSkinnedMesh || fora.has(m)) return;
    for (let p = m; p && p !== grupo; p = p.parent) if (fora.has(p) || !p.visible) return;
    if (Array.isArray(m.material)) return;
    const chave = `${m.material.uuid}|${m.castShadow}|${m.receiveShadow}|${m.layers.mask}|${!!m.userData.solido}|${m.renderOrder}`;
    if (!lotes.has(chave)) lotes.set(chave, []);
    lotes.get(chave).push(m);
  });

  let fundidas = 0;
  for (const malhas of lotes.values()) {
    if (malhas.length < 2) continue;
    const geos = malhas.map(m => {
      let g = m.geometry.clone();
      for (const nome of Object.keys(g.attributes)) if (!ATRIBUTOS.includes(nome)) g.deleteAttribute(nome);
      g = g.index ? g.toNonIndexed() : g;
      g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inversa, m.matrixWorld));
      // a negative scale flips the winding: rebuild the normals from the transformed triangles
      if (m.matrixWorld.determinant() < 0) g.computeVertexNormals();
      return g;
    });
    // all sources must share the same attribute set to be merged
    const nomes = Object.keys(geos[0].attributes).sort().join();
    if (!geos.every(g => Object.keys(g.attributes).sort().join() === nomes)) { geos.forEach(g => g.dispose()); continue; }
    const geo = mergeGeometries(geos);
    geos.forEach(g => g.dispose());
    if (!geo) continue;
    const m0 = malhas[0];
    const lote = new THREE.Mesh(geo, m0.material);
    lote.name = 'lote';
    lote.castShadow = m0.castShadow; lote.receiveShadow = m0.receiveShadow;
    lote.layers.mask = m0.layers.mask; lote.renderOrder = m0.renderOrder;
    lote.userData.solido = m0.userData.solido;
    for (const m of malhas) m.parent.remove(m);
    grupo.add(lote);
    fundidas += malhas.length;
  }
  return fundidas;
}
