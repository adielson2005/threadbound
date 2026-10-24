import * as THREE from 'three';

// Repairs for the Meshy auto-rig of the doll (Numi).
//
// Root cause of the "disappearing leg": the auto-rigger put both hip joints
// (LeftUpLeg / RightUpLeg) at exactly the same point, and the mesh models the legs one
// behind the other (knees only 5.6 cm apart, in depth) instead of side by side. Seen from
// the front, the right leg was hidden behind the left, and whenever an animation brought
// the legs together one leg ended up inside the other.
//
// Fix (in bind pose, before any animation is prepared):
//  - hip joints moved apart to a natural hip width;
//  - each leg (flesh, sock and shoe vertices + knee/ankle/toe joints) moved rigidly so the
//    legs stand side by side at the same depth; the skirt is left untouched (vertices are
//    selected by distance to the leg's own bone chain, not only by skin weight, because the
//    skirt is weighted to the thigh bones too);
//  - the mesh is re-bound to the corrected skeleton, and the constant position tracks of the
//    leg bones in the clips are updated (animations only rotate bones, so they stay valid).

const M = n => 'mixamorig' + n;
const LADOS = ['Left', 'Right'];
const CADEIA = ['UpLeg', 'Leg', 'Foot', 'ToeBase', 'Toe_End'];

// sizes as a fraction of the model height (the doll is 1.7 m tall in the game)
const META_LARGURA_JOELHOS = 0.045 / 1.7; // knees at ±4.5 cm from the body axis
const META_LARGURA_QUADRIL = 0.04 / 1.7;  // hip joints at ±4 cm
const RAIO_COXA = 0.07 / 1.7, RAIO_CANELA = 0.06 / 1.7, RAIO_PE = 0.085 / 1.7;

const wp = o => o.getWorldPosition(new THREE.Vector3());

function distanciaAoSegmento(p, a, b) {
  const ab = b.clone().sub(a), t = THREE.MathUtils.clamp(p.clone().sub(a).dot(ab) / ab.lengthSq(), 0, 1);
  return a.clone().addScaledVector(ab, t).distanceTo(p);
}

// Returns a map bone name -> new local position (for patching clip tracks), or null if not needed.
export function corrigirPernas(fbx, malha) {
  fbx.updateMatrixWorld(true);
  const osso = n => fbx.getObjectByName(M(n));
  const quadrilL = osso('LeftUpLeg'), quadrilR = osso('RightUpLeg');
  if (!quadrilL || !quadrilR) return null;
  // only needed when the hip joints are (nearly) on top of each other
  const altura = new THREE.Box3().setFromObject(fbx).getSize(new THREE.Vector3()).y;
  if (wp(quadrilL).distanceTo(wp(quadrilR)) > altura * 0.02) return null;

  const hips = osso('Hips'), centroX = wp(hips).x;
  // current joint positions per side (world = FBX space, the root is still at identity here)
  const juntas = Object.fromEntries(LADOS.map(l => [l, Object.fromEntries(CADEIA.map(c => [c, osso(l + c) && wp(osso(l + c))]))]));
  const joelhoZ = (juntas.Left.Leg.z + juntas.Right.Leg.z) / 2;
  const desloc = {
    Left: new THREE.Vector3(centroX + META_LARGURA_JOELHOS * altura - juntas.Left.Leg.x, 0, joelhoZ - juntas.Left.Leg.z),
    Right: new THREE.Vector3(centroX - META_LARGURA_JOELHOS * altura - juntas.Right.Leg.x, 0, joelhoZ - juntas.Right.Leg.z),
  };

  // ---- vertices ----
  const geo = malha.geometry, pos = geo.attributes.position, si = geo.attributes.skinIndex, sw = geo.attributes.skinWeight;
  const ossos = malha.skeleton.bones;
  const lado = new Map(); // bone index -> side, for leg bones
  ossos.forEach((b, i) => { for (const l of LADOS) if (CADEIA.some(c => b.name === M(l + c))) lado.set(i, l); });
  const mw = malha.matrixWorld, mwInv = mw.clone().invert();
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    const peso = { Left: 0, Right: 0 };
    for (let k = 0; k < 4; k++) { const l = lado.get(si.getComponent(i, k)); if (l) peso[l] += sw.getComponent(i, k); }
    const l = peso.Left > peso.Right ? 'Left' : 'Right';
    if (peso[l] < 0.5) continue;
    v.fromBufferAttribute(pos, i).applyMatrix4(mw);
    const j = juntas[l];
    // part of the leg itself (not the skirt that is also weighted to the thigh)?
    const d = Math.min(
      distanciaAoSegmento(v, j.UpLeg, j.Leg) / RAIO_COXA,
      distanciaAoSegmento(v, j.Leg, j.Foot) / RAIO_CANELA,
      distanciaAoSegmento(v, j.Foot, j.ToeBase) / RAIO_PE,
      j.Toe_End ? distanciaAoSegmento(v, j.ToeBase, j.Toe_End) / RAIO_PE : Infinity,
    ) / altura;
    if (d > 1) continue;
    // full move below the knee, fading to zero at the hip (no tearing at the crotch)
    const fator = THREE.MathUtils.smoothstep(v.y, j.UpLeg.y, j.Leg.y + (j.UpLeg.y - j.Leg.y) * 0.3);
    v.addScaledVector(desloc[l], fator).applyMatrix4(mwInv);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  pos.needsUpdate = true;
  geo.computeBoundingBox(); geo.computeBoundingSphere();

  // ---- joints ----
  const novas = new Map();
  for (const l of LADOS) {
    const alvo = {
      UpLeg: juntas[l].UpLeg.clone().setX(centroX + (l === 'Left' ? 1 : -1) * META_LARGURA_QUADRIL * altura),
      ...Object.fromEntries(CADEIA.slice(1).filter(c => juntas[l][c]).map(c => [c, juntas[l][c].clone().add(desloc[l])])),
    };
    for (const c of CADEIA) { // parent before child
      const b = osso(l + c);
      if (!b || !alvo[c]) continue;
      b.parent.updateMatrixWorld(true);
      b.position.copy(b.parent.worldToLocal(alvo[c].clone()));
      b.updateMatrixWorld(true);
      novas.set(b.name, b.position.clone());
    }
  }
  fbx.updateMatrixWorld(true);
  malha.bind(malha.skeleton, malha.matrixWorld);
  return novas;
}

