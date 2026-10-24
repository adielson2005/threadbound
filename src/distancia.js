import * as THREE from 'three';

// Draw-distance streaming for small props (like open-world games do): an object is only drawn
// while it is within "alcance" of the camera. Each item may also have its own game rule
// (picked up, broken, hidden until the ending…): the object is visible only if both agree, so
// this never shows something the game logic hid. Checked a few times per second, not every frame.

export function criarDistancia() {
  const itens = [];
  let alcance = 60, espera = 0;
  const centro = new THREE.Vector3();

  // obj: Object3D; raio: its size (big things stay visible from farther); regra: () => boolean
  function adicionar(obj, raio = 1, regra = null) {
    if (obj) itens.push({ obj, raio, regra });
  }

  function atualizar(dt, camera, forcar = false) {
    espera -= dt;
    if (espera > 0 && !forcar) return;
    espera = 0.15;
    for (const it of itens) {
      const permitido = it.regra ? it.regra() : true;
      if (!permitido) { it.obj.visible = false; continue; }
      it.obj.getWorldPosition(centro);
      const lim = alcance + it.raio;
      it.obj.visible = centro.distanceToSquared(camera.position) < lim * lim;
    }
  }

  return {
    adicionar, atualizar,
    definirAlcance(m) { alcance = m; espera = 0; },
    get quantidade() { return itens.length; },
  };
}
