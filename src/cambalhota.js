import * as THREE from 'three';

// Pose da cambalhota feita em código (o pacote de animações não tem flip).
// Fases, pelo progresso p do giro (0..1):
//   impulso  – pernas estendem e empurram, pontas dos pés esticadas, braços sobem
//   grupado  – "bola": bacia encaixada, coxas no peito, joelhos bem dobrados, costas e cabeça enroladas
//   abertura – pernas e tronco se abrem para cair, e a animação de queda assume
//
// Ângulos em radianos, positivos no sentido "natural" de cada articulação:
//   quadril/braco: levar para a frente · joelho/cotovelo: dobrar · pe: esticar a ponta
//   coluna/cabeca: curvar para a frente · bacia: encaixar o quadril para baixo/frente
//   (a bacia leva a saia junto, fechando o corpo numa "bola")
const GRUPADO = { bacia: 0.75, quadril: 2.0, joelho: 2.75, pe: 0.5, coluna: 1.6, braco: 0.25, cotovelo: 1.5, cabeca: 0.6 };
const CHAVES = [
  [0.00, { bacia: 0, quadril: 0.5, joelho: 0.9, pe: 0.0, coluna: 0.2, braco: 0.1, cotovelo: 0.3, cabeca: 0.0 }],
  [0.18, { bacia: 0, quadril: -0.25, joelho: 0.05, pe: 0.75, coluna: -0.15, braco: 2.1, cotovelo: 0.15, cabeca: -0.15 }],
  [0.40, GRUPADO],
  [0.68, GRUPADO],
  [0.90, { bacia: 0.1, quadril: 0.45, joelho: 0.5, pe: 0.1, coluna: 0.15, braco: 0.5, cotovelo: 0.4, cabeca: 0.0 }],
  [1.00, { bacia: 0, quadril: 0.3, joelho: 0.4, pe: 0.0, coluna: 0.05, braco: 0.4, cotovelo: 0.3, cabeca: 0.0 }],
];

function pose(p) {
  let i = 0;
  while (i < CHAVES.length - 2 && p > CHAVES[i + 1][0]) i++;
  const [p0, a] = CHAVES[i], [p1, b] = CHAVES[i + 1];
  const t = THREE.MathUtils.smoothstep(p, p0, p1);
  const r = {};
  for (const k in a) r[k] = a[k] + (b[k] - a[k]) * t;
  return r;
}

// Quanto a pose em código domina a animação: entra rápido e sai no fim, entregando para a queda.
export function pesoCambalhota(p) {
  if (p < 0) return 0;
  return THREE.MathUtils.smoothstep(p, 0, 0.08) * (1 - THREE.MathUtils.smoothstep(p, 0.8, 1));
}

const EIXO = new THREE.Vector3(1, 0, 0); // eixo lateral da personagem no espaço do modelo
const q = new THREE.Quaternion(), qLocal = new THREE.Quaternion();

// Rotação de cada articulação em torno do eixo lateral (já somada à dos pais), a partir do repouso.
// "P" diz qual osso faz cada papel no esqueleto (rig.papeis).
function angulos(a, P) {
  // bacia encaixada = quadril gira com o topo para trás; a coluna compensa e enrola para a frente
  const bacia = -a.bacia, partes = P.coluna.length;
  const s = new Map();
  s.set(P.hips, bacia);
  P.coluna.forEach((n, i) => s.set(n, bacia + (a.coluna * (i + 1)) / partes));
  const peito = s.get(P.coluna.at(-1));
  s.set(P.pescoco, peito);
  s.set(P.cabeca, peito + a.cabeca);
  for (const L of ['L', 'R']) {
    s.set(P[`ombro${L}`], peito);
    s.set(P[`braco${L}`], peito - a.braco);        // braço pendurado: levar à frente é girar para trás no eixo X
    s.set(P[`antebraco${L}`], peito - a.braco - a.cotovelo);
    s.set(P[`coxa${L}`], bacia - a.quadril);
    s.set(P[`canela${L}`], bacia - a.quadril + a.joelho);
    s.set(P[`pe${L}`], bacia - a.quadril + a.joelho + a.pe);
  }
  return s;
}

// Chamar depois de mixer.update(): mistura a pose da cambalhota por cima da animação atual.
// rig: { lista (ossos de pai para filho), ossos, ligacao (repouso: q, p, qModelo), papeis }
export function aplicarCambalhota(rig, p) {
  const w = pesoCambalhota(p);
  if (w <= 0) return;
  aplicarPose(rig, pose(p), w);
}

// Mistura (peso w) uma pose dada em ângulos de articulação (bacia, quadril, joelho, pe, coluna,
// braco, cotovelo, cabeca) por cima da animação. Usada pela cambalhota e pelo "pegar do chão".
// quadrilEmPe: devolve o quadril à altura de pé (no ar); no chão quem ajusta a altura é quem chama.
export function aplicarPose(rig, a, w, quadrilEmPe = true) {
  const ang = angulos(a, rig.papeis);
  const angulo = new Map(), qModelo = new Map();
  for (const osso of rig.lista) {
    // ossos sem papel (dedos, cabelo, mãos) acompanham o pai
    const a = ang.has(osso.name) ? ang.get(osso.name) : (angulo.get(osso.parent.name) ?? 0);
    angulo.set(osso.name, a);
    const lig = rig.ligacao.get(osso.name);
    const qm = q.setFromAxisAngle(EIXO, a).clone().multiply(lig.qModelo);
    qModelo.set(osso.name, qm);
    const qPai = qModelo.get(osso.parent.name) ?? rig.ligacao.get(osso.parent.name)?.qModelo;
    if (!qPai) continue;
    qLocal.copy(qPai).invert().multiply(qm);
    osso.quaternion.slerp(qLocal, w);
  }
  // quadril volta à altura de pé (a animação de base pode estar agachada)
  if (quadrilEmPe) {
    const hips = rig.ossos[rig.papeis.hips];
    hips.position.lerp(rig.ligacao.get(hips.name).p, w);
  }
}