// ---------------------------------------------------------------------------------------
// Animation clip repairs
// ---------------------------------------------------------------------------------------

const _q = new THREE.Quaternion(), _q0 = new THREE.Quaternion(), _q1 = new THREE.Quaternion(), _qm = new THREE.Quaternion();

// Single-frame outliers: a key that breaks away from both neighbours (which agree with each
// other) is a glitch in the source data (seen in the fingers of falling_down, a thigh key of
// the roundhouse kick and the first frames of the borrowed landing/jump clips). Replaced by the
// interpolation of its neighbours.
export function removerPicos(clipe, limiteGraus = 20) {
  const lim = THREE.MathUtils.degToRad(limiteGraus);
  let corrigidos = 0;
  for (const t of clipe.tracks) {
    if (!t.name.endsWith('.quaternion')) continue;
    const v = t.values, n = t.times.length;
    for (let passada = 0; passada < 2; passada++) {
      for (let k = 1; k < n - 1; k++) {
        _q0.fromArray(v, (k - 1) * 4); _q.fromArray(v, k * 4); _q1.fromArray(v, (k + 1) * 4);
        const f = (t.times[k] - t.times[k - 1]) / (t.times[k + 1] - t.times[k - 1]);
        _qm.copy(_q0).slerp(_q1, f);
        const desvio = _q.angleTo(_qm), vizinhos = _q0.angleTo(_q1);
        if (desvio > lim && desvio > vizinhos * 0.8) { _qm.toArray(v, k * 4); corrigidos++; }
      }
    }
  }
  return corrigidos;
}

// Looping clips whose last frame does not match the first (Walking 14°, Running 31°,
// Combat_Idle 20°) snap once per cycle. The last part of the clip is eased toward the first
// frame so the loop closes exactly.
export function fecharCiclo(clipe, fracao = 0.22) {
  const d = clipe.duration, ini = d * (1 - fracao);
  clipe.tracks = clipe.tracks.map(t => {
    // some source tracks stop early (keyframe reduction: the right toe of Walking ends at
    // 0.27 s of 1.03 s); they hold their last value and jump back when the loop restarts.
    // A key equal to the first frame is added at the end, so they ease back over the cycle.
    if (t.times.length < 2 || t.times[t.times.length - 1] >= d - 1e-4) return t;
    const n = t.getValueSize();
    const tempos = new Float32Array([...t.times, d]);
    const valores = new Float32Array(t.values.length + n);
    valores.set(t.values); valores.set(t.values.slice(0, n), t.values.length);
    return new t.constructor(t.name, tempos, valores);
  });
  for (const t of clipe.tracks) {
    const n = t.getValueSize(), v = t.values, ultimo = t.times.length - 1;
    if (ultimo < 1) continue;
    // a track that ends early was already closed above; only ease tracks covering the whole cycle
    if (t.times[ultimo - 1] < ini && t.times[ultimo] >= d - 1e-4 && ultimo > 1 && t.times[ultimo - 1] < d * 0.5) continue;
    const quat = t.name.endsWith('.quaternion');
    for (let k = 0; k <= ultimo; k++) {
      if (t.times[k] < ini) continue;
      const s = THREE.MathUtils.smootherstep(t.times[k], ini, d);
      if (quat) {
        _q.fromArray(v, k * 4).slerp(_q0.fromArray(v, 0), s).toArray(v, k * 4);
      } else for (let c = 0; c < n; c++) v[k * n + c] += (v[c] - v[k * n + c]) * s;
    }
  }
}

