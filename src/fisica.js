import * as THREE from 'three';

// Colisão da personagem (uma cápsula) contra a malha do mapa, usando a BVH do three-mesh-bvh.
// A cápsula é empurrada para fora de cada triângulo que atravessa (como no exemplo
// "characterMovement" da biblioteca); a direção do empurrão diz se é chão, parede ou teto.

export const RAIO = 0.32, ALTURA = 1.6;
const CHAO_MIN = 0.55;      // inclinação máxima andável ≈ 57°
const PASSO_MAX = 0.18;     // deslocamento máximo por verificação (evita atravessar o chão em quedas rápidas)
// Degraus: a cápsula sozinha só "sobe" quinas até ~13 cm (a parte de baixo é uma meia-esfera de
// 32 cm; numa quina mais alta o contato fica de lado e vira parede). Um degrau, a beira de uma
// plataforma ou o primeiro degrau de uma escada parava a personagem na hora. Andando no chão e
// batendo numa parede, ela tenta subir: levanta até DEGRAU, anda o mesmo tanto e desce até
// encontrar chão andável. Só vale se avançou e o chão de cima é plano o bastante.
export const DEGRAU = 0.36;

const seg = new THREE.Line3(), caixa = new THREE.Box3();
const pTri = new THREE.Vector3(), pSeg = new THREE.Vector3(), dir = new THREE.Vector3(), meio = new THREE.Vector3();
const parede = new THREE.Vector3(), normalChao = new THREE.Vector3(), centroTri = new THREE.Vector3();
const rc = new THREE.Raycaster(), origem = new THREE.Vector3(), baixo = new THREE.Vector3(0, -1, 0);
rc.firstHitOnly = true;
rc.layers.enableAll(); // a malha de colisão fica numa camada própria (não é desenhada)

// Devolve false se não conseguiu tirar a cápsula de dentro de tudo (numa fenda mais estreita que
// ela, as paredes empurram uma contra a outra): quem chama desfaz o passo.
function empurrar(mapa, pos, vel, res) {
  seg.start.set(pos.x, pos.y + RAIO, pos.z);
  seg.end.set(pos.x, pos.y + ALTURA - RAIO, pos.z);
  parede.set(0, 0, 0);
  let resolveu = false;
  for (let iter = 0; iter < 6; iter++) {
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
    if (!mexeu) { resolveu = true; break; }
  }
  pos.set(seg.start.x, seg.start.y - RAIO, seg.start.z);
  // tira da velocidade a parte que entra em paredes e rampas íngremes (assim ela desliza)
  if (parede.lengthSq() > 1e-12) {
    parede.normalize();
    const entra = vel.dot(parede);
    if (entra < 0) { vel.addScaledVector(parede, -entra); registrarBatida(res, -entra, parede); }
  }
  return resolveu;
}

// subida de degrau a partir de "de", com a velocidade horizontal "v" por "dt". Se der certo,
// escreve a posição final em "saida" e devolve true. A cápsula termina com o centro em cima do
// degrau (avançando até 0,8 do raio além do passo normal, um "pé" sobre a quina): parando só na
// beira ela ficaria sem apoio e cairia de volta no quadro seguinte (sobe-desce). Se do outro lado
// da quina não há espaço (a base de uma casa colada na parede), não sobe.
const _resDegrau = { noChao: false, teto: false, batida: 0, normalBatida: new THREE.Vector3() };
const _alto = new THREE.Vector3(), _antes = new THREE.Vector3();
function limparResDegrau() { _resDegrau.teto = false; _resDegrau.noChao = false; _resDegrau.batida = 0; }
function subirDegrau(mapa, de, v, dt, saida) {
  const dx = v.x * dt, dz = v.z * dt, quer = Math.hypot(dx, dz);
  if (quer < 1e-4) return false;
  const ux = dx / quer, uz = dz / quer;
  // a altura de cima tem de estar livre (sem teto nem parede logo acima)
  _alto.set(de.x, de.y + DEGRAU, de.z);
  tVel.set(v.x, 0, v.z);
  _antes.copy(_alto);
  empurrar(mapa, _alto, tVel, _resDegrau);
  const livre = !_resDegrau.teto && _alto.distanceTo(_antes) < 0.03;
  limparResDegrau();
  if (!livre) return false;
  rc.far = DEGRAU + 0.15;
  try {
    for (const a of [quer, quer + RAIO * 0.4, quer + RAIO * 0.8]) {
      tPos.set(_alto.x + ux * a, _alto.y, _alto.z + uz * a);
      rc.set(origem.set(tPos.x, tPos.y + 0.05, tPos.z), baixo);
      const h = rc.intersectObject(mapa.malha)[0];
      if (!h || h.face.normal.y < CHAO_MIN) continue;
      const sobe = h.point.y - de.y;
      if (sobe < 0.02 || sobe > DEGRAU) continue; // o centro ainda está sobre o chão de baixo
      // o caminho por cima até lá está livre?
      _antes.copy(tPos);
      empurrar(mapa, tPos, tVel, _resDegrau);
      const passa = !_resDegrau.teto && tPos.distanceTo(_antes) < 0.03;
      limparResDegrau();
      if (!passa) return false;
      // apoiada no degrau, sem estar dentro de nada
      tPos.copy(_antes).setY(h.point.y);
      _antes.copy(tPos);
      empurrar(mapa, tPos, tVel, _resDegrau);
      limparResDegrau();
      if (tPos.distanceTo(_antes) > 0.03) return false;
      saida.copy(tPos);
      return true;
    }
    return false;
  } finally { rc.far = Infinity; }
}

