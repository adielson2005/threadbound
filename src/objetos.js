import * as THREE from 'three';

// Física dos objetos soltos (galho, agulha): cada um é um corpo rígido comprido, feito de três
// pontos (as duas pontas e o meio) presos uns aos outros à mesma distância, integrados por Verlet
// (dinâmica por posições). Cada ponto é uma esfera pequena contra a malha de colisão do mapa (BVH):
// ao tocar o chão é empurrado para fora, perde parte da velocidade de quique (restituição) e
// escorrega com atrito. Assim o objeto cai, quica um pouco, tomba, rola na encosta e para deitado
// acompanhando o chão, como um graveto de verdade. Parado por um instante, "dorme" (não gasta nada)
// e acorda quando algo o empurra: a Brisa passando por cima, um golpe perto, ou ao ser solto.
// Antes: o objeto aparecia direto no chão, sempre na horizontal (mesmo no morro) e flutuando 6 cm
// acima dele, balançando.

const G = -18;              // gravidade dos objetos (m/s²; o pulo da Brisa usa -32, mais "de jogo")
const RESTITUICAO = 0.25;   // quanto da velocidade contra o chão volta em quique
const ATRITO = 0.55;        // quanto da velocidade ao longo do chão some a cada toque (por quadro a 60 Hz)
const SUBPASSOS = 3;
// atrito estático: abaixo desta velocidade, num chão até ~35° de inclinação, o objeto fica parado
const ESTATICO_VEL = 0.6, ESTATICO_NY = Math.cos(35 * Math.PI / 180);
const DORMIR_VEL = 0.06, DORMIR_TEMPO = 0.6;

const _t = {}, _d = new THREE.Vector3(), _v = new THREE.Vector3(), _n = new THREE.Vector3(), _c = new THREE.Vector3();
const _q = new THREE.Quaternion(), _eixo = new THREE.Vector3(), _cima = new THREE.Vector3(0, 1, 0), _lado = new THREE.Vector3();

// pontas no espaço do objeto (ao longo de +Y, pegada na origem) e o raio de colisão
export function criarCorpo(grupo, y0, y1, raio = 0.045) {
  const locais = [new THREE.Vector3(0, y0, 0), new THREE.Vector3(0, (y0 + y1) / 2, 0), new THREE.Vector3(0, y1, 0)];
  grupo.updateMatrixWorld(true);
  const pts = locais.map(p => p.clone().applyMatrix4(grupo.matrixWorld));
  return {
    locais, pts, antes: pts.map(p => p.clone()), raio, comp: y1 - y0, dormindo: false, parado: 0,
    // giro em volta do próprio eixo (rolar): o graveto gira ao rolar morro abaixo
    giro: 0, ultimoMeio: pts[1].clone(),
  };
}

// recoloca o corpo onde o grupo está agora, com uma velocidade inicial (m/s) e um giro
export function lancar(corpo, grupo, vel, dt = 1 / 60, giroAng = new THREE.Vector3()) {
  grupo.updateMatrixWorld(true);
  corpo.locais.forEach((l, k) => {
    corpo.pts[k].copy(l).applyMatrix4(grupo.matrixWorld);
    // velocidade de rotação: v = ω × r (r a partir do meio)
    _d.copy(l).sub(corpo.locais[1]).applyQuaternion(grupo.getWorldQuaternion(_q));
    _v.crossVectors(giroAng, _d).add(vel);
    corpo.antes[k].copy(corpo.pts[k]).addScaledVector(_v, -dt);
  });
  corpo.dormindo = false; corpo.parado = 0;
  corpo.ultimoMeio.copy(corpo.pts[1]);
}

// empurra para fora da malha (esfera de raio r no ponto p); devolve a normal do contato ou null
function contato(bvh, p, r) {
  const h = bvh.closestPointToPoint(p, _t, 0, r);
  if (!h) return null;
  _n.subVectors(p, h.point);
  const d = _n.length();
  if (d < 1e-6) _n.set(0, 1, 0); else _n.divideScalar(d);
  p.copy(h.point).addScaledVector(_n, r);
  return _n;
}