// Samples a clip on the skeleton (root of the FBX at identity) and calls fn(t) per frame.
function amostrar(fbx, clipe, fps, fn) {
  const mixer = new THREE.AnimationMixer(fbx), acao = mixer.clipAction(clipe);
  acao.play();
  const n = Math.max(2, Math.round(clipe.duration * fps));
  for (let k = 0; k <= n; k++) {
    const t = Math.min(clipe.duration - 1e-4, k / fps);
    mixer.setTime(t);
    fbx.updateMatrixWorld(true);
    fn(t, k);
  }
  acao.stop();
  mixer.uncacheRoot(fbx);
}

// Attacks: at the moment of impact the strike must go straight ahead of the character. The
// punch combo was authored in a side stance, so its pieces hit 35–110° off to the side of where
// Numi faces. Impact = maximum horizontal reach of the striking hand/foot measured from the
// chest (not maximum speed: the fastest frame of a punch is often the pull-back). The whole
// clip is turned around the vertical axis (the motion itself is untouched).
export function alinharGolpe(clipe, fbx, membros) {
  const peito = fbx.getObjectByName(M('Spine2')), ossos = membros.map(n => fbx.getObjectByName(M(n)));
  let melhor = { alcance: -1, dir: null };
  amostrar(fbx, clipe, 60, () => {
    const pc = wp(peito);
    for (const o of ossos) {
      const dir = wp(o).sub(pc).setY(0), alcance = dir.length();
      if (alcance > melhor.alcance) melhor = { alcance, dir };
    }
  });
  if (!melhor.dir || melhor.dir.lengthSq() < 1e-8) return 0;
  const angulo = -Math.atan2(melhor.dir.x, melhor.dir.z); // rotation that brings the strike to +Z
  girarClipe(clipe, fbx.getObjectByName(M('Hips')), angulo);
  return THREE.MathUtils.radToDeg(angulo);
}

function girarClipe(clipe, hips, angulo) {
  const t = clipe.tracks.find(x => x.name === `${hips.name}.quaternion`);
  if (!t) return;
  const qPai = hips.parent.getWorldQuaternion(new THREE.Quaternion()), qPaiInv = qPai.clone().invert();
  const giro = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), angulo);
  for (let i = 0; i < t.values.length; i += 4) {
    _q.fromArray(t.values, i).premultiply(qPai).premultiply(giro).premultiply(qPaiInv).toArray(t.values, i);
  }
}

// Natural ground speed of an in-place locomotion clip (m/s, in game units): how fast the
// supporting foot moves backwards while it is on the ground. Playing the clip at
// (movement speed / natural speed) keeps the feet from sliding.
export function velocidadeNatural(clipe, fbx, metrosPorUnidade) {
  const pes = ['LeftToeBase', 'RightToeBase'].map(n => fbx.getObjectByName(M(n)));
  const quadros = [];
  amostrar(fbx, clipe, 60, () => quadros.push(pes.map(p => wp(p))));
  const chao = Math.min(...quadros.flat().map(p => p.y));
  const tol = 0.025 / metrosPorUnidade;
  let soma = 0, n = 0;
  for (let k = 1; k < quadros.length; k++) {
    for (let i = 0; i < 2; i++) {
      if (quadros[k][i].y < chao + tol && quadros[k - 1][i].y < chao + tol) { soma -= (quadros[k][i].z - quadros[k - 1][i].z) * 60; n++; }
    }
  }
  return n ? (soma / n) * metrosPorUnidade : 0;
}

// The doll clips carry a (constant) position track for every bone: point the leg bones to the
// corrected joints, keeping any animated variation relative to the old rest position.
export function corrigirTrilhasPernas(clipe, novas, antigas) {
  if (!novas) return;
  for (const t of clipe.tracks) {
    const [nome, prop] = t.name.split('.');
    if (prop !== 'position' || !novas.has(nome)) continue;
    const n = novas.get(nome), a = antigas.get(nome);
    for (let i = 0; i < t.values.length; i += 3) {
      t.values[i] += n.x - a.x; t.values[i + 1] += n.y - a.y; t.values[i + 2] += n.z - a.z;
    }
  }
}
