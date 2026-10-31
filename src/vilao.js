import * as THREE from 'three';
import { criarBoneca } from './boneca.js';
import { moverComColisao, RAIO } from './fisica.js';
import { linhaLivre } from './colisao.js';
import { texturaDeCanvas } from './canvasTextura.js';

// Ravi, o vilão do Capítulo 1 (modelo do release "vilão1": rapaz de jaqueta verde, Meshy, sem ossos).
// A malha ganhou pesos de ossos fora do jogo (ferramentas/vilao/pesos.py) e é vestida no mesmo
// esqueleto Mixamo da Brisa, então usa as mesmas animações (andar, correr, socos, chute, guarda,
// cair) com os mesmos reparos de boneca.js.
//
// Luta de chefe no alto do morro, antes do Coração da Ilha:
//  - persegue a Brisa correndo e golpeia de perto (soco, soco, chute), com a janela de acerto da
//    própria animação e só se ela estiver à frente dele e sem parede no meio;
//  - de longe prepara uma investida (se encolhe em guarda, depois dispara em linha reta): se bater
//    numa parede ou numa pedra, fica tonto e apanha;
//  - defender de frente (a guarda da Brisa) bloqueia e o deixa tonto (combate.aoSerAtacada);
//  - metade da vida: segunda fase, mais rápido e com menos pausa entre os ataques;
//  - sem vida: cai de joelhos e se desfaz em névoa (foge: a história continua no Cap. 2).

const PASTA = new URL('../assets/vilao/', import.meta.url).href;
const VIDA = 16;
const G = -26;
const ALCANCE = { soco1: 1.55, soco2: 1.6, chute: 1.9 };
const IMPACTO = { soco1: [0.1, 0.45], soco2: [0.3, 0.65], chute: [0.42, 0.66] };
// aviso: antes de cada sequência de golpes ele se encolhe em guarda por esse tempo (dá para ler e
// defender ou sair); depois de acertar a Brisa ele recua um instante (vez dela de bater).
// Medido com um jogador automático que só soca e nunca defende: com os socos saindo sem aviso e o
// combo de 3 golpes, a Brisa perdia os 5 fôlegos em 8 s tirando 2 de 16 de vida dele.
const FASES = [
  { correr: 3.6, pausa: 1.6, aviso: 0.45, investida: 8, combo: ['soco1'], recuo: 1.6 },
  { correr: 4.6, pausa: 1.0, aviso: 0.3, investida: 9.5, combo: ['soco1', 'chute'], recuo: 1.1 },
];

function material(boneca, nivel, textura) {
  return Promise.all([
    textura(nivel.materialSimples || nivel.nome === 'Low' ? 'vilao_cor_1024.jpg' : 'vilao_cor_2048.jpg', true),
    nivel.materialSimples ? null : textura('vilao_rugosidade_1024.jpg'),
  ]).then(([cor, rugosidade]) => {
    const antigo = boneca.malha.material;
    const base = { map: cor, color: new THREE.Color().setScalar(0.85), emissive: new THREE.Color('#ff3020'), emissiveIntensity: 0 };
    boneca.malha.material = nivel.materialSimples
      ? new THREE.MeshLambertMaterial(base)
      : new THREE.MeshStandardMaterial({ ...base, roughnessMap: rugosidade, roughness: 1, metalness: 0, envMapIntensity: 0.3 });
    boneca.malha.material.transparent = false;
    antigo?.dispose?.();
  });
}

export const MODELO_VILAO = { pasta: PASTA, nome: 'vilao', altura: 1.85, material };

