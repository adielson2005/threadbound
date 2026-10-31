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
// Aparece em três momentos do capítulo (campanha.js):
//  - 'observar': depois da 1ª âncora, parado ao longe olhando a Brisa; some na névoa se ela chega
//    perto ou depois de um tempo;
//  - 'emboscada': depois da 2ª âncora, surge perto dela e luta até perder um terço da vida (ou meio
//    minuto), então recua para a névoa;
//  - 'chefe': no alto do morro, antes do Coração da Ilha, a luta inteira.
//
// Luta dinâmica:
//  - rodeia a Brisa de guarda a meia distância (não vem sempre reto), avança e golpeia de perto
//    (soco; na 2ª fase soco + chute), sempre com um aviso em guarda antes, com a janela de acerto da
//    própria animação e só se ela estiver à frente dele e sem parede no meio;
//  - de longe prepara uma investida (se encolhe, depois dispara em linha reta): se bater numa parede
//    ou numa pedra fica tonto; na 2ª fase também salta sobre ela e o pouso derruba quem está perto;
//  - quando ela começa um golpe perto dele, às vezes ele esquiva para trás;
//  - postura: golpes seguidos enchem a postura dele; cheia, a guarda quebra e ele fica tonto (os
//    golpes valem mais tonto). Defesa perfeita e esquiva perfeita da Brisa também (combate.js);
//  - metade da vida: segunda fase, mais rápido e com menos pausa entre os ataques;
//  - sem vida: cai e se desfaz em névoa (foge: a história continua no Cap. 2).
// Poderes (a névoa obedece a ele):
//  - Lâminas de Névoa: de longe, junta névoa nas mãos (brilho roxo) e arremessa lâminas em leque
//    (1 na 1ª fase, 3 na 2ª) que voam baixo; dá para defender ou esquivar; batem em paredes;
//  - Passo de Névoa (2ª fase): se desfaz e reaparece atrás da Brisa, já em guarda para golpear.
// Reação a golpes: o corpo tomba para o lado contrário de onde veio o golpe.

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
  { correr: 3.6, pausa: 1.6, aviso: 0.45, investida: 8, combo: ['soco1'], recuo: 1.6, esquiva: 0.3, salto: false, laminas: 1, passo: false },
  { correr: 4.6, pausa: 1.0, aviso: 0.3, investida: 9.5, combo: ['soco1', 'chute'], recuo: 1.1, esquiva: 0.5, salto: true, laminas: 3, passo: true },
];
const LAMINA = { vel: 12, vida: 1.3, raio: 0.45, espera: 6 };
const COR_VERMELHA = new THREE.Color('#ff3020'), COR_NEVOA = new THREE.Color('#9b5cff');
export const NOME_VILAO = 'Ravi, o Corta-Fios';

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
  for (const nome of ['soco1', 'soco2', 'chute', 'morte', 'puloInicio', 'aterrissar']) { b.acoes[nome].setLoop(THREE.LoopOnce, 1); b.acoes[nome].clampWhenFinished = true; }
  b.raiz.visible = false;
  const sombra = mancha(); sombra.visible = false;
  cena.add(b.raiz, sombra);
  const rc = new THREE.Raycaster(); rc.firstHitOnly = true; rc.layers.enableAll();
  const baixo = new THREE.Vector3(0, -1, 0), o = new THREE.Vector3();
  if (ui) ui.firstChild.textContent = NOME_VILAO;

  // o objeto que o combate trata como um inimigo (aoSerAtacada mexe em vel, estado, atordoado, flash)
  const v = {
    nome: NOME_VILAO, pos: new THREE.Vector3(), vel: new THREE.Vector3(), angulo: 0, vida: VIDA,
    estado: 'oculto', modo: null, tempo: 0, atordoado: 0, flash: 0, ativo: false, golpe: null, acertou: false,
    noChao: true, aparecer: 0, recuo: 0, proximaInvestida: 4, derrotado: false, postura: 0, lado: 1,
    tempoModo: 0, vidaInicio: VIDA, proximasLaminas: 3, proximoPasso: 6, golpeDir: new THREE.Vector2(),
    aoDerrotar: null, aoAtacar: null, aoMudarFase: null, aoRecuar: null, aoAviso: null,
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
  const fase = () => FASES[v.modo === 'chefe' && v.vida <= VIDA / 2 ? 1 : 0];

  function mostrarBarra(sim) {
    if (!ui) return;
    ui.style.opacity = sim ? 1 : 0;
    ui.querySelector('i').style.transform = `scaleX(${Math.max(0, v.vida / VIDA)})`;
  }
  function noChaoEm(p) {
    rc.set(o.set(p.x, p.y + 4, p.z), baixo); rc.far = 12;
    const h = rc.intersectObject(mapa.malha)[0];
    if (h) p.y = h.point.y;
    return !!h;
  }

  // aparece em "perto" (no chão), de frente para a Brisa, saindo da névoa
  // modo: 'chefe' (luta inteira), 'emboscada' (luta curta, depois recua) ou 'observar' (só olha)
  function iniciar(perto, modo = 'chefe') {
    v.pos.copy(perto); noChaoEm(v.pos);
    v.vel.set(0, 0, 0); v.modo = modo; v.derrotado = false; v.golpe = null; v.postura = 0; v.tempoModo = 0;
    if (modo === 'chefe' || v.vida <= 0) v.vida = VIDA;
    v.vidaInicio = v.vida;
    v.ativo = modo !== 'observar';
    v.estado = modo === 'observar' ? 'observando' : 'chegada'; v.tempo = modo === 'chefe' ? 2.6 : 1.4;
    v.aparecer = 0; v.proximaInvestida = 5; v.proximasLaminas = 7; v.proximoPasso = 8; // o primeiro poder não vem logo de cara
    v.angulo = Math.atan2(jogador.pos.x - v.pos.x, jogador.pos.z - v.pos.z);
    b.raiz.visible = true; sombra.visible = true;
    b.mixer.stopAllAction(); anim = null; tocar(modo === 'observar' ? 'parada' : 'guarda', 0);
    mostrarBarra(modo !== 'observar');
  }
  // some sem lutar (a Brisa voltou ao ponto salvo, ou ele terminou a aparição)
  function reiniciar() {
    for (const l of laminas) cena.remove(l.malha);
    laminas.length = 0;
    v.ativo = false; v.estado = 'oculto'; v.modo = null; b.raiz.visible = false; sombra.visible = false; mostrarBarra(false);
  }
  // recua para a névoa (fim da emboscada ou da observação): se desfaz de pé
  function recuar() {
    v.ativo = false; v.estado = 'sumindo'; v.tempo = 0; v.golpe = null; mostrarBarra(false);
    tocar('guarda', 0.2);
  }

  // ---------- Lâminas de Névoa ----------
  // meia-lua roxa brilhante, voando de pé um pouco acima do chão; some ao bater numa parede
  const geoLamina = new THREE.TorusGeometry(0.42, 0.05, 6, 18, Math.PI * 0.9).rotateZ(Math.PI * 0.05);
  const matLamina = new THREE.MeshBasicMaterial({ color: '#c39bff', transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
  const laminas = [];
  const _dl = new THREE.Vector3();
  function arremessar(n) {
    const base = Math.atan2(jogador.pos.x - v.pos.x, jogador.pos.z - v.pos.z);
    for (let k = 0; k < n; k++) {
      const a = base + (k - (n - 1) / 2) * 0.26;
      const m = new THREE.Mesh(geoLamina, matLamina);
      m.position.set(v.pos.x + Math.sin(a) * 0.6, v.pos.y + 1.0, v.pos.z + Math.cos(a) * 0.6);
      m.rotation.set(0, a, 0);
      cena.add(m);
      // (o objeto que o combate trata como atacante: aoSerAtacada lê pos e mexe em vel e estado)
      laminas.push({ malha: m, pos: m.position, vel: new THREE.Vector3(Math.sin(a) * LAMINA.vel, 0, Math.cos(a) * LAMINA.vel), vida: LAMINA.vida, estado: '', atordoado: 0, flash: 0 });
    }
  }
  function atualizarLaminas(dt) {
    for (let i = laminas.length - 1; i >= 0; i--) {
      const l = laminas[i];
      l.vida -= dt;
      _dl.copy(l.pos);
      l.pos.addScaledVector(l.vel, dt);
      l.malha.rotation.z += dt * 18;
      let fim = l.vida <= 0 || !linhaLivre(mapa, _dl, l.pos);
      if (!fim) {
        const dx = jogador.pos.x - l.pos.x, dz = jogador.pos.z - l.pos.z, dy = l.pos.y - jogador.pos.y;
        if (Math.hypot(dx, dz) < LAMINA.raio + RAIO && dy > 0 && dy < 1.7 && !jogador.morta) { v.aoAtacar?.(l); fim = true; }
      }
      if (fim) { cena.remove(l.malha); laminas.splice(i, 1); }
    }
  }

  // golpe da Brisa (combate.js): dano, empurrão, postura e um tranco no corpo
  function atingir(dano, de, empurrao = 3) {
    if (!v.ativo || ['chegada', 'caindo', 'sumindo', 'observando', 'passo'].includes(v.estado)) return false;
    const faseAntes = fase();
    const tonto = v.estado === 'atordoado';
    v.vida -= tonto ? dano * 1.5 : dano;
    v.flash = 1; v.recuo = 1;
    const p = v.pos.clone().sub(de).setY(0); if (p.lengthSq() < 1e-6) p.set(0, 0, 1);
    // direção do golpe no espaço dele (x: de lado, y: de frente/de costas) para o corpo tombar
    { const n = p.clone().normalize(), c = Math.cos(v.angulo), si = Math.sin(v.angulo); v.golpeDir.set(n.x * c - n.z * si, n.x * si + n.z * c); }
    v.vel.addScaledVector(p.normalize(), Math.min(empurrao, 6) * (tonto ? 0.9 : 0.6));
    // apanhando no meio de um golpe dele: o golpe é interrompido (dá para trocar socos)
    // (na primeira fase sempre; na segunda, metade das vezes) e o aviso também
    if ((v.estado === 'golpe' || v.estado === 'aviso') && (faseAntes === FASES[0] || Math.random() < 0.5)) { v.estado = 'perseguir'; v.golpe = null; v.tempo = 0.45; }
    // postura: três ou quatro golpes seguidos quebram a guarda dele
    if (!tonto) {
      v.postura += 22 + dano * 8;
      if (v.postura >= 100) { v.postura = 0; atordoar(1.5, 'quebra'); }
    }
    mostrarBarra(true);
    if (v.vida <= 0) {
      if (v.modo === 'chefe') derrotar();
      else { v.vida = 1; recuar(); v.aoRecuar?.(v.modo); }
      return true;
    }
    if (fase() !== faseAntes) v.aoMudarFase?.();
    return true;
  }
  function atordoar(t, motivo) {
    v.estado = 'atordoado'; v.atordoado = t; v.golpe = null; v.flash = Math.max(v.flash, 0.6);
    v.aoAviso?.(motivo);
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
  let golpeVisto = null;
  function atualizar(dt) {
    if (v.estado === 'oculto') { atualizarLaminas(dt); return; }
    v.flash = Math.max(0, v.flash - dt * 3);
    v.recuo = Math.max(0, v.recuo - dt * 4);
    v.postura = Math.max(0, v.postura - dt * 14);
    v.tempoModo += dt;
    const F = fase();
    const dx = jogador.pos.x - v.pos.x, dz = jogador.pos.z - v.pos.z, dJ = Math.hypot(dx, dz);
    desejado.set(0, 0, 0);
    let controla = true; // anda pelo chão com o "desejado"; na investida e no salto a velocidade é dele

    // emboscada: depois de meio minuto ou de perder um terço da vida, recua
    if (v.modo === 'emboscada' && v.ativo && (v.tempoModo > 30 || v.vida <= v.vidaInicio - VIDA / 3) && ['perseguir', 'rodear'].includes(v.estado)) {
      recuar(); v.aoRecuar?.('emboscada');
    }
    // a Brisa começou um golpe perto dele: às vezes ele esquiva para trás
    const golpeAgora = jogador.golpe;
    if (golpeAgora && golpeAgora !== golpeVisto) {
      golpeVisto = golpeAgora;
      if (v.ativo && dJ < 2.2 && ['perseguir', 'rodear'].includes(v.estado) && v.noChao && Math.random() < F.esquiva) {
        v.estado = 'esquivando'; v.tempo = 0.32;
        v.vel.set(-dx / (dJ || 1) * 6.5, 2.2, -dz / (dJ || 1) * 6.5); v.noChao = false;
      }
    }

    if (v.estado === 'observando') {
      // parado ao longe olhando a Brisa; ela chega perto ou o tempo passa: some
      v.aparecer = Math.min(1, v.aparecer + dt * 0.6);
      tocar('parada'); virarPara(jogador.pos, dt, 3);
      if (dJ < 10 || v.tempoModo > 14) recuar();
    } else if (v.estado === 'sumindo') {
      v.tempo += dt; controla = true;
      v.aparecer = Math.max(0, 1 - v.tempo / 1.2);
      if (v.tempo > 1.2) { const modo = v.modo; reiniciar(); v.ultimoModo = modo; }
    } else if (v.estado === 'chegada') {
      v.aparecer = Math.min(1, v.aparecer + dt * 0.7);
      virarPara(jogador.pos, dt);
      v.tempo -= dt;
      if (v.tempo <= 0) { v.estado = 'rodear'; v.tempo = 1.2; v.lado = Math.random() < 0.5 ? -1 : 1; }
    } else if (v.estado === 'caindo') {
      v.tempo += dt;
      // se desfaz em névoa depois de cair
      v.aparecer = Math.max(0, 1 - Math.max(0, v.tempo - 2.2) / 1.6);
      if (v.tempo > 3.8 && !v.derrotado) { v.derrotado = true; v.ativo = false; v.estado = 'oculto'; b.raiz.visible = false; sombra.visible = false; v.aoDerrotar?.(); }
    } else if (jogador.morta) {
      tocar('parada');
    } else if (v.estado === 'atordoado') {
      v.atordoado -= dt; tocar('guarda');
      if (v.atordoado <= 0) { v.estado = 'rodear'; v.tempo = 0.6; }
    } else if (v.estado === 'esquivando') {
      controla = false; tocar('guarda', 0.08);
      virarPara(jogador.pos, dt, 10);
      v.tempo -= dt;
      if (v.tempo <= 0 && v.noChao) { v.estado = 'rodear'; v.tempo = 0.5 + Math.random() * 0.5; }
    } else if (v.estado === 'conjurar') {
      // junta a névoa nas mãos (brilho roxo) e arremessa as lâminas em leque
      tocar('guarda', 0.12); virarPara(jogador.pos, dt, 10);
      v.tempo -= dt;
      if (v.tempo <= 0) { arremessar(F.laminas); v.estado = 'rodear'; v.tempo = F.pausa * 0.8; }
    } else if (v.estado === 'passo') {
      // se desfaz em névoa e reaparece atrás dela
      v.tempo -= dt; controla = false; v.vel.set(0, v.vel.y, 0);
      v.aparecer = Math.max(0.0, v.tempo / 0.3);
      if (v.tempo <= 0) {
        const fx = Math.sin(jogador.angulo), fz = Math.cos(jogador.angulo);
        const alvo = new THREE.Vector3(jogador.pos.x - fx * 1.5, jogador.pos.y + 1, jogador.pos.z - fz * 1.5);
        if (noChaoEm(alvo) && linhaLivre(mapa, peitoV.copy(alvo).setY(alvo.y + 1.0), peitoJ.copy(jogador.pos).setY(jogador.pos.y + 1.0))) v.pos.copy(alvo);
        v.angulo = Math.atan2(jogador.pos.x - v.pos.x, jogador.pos.z - v.pos.z);
        v.estado = 'reaparecer'; v.tempo = 0.25;
      }
    } else if (v.estado === 'reaparecer') {
      v.tempo -= dt; v.aparecer = Math.min(1, 1 - v.tempo / 0.25);
      virarPara(jogador.pos, dt, 12);
      if (v.tempo <= 0) { v.aparecer = 1; v.estado = 'aviso'; v.tempo = F.aviso * 0.8; }
    } else if (v.estado === 'aviso') {
      tocar('guarda', 0.12); virarPara(jogador.pos, dt, 10);
      v.flash = Math.max(v.flash, 0.35);
      v.tempo -= dt;
      if (v.tempo <= 0) iniciarGolpe(F.combo[0], 0);
    } else if (v.estado === 'preparar') {
      // investida: se encolhe olhando para ela e depois dispara
      tocar('guarda'); virarPara(jogador.pos, dt, 10);
      v.flash = Math.max(v.flash, 0.25);
      v.tempo -= dt;
      if (v.tempo <= 0) {
        v.estado = 'investida'; v.tempo = 0.75; v.acertou = false;
        v.vel.set(Math.sin(v.angulo) * F.investida, 0, Math.cos(v.angulo) * F.investida);
      }
    } else if (v.estado === 'investida') {
      tocar('correr', 0.08); controla = false;
      v.tempo -= dt;
      if (!v.acertou && dJ < 0.95 && Math.abs(jogador.pos.y - v.pos.y) < 1.2) { v.acertou = true; v.aoAtacar?.(v); }
      if (v.tempo <= 0) { v.estado = 'rodear'; v.tempo = F.pausa; }
    } else if (v.estado === 'salto') {
      // salto sobre ela (2ª fase): sobe, cai perto e o pouso empurra quem está em volta
      controla = false;
      tocar(v.vel.y > 0 ? 'puloInicio' : 'queda', 0.15);
      if (v.noChao && v.tempo < 0) {
        v.estado = 'pouso'; v.tempo = 0.45; v.vel.set(0, 0, 0); tocar('aterrissar', 0.08);
        if (dJ < 2.0 && Math.abs(jogador.pos.y - v.pos.y) < 0.8 && jogador.noChao) v.aoAtacar?.(v);
        v.aoAviso?.('pouso');
      }
      v.tempo -= dt;
    } else if (v.estado === 'pouso') {
      v.tempo -= dt;
      if (v.tempo <= 0) { v.estado = 'rodear'; v.tempo = F.pausa; }
    } else if (v.estado === 'golpe') {
      const g = v.golpe, acao = b.acoes[g.nome], clipe = acao.getClip();
      g.t += dt;
      const f = g.t / clipe.duration;
      virarPara(jogador.pos, dt, f < IMPACTO[g.nome][0] ? 10 : 2);
      if (!g.acertou && f >= IMPACTO[g.nome][0] && f <= IMPACTO[g.nome][1] && alcanca(ALCANCE[g.nome])) { g.acertou = true; g.algum = true; v.aoAtacar?.(v); }
      if (f >= 0.92) {
        g.i++;
        if (g.i < F.combo.length && dJ < 2.4 && !g.algum) iniciarGolpe(F.combo[g.i], g.i, g.algum);
        else { v.estado = 'rodear'; v.tempo = g.algum ? F.recuo : F.pausa; v.golpe = null; }
      }
    } else if (v.estado === 'rodear') {
      // de guarda, andando de lado em volta dela a ~3 m (às vezes troca de lado)
      v.tempo -= dt; v.proximaInvestida -= dt;
      virarPara(jogador.pos, dt, 10);
      const ux = dx / (dJ || 1), uz = dz / (dJ || 1);
      const aproxima = THREE.MathUtils.clamp((dJ - 3) * 1.2, -1.5, 2.5);
      desejado.set(ux * aproxima - uz * v.lado * 1.6, 0, uz * aproxima + ux * v.lado * 1.6);
      tocar(dJ > 6 ? 'correr' : 'guarda');
      if (dJ > 6) desejado.set(ux, 0, uz).multiplyScalar(F.correr);
      if (Math.random() < dt * 0.6) v.lado = -v.lado;
      v.proximasLaminas -= dt; v.proximoPasso -= dt;
      if (v.tempo <= 0 && v.noChao) {
        if (dJ > 5 && dJ < 13 && v.proximasLaminas <= 0) {
          v.estado = 'conjurar'; v.tempo = 0.6; v.proximasLaminas = LAMINA.espera + Math.random() * 2;
        } else if (F.passo && dJ > 3 && v.proximoPasso <= 0) {
          v.estado = 'passo'; v.tempo = 0.3; v.proximoPasso = 7 + Math.random() * 3;
        } else if (F.salto && dJ > 3.5 && dJ < 8 && Math.random() < 0.35) {
          v.estado = 'salto'; v.tempo = 0.2;
          const tVoo = 0.75;
          v.vel.set(dx / tVoo, 9, dz / tVoo); v.noChao = false;
        } else if (dJ > 4.5 && dJ < 11 && v.proximaInvestida <= 0) {
          v.estado = 'preparar'; v.tempo = 0.65; v.proximaInvestida = 5 + Math.random() * 3;
        } else { v.estado = 'perseguir'; v.tempo = 2.5; }
      }
    } else { // perseguir: avança até ela para golpear
      v.tempo -= dt;
      virarPara(jogador.pos, dt);
      if (dJ > 1.35) {
        desejado.set(dx, 0, dz).normalize().multiplyScalar(dJ > 3 ? F.correr : F.correr * 0.6);
        tocar(dJ > 3 ? 'correr' : 'andar');
      } else tocar('guarda');
      if (dJ < 1.6 && v.noChao) { v.estado = 'aviso'; v.tempo = F.aviso; }
      else if (v.tempo <= 0) { v.estado = 'rodear'; v.tempo = 1; }
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
      if (v.estado === 'investida' && res.batida > 3) { v.vel.set(0, 0, 0); atordoar(1.6, 'parede'); }
    }
    // desenho
    b.raiz.position.copy(v.pos);
    b.raiz.rotation.y = v.angulo;
    // tomba para o lado contrário do golpe (de frente: para trás; de lado: para o lado)
    b.corpo.rotation.x = -v.recuo * 0.28 * Math.max(0.3, v.golpeDir.y) + (v.estado === 'atordoado' ? Math.sin(v.atordoado * 9) * 0.05 : 0);
    b.corpo.rotation.z = -v.recuo * 0.22 * v.golpeDir.x;
    const conjurando = v.estado === 'conjurar' || v.estado === 'passo' || v.estado === 'reaparecer';
    // golpe com peso: inclina para a frente no impacto; correndo na investida, bem inclinado
    if (v.golpe) {
      const f = v.golpe.t / b.acoes[v.golpe.nome].getClip().duration, [i0, i1] = IMPACTO[v.golpe.nome];
      b.corpo.rotation.x += Math.sin(THREE.MathUtils.clamp((f - i0 + 0.12) / (i1 - i0 + 0.3), 0, 1) * Math.PI) * 0.16;
    } else if (v.estado === 'investida') b.corpo.rotation.x += 0.22;
    else if (v.estado === 'preparar' || v.estado === 'aviso') b.corpo.rotation.x += 0.08;
    b.mixer.update(dt);
    const m = b.malha.material;
    if (m.emissiveIntensity !== undefined) {
      m.emissive.copy(conjurando ? COR_NEVOA : COR_VERMELHA);
      m.emissiveIntensity = conjurando ? 0.5 + Math.sin(v.tempoModo * 30) * 0.2 : v.flash * 0.6;
    }
    atualizarLaminas(dt);
    // aparecendo / se desfazendo: o corpo sai do chão de névoa (escala vertical e transparência)
    b.raiz.scale.set(1, 0.15 + 0.85 * v.aparecer, 1);
    if (v.aparecer < 1 !== m.transparent) { m.transparent = v.aparecer < 1; m.needsUpdate = true; }
    m.opacity = v.aparecer;
    rc.set(o.set(v.pos.x, v.pos.y + 0.5, v.pos.z), baixo); rc.far = 6;
    const h = rc.intersectObject(mapa.malha)[0];
    sombra.visible = !!h && b.raiz.visible;
    if (h) { sombra.position.copy(h.point).y += 0.04; sombra.material.opacity = v.aparecer; }
  }
  function iniciarGolpe(nome, i, algum = false) {
    v.estado = 'golpe';
    v.golpe = { nome, t: 0, i, acertou: false, algum };
    tocar(nome, 0.1, true);
  }

  return {
    v, boneca: b, iniciar, reiniciar, recuar, atingir, atualizar, atordoar,
    get lutando() { return v.ativo && !['caindo', 'sumindo', 'observando', 'oculto'].includes(v.estado); },
    get visivel() { return b.raiz.visible; },
  };
}
