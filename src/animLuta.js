import * as THREE from 'three';

// Camadas de animação de luta, aplicadas por cima dos clipes (que vêm de captura de movimento e
// não podem ser trocados aqui): dão peso, preparação e reação aos golpes. Usadas pela Brisa
// (jogo.js) e pelo Ravi (vilao.js), que têm o mesmo esqueleto.
//  - golpe: antes do impacto o tronco recua um pouco para o lado contrário (preparação); no
//    impacto gira com força para o lado do golpe (o quadril leva o braço) e os joelhos dobram
//    (o peso desce); depois volta devagar (recuperação);
//  - reação: atingido, o tronco tomba para longe de onde veio o golpe e a cabeça dá um tranco;
//  - guarda: em pé perto de um inimigo, joelhos levemente dobrados e o peso baixo.

const CIMA = new THREE.Vector3(0, 1, 0), _eixo = new THREE.Vector3();
const _qPai = new THREE.Quaternion(), _qOsso = new THREE.Quaternion(), _qGiro = new THREE.Quaternion();

// gira um osso em volta de um eixo do mundo (os filhos vão junto)
export function girarNoMundo(osso, eixo, angulo) {
  if (!osso || Math.abs(angulo) < 1e-4) return;
  osso.updateWorldMatrix(true, false);
  osso.parent.getWorldQuaternion(_qPai);
  osso.getWorldQuaternion(_qOsso);
  _qGiro.setFromAxisAngle(eixo, angulo).multiply(_qOsso);
  osso.quaternion.copy(_qPai.invert().multiply(_qGiro));
  osso.updateMatrixWorld(true);
}

// lado do golpe: +1 gira para a esquerda (golpe com o braço direito), −1 para a direita, 0 sem
// torção (chute giratório e giro da lâmina: o clipe já gira o corpo inteiro)
// (jab e direto com passo são da mão esquerda, a direita final é da direita: medido nos clipes)
export const LADO_GOLPE = { soco1: 1, soco2: -1, soco3: 1, soco4: -1, soco5: 1, socoFinal: 1, chute: 0, chuteBaixo: 0, golpeArma: 1, golpeArma2: -1, giroArma: 0 };

const suave = k => k * k * (3 - 2 * k);

// f: progresso do golpe (0..1); impacto: [início, fim] da janela de acerto; forca: 1 normal.
// Só o tronco, e pouco: o clipe é captura de movimento (já é natural) e esta camada só acompanha o
// braço que bate. Antes ela girava também o quadril (arrastava as pernas e os pés escorregavam),
// abaixava o corpo inteiro (os pés afundavam no chão) e quem chamava inclinava o corpo todo (os pés
// saíam do chão): o golpe ficava duro e esquisito. Devolve 0 (nada de descer o corpo).
export function camadaGolpe(rig, f, impacto, lado, forca = 1) {
  const [i0, i1] = impacto;
  // sobe até o impacto, segura na janela e volta devagar
  let k;
  if (f < i0) k = suave(f / Math.max(0.01, i0)) * 0.6;
  else if (f < i1) k = 0.6 + 0.4 * suave((f - i0) / Math.max(0.01, i1 - i0));
  else k = 1 - suave((f - i1) / Math.max(0.01, 1 - i1));
  const giro = 0.22 * k * lado * forca;
  const coluna = rig.papeis.coluna.map(n => rig.ossos[n]);
  for (const [n, osso] of coluna.entries()) girarNoMundo(osso, CIMA, giro * [0.3, 0.35, 0.35][n]);
  girarNoMundo(rig.ossos[rig.papeis.cabeca], CIMA, -giro * 0.5); // o olhar fica no alvo
  return 0;
}

// reação a um golpe: k 0..1 (1 no instante do golpe), dirX/dirZ = de onde veio, no mundo
export function camadaReacao(rig, k, dirX, dirZ) {
  if (k <= 0) return;
  // tomba para longe do golpe: eixo horizontal perpendicular à direção dele
  _eixo.set(-dirZ, 0, dirX).normalize();
  const a = -Math.sin(k * Math.PI) * 0.45;
  const coluna = rig.papeis.coluna.map(n => rig.ossos[n]);
  for (const osso of coluna) girarNoMundo(osso, _eixo, a * 0.33);
  girarNoMundo(rig.ossos[rig.papeis.cabeca], _eixo, a * 0.6); // a cabeça dá o tranco
}