// ainda há algum triângulo a mais de 2 cm dentro da cápsula?
function presaNaFenda(mapa, pos) {
  seg.start.set(pos.x, pos.y + RAIO, pos.z);
  seg.end.set(pos.x, pos.y + ALTURA - RAIO, pos.z);
  caixa.makeEmpty().expandByPoint(seg.start).expandByPoint(seg.end);
  caixa.min.addScalar(-RAIO); caixa.max.addScalar(RAIO);
  return !!mapa.geo.boundsTree.shapecast({
    intersectsBounds: b => b.intersectsBox(caixa),
    intersectsTriangle: tri => tri.closestPointToSegment(seg, pTri, pSeg) < RAIO - 0.02,
  });
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
const posAntes = new THREE.Vector3(), velAntes = new THREE.Vector3(), tPos = new THREE.Vector3(), tVel = new THREE.Vector3();
export function moverComColisao(mapa, pos, vel, dt, grudar) {
  const res = { noChao: false, teto: false, normal: normalChao.set(0, 1, 0), apoio: null, batida: 0, normalBatida: normalBatida.set(0, 0, 0), degrau: 0 };
  const vyAntesTeto = vel.y;
  const passos = Math.max(1, Math.ceil((vel.length() * dt) / PASSO_MAX));
  for (let i = 0; i < passos; i++) {
    const yAntes = pos.y;
    posAntes.copy(pos); velAntes.copy(vel);
    const batidaAntes = res.batida;
    pos.addScaledVector(vel, dt / passos);
    parede.set(0, 0, 0);
    if (!empurrar(mapa, pos, vel, res) && presaNaFenda(mapa, pos)) {
      // não saiu de dentro: o passo é desfeito (antes ela entrava até 23 cm entre duas pedras).
      // A velocidade que ia para lá some; se a posição de antes também não é livre (algo se mexeu),
      // fica com o melhor que o empurrão conseguiu
      tPos.copy(pos); pos.copy(posAntes);
      if (presaNaFenda(mapa, pos)) pos.copy(tPos); else { vel.x = 0; vel.z = 0; if (vel.y < 0) vel.y = 0; }
    }
    // bateu numa parede andando no chão: tenta subir como degrau
    if (grudar && parede.lengthSq() > 1e-12 && subirDegrau(mapa, posAntes, velAntes, dt / passos, pos)) {
      vel.x = velAntes.x; vel.z = velAntes.z; res.noChao = true; res.degrau = pos.y - posAntes.y;
      res.batida = batidaAntes; // subir um degrau não é bater
    }
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
    // (o raio só olha o meio da cápsula: descendo para o chão lá embaixo ela podia se encaixar
    // dentro de uma pedra ou quina do lado; se a posição colada não é livre, não cola)
    if (h && h.face.normal.y > CHAO_MIN) {
      tPos.copy(pos);
      pos.y = h.point.y;
      empurrar(mapa, pos, vel, res); // encostada numa quina: sai dela (de lado ou subindo)
      if (presaNaFenda(mapa, pos)) pos.copy(tPos);
      else { res.noChao = true; vel.y = 0; normalChao.copy(h.face.normal); }
    }
  }
  return res;
}
