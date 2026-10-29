import * as THREE from 'three';
import { texturaDeCanvas } from './canvasTextura.js';
import { aplicarPose } from './cambalhota.js';
import { linhaLivre } from './colisao.js';
import { brilhoDeDia } from './dia.js';
import { criarCorpo, lancar, passo as passoObjeto, aplicar, empurrar as empurrarCorpo } from './objetos.js';

// Combate de Brisa: socos (combo de 5), chute, pegar um objeto do chão (galho ou a Agulha de
// Prata) e bater com ele, e defender. Os Retalhos atacam com uma investida; defender de frente
// bloqueia (sem dano, ele recua atordoado).
//
// Animações: socos/chute/guarda/"Attack" vêm da boneca (boneca.js). "Pegar do chão" não existe no
// pacote: é uma pose feita em código (agachar dobrando joelhos e quadril, inclinar o tronco e
// esticar os braços), misturada por cima da animação com os pés mantidos no chão.

// golpes: velocidade da animação, a partir de quando um pulo cancela, alcance (m), dano, janela de
// impacto (fração da animação), avanço (m/s no começo do golpe) e empurrão no inimigo (m/s).
// As janelas seguem o momento de alcance máximo medido em cada animação.
export const GOLPES = {
  soco1: { vel: 1.3, cancela: 0.4, nome: 'Soco rápido', alcance: 1.4, dano: 1, impacto: [0.1, 0.45], avanco: 2.2, empurrao: 1.2 },
  soco2: { vel: 1.3, cancela: 0.4, nome: 'Soco direto', alcance: 1.5, dano: 1, impacto: [0.3, 0.65], avanco: 2.2, empurrao: 1.2 },
  soco3: { vel: 1.3, cancela: 0.4, nome: 'Gancho', alcance: 1.4, dano: 1, impacto: [0.3, 0.7], avanco: 2, empurrao: 1.4 },
  soco4: { vel: 1.3, cancela: 0.4, nome: 'Soco giratório', alcance: 1.6, dano: 1, impacto: [0.4, 0.72], avanco: 2, empurrao: 1.6 },
  soco5: { vel: 1.25, cancela: 0.45, nome: 'Golpe final', alcance: 1.7, dano: 2, impacto: [0.15, 0.5], avanco: 2.4, empurrao: 6 },
  chute: { vel: 1.35, cancela: 0.5, nome: 'Chute giratório', alcance: 1.9, dano: 2, impacto: [0.42, 0.66], avanco: 1.2, empurrao: 5.5 },
  // com objeto na mão: alcance e dano vêm do objeto
  golpeArma: { vel: 1.45, cancela: 0.45, nome: 'Golpe', alcance: 2, dano: 2, impacto: [0.28, 0.52], avanco: 1.2, empurrao: 6, arma: true },
};
const COMBO = ['soco1', 'soco2', 'soco3', 'soco4', 'soco5'];
const JANELA_COMBO = 0.3; // a partir de quanto do golpe atual o próximo toque já fica guardado
const FOLGA_COMBO = 0.4;  // segundos depois de um soco em que um toque ainda continua a sequência

const ARMAS = {
  galho: { nome: 'Galho', dano: 2, alcance: 2.1, usos: 8 },
  agulha: { nome: 'Agulha de Prata', dano: 3, alcance: 2.4, usos: 16 },
};
const DURACAO_PEGAR = 0.8;
const DIRECAO_NA_MAO = new THREE.Vector3(0.318, 0.816, 0.483).normalize();
const INVULNERAVEL = 1.1;
// volume do golpe nos Retalhos: uma cápsula na altura da cintura, do corpo da Brisa até o alcance,
// testada contra o corpo do Retalho (inimigos.js). O alcance segue medido até o centro do alvo:
// a cápsula termina antes dele o quanto somam o raio dela e o do corpo.
const GOLPE_RAIO = 0.45, GOLPE_ALTURA = 0.75, GOLPE_INICIO = 0.2;
const PEITO = 1.1; // de onde sai a linha de visão do golpe (nada pode estar entre ela e o alvo)

