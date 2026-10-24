import * as THREE from 'three';

// Colisão da personagem (uma cápsula) contra a malha do mapa, usando a BVH do three-mesh-bvh.
// A cápsula é empurrada para fora de cada triângulo que atravessa (como no exemplo
// "characterMovement" da biblioteca); a direção do empurrão diz se é chão, parede ou teto.

export const RAIO = 0.32, ALTURA = 1.6;
const CHAO_MIN = 0.55;      // inclinação máxima andável ≈ 57°
const PASSO_MAX = 0.18;     // deslocamento máximo por verificação (evita atravessar o chão em quedas rápidas)

const seg = new THREE.Line3(), caixa = new THREE.Box3();
const pTri = new THREE.Vector3(), pSeg = new THREE.Vector3(), dir = new THREE.Vector3(), meio = new THREE.Vector3();
const parede = new THREE.Vector3(), normalChao = new THREE.Vector3(), centroTri = new THREE.Vector3();
const rc = new THREE.Raycaster(), origem = new THREE.Vector3(), baixo = new THREE.Vector3(0, -1, 0);
rc.firstHitOnly = true;
rc.layers.enableAll(); // a malha de colisão fica numa camada própria (não é desenhada)

function empurrar(mapa, pos, vel, res) {
  seg.start.set(pos.x, pos.y + RAIO, pos.z);
  seg.end.set(pos.x, pos.y + ALTURA - RAIO, pos.z);
  parede.set(0, 0, 0);
  for (let iter = 0; iter < 3; iter++) {
    caixa.makeEmpty().expandByPoint(seg.start).expandByPoint(seg.end);
    caixa.min.addScalar(-RAIO); caixa.max.addScalar(RAIO);
    let mexeu = false;
    mapa.geo.boundsTree.shapecast({
      intersectsBounds: b => b.intersectsBox(caixa),
      intersectsTriangle: tri => {
        const d = tri.closestPointToSegment(seg, pTri, pSeg);
        if (d >= RAIO) return;
        dir.subVectors(pSeg, pTri);
        if (dir.lengthSq() < 1e-12) {
          // a cápsula cruza o triângulo: usa a normal virada para o lado da cápsula
          tri.getNormal(dir);
          tri.getMidpoint(centroTri);
          seg.getCenter(meio);
          if (dir.dot(meio.sub(centroTri)) < 0) dir.negate();
        } else dir.normalize();
        const prof = RAIO - d;
        if (dir.y > CHAO_MIN) {
          // chão andável: sobe na vertical (empurrar pela normal faria escorregar nas rampas)
          res.noChao = true; normalChao.copy(dir);
          const sobe = prof / dir.y;
          seg.start.y += sobe; seg.end.y += sobe;
        } else {
          if (dir.y < -0.5) res.teto = true;
          seg.start.addScaledVector(dir, prof); seg.end.addScaledVector(dir, prof);
          parede.addScaledVector(dir, prof);
        }
        mexeu = true;
      },
    });
    if (!mexeu) break;
  }
  pos.set(seg.start.x, seg.start.y - RAIO, seg.start.z);
  // tira da velocidade a parte que entra em paredes e rampas íngremes (assim ela desliza)
  if (parede.lengthSq() > 1e-12) {
    parede.normalize();
    const entra = vel.dot(parede);
    if (entra < 0) { vel.addScaledVector(parede, -entra); registrarBatida(res, -entra, parede); }
  }
}

// a batida mais forte do quadro (velocidade que entrou na parede, m/s) e a direção dela
function registrarBatida(res, forca, normal) {
  if (forca > res.batida) { res.batida = forca; res.normalBatida.copy(normal); }
}

// Extra colliders for things that move or break (floating rocks, Void crystals): vertical
// cylinders { x, z, raio, base, topo, solido? }. Their sides block and their top can be stood on
// (res.apoio). Static props collide through the map mesh itself (colisao.js).
const lateral = new THREE.Vector3();
function colidirExtras(extras, pos, vel, res, yAntes) {
  for (const c of extras) {
    if (c.solido === false) continue; // e.g. a crystal that was broken
    const dx = pos.x - c.x, dz = pos.z - c.z, d = Math.hypot(dx, dz), lim = c.raio + RAIO;
    // small tolerance above the top: a bobbing rock dips a few mm per frame and would otherwise
    // drop the player into "airborne" for one frame (fall animation flicker)
    const folga = vel.y <= 0 && d < c.raio + RAIO * 0.6 ? 0.06 : 0;
    if (d >= lim || pos.y >= c.topo + folga || pos.y + ALTURA <= c.base) continue;
    if (yAntes >= c.topo - 0.3 && vel.y <= 0.5 && d < c.raio + RAIO * 0.6) {
      // landing on top
      pos.y = c.topo; if (vel.y < 0) vel.y = 0;
      res.noChao = true; res.apoio = c; normalChao.set(0, 1, 0);
    } else {
      // pushed out sideways
      const nx = d > 1e-5 ? dx / d : 1, nz = d > 1e-5 ? dz / d : 0;
      pos.x = c.x + nx * lim; pos.z = c.z + nz * lim;
      const entra = vel.x * nx + vel.z * nz;
      if (entra < 0) { vel.x -= nx * entra; vel.z -= nz * entra; registrarBatida(res, -entra, lateral.set(nx, 0, nz)); }
    }
  }
}

// Move a personagem por vel·dt resolvendo colisões.
// Devolve { noChao, normal, apoio, teto, batida (m/s perdidos contra paredes), normalBatida }.
// grudar: estava no chão há pouco e não pulou — ao descer rampas, continua presa ao chão.
const normalBatida = new THREE.Vector3();
export function moverComColisao(mapa, pos, vel, dt, grudar) {
  const res = { noChao: false, teto: false, normal: normalChao.set(0, 1, 0), apoio: null, batida: 0, normalBatida: normalBatida.set(0, 0, 0) };
  const vyAntesTeto = vel.y;
  const passos = Math.max(1, Math.ceil((vel.length() * dt) / PASSO_MAX));
  for (let i = 0; i < passos; i++) {
    const yAntes = pos.y;
    pos.addScaledVector(vel, dt / passos);
    empurrar(mapa, pos, vel, res);
    if (mapa.extras?.length) colidirExtras(mapa.extras, pos, vel, res, yAntes);
  }
  if (res.noChao && vel.y < 0) vel.y = 0;
  // bater a cabeça no teto também é um impacto (subindo rápido contra a parte de baixo de algo)
  if (res.teto && vel.y > 0) { registrarBatida(res, Math.max(vel.y, vyAntesTeto), lateral.set(0, -1, 0)); vel.y = 0; }

  if (!res.noChao && grudar && vel.y <= 0) {
    const alcance = 0.3 + Math.hypot(vel.x, vel.z) * dt * 2;
    rc.set(origem.set(pos.x, pos.y + 0.3, pos.z), baixo);
    rc.far = 0.3 + alcance;
    const h = rc.intersectObject(mapa.malha)[0];
    rc.far = Infinity;
    if (h && h.face.normal.y > CHAO_MIN) { pos.y = h.point.y; res.noChao = true; vel.y = 0; normalChao.copy(h.face.normal); }
  }
  return res;
}
