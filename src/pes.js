import * as THREE from 'three';

// Pés no chão em rampas (IK de duas articulações: coxa e canela).
// Com a personagem parada numa rampa, o quadril desce até o pé de baixo alcançar o chão
// e o joelho do pé de cima dobra para ele apoiar na parte mais alta.

const rc = new THREE.Raycaster(); rc.firstHitOnly = true; rc.layers.enableAll();
const baixo = new THREE.Vector3(0, -1, 0);
const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3(), T = new THREE.Vector3(), o = new THREE.Vector3();
const q = new THREE.Quaternion(), qPai = new THREE.Quaternion(), qMundo = new THREE.Quaternion(), qPe = new THREE.Quaternion();

function chaoEm(malha, x, y, z) {
  rc.set(o.set(x, y + 0.6, z), baixo); rc.far = 1.4;
  return rc.intersectObject(malha)[0]?.point.y;
}

// gira o osso (no mundo) para levar a direção "de" até "para"
function girarPara(osso, de, para) {
  q.setFromUnitVectors(de.clone().normalize(), para.clone().normalize());
  osso.getWorldQuaternion(qMundo);
  osso.parent.getWorldQuaternion(qPai);
  osso.quaternion.copy(qPai.invert().multiply(q).multiply(qMundo));
  osso.updateMatrixWorld(true);
}

function resolverPerna(perna, alvo) {
  const { coxa, canela, pe } = perna;
  coxa.getWorldPosition(A); canela.getWorldPosition(B); pe.getWorldPosition(C);
  pe.getWorldQuaternion(qPe); // a sola não deve girar junto
  const a = A.distanceTo(B), b = B.distanceTo(C);
  const dAT = T.copy(alvo).sub(A), c = Math.min(dAT.length(), a + b - 1e-4);
  // direção para onde o joelho aponta (mantém a da animação)
  const eixo = dAT.clone().normalize();
  const polo = B.clone().sub(A).addScaledVector(eixo, -B.clone().sub(A).dot(eixo)).normalize();
  const cosA = THREE.MathUtils.clamp((a * a + c * c - b * b) / (2 * a * c), -1, 1);
  const joelho = A.clone().addScaledVector(eixo, a * cosA).addScaledVector(polo, a * Math.sqrt(1 - cosA * cosA));
  girarPara(coxa, B.clone().sub(A), joelho.clone().sub(A));
  canela.getWorldPosition(B); pe.getWorldPosition(C);
  girarPara(canela, C.clone().sub(B), alvo.clone().sub(B));
  // devolve a orientação original ao pé
  pe.parent.getWorldQuaternion(qPai);
  pe.quaternion.copy(qPai.invert().multiply(qPe));
  pe.updateMatrixWorld(true);
}

// Devolve quanto o corpo deve descer (m, ≤ 0) e ajusta as pernas. "peso" (0..1) liga/desliga suave.
export function assentarPes(boneca, malhaChao, peso) {
  if (peso <= 0.01) return 0;
  const { pernas, raiz } = boneca;
  raiz.updateMatrixWorld(true);
  // a animação supõe o chão na altura da raiz; "erro" é quanto o chão embaixo de cada pé está
  // acima (+) ou abaixo (−) disso — mantém a distância pé-chão que a animação já tem
  const dados = pernas.map(p => {
    const pos = p.pe.getWorldPosition(new THREE.Vector3());
    const chao = chaoEm(malhaChao, pos.x, raiz.position.y, pos.z);
    return { p, erro: chao === undefined ? 0 : THREE.MathUtils.clamp(chao - raiz.position.y, -0.45, 0.45) };
  });
  // desce o quadril o suficiente para o pé mais baixo alcançar o chão (nunca sobe: aí seria afundar)
  const desce = Math.min(0, ...dados.map(d => d.erro)) * peso;
  if (desce < -0.002) {
    raiz.position.y += desce;
    raiz.updateMatrixWorld(true);
  }
  // o outro pé, que ficou abaixo do chão, sobe com o joelho dobrando
  for (const d of dados) {
    const sobe = (d.erro - desce) * peso;
    if (sobe > 0.005) resolverPerna(d.p, d.p.pe.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, sobe, 0)));
  }
  return desce;
}