const rnd = (() => { let s = 98765; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();

// ---------- modelos dos objetos (comprimento ao longo de +Y, pegada na origem) ----------
function modeloGalho() {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: '#6b4a2b', roughness: 0.9 });
  const curva = new THREE.CatmullRomCurve3([new THREE.Vector3(0, -0.12, 0), new THREE.Vector3(0.02, 0.3, 0.01), new THREE.Vector3(-0.02, 0.62, -0.01), new THREE.Vector3(0.03, 0.9, 0)]);
  const tronco = new THREE.Mesh(new THREE.TubeGeometry(curva, 10, 0.03, 6), mat);
  const g1 = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.22, 5), mat); g1.position.set(0.05, 0.62, 0); g1.rotation.z = -0.8;
  const g2 = new THREE.Mesh(new THREE.ConeGeometry(0.01, 0.16, 5), mat); g2.position.set(-0.04, 0.45, 0.02); g2.rotation.z = 0.9;
  const folha = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 4), new THREE.MeshStandardMaterial({ color: '#6f9a3a', roughness: 1 }));
  folha.scale.set(1, 0.4, 1.8); folha.position.set(0.11, 0.7, 0);
  g.add(tronco, g1, g2, folha);
  return g;
}
function modeloAgulha() {
  const g = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({ color: '#dfe6f2', metalness: 0.95, roughness: 0.18, emissive: '#1a2230' });
  const corpo = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.026, 1.0, 10), metal); corpo.position.y = 0.42;
  const ponta = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.16, 10), metal); ponta.position.y = 1.0;
  // o "olho" da agulha embaixo, com um fio lilás amarrado (o cabo)
  const olho = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.012, 6, 16), metal); olho.position.y = -0.1;
  const fio = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.2, 8), new THREE.MeshStandardMaterial({ color: '#c9a7f2', roughness: 0.8 }));
  fio.position.y = 0.0;
  g.add(corpo, ponta, olho, fio);
  return g;
}