// sombra-mancha embaixo dele (a sombra do mapa é fixa; a de verdade é só a da Brisa)
function mancha() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(0,0,0,0.5)'); gr.addColorStop(0.6, 'rgba(0,0,0,0.25)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.2), new THREE.MeshBasicMaterial({ map: texturaDeCanvas(c), transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.renderOrder = 1;
  return m;
}

export async function criarVilao({ renderer, nivel, cena, mapa, jogador, ui }) {
  const b = await criarBoneca(renderer, nivel, null, MODELO_VILAO);
  for (const nome of ['soco1', 'soco2', 'chute', 'morte']) { b.acoes[nome].setLoop(THREE.LoopOnce, 1); b.acoes[nome].clampWhenFinished = true; }
  b.raiz.visible = false;
  const sombra = mancha(); sombra.visible = false;
  cena.add(b.raiz, sombra);
  const rc = new THREE.Raycaster(); rc.firstHitOnly = true; rc.layers.enableAll();
  const baixo = new THREE.Vector3(0, -1, 0), o = new THREE.Vector3();

  // o objeto que o combate trata como um inimigo (aoSerAtacada mexe em vel, estado, atordoado, flash)
  const v = {
    nome: 'Ravi', pos: new THREE.Vector3(), vel: new THREE.Vector3(), angulo: 0, vida: VIDA,
    estado: 'oculto', tempo: 0, atordoado: 0, flash: 0, ativo: false, golpe: null, acertou: false,
    noChao: true, aparecer: 0, recuo: 0, proximaInvestida: 4, derrotado: false,
    aoDerrotar: null, aoAtacar: null, aoMudarFase: null,
  };
  let anim = null;
  // (recomecar: o mesmo golpe de novo, do início)
  function tocar(nome, fade = 0.2, recomecar = false) {
    if (anim === nome && !recomecar) return;
    const nova = b.acoes[nome];
    if (anim === nome) { nova.reset().play(); return; }
    nova.reset().setEffectiveTimeScale(1).setEffectiveWeight(1).play();
    if (anim) b.acoes[anim].crossFadeTo(nova, fade, false);
    anim = nome;
  }
  const fase = () => FASES[v.vida <= VIDA / 2 ? 1 : 0];

  function mostrarBarra(sim) {
    if (!ui) return;
    ui.style.opacity = sim ? 1 : 0;
    ui.querySelector('i').style.transform = `scaleX(${Math.max(0, v.vida / VIDA)})`;
  }

  // aparece entre o Coração e a Brisa, de frente para ela, saindo da névoa
  function iniciar(coracao) {
    const dir = jogador.pos.clone().sub(coracao).setY(0);
    if (dir.lengthSq() < 1e-4) dir.set(1, 0, 0);
    dir.normalize();
    v.pos.copy(coracao).addScaledVector(dir, 2.5);
    rc.set(o.set(v.pos.x, v.pos.y + 3, v.pos.z), baixo); rc.far = 8;
    const h = rc.intersectObject(mapa.malha)[0];
    if (h) v.pos.y = h.point.y;
    v.vel.set(0, 0, 0); v.vida = VIDA; v.ativo = true; v.derrotado = false;
    v.estado = 'chegada'; v.tempo = 2.6; v.aparecer = 0; v.proximaInvestida = 5; v.golpe = null;
    v.angulo = Math.atan2(jogador.pos.x - v.pos.x, jogador.pos.z - v.pos.z);
    b.raiz.visible = true; sombra.visible = true;
    b.mixer.stopAllAction(); anim = null; tocar('parada', 0);
    mostrarBarra(true);
  }
  // a Brisa voltou ao ponto salvo: ele some e espera ela subir de novo
  function reiniciar() {
    v.ativo = false; v.estado = 'oculto'; b.raiz.visible = false; sombra.visible = false; mostrarBarra(false);
  }

  // golpe da Brisa (combate.js): dano, empurrão e um tranco no corpo
  function atingir(dano, de, empurrao = 3) {
    if (!v.ativo || v.estado === 'chegada' || v.estado === 'caindo') return false;
    const faseAntes = fase();
    v.vida -= v.estado === 'atordoado' ? dano * 1.5 : dano;
    v.flash = 1; v.recuo = 1;
    const p = v.pos.clone().sub(de).setY(0); if (p.lengthSq() < 1e-6) p.set(0, 0, 1);
    v.vel.addScaledVector(p.normalize(), Math.min(empurrao, 6) * 0.6);
    // apanhando no meio de um golpe dele: o golpe é interrompido (dá para trocar socos)
    // (na primeira fase sempre; na segunda, metade das vezes) e o aviso também
    if ((v.estado === 'golpe' || v.estado === 'aviso') && (faseAntes === FASES[0] || Math.random() < 0.5)) { v.estado = 'perseguir'; v.golpe = null; v.tempo = 0.45; }
    mostrarBarra(true);
    if (v.vida <= 0) { derrotar(); return true; }
    if (fase() !== faseAntes) v.aoMudarFase?.();
    return true;
  }
  function derrotar() {
    v.vida = 0; v.estado = 'caindo'; v.tempo = 0; v.golpe = null; v.vel.set(0, 0, 0);
    tocar('morte', 0.15);
    mostrarBarra(false);
  }

  // distância horizontal até a cápsula da Brisa e se ela está à frente dele (cone de ~70°)
  const frente = new THREE.Vector3(), para = new THREE.Vector3(), peitoV = new THREE.Vector3(), peitoJ = new THREE.Vector3();
  function alcanca(maximo) {
    para.subVectors(jogador.pos, v.pos); const dy = Math.abs(para.y); para.y = 0;
    const d = para.length();
    if (d > maximo + RAIO || dy > 1.2) return false;
    frente.set(Math.sin(v.angulo), 0, Math.cos(v.angulo));
    if (d > 0.3 && para.divideScalar(d).dot(frente) < 0.35) return false;
    return linhaLivre(mapa, peitoV.copy(v.pos).setY(v.pos.y + 1.2), peitoJ.copy(jogador.pos).setY(jogador.pos.y + 1.0));
  }
  function virarPara(alvo, dt, rapidez = 8) {
    const quer = Math.atan2(alvo.x - v.pos.x, alvo.z - v.pos.z);
    let d = quer - v.angulo; d = Math.atan2(Math.sin(d), Math.cos(d));
    v.angulo += d * Math.min(1, dt * rapidez);
  }

  const desejado = new THREE.Vector3();
  function atualizar(dt) {
    if (v.estado === 'oculto') return;
    v.flash = Math.max(0, v.flash - dt * 3);
    v.recuo = Math.max(0, v.recuo - dt * 4);
    const F = fase();
    const dJ = Math.hypot(jogador.pos.x - v.pos.x, jogador.pos.z - v.pos.z);
    desejado.set(0, 0, 0);
    let controla = true; // anda pelo chão com o "desejado"; na investida a velocidade é dele

    if (v.estado === 'chegada') {
      v.aparecer = Math.min(1, v.aparecer + dt * 0.7);
      virarPara(jogador.pos, dt);
      v.tempo -= dt;
      if (v.tempo <= 0) { v.estado = 'perseguir'; v.tempo = 0.5; }
    } else if (v.estado === 'caindo') {
      v.tempo += dt;
      // se desfaz em névoa depois de cair
      v.aparecer = Math.max(0, 1 - Math.max(0, v.tempo - 2.2) / 1.6);
      if (v.tempo > 3.8 && !v.derrotado) { v.derrotado = true; v.ativo = false; v.estado = 'oculto'; b.raiz.visible = false; sombra.visible = false; v.aoDerrotar?.(); }
    } else if (jogador.morta) {
      tocar('parada');
    } else if (v.estado === 'atordoado') {
      v.atordoado -= dt; tocar('guarda');
      if (v.atordoado <= 0) { v.estado = 'perseguir'; v.tempo = F.pausa * 0.5; }
    } else if (v.estado === 'aviso') {
      tocar('guarda', 0.12); virarPara(jogador.pos, dt, 10);
      v.flash = Math.max(v.flash, 0.35);
      v.tempo -= dt;
      if (v.tempo <= 0) iniciarGolpe(F.combo[0], 0);
    } else if (v.estado === 'preparar') {
      // investida: se encolhe olhando para ela e depois dispara
      tocar('guarda'); virarPara(jogador.pos, dt, 10);
      v.tempo -= dt;
      if (v.tempo <= 0) {
        v.estado = 'investida'; v.tempo = 0.75; v.acertou = false;
        v.vel.set(Math.sin(v.angulo) * F.investida, 0, Math.cos(v.angulo) * F.investida);
      }
    } else if (v.estado === 'investida') {
      tocar('correr', 0.08); controla = false;
      v.tempo -= dt;
      if (!v.acertou && dJ < 0.95 && Math.abs(jogador.pos.y - v.pos.y) < 1.2) { v.acertou = true; v.aoAtacar?.(v); }
      if (v.tempo <= 0) { v.estado = 'perseguir'; v.tempo = F.pausa; }
    } else if (v.estado === 'golpe') {
      const g = v.golpe, acao = b.acoes[g.nome], clipe = acao.getClip();
      g.t += dt;
      const f = g.t / clipe.duration;
      virarPara(jogador.pos, dt, f < IMPACTO[g.nome][0] ? 10 : 2);
      if (!g.acertou && f >= IMPACTO[g.nome][0] && f <= IMPACTO[g.nome][1] && alcanca(ALCANCE[g.nome])) { g.acertou = true; g.algum = true; v.aoAtacar?.(v); }
      if (f >= 0.92) {
        g.i++;
        if (g.i < F.combo.length && dJ < 2.4 && !g.algum) iniciarGolpe(F.combo[g.i], g.i);
        else { v.estado = 'perseguir'; v.tempo = g.algum ? F.recuo : F.pausa; v.golpe = null; }
      }
    } else { // perseguir
      v.tempo -= dt;
      virarPara(jogador.pos, dt);
      v.proximaInvestida -= dt;
      if (dJ > 1.35) {
        desejado.set(jogador.pos.x - v.pos.x, 0, jogador.pos.z - v.pos.z).normalize().multiplyScalar(dJ > 3 ? F.correr : F.correr * 0.5);
        tocar(dJ > 3 ? 'correr' : 'andar');
      } else tocar('parada');
      if (v.tempo <= 0 && v.noChao) {
        if (dJ < 1.6) { v.estado = 'aviso'; v.tempo = F.aviso; }
        else if (dJ > 4.5 && dJ < 11 && v.proximaInvestida <= 0) {
          v.estado = 'preparar'; v.tempo = 0.65; v.proximaInvestida = 5 + Math.random() * 3;
        }
      }
    }

    // física: o mesmo movimento com colisão da Brisa (não atravessa paredes, pedras nem árvores)
    if (v.estado !== 'oculto') {
      if (controla) {
        const k = Math.min(1, dt * 8);
        v.vel.x += (desejado.x - v.vel.x) * k; v.vel.z += (desejado.z - v.vel.z) * k;
      }
      v.vel.y += G * dt;
      const res = moverComColisao(mapa, v.pos, v.vel, dt, v.noChao && v.vel.y <= 0);
      v.noChao = res.noChao;
      // investida contra uma parede: fica tonto
      if (v.estado === 'investida' && res.batida > 3) { v.estado = 'atordoado'; v.atordoado = 1.6; v.vel.set(0, 0, 0); v.flash = 0.6; }
    }
    // desenho
    b.raiz.position.copy(v.pos);
    b.raiz.rotation.y = v.angulo;
    b.corpo.rotation.x = -v.recuo * 0.18; // tranco para trás quando apanha
    b.mixer.update(dt);
    const m = b.malha.material;
    if (m.emissiveIntensity !== undefined) m.emissiveIntensity = v.flash * 0.6;
    // aparecendo / se desfazendo: o corpo sai do chão de névoa (escala vertical e transparência)
    b.raiz.scale.set(1, 0.15 + 0.85 * v.aparecer, 1);
    if (v.aparecer < 1 !== m.transparent) { m.transparent = v.aparecer < 1; m.needsUpdate = true; }
    m.opacity = v.aparecer;
    rc.set(o.set(v.pos.x, v.pos.y + 0.5, v.pos.z), baixo); rc.far = 6;
    const h = rc.intersectObject(mapa.malha)[0];
    sombra.visible = !!h && b.raiz.visible;
    if (h) { sombra.position.copy(h.point).y += 0.04; sombra.material.opacity = v.aparecer; }
  }
  function iniciarGolpe(nome, i) {
    v.estado = 'golpe';
    v.golpe = { nome, t: 0, i, acertou: false };
    tocar(nome, 0.1, true);
  }

  return {
    v, boneca: b, iniciar, reiniciar, atingir, atualizar,
    get lutando() { return v.ativo && v.estado !== 'caindo'; },
    get visivel() { return b.raiz.visible; },
  };
}
