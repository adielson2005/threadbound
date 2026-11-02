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
export const LADO_GOLPE = { soco1: 1, soco2: -1, soco3: 1, soco4: -1, soco5: 1, chute: 0, golpeArma: 1, golpeArma2: -1, giroArma: 0 };

const suave = k => k * k * (3 - 2 * k);

// f: progresso do golpe (0..1); impacto: [início, fim] da janela de acerto; forca: 1 normal
// devolve quanto o corpo desce (m), para quem chama somar na altura
export function camadaGolpe(rig, f, impacto, lado, forca = 1) {
  const [i0, i1] = impacto;
  let giro;
  if (f < i0) giro = -0.22 * suave(f / Math.max(0.01, i0));                     // preparação
  else if (f < i1) giro = -0.22 + 0.8 * suave((f - i0) / Math.max(0.01, i1 - i0)); // impacto
  else giro = 0.58 * (1 - suave((f - i1) / Math.max(0.01, 1 - i1)));           // recuperação
  giro *= lado * forca;
  const coluna = rig.papeis.coluna.map(n => rig.ossos[n]);
  // o quadril começa, a coluna completa (o giro se distribui de baixo para cima)
  girarNoMundo(rig.ossos[rig.papeis.hips], CIMA, giro * 0.3);
  for (const [k, osso] of coluna.entries()) girarNoMundo(osso, CIMA, giro * [0.25, 0.25, 0.2][k]);
  // a cabeça segura o olhar no alvo (desfaz parte do giro)
  girarNoMundo(rig.ossos[rig.papeis.cabeca], CIMA, -giro * 0.45);
  // peso descendo no impacto
  const desce = f > i0 - 0.1 && f < i1 + 0.25 ? Math.sin(THREE.MathUtils.clamp((f - i0 + 0.1) / (i1 - i0 + 0.35), 0, 1) * Math.PI) : 0;
  return desce * 0.07 * forca;
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