export function criarCombate({ cena, mapa, mundo, terreno, inimigos, campanha, jogador, personagem, tremer, morrer }) {
  const $ = id => document.getElementById(id);
  const hudArma = $('arma'), hudGolpe = $('golpe');
  const rc = new THREE.Raycaster(); rc.firstHitOnly = true; rc.layers.enableAll();
  const baixo = new THREE.Vector3(0, -1, 0);
  const chaoEm = (x, y, z) => { rc.set(new THREE.Vector3(x, y + 2, z), baixo); rc.far = 6; const h = rc.intersectObject(mapa.malha)[0]; return h ? h.point.y : null; };

  // ---------- objetos no chão ----------
  const brilho = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,240,190,0.9)'); gr.addColorStop(1, 'rgba(255,240,190,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    return new THREE.SpriteMaterial({ map: texturaDeCanvas(c), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  })();
  const objetos = [];
  // pontas de cada objeto ao longo de +Y (para a física: objetos.js)
  const PONTAS = { galho: [-0.12, 0.9, 0.04], agulha: [-0.13, 1.08, 0.035] };
  // no começo: solto um pouco acima do chão, deitado, e assentado pela própria física (fica
  // deitado acompanhando a encosta, sem flutuar)
  function colocarNoChao(o, x, z, yRef) {
    const y = chaoEm(x, yRef, z);
    if (y === null) return false;
    o.grupo.position.set(x, y + 0.2, z);
    o.grupo.rotation.set(0, rnd() * Math.PI * 2, Math.PI / 2);
    o.noChao = true;
    cena.add(o.grupo);
    const [y0, y1, r] = PONTAS[o.tipo];
    o.corpo = criarCorpo(o.grupo, y0, y1, r);
    lancar(o.corpo, o.grupo, new THREE.Vector3());
    for (let k = 0; k < 120 && !o.corpo.dormindo; k++) passoObjeto(o.corpo, mapa.geo.boundsTree, 1 / 60);
    aplicar(o.corpo, o.grupo); posicionarLuz(o);
    return true;
  }
  // o brilho que marca o objeto fica sempre acima do meio dele (não gira junto)
  const _acima = new THREE.Vector3();
  function posicionarLuz(o) {
    o.grupo.updateMatrixWorld(true);
    o.luz.position.copy(o.grupo.worldToLocal(_acima.copy(o.corpo.pts[1]).setY(o.corpo.pts[1].y + 0.3)));
  }
  function criarObjeto(tipo) {
    const grupo = new THREE.Group();
    const modelo = tipo === 'agulha' ? modeloAgulha() : modeloGalho();
    modelo.traverse(m => { if (m.isMesh) m.castShadow = false; });
    grupo.add(modelo);
    const luz = new THREE.Sprite(brilho.clone()); luz.scale.setScalar(0.9); luz.position.y = 0.4;
    grupo.add(luz);
    return { tipo, ...ARMAS[tipo], usosRestantes: ARMAS[tipo].usos, grupo, modelo, luz, noChao: false, fase: rnd() * 6 };
  }
  // onde ficam: a agulha ao lado da mesa da oficina; galhos perto do início e de cada âncora
  {
    const of = mundo.oficina; of.updateMatrixWorld(true);
    const p = new THREE.Vector3(-1.1, 0, 2.3).applyMatrix4(of.matrixWorld);
    const agulha = criarObjeto('agulha');
    if (colocarNoChao(agulha, p.x, p.z, p.y)) objetos.push(agulha);
    const livres = terreno.areas.flatMap(a => a.livres);
    const perto = (centro, min, max) => livres.filter(q => { const d = Math.hypot(q.x - centro.x, q.z - centro.z); return d > min && d < max && Math.abs(q.y - centro.y) < 2; });
    const lugares = [...perto(terreno.nascimento, 5, 11).slice(0, 40), ...mundo.ancoras.flatMap(a => perto(a.pos, 4.5, 8).slice(0, 15))];
    const centros = [terreno.nascimento, terreno.nascimento, ...mundo.ancoras.map(a => a.pos)];
    for (const c of centros) {
      const cand = lugares.filter(q => Math.hypot(q.x - c.x, q.z - c.z) < 11 && objetos.every(o => o.grupo.position.distanceTo(q) > 3));
      if (!cand.length) continue;
      const q = cand[Math.floor(rnd() * cand.length)];
      const galho = criarObjeto('galho');
      if (colocarNoChao(galho, q.x, q.z, q.y)) objetos.push(galho);
    }
  }

  // ---------- segurar ----------
  const mao = personagem.rig.ossos['mixamorigRightHand'];
  const suporte = new THREE.Group(); // na mão, em metros (desfaz a escala do esqueleto)
  mao.add(suporte);
  let segurando = null;
  function prenderNaMao(o) {
    cena.remove(o.grupo);
    personagem.raiz.updateMatrixWorld(true);
    const s = mao.getWorldScale(new THREE.Vector3()).x;
    suporte.scale.setScalar(1 / s);
    o.grupo.position.set(0, 0.07, 0.02); // na palma, um pouco à frente dos dedos
    // direção do objeto no espaço da mão: medida com a boneca parada, é a que deixa o objeto
    // apontando para a frente e um pouco para baixo (como quem segura um bastão relaxado);
    // nos golpes ele acompanha a mão
    o.grupo.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), DIRECAO_NA_MAO);
    o.luz.visible = false; o.noChao = false;
    suporte.add(o.grupo);
    segurando = o;
    atualizarHud();
  }
  // soltar: o objeto sai da mão de onde está (posição e direção de verdade), com a velocidade
  // dela mais um pequeno arremesso para a frente, e cai, quica e para sozinho (objetos.js)
  function soltar() {
    if (!segurando) return;
    const o = segurando;
    personagem.raiz.updateMatrixWorld(true);
    o.grupo.updateMatrixWorld(true);
    const m = o.grupo.matrixWorld.clone();
    suporte.remove(o.grupo);
    m.decompose(o.grupo.position, o.grupo.quaternion, o.grupo.scale);
    o.grupo.scale.setScalar(1);
    cena.add(o.grupo);
    const f = new THREE.Vector3(Math.sin(jogador.angulo), 0, Math.cos(jogador.angulo));
    const vel = new THREE.Vector3(jogador.vel.x, Math.max(0, jogador.vel.y), jogador.vel.z).addScaledVector(f, 1.2).setY(Math.max(0, jogador.vel.y) + 1.5);
    const [y0, y1, r] = PONTAS[o.tipo];
    o.corpo = criarCorpo(o.grupo, y0, y1, r);
    lancar(o.corpo, o.grupo, vel, 1 / 60, new THREE.Vector3(f.z, 0, -f.x).multiplyScalar(4 + rnd() * 3));
    o.luz.visible = true; o.noChao = true;
    segurando = null;
    atualizarHud();
  }
  function quebrar() {
    const o = segurando;
    suporte.remove(o.grupo);
    objetos.splice(objetos.indexOf(o), 1);
    faiscas(personagem.raiz.position.clone().add(new THREE.Vector3(0, 1.2, 0)), '#c89a5a', 14);
    mostrar(`${o.nome} quebrou!`);
    segurando = null;
    atualizarHud();
  }

  // ---------- HUD ----------
  let pertoDe = null;
  function atualizarHud() {
    if (segurando) {
      const k = segurando.usosRestantes / segurando.usos;
      hudArma.innerHTML = `<span class="nome">${segurando.nome}</span><i class="barrinha"><i style="width:${Math.round(k * 100)}%"></i></i><kbd title="soltar">F</kbd>`;
    } else if (pertoDe) hudArma.innerHTML = `<kbd>F</kbd><span class="nome">pegar ${pertoDe.nome}</span>`;
    else hudArma.textContent = '';
  }
  let tempoAviso = null;
  // pequeno: mais embaixo e menor (o nome do que ela pegou)
  function mostrar(texto, pequeno = false) {
    hudGolpe.classList.toggle('pequeno', pequeno);
    hudGolpe.textContent = texto; hudGolpe.style.opacity = 1;
    clearTimeout(tempoAviso); tempoAviso = setTimeout(() => { hudGolpe.style.opacity = 0; }, 750);
  }

  // ---------- faíscas de impacto ----------
  const particulas = [];
  function faiscas(pos, cor, n = 10) {
    for (let i = 0; i < n; i++) {
      const s = new THREE.Sprite(brilho.clone());
      s.material.color.set(cor);
      s.scale.setScalar(0.18 + rnd() * 0.18);
      s.position.copy(pos);
      const a = rnd() * Math.PI * 2, e = rnd() * 1.2;
      s.userData = { v: new THREE.Vector3(Math.cos(a) * Math.cos(e), Math.sin(e) + 0.3, Math.sin(a) * Math.cos(e)).multiplyScalar(3 + rnd() * 3), vida: 0.35 + rnd() * 0.25 };
      cena.add(s); particulas.push(s);
    }
  }

  // ---------- estado ----------
  const est = { invulneravel: 0, hitstop: 0, ultimoCombo: -1, desdeCombo: 9, acertados: null };
  let pedido = null, proximo = null;

  function alvos() {
    return [
      ...inimigos.lista.filter(e => e.ativo).map(e => ({ tipo: 'inimigo', obj: e, pos: e.pos })),
      ...mundo.ancoras.flatMap(a => a.cristais.filter(c => !c.quebrado).map(c => ({ tipo: 'cristal', obj: c, pos: c.pos }))),
    ];
  }
  function iniciarGolpe(nome) {
    const g = GOLPES[nome];
    // mira suave: vira para o inimigo (ou cristal) mais próximo à frente
    let melhor = null, d = 3.2;
    for (const a of alvos()) { const x = Math.hypot(a.pos.x - jogador.pos.x, a.pos.z - jogador.pos.z); if (x < d - (a.tipo === 'inimigo' ? 0.8 : 0)) { d = x; melhor = a; } }
    if (melhor) jogador.angulo = Math.atan2(melhor.pos.x - jogador.pos.x, melhor.pos.z - jogador.pos.z);
    jogador.golpe = { nome, t: 0, duracao: personagem.acoes[nome].getClip().duration / g.vel, cancela: g.cancela, novo: true };
    est.acertados = new Set();
  }

  // confere o golpe ativo contra inimigos e cristais (uma vez por alvo em cada golpe)
  function aplicarGolpe() {
    const g = jogador.golpe;
    if (!g) return;
    const def = GOLPES[g.nome], f = g.t / g.duracao;
    if (f < def.impacto[0] || f > def.impacto[1]) return;
    const arma = def.arma ? segurando : null;
    const alcance = arma ? arma.alcance : def.alcance, dano = arma ? arma.dano : def.dano;
    const frente = new THREE.Vector3(Math.sin(jogador.angulo), 0, Math.cos(jogador.angulo));
    const centro = jogador.pos.clone().addScaledVector(frente, 0.45);
    const ini = jogador.pos.clone().addScaledVector(frente, GOLPE_INICIO).setY(jogador.pos.y + GOLPE_ALTURA);
    const fim = jogador.pos.clone().addScaledVector(frente, Math.max(GOLPE_INICIO, alcance + 0.45 - GOLPE_RAIO - 0.44)).setY(ini.y);
    const peito = jogador.pos.clone().setY(jogador.pos.y + PEITO);
    // objetos soltos à frente voam com o golpe (o chute manda mais longe)
    for (const o of objetos) {
      if (!o.noChao || !o.corpo || est.acertados.has(o)) continue;
      const d = o.corpo.pts[1].clone().sub(centro); const dy = Math.abs(d.y); d.setY(0);
      if (d.length() > alcance + 0.3 || dy > 1.2) continue;
      if (d.lengthSq() > 0.04 && d.normalize().dot(frente) < 0.25) continue;
      est.acertados.add(o);
      const forca = g.nome === 'chute' ? 7 : 4;
      empurrarCorpo(o.corpo, frente.clone().multiplyScalar(forca).setY(forca * 0.45));
    }
    for (const a of alvos()) {
      if (est.acertados.has(a.obj)) continue;
      const ponto = a.pos.clone().add(new THREE.Vector3(0, a.tipo === 'inimigo' ? 0.5 : 0.3, 0));
      if (a.tipo === 'inimigo') {
        if (inimigos.distanciaSegmento(a.obj, ini, fim) > GOLPE_RAIO) continue;
      } else {
        const d = a.pos.clone().sub(centro); const dy = Math.abs(d.y); d.setY(0);
        if (d.length() > alcance || dy > 1.6) continue;
        if (d.lengthSq() > 0.04 && d.normalize().dot(frente) < 0.25) continue; // cone de ~75° à frente
      }
      if (!linhaLivre(mapa, peito, ponto)) continue; // não acerta através de paredes
      est.acertados.add(a.obj);
      if (a.tipo === 'inimigo') {
        inimigos.atingir(a.obj, dano, jogador.pos, def.empurrao);
        faiscas(ponto, '#ffe6a0', 8 + dano * 3);
        if (!a.obj.ativo) campanha.registrarPurificado();
      } else {
        const c = a.obj; c.vida -= dano; c.flash = 1;
        faiscas(ponto, '#c890ff', 10);
        if (c.vida <= 0) { c.quebrado = true; c.grupo.visible = false; c.aura.visible = false; campanha.registrarCristal(); }
      }
      // o golpe "pesa": congela um instante e a câmera dá um tranco
      est.hitstop = Math.max(est.hitstop, 0.05 + dano * 0.015);
      tremer(0.18 + dano * 0.08);
      if (arma) { arma.usosRestantes--; atualizarHud(); if (arma.usosRestantes <= 0) { quebrar(); return; } }
    }
  }

  // ---------- ser atacada ----------
  // o Retalho que acerta a investida: defendendo de frente, bloqueia; senão perde fôlego
  function aoSerAtacada(e) {
    const j = jogador;
    if (est.invulneravel > 0 || j.morta || campanha.estado.terminou) return;
    const para = e.pos.clone().sub(j.pos).setY(0).normalize(); // da Brisa para o inimigo
    const frente = new THREE.Vector3(Math.sin(j.angulo), 0, Math.cos(j.angulo));
    if (j.defendendo && frente.dot(para) > 0.1) {
      j.vel.addScaledVector(para, -3);
      e.vel.copy(para).multiplyScalar(5); e.estado = 'atordoado'; e.atordoado = 0.8; e.flash = 0.6;
      faiscas(j.pos.clone().addScaledVector(para, 0.45).add(new THREE.Vector3(0, 1.1, 0)), '#bfe4ff', 12);
      tremer(0.25); est.invulneravel = 0.35; est.hitstop = 0.06;
      mostrar('Defendeu!');
      return;
    }
    est.invulneravel = INVULNERAVEL;
    j.vel.set(-para.x * 7, 4.5, -para.z * 7); j.noChao = false;
    j.golpe = null; j.pegando = null; j.machucado = 0.45;
    tremer(0.5);
    if (campanha.perderVida(1) <= 0) morrer('golpe');
  }

  // ---------- por passo de física ----------
  // um comando apertado num momento em que ela não pode agir (no ar, recuando de um golpe) fica
  // guardado um instante e sai assim que der, em vez de se perder
  let validade = 0;
  function pedir(tipo) { pedido = tipo; validade = 0.3; }
  function passo(dt) {
    const j = jogador;
    validade -= dt;
    if (validade <= 0) pedido = null;
    est.invulneravel = Math.max(0, est.invulneravel - dt);
    est.desdeCombo += dt;
    j.machucado = Math.max(0, (j.machucado || 0) - dt);
    const livre = j.noChao && j.cambalhota < 0 && !j.morta && !j.pegando && !(j.machucado > 0);

    // pegar / soltar
    if (pedido === 'pegar') {
      if (segurando && !j.golpe) { soltar(); pedido = null; }
      else if (!segurando && pertoDe && livre && !j.golpe) {
        j.pegando = { t: 0, objeto: pertoDe, preso: false };
        j.angulo = Math.atan2(pertoDe.grupo.position.x - j.pos.x, pertoDe.grupo.position.z - j.pos.z);
        pedido = null;
      }
    }
    if (j.pegando) {
      const p = j.pegando;
      p.t += dt;
      if (!p.preso && p.t >= DURACAO_PEGAR * 0.5) { p.preso = true; prenderNaMao(p.objeto); mostrar(`Pegou: ${p.objeto.nome}`, true); }
      if (p.t >= DURACAO_PEGAR) j.pegando = null;
    }

    // golpes: só no chão. "combo" começa o soco 1 e, durante um soco, guarda o próximo para emendar.
    // Segurando um objeto, o golpe principal é bater com ele.
    if (pedido === 'combo' || pedido === 'chute') {
      let feito = false;
      if (pedido === 'combo' && segurando) { if (!j.golpe && livre) { iniciarGolpe('golpeArma'); feito = true; } }
      else if (pedido === 'combo') {
        const i = j.golpe ? COMBO.indexOf(j.golpe.nome) : -1;
        if (!j.golpe && livre) {
          const continua = est.ultimoCombo >= 0 && est.ultimoCombo < COMBO.length - 1 && est.desdeCombo < FOLGA_COMBO;
          iniciarGolpe(COMBO[continua ? est.ultimoCombo + 1 : 0]); feito = true;
        } else if (i >= 0 && i < COMBO.length - 1 && j.golpe.t / j.golpe.duracao > JANELA_COMBO) { proximo = COMBO[i + 1]; feito = true; }
      } else if (!j.golpe && livre) { iniciarGolpe('chute'); feito = true; }
      if (feito) pedido = null;
    }
    if (j.golpe) {
      j.golpe.t += dt;
      aplicarGolpe();
      // termina um pouco antes do fim da animação, que se mistura com a próxima
      if (j.golpe && j.golpe.t >= j.golpe.duracao - 0.12) {
        est.ultimoCombo = COMBO.indexOf(j.golpe.nome); est.desdeCombo = 0;
        j.golpe = null;
        if (proximo && j.noChao) iniciarGolpe(proximo);
        proximo = null;
      }
    }
    if (!j.noChao && j.golpe) { j.golpe = null; proximo = null; } // saiu do chão: o golpe acaba

    // objeto mais próximo para pegar
    pertoDe = null;
    if (!segurando) {
      let d = 1.6;
      for (const o of objetos) if (o.noChao) { const x = (o.corpo ? o.corpo.pts[1] : o.grupo.position).distanceTo(j.pos); if (x < d) { d = x; pertoDe = o; } }
    }
  }

  // ---------- por quadro (visual) ----------
  const empurrador = { inicio: new THREE.Vector3(), fim: new THREE.Vector3(), raio: 0.2, vel: new THREE.Vector3() };
  let hudAntes = '';
  function atualizar(dt, t) {
    // física dos objetos soltos; a Brisa empurra (chuta) o que estiver nos pés dela
    const p = jogador.pos;
    empurrador.inicio.set(p.x, p.y + 0.06, p.z); empurrador.fim.set(p.x, p.y + 0.5, p.z);
    empurrador.vel.set(jogador.vel.x, 0, jogador.vel.z);
    const empurra = Math.hypot(jogador.vel.x, jogador.vel.z) > 0.5 && !jogador.morta ? [empurrador] : [];
    for (const o of objetos) if (o.noChao) {
      o.luz.material.opacity = (0.45 + Math.sin(t * 3 + o.fase) * 0.25) * brilhoDeDia(0.3);
      if (o.corpo && passoObjeto(o.corpo, mapa.geo.boundsTree, Math.min(dt, 1 / 30), empurra)) { aplicar(o.corpo, o.grupo); posicionarLuz(o); }
    }
    for (const s of [...particulas]) {
      const u = s.userData; u.vida -= dt;
      u.v.y -= 9 * dt; s.position.addScaledVector(u.v, dt);
      s.material.opacity = Math.max(0, u.vida * 3);
      if (u.vida <= 0) { cena.remove(s); s.material.dispose(); particulas.splice(particulas.indexOf(s), 1); }
    }
    const chave = `${segurando?.usosRestantes}|${pertoDe?.nome}`;
    if (chave !== hudAntes) { hudAntes = chave; atualizarHud(); }
  }
  function avancarHitstop(dtReal) { est.hitstop = Math.max(0, est.hitstop - dtReal); }

  // Pose de "pegar do chão" (depois de mixer.update): agacha, inclina o tronco e estica os braços.
  // Os pés ficam onde a animação de base os pôs: o quadril desce o quanto as pernas dobradas sobem.
  const AGACHADO = { bacia: 0, quadril: 1.35, joelho: 2.0, pe: 1.35 - 2.0, coluna: 0.6, braco: 1.2, cotovelo: 0.25, cabeca: 0.3 };
  const pes = ['mixamorigLeftFoot', 'mixamorigRightFoot'].map(n => personagem.rig.ossos[n]);
  const tmp = new THREE.Vector3();
  function aplicarPoses() {
    const p = jogador.pegando;
    if (!p) return;
    const k = p.t / DURACAO_PEGAR;
    const w = THREE.MathUtils.smoothstep(k, 0, 0.35) * (1 - THREE.MathUtils.smoothstep(k, 0.65, 1));
    if (w <= 0) return;
    personagem.raiz.updateMatrixWorld(true);
    const antes = Math.min(...pes.map(o => o.getWorldPosition(tmp).y));
    aplicarPose(personagem.rig, AGACHADO, w, false);
    personagem.raiz.updateMatrixWorld(true);
    const depois = Math.min(...pes.map(o => o.getWorldPosition(tmp).y));
    const hips = personagem.rig.ossos[personagem.rig.papeis.hips];
    hips.getWorldPosition(tmp); tmp.y -= depois - antes;
    hips.position.copy(hips.parent.worldToLocal(tmp));
    hips.updateMatrixWorld(true);
  }

  return {
    pedir, passo, atualizar, aplicarPoses, aoSerAtacada, avancarHitstop,
    get segurando() { return segurando; },
    get invulneravel() { return est.invulneravel; },
    get hitstop() { return est.hitstop; },
    objetos,
  };
}
