import * as THREE from 'three';

// Occlusion culling simples (na CPU): o que está atrás do relevo (o morro, uma falésia, uma casa)
// não é desenhado. Para cada objeto, raios da câmera até alguns pontos da esfera dele, contra a
// malha de colisão (BVH): se todos batem em alguma coisa antes de chegar na esfera, ele está
// escondido. Conservador de propósito:
//  - só conta obstáculo fora da esfera do objeto (o próprio tronco ou parede não o esconde);
//  - perto da câmera nunca esconde; fora do campo de visão não gasta raio (o frustum já cuida);
//  - os pontos testados ficam um pouco além da esfera (andar um pouco não revela nada de repente);
//  - fora do campo de visão o objeto volta a ser visível: ao virar a câmera ele já está lá, e só
//    some de novo se continuar escondido (sumir atrás do morro ninguém vê; aparecer do nada, sim);
//  - poucos objetos por quadro, em rodízio, e os escondidos são reconferidos mais vezes; o primeiro
//    raio livre encerra a conta.
// Na hora de assar a sombra fixa, tudo volta a aparecer (mostrarTudo / reaplicar).
// ?oclusao=0 desliga (para comparar).
const ligado = new URLSearchParams(location.search).get('oclusao') !== '0';

export function criarOclusao({ malha, porQuadro = 6, perto = 28 }) {
  const itens = [];
  const rc = new THREE.Raycaster(); rc.firstHitOnly = true; rc.layers.enableAll();
  const frustum = new THREE.Frustum(), m = new THREE.Matrix4();
  const dir = new THREE.Vector3(), ponto = new THREE.Vector3(), lado = new THREE.Vector3(), cima = new THREE.Vector3(0, 1, 0);
  let vez = 0, vezOcultos = 0;

  function adicionar(obj) {
    obj.updateWorldMatrix(true, true);
    const esfera = new THREE.Box3().setFromObject(obj).getBoundingSphere(new THREE.Sphere());
    if (esfera.radius > 0) itens.push({ obj, esfera, oculto: false });
  }

  // algum obstáculo entre a câmera e este ponto, antes de chegar na esfera do objeto?
  function bloqueado(origem, alvo, esfera) {
    dir.subVectors(alvo, origem);
    const d = dir.length();
    rc.set(origem, dir.divideScalar(d));
    rc.far = Math.max(0, origem.distanceTo(esfera.center) - esfera.radius);
    if (rc.far <= 0) return false;
    return rc.intersectObject(malha).length > 0;
  }
  function escondido(it, camera) {
    const c = it.esfera.center, r = it.esfera.radius * 1.15 + 2, o = camera.position;
    lado.subVectors(c, o).cross(cima).normalize().multiplyScalar(r * 0.75);
    const pontos = [
      ponto.copy(c).addScaledVector(cima, r * 0.75),
      c,
      ponto.clone().copy(c).add(lado),
      ponto.clone().copy(c).sub(lado),
      ponto.clone().copy(c).addScaledVector(cima, r * 0.35).add(lado.multiplyScalar(0.5)),
    ];
    for (const p of pontos) if (!bloqueado(o, p, it.esfera)) return false;
    return true;
  }

  function atualizar(camera) {
    if (!ligado || !itens.length) return;
    frustum.setFromProjectionMatrix(m.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    const conferir = it => {
      if (!frustum.intersectsSphere(it.esfera)) { it.oculto = false; it.obj.visible = true; return; }
      const longe = it.esfera.center.distanceTo(camera.position) > perto + it.esfera.radius;
      it.oculto = longe && escondido(it, camera);
      it.obj.visible = !it.oculto;
    };
    for (let k = 0; k < Math.min(porQuadro, itens.length); k++) conferir(itens[vez++ % itens.length]);
    // os escondidos de novo, mais depressa (são os que podem reaparecer)
    let n = 0;
    for (let k = 0; k < itens.length && n < 3; k++) { const it = itens[(vezOcultos++) % itens.length]; if (it.oculto) { conferir(it); n++; } }
  }

  return {
    adicionar, atualizar,
    mostrarTudo() { for (const it of itens) it.obj.visible = true; },
    reaplicar() { for (const it of itens) it.obj.visible = !it.oculto; },
    get ocultos() { return itens.filter(it => it.oculto).length; },
    get total() { return itens.length; },
  };
}