// um passo de física. empurradores: [{ inicio, fim, raio, vel }] (cápsulas verticais que movem os
// objetos ao encostar: a Brisa). Devolve true se o objeto se mexeu.
export function passo(corpo, bvh, dt, empurradores = []) {
  if (corpo.dormindo) {
    // acorda se alguém encostar
    if (!empurradores.some(e => tocaCapsula(corpo, e))) return false;
    corpo.dormindo = false; corpo.parado = 0;
  }
  const h = dt / SUBPASSOS;
  const amort = Math.pow(0.995, 60 * h); // um pouco de resistência do ar
  let tocouChao = false;
  for (let s = 0; s < SUBPASSOS; s++) {
    // Verlet
    for (let k = 0; k < 3; k++) {
      const p = corpo.pts[k], a = corpo.antes[k];
      _v.subVectors(p, a).multiplyScalar(amort);
      a.copy(p);
      p.add(_v); p.y += G * h * h;
    }
    // cápsulas que empurram (a Brisa): o ponto sai de dentro e ganha a velocidade dela
    for (const e of empurradores) for (let k = 0; k < 3; k++) {
      const p = corpo.pts[k];
      const t = THREE.MathUtils.clamp((p.y - e.inicio.y) / Math.max(1e-6, e.fim.y - e.inicio.y), 0, 1);
      _c.lerpVectors(e.inicio, e.fim, t);
      _d.subVectors(p, _c); _d.y = 0;
      const dist = _d.length(), lim = e.raio + corpo.raio;
      if (dist >= lim || p.y < e.inicio.y - e.raio || p.y > e.fim.y + e.raio) continue;
      if (dist < 1e-5) _d.set(1, 0, 0); else _d.divideScalar(dist);
      p.addScaledVector(_d, lim - dist);
      // chute: o ponto passa a andar com a velocidade horizontal dela, um pouco para cima
      corpo.antes[k].copy(p).addScaledVector(_v.set(e.vel.x, Math.max(0.6, Math.hypot(e.vel.x, e.vel.z) * 0.25), e.vel.z), -h * 0.6);
    }
    // corpo rígido: as três distâncias fixas (meio no meio das pontas)
    for (let it = 0; it < 2; it++) {
      restringir(corpo.pts[0], corpo.pts[2], corpo.comp);
      restringir(corpo.pts[0], corpo.pts[1], corpo.comp / 2);
      restringir(corpo.pts[1], corpo.pts[2], corpo.comp / 2);
    }
    // chão e paredes: empurra, quique e atrito
    for (let k = 0; k < 3; k++) {
      const p = corpo.pts[k], a = corpo.antes[k];
      const n = contato(bvh, p, corpo.raio);
      if (!n) continue;
      if (n.y > 0.5) tocouChao = true;
      _v.subVectors(p, a); // velocidade (por subpasso), já depois do empurrão
      const vn = _v.dot(n);
      const normal = _d.copy(n).multiplyScalar(vn), tangente = _v.sub(normal);
      // contra o chão: devolve só um pouco (quique); ao longo dele: atrito
      if (vn < 0) normal.multiplyScalar(-RESTITUICAO);
      // atrito estático: devagar num chão não muito inclinado, o objeto para de vez (sem ele um
      // graveto escorregava para sempre num declive de 20°, como no gelo)
      if (n.y > ESTATICO_NY && tangente.length() / h < ESTATICO_VEL) tangente.set(0, 0, 0);
      else tangente.multiplyScalar(1 - ATRITO * (h * 60));
      a.copy(p).sub(normal.add(tangente));
    }
  }
  // rolar: girar em volta do eixo o quanto o meio andou de lado (sem escorregar)
  _eixo.subVectors(corpo.pts[2], corpo.pts[0]).normalize();
  _d.subVectors(corpo.pts[1], corpo.ultimoMeio);
  const lateral = _d.addScaledVector(_eixo, -_d.dot(_eixo));
  if (tocouChao) corpo.giro += lateral.length() / Math.max(0.01, corpo.raio) * Math.sign(_lado.crossVectors(_eixo, _cima).dot(lateral) || 1) * 0.5;
  corpo.ultimoMeio.copy(corpo.pts[1]);
  // dormir quando quase parado no chão
  const vel = corpo.pts.reduce((m, p, k) => Math.max(m, p.distanceTo(corpo.antes[k])), 0) / h;
  corpo.parado = tocouChao && vel < DORMIR_VEL ? corpo.parado + dt : 0;
  if (corpo.parado > DORMIR_TEMPO) { corpo.dormindo = true; corpo.antes.forEach((a, k) => a.copy(corpo.pts[k])); }
  return true;
}

function restringir(a, b, L) {
  _d.subVectors(b, a);
  const d = _d.length();
  if (d < 1e-6) return;
  _d.multiplyScalar((d - L) / d * 0.5);
  a.add(_d); b.sub(_d);
}

function tocaCapsula(corpo, e) {
  return corpo.pts.some(p => {
    const t = THREE.MathUtils.clamp((p.y - e.inicio.y) / Math.max(1e-6, e.fim.y - e.inicio.y), 0, 1);
    _c.lerpVectors(e.inicio, e.fim, t);
    return Math.hypot(p.x - _c.x, p.z - _c.z) < e.raio + corpo.raio && p.y > e.inicio.y - e.raio && p.y < e.fim.y + e.raio;
  });
}

// põe o grupo na posição e direção do corpo (o eixo +Y do objeto vai de uma ponta à outra)
export function aplicar(corpo, grupo) {
  _eixo.subVectors(corpo.pts[2], corpo.pts[0]).normalize();
  _q.setFromUnitVectors(_cima, _eixo);
  grupo.quaternion.copy(_q).multiply(new THREE.Quaternion().setFromAxisAngle(_cima, corpo.giro));
  // a origem do grupo (a pegada) fica a -y0 da ponta de baixo, ao longo do eixo
  grupo.position.copy(corpo.pts[0]).addScaledVector(_eixo, -corpo.locais[0].y);
}

// empurrão de um golpe: o objeto ganha velocidade vel (m/s) e um giro
export function empurrar(corpo, vel, dt = 1 / 60) {
  corpo.dormindo = false; corpo.parado = 0;
  for (let k = 0; k < 3; k++) {
    const fator = k === 1 ? 1 : 0.7 + Math.random() * 0.6; // pontas diferentes: o objeto gira
    corpo.antes[k].copy(corpo.pts[k]).addScaledVector(vel, -dt * fator);
  }
}
