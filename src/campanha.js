import * as THREE from 'three';
import { texturaDeCanvas } from './canvasTextura.js';
import { linhaLivre } from './colisao.js';
import { DICAS_TOQUE, paraToque } from './historia.js';
import { FALAS, DICAS, OBJETIVOS, MEMORIAS, AVISOS, BILHETE, CAPITULO, CARTAS, INTERACOES } from './historia.js';
import { CAPITULO_ATUAL } from './capitulo.js';

// Chapter progression (the same structure in the four chapters, with each chapter's texts): fragments, purification by interaction, restoring the anchors and the
// Heart of the Thread, short dialogues, tremors while the island sinks, and the ending.
// Everything here is lightweight and driven by the game loop (atualizar) and the E key (interagir).

import { dificuldade } from './dificuldade.js';
import { som } from './som.js';

// fôlegos da Brisa: dependem da dificuldade (dificuldade.js), lida a cada uso
const vidaMax = () => dificuldade().folego;
const TOQUE = matchMedia('(pointer: coarse)').matches; // celular/tablet: dicas dos botões de toque

const $ = id => document.getElementById(id);

export function criarCampanha({ cena, mapa, mundo, inimigos, jogador, respawn, comEscuro, aoTerminar, aoAtaque, casas = [], aoSalvar = null }) {
  const ui = {
    vida: $('vida'), objetivo: $('objetivo'),
    fala: $('fala'), falaQuem: document.querySelector('#fala b'), falaTexto: document.querySelector('#fala span'),
    dica: $('dicaTutorial'), aviso: $('aviso'), interagir: $('interagir'), memoria: $('memoria'), bilhete: $('bilhete'),
    fragmentos: $('moedas'),
  };
  // no toque o objetivo fica na coluna da esquerda, no fluxo, embaixo do fôlego (design/ux/hud.md, celular)
  if (TOQUE) $('hud').querySelector('.esq').appendChild(ui.objetivo);

  // ---------- fragments ----------
  const geoFrag = new THREE.OctahedronGeometry(0.22, 0); geoFrag.scale(1, 1.7, 1);
  const matFrag = new THREE.MeshBasicMaterial({ color: '#ffe9a0' });
  const matMem = new THREE.MeshBasicMaterial({ color: '#d9b8ff' });
  const halo = (cor) => {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, cor); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    return new THREE.SpriteMaterial({ map: texturaDeCanvas(c), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  };
  const haloFrag = halo('rgba(255,225,140,0.9)'), haloMem = halo('rgba(200,160,255,0.9)');
  const fragmentos = mundo.fragmentos.map((f, i) => {
    const g = new THREE.Group();
    const m = new THREE.Mesh(geoFrag, f.memoria ? matMem : matFrag);
    const h = new THREE.Sprite(f.memoria ? haloMem : haloFrag); h.scale.setScalar(1.3);
    g.add(m, h); g.position.copy(f.pos); cena.add(g);
    return { ...f, grupo: g, malha: m, pega: false, y: f.pos.y, fase: i * 0.7 };
  });
  let memoriasLidas = 0;

  // ---------- cartas dos moradores, no chão de cada casa da vila ----------
  const papel = new THREE.MeshStandardMaterial({ color: '#f4ead2', emissive: '#4a3d22', roughness: 0.9, side: THREE.DoubleSide });
  const haloCarta = halo('rgba(255,238,190,0.75)');
  const cartas = casas.filter(c => CARTAS[c.nome]).map(c => {
    const g = new THREE.Group();
    const folha = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 0.42), papel); folha.rotation.x = -Math.PI / 2; folha.rotation.z = 0.4;
    const brilho = new THREE.Sprite(haloCarta); brilho.scale.setScalar(0.9); brilho.position.y = 0.2;
    g.add(folha, brilho); g.position.copy(c.pos).add(new THREE.Vector3(0, 0.26, 0)); cena.add(g);
    return { nome: c.nome, pos: g.position, grupo: g, brilho, lida: false };
  });
  let cartasLidas = 0;

  // ---------- farol do objetivo (level design: guiar sem encher a tela de texto) ----------
  // uma coluna de luz dourada, alta e fininha, sobre o objetivo atual: a âncora apagada mais perto
  // e, depois, o Coração. Vista de longe por cima das árvores; some quando ela chega perto (não
  // atrapalha a área) e durante as lutas
  const farol = new THREE.Mesh(
    new THREE.CylinderGeometry(0.9, 1.6, 70, 14, 1, true).translate(0, 35, 0),
    new THREE.ShaderMaterial({
      // (mistura normal, não aditiva: luz dourada somada ao céu claro do dia quase não aparecia)
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      uniforms: { forca: { value: 0 }, tempo: { value: 0 } },
      vertexShader: 'varying float vY; void main() { vY = position.y / 70.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform float forca; uniform float tempo; varying float vY; void main() { float a = forca * pow(1.0 - vY, 0.6) * (0.8 + 0.2 * sin(tempo * 2.0 - vY * 14.0)); gl_FragColor = vec4(1.0, 0.8, 0.38, a); }',
    }));
  farol.frustumCulled = false; farol.visible = false; farol.renderOrder = 2;
  cena.add(farol);
  function atualizarFarol(dt, t) {
    let alvo = null;
    if (est.etapa === 'ancoras' || est.etapa === 'inicio') {
      let d = Infinity;
      for (const a of mundo.ancoras) if (!a.restaurada) { const x = a.pos.distanceTo(jogador.pos); if (x < d) { d = x; alvo = a.pos; } }
    } else if (est.etapa === 'coracao' || est.etapa === 'chefe') alvo = mundo.coracao.pos;
    const lutando = chefe?.lutando;
    const d = alvo ? Math.hypot(alvo.x - jogador.pos.x, alvo.z - jogador.pos.z) : 0;
    const quer = alvo && !lutando ? THREE.MathUtils.smoothstep(d, 10, 30) * 0.6 : 0;
    const u = farol.material.uniforms;
    u.forca.value += (quer - u.forca.value) * Math.min(1, dt * 2);
    u.tempo.value = t;
    farol.visible = u.forca.value > 0.005;
    if (alvo) farol.position.copy(alvo);
  }

  // ---------- state ----------
  const est = {
    vida: vidaMax(), pegos: 0, purificados: 0, cristais: 0,
    etapa: 'inicio', checkpoint: jogador.pos.clone(), tempoTremor: 22, tremor: 0,
    dicas: new Set(), andou: 0, falas: [], falaTempo: 0, mostrouAncora: new Set(), viuInimigo: false, terminou: false,
  };

  // ---------- UI helpers ----------
  // fôlego: um carretel por fôlego (cheio / vazio), o número "4/5" e, no último, o "!" (design/ux/hud.md).
  // Os nós são criados só quando o total muda (dificuldade); o resto é troca de classe e de texto.
  const SVG = 'http://www.w3.org/2000/svg';
  const CARRETEL_CHEIO = '#i-carretel-cheio', CARRETEL_VAZIO = '#i-carretel-vazio', MS_DESENROLA = 320;
  const icone = (href, classe) => {
    const s = document.createElementNS(SVG, 'svg'), u = document.createElementNS(SVG, 'use');
    s.setAttribute('class', classe); s.setAttribute('aria-hidden', 'true'); u.setAttribute('href', href); s.appendChild(u);
    return s;
  };
  const vidaUi = { carreteis: [], num: null, vida: -1, max: -1 };
  function atualizarVida() {
    const max = vidaMax();
    if (max !== vidaUi.max) {
      ui.vida.replaceChildren();
      vidaUi.carreteis = [];
      for (let i = 0; i < max; i++) { const c = icone(CARRETEL_CHEIO, 'carretel'); vidaUi.carreteis.push(c); ui.vida.appendChild(c); }
      vidaUi.num = document.createElement('span'); vidaUi.num.className = 'num';
      ui.vida.append(vidaUi.num, icone('#i-alerta', 'i alerta'));
      vidaUi.vida = -1;
    }
    if (est.vida === vidaUi.vida && max === vidaUi.max) return;
    const perdeu = vidaUi.max === max && vidaUi.vida > est.vida;
    vidaUi.carreteis.forEach((c, i) => {
      const cheio = i < est.vida;
      c.classList.toggle('vazio', !cheio);
      c.firstChild.setAttribute('href', cheio ? CARRETEL_CHEIO : CARRETEL_VAZIO);
      if (perdeu && i >= est.vida && i < vidaUi.vida) { c.classList.add('desenrola'); setTimeout(() => c.classList.remove('desenrola'), MS_DESENROLA); }
    });
    vidaUi.vida = est.vida; vidaUi.max = max;
    vidaUi.num.textContent = `${est.vida}/${max}`;
    ui.vida.setAttribute('aria-label', `Fôlego: ${est.vida} de ${max}`);
    const baixo = est.vida === 1;
    ui.vida.classList.toggle('baixo', baixo);
    document.body.classList.toggle('folego-baixo', baixo); // o pulso do fôlego baixo tem a vez (os outros ficam fixos)
  }
  const fragUi = { num: ui.fragmentos.querySelector('b'), total: ui.fragmentos.querySelector('.total'), pegos: -1 };
  function atualizarFragmentos() {
    if (est.pegos === fragUi.pegos) return;
    const cresceu = fragUi.pegos >= 0 && est.pegos > fragUi.pegos;
    fragUi.pegos = est.pegos;
    fragUi.num.textContent = est.pegos; fragUi.total.textContent = `/ ${fragmentos.length}`;
    ui.fragmentos.setAttribute('aria-label', `Fragmentos: ${est.pegos} de ${fragmentos.length}`);
    if (cresceu) { ui.fragmentos.classList.remove('pegou'); void ui.fragmentos.offsetWidth; ui.fragmentos.classList.add('pegou'); }
  }
  // o HUD é atualizado todo quadro: só mexe no HTML quando o conteúdo muda
  const ultimoHtml = new Map();
  function html(el, conteudo) { if (ultimoHtml.get(el) !== conteudo) { ultimoHtml.set(el, conteudo); el.innerHTML = conteudo; } }
  const escapar = s => s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  // "E — Purificar o Retalho" vira a tecla desenhada + o texto
  // (no toque a tecla vira o ícone "usar", o mesmo do botão)
  const ICONE_USAR = '<svg class="i" aria-hidden="true"><use href="#i-usar"/></svg>';
  const comTecla = t => { const m = /^(\w) — (.*)$/.exec(t); return m ? `<kbd>${TOQUE ? ICONE_USAR : m[1]}</kbd>${escapar(m[2])}` : escapar(t); };

  // ---------- fila de aviso e memória (design/ux/hud.md, "Feedback"): os dois dividem a zona do meio.
  // 1 na tela + 1 esperando de cada tipo; o aviso passa à frente (interrompe a memória, que volta
  // depois); a memória espera a luta acabar. ----------
  const MS_INTERVALO_FILA = 120, MS_MIN_MEMORIA_RETOMADA = 3000;
  const ICONES_AVISO = { ok: '#i-ok', alerta: '#i-alerta', fragmento: '#i-fragmento' };
  const avisoUi = { icone: ui.aviso.querySelector('svg'), uso: ui.aviso.querySelector('use'), texto: ui.aviso.querySelector('span') };
  const memoriaUi = { titulo: ui.memoria.querySelector('h3 span'), uso: ui.memoria.querySelector('h3 use'), texto: ui.memoria.querySelector('p') };
  const fila = { atual: null, fim: 0, tempo: null, aviso: null, memoria: null };
  const emLuta = () => document.body.classList.contains('em-luta');
  function exibir(item) {
    fila.atual = item; fila.fim = performance.now() + item.ms;
    if (item.tipo === 'aviso') {
      avisoUi.uso.setAttribute('href', ICONES_AVISO[item.icone] ?? ICONES_AVISO.ok);
      avisoUi.icone.setAttribute('class', `i ${item.icone}`);
      avisoUi.texto.textContent = item.texto;
      ui.aviso.classList.add('visivel');
    } else {
      memoriaUi.titulo.textContent = item.titulo; memoriaUi.uso.setAttribute('href', item.icone);
      memoriaUi.texto.textContent = item.texto;
      ui.memoria.classList.add('visivel');
    }
    clearTimeout(fila.tempo); fila.tempo = setTimeout(encerrar, item.ms);
  }
  function encerrar() {
    if (!fila.atual) return;
    (fila.atual.tipo === 'aviso' ? ui.aviso : ui.memoria).classList.remove('visivel');
    fila.atual = null;
    setTimeout(proximoDaFila, MS_INTERVALO_FILA);
  }
  function proximoDaFila() {
    if (fila.atual) return;
    let item = fila.aviso;
    if (item) fila.aviso = null;
    else if (fila.memoria && !emLuta()) { item = fila.memoria; fila.memoria = null; }
    if (item) exibir(item);
  }
  function enfileirar(item) {
    if (!fila.atual) { if (item.tipo === 'memoria' && emLuta()) fila.memoria = item; else exibir(item); return; }
    if (item.tipo === 'memoria') { fila.memoria = item; return; }
    if (fila.atual.tipo === 'memoria') {
      // o aviso passa à frente: a memória sai e volta depois com o tempo que faltava
      const m = fila.atual;
      ui.memoria.classList.remove('visivel');
      if (!fila.memoria) fila.memoria = { ...m, ms: Math.max(MS_MIN_MEMORIA_RETOMADA, fila.fim - performance.now()) };
      exibir(item);
    } else fila.aviso = item;
  }
  // icone: 'ok' (conquista), 'alerta' (perigo) ou 'fragmento'
  function aviso(texto, ms = 2600, icone = 'ok') { enfileirar({ tipo: 'aviso', texto, ms, icone }); }
  let tempoDica = null;
  // depois do mini tutorial (tutorial.js) as dicas de controle não aparecem mais: só as que
  // respondem a algo que ela tentou fazer (forcar), como a âncora ainda presa por cristais
  let semDicas = false;
  function silenciarDicas() { semDicas = true; }
  function dica(chave, forcar = false) {
    if (semDicas && !forcar) return;
    if (est.dicas.has(chave) && !forcar) return;
    est.dicas.add(chave);
    ui.dica.textContent = TOQUE ? (DICAS_TOQUE[chave] ?? paraToque(DICAS[chave])) : DICAS[chave]; ui.dica.style.opacity = 1;
    clearTimeout(tempoDica); tempoDica = setTimeout(() => { ui.dica.style.opacity = 0; }, 7000);
  }
  function falar(linhas) { est.falas.push(...linhas); if (!est.falaAtual) proximaFala(); }
  function proximaFala() {
    const f = est.falas.shift();
    est.falaAtual = f || null;
    if (!f) { ui.fala.classList.remove('visivel'); return; }
    ui.falaQuem.textContent = f[0]; ui.falaTexto.textContent = f[1];
    ui.fala.classList.add('visivel');
    est.falaTempo = Math.max(2.8, f[1].length * 0.055);
  }
  function objetivo() {
    const restauradas = mundo.ancoras.filter(a => a.restaurada).length;
    let txt;
    if (est.etapa === 'inicio') txt = OBJETIVOS.inicio;
    else if (est.etapa === 'ancoras') txt = OBJETIVOS.ancoras(restauradas, mundo.ancoras.length);
    else if (est.etapa === 'coracao') txt = OBJETIVOS.coracao;
    else if (est.etapa === 'chefe') txt = OBJETIVOS.chefe;
    else if (est.etapa === 'bilhete') txt = OBJETIVOS.bilhete;
    else txt = OBJETIVOS.fim;
    // details of the nearest unfinished anchor
    const a = ancoraProxima(16);
    if (a && !a.restaurada && est.etapa === 'ancoras') {
      const cr = a.cristais.filter(c => !c.quebrado).length;
      const gd = inimigos.lista.filter(e => e.ancora === a && e.ativo).length;
      txt += `\nCristais: ${cr} · Guardiões: ${gd} · Luz: ${Math.min(est.pegos, a.requer)}/${a.requer}`;
    }
    // primeira linha = o objetivo; o resto (cristais, guardiões, luz) vai menor embaixo
    const [titulo, ...detalhes] = txt.split('\n');
    // (os detalhes da âncora só de perto dela, numa linha curta: menos texto na tela durante o jogo)
    html(ui.objetivo, `<svg class="i ok" aria-hidden="true"><use href="#i-ok"/></svg><b>${escapar(titulo)}</b>${detalhes.length ? `<span class="detalhe">${escapar(detalhes.join(' · '))}</span>` : ''}`);
    // mudou: fio sólido por 1,5 s; ✓ por 1 s (o anterior foi cumprido)
    if (objetivoUi.titulo !== null && titulo !== objetivoUi.titulo) {
      ui.objetivo.classList.add('mudou', 'concluido');
      clearTimeout(objetivoUi.tMudou); clearTimeout(objetivoUi.tOk);
      objetivoUi.tMudou = setTimeout(() => ui.objetivo.classList.remove('mudou'), MS_OBJETIVO_MUDOU);
      objetivoUi.tOk = setTimeout(() => ui.objetivo.classList.remove('concluido'), MS_OBJETIVO_OK);
    }
    objetivoUi.titulo = titulo;
  }
  const MS_OBJETIVO_MUDOU = 1500, MS_OBJETIVO_OK = 1000, MS_MEMORIA = 7500;
  const objetivoUi = { titulo: null, tMudou: null, tOk: null };
  function memoria(texto, titulo = 'Fragmento de Lembrança', icone = '#i-fragmento') {
    enfileirar({ tipo: 'memoria', texto, titulo, icone, ms: MS_MEMORIA });
  }

  function ancoraProxima(raio) {
    let melhor = null, d = raio;
    for (const a of mundo.ancoras) { const x = a.pos.distanceTo(jogador.pos); if (x < d) { d = x; melhor = a; } }
    return melhor;
  }

  // (só o que ela alcança: nada de acalmar um Retalho do outro lado de uma parede)
  const peito = new THREE.Vector3(), alvoVisto = new THREE.Vector3();
  function alvoPurificavel() {
    let melhor = null, distancia = 2.5;
    peito.copy(jogador.pos).y += 1.1;
    for (const e of inimigos.lista) if (e.ativo) { const d = e.pos.distanceTo(jogador.pos); if (d < distancia && inimigos.alcanca(e, peito)) { melhor = { tipo: 'retalho', obj: e }; distancia = d; } }
    for (const a of mundo.ancoras) for (const c of a.cristais) if (!c.quebrado) {
      const d = c.pos.distanceTo(jogador.pos);
      if (d < distancia && linhaLivre(mapa, peito, alvoVisto.set(c.pos.x, c.pos.y + 0.3, c.pos.z))) { melhor = { tipo: 'cristal', obj: c }; distancia = d; }
    }
    return melhor;
  }
  function purificar(alvo) {
    if (alvo.tipo === 'retalho') { inimigos.purificar(alvo.obj); est.purificados++; aviso(AVISOS.inimigoPurificado, 1400); }
    else { const c = alvo.obj; c.quebrado = true; c.grupo.visible = false; c.aura.visible = false; est.cristais++; aviso(AVISOS.cristalQuebrado, 1400); }
    salvar();
  }

  // ---------- interactions ----------
  let interacao = null;
  function procurarInteracao() {
    interacao = null;
    const alvo = alvoPurificavel();
    if (alvo) interacao = { texto: `E — ${alvo.tipo === 'retalho' ? 'Acalmar o Retalho' : 'Dissolver o Cristal de Névoa'}`, acao: () => purificar(alvo) };
    if (interacao) { html(ui.interagir, comTecla(interacao.texto)); ui.interagir.style.opacity = 1; return; }
    for (const c of cartas) {
      if (Math.hypot(c.pos.x - jogador.pos.x, c.pos.z - jogador.pos.z) < 2.4 && Math.abs(c.pos.y - jogador.pos.y) < 2) {
        interacao = { texto: `E — Ler a carta (${c.nome})`, acao: () => lerCarta(c) };
        break;
      }
    }
    if (interacao) { html(ui.interagir, comTecla(interacao.texto)); ui.interagir.style.opacity = 1; return; }
    if (est.etapa === 'ancoras' || est.etapa === 'inicio') {
      const a = ancoraProxima(2.8);
      if (a && !a.restaurada) interacao = { texto: `E — ${INTERACOES.ancora}`, acao: () => tentarAncora(a) };
    }
    const dCor = mundo.coracao.pos.distanceTo(jogador.pos);
    if (dCor < 3.4) {
      if (est.etapa === 'coracao') interacao = { texto: `E — ${INTERACOES.coracao}`, acao: restaurarCoracao };
      else if (est.etapa === 'bilhete') interacao = { texto: `E — ${INTERACOES.bilhete}`, acao: lerBilhete };
      else if (est.etapa === 'ancoras' || est.etapa === 'inicio') interacao = { texto: `E — ${INTERACOES.examinar}`, acao: () => falar(FALAS.coracaoFechado) };
    }
    html(ui.interagir, interacao ? comTecla(interacao.texto) : '');
    ui.interagir.style.opacity = interacao ? 1 : 0;
  }
  function lerCarta(c) {
    memoria(CARTAS[c.nome], c.nome, '#i-carta');
    if (!c.lida) { c.lida = true; cartasLidas++; c.brilho.visible = false; if (cartasLidas === 1) falar(FALAS.primeiraCarta); salvar(); }
  }
  function tentarAncora(a) {
    const cristaisRestantes = a.cristais.filter(c => !c.quebrado).length;
    const guardas = inimigos.lista.filter(e => e.ancora === a && e.ativo).length;
    if (guardas > 0) return falar(FALAS.ancoraComGuardas);
    if (cristaisRestantes > 0) { dica('cristal', true); return; }
    if (est.pegos < a.requer) return falar(FALAS.ancoraSemFragmentos);
    mundo.ancoras.restaurar(a);
    const n = mundo.ancoras.filter(x => x.restaurada).length;
    // checkpoint where Brisa is standing (she must be on the ground next to the anchor to restore
    // it); a fixed offset from the anchor could land over the edge on small islands
    est.checkpoint.copy(jogador.noChao ? jogador.pos : (jogador.seguro ?? jogador.pos)).add(new THREE.Vector3(0, 0.2, 0));
    est.vida = vidaMax(); atualizarVida();
    aviso(AVISOS.ancoraRestaurada); som.ancora();
    falar(FALAS.ancoraRestaurada[Math.min(n, 3) - 1]);
    est.tempoTremor = 30 + n * 25;
    if (n === mundo.ancoras.length) { est.etapa = chefe ? 'chefe' : 'coracao'; dica('coracao'); }
    // a corrente nova do Pomar até o pé do Morro (mundo.js, só no Cap. 1) liga agora
    if (n === mundo.ancoras.length && mundo.correntes.some(c => c.atalho)) setTimeout(() => aviso(AVISOS.atalhoMorro, 3200), 2500);
    // Ravi aparece: depois da 1ª âncora, olhando de longe; depois da 2ª, numa emboscada
    if (chefe && n === 1 && !est.raviObservou) { est.raviObservou = true; setTimeout(() => aparecerRavi('observar'), 3500); }
    if (chefe && n === 2 && !est.raviEmboscou) { est.raviEmboscou = true; setTimeout(() => aparecerRavi('emboscada'), 4500); }
    salvar();
  }
  function restaurarCoracao() {
    est.etapa = 'final';
    falar(FALAS.restaurarCoracao);
    mundo.coracao.restaurar();
    est.tremor = 0; est.tempoTremor = Infinity;
    setTimeout(() => { falar(FALAS.depoisCoracao); est.etapa = 'bilhete'; salvar(); }, 1800);
  }
  function lerBilhete() {
    est.etapa = 'fim';
    ui.bilhete.querySelector('p').textContent = BILHETE;
    ui.bilhete.style.display = 'flex';
    est.lendo = true;
  }
  // carta: no toque, o botão Fechar (48 dp); no teclado, Enter ou E
  ui.bilhete.querySelector('.fechar-carta').addEventListener('click', () => fecharBilhete());
  function fecharBilhete() {
    if (!est.lendo) return false;
    est.lendo = false; ui.bilhete.style.display = 'none';
    mundo.coracao.bilhete.visible = false;
    falar(FALAS.depoisBilhete);
    est.concluido = true; salvar();
    setTimeout(() => { est.terminou = true; aoTerminar({ capitulo: CAPITULO, numero: CAPITULO_ATUAL, fragmentos: est.pegos, total: fragmentos.length, purificados: est.purificados, memorias: memoriasLidas + cartasLidas }); }, 6500);
    return true;
  }

  // ---------- per-frame ----------
  const antes = jogador.pos.clone(), _corpo = new THREE.Vector3();
  function atualizar(dt, t) {
    // dialogue timing
    if (est.falaAtual) { est.falaTempo -= dt; if (est.falaTempo <= 0) proximaFala(); }
    vigiarChefe();
    atualizarFarol(dt, t);

    // fragments
    const corpo = _corpo.copy(jogador.pos); corpo.y += 0.8;
    for (const f of fragmentos) {
      if (f.pega) continue;
      const y = f.rocha ? f.rocha.col.topo + 1 : f.y;
      f.grupo.position.y = y + Math.sin(t * 2 + f.fase) * 0.12;
      f.malha.rotation.y = t * 1.8 + f.fase;
      if (f.grupo.position.distanceToSquared(corpo) < 1.2) {
        f.pega = true; f.grupo.visible = false; est.pegos++; som.fragmento();
        est.vida = Math.min(vidaMax(), est.vida + 1); atualizarVida(); atualizarFragmentos();
        if (est.pegos === 1) { falar(FALAS.primeiroFragmento); est.etapa = 'ancoras'; }
        if (f.memoria) { memoria(MEMORIAS[memoriasLidas % MEMORIAS.length]); memoriasLidas++; if (memoriasLidas === 1) dica('memoria'); }
        salvar();
      }
      if (f.rocha && !est.dicas.has('rocha') && f.grupo.position.distanceTo(jogador.pos) < 9) dica('rocha');
    }

    // Retalhos atacam com uma investida (avisada pelo tremor antes); defender de frente bloqueia (combate.js)
    inimigos.atualizar(dt, t, { pos: jogador.pos, vivo: !jogador.morta && !est.terminou && !!aoAtaque }, e => aoAtaque?.(e));

    // tutorials driven by what the player has done
    est.andou += jogador.pos.distanceTo(antes); antes.copy(jogador.pos);
    if (est.andou > 6) dica('correr');
    if (est.andou > 18) dica('pular');
    if (est.andou > 45) dica('borda');
    if (cartas.some(c => !c.lida && c.pos.distanceTo(jogador.pos) < 7)) dica('carta');
    for (const c of cartas) if (!c.lida) c.brilho.material.opacity = 0.55 + Math.sin(t * 2.5) * 0.3;
    if (jogador.vel.y < -13 && !jogador.planando && !jogador.noVazio) dica('planar');
    if (mundo.correntes.some(c => c.pos.distanceTo(jogador.pos) < 9)) dica('vento');
    const a = ancoraProxima(10);
    if (a && !a.restaurada && !est.mostrouAncora.has(a)) {
      est.mostrouAncora.add(a);
      if (est.mostrouAncora.size === 1) { falar(FALAS.primeiraAncora); dica('ancora', true); }
    }
    // first Retalho in sight: Brisa notices it moves out of fear, then the purify hint
    if (!est.viuInimigo && inimigos.lista.some(e => e.ativo && e.pos.distanceTo(jogador.pos) < 9)) {
      est.viuInimigo = true; falar(FALAS.primeiroInimigo); dica('combate', true);
    }

    // the island is sinking: periodic tremors until the anchors and the Heart are restored
    est.tempoTremor -= dt;
    if (est.tempoTremor <= 0 && est.etapa !== 'final' && est.etapa !== 'bilhete' && est.etapa !== 'fim') {
      const n = mundo.ancoras.filter(x => x.restaurada).length;
      est.tempoTremor = 32 + n * 25; est.tremor = 1;
      mundo.sacudir(jogador.pos);
      if (!est.avisouTremor) { est.avisouTremor = true; aviso(AVISOS.tremor, 2600, 'alerta'); }
    }
    est.tremor = Math.max(0, est.tremor - dt * 1.1);
    // salvamento automático de tempos em tempos (o ponto seguro onde ela está agora)
    est.tempoSalvar = (est.tempoSalvar ?? 15) - dt;
    if (est.tempoSalvar <= 0 && jogador.noChao && !jogador.morta) { est.tempoSalvar = 15; est.checkpoint.copy(jogador.seguro ?? jogador.pos).add(new THREE.Vector3(0, 0.2, 0)); salvar(); }

    procurarInteracao();
    objetivo();
    if (!fila.atual && fila.memoria && !emLuta()) proximoDaFila(); // memória que esperou a luta acabar
  }

  const MS_APERTADO = 140;
  function interagir() {
    if (interacao) { ui.interagir.classList.add('apertado'); setTimeout(() => ui.interagir.classList.remove('apertado'), MS_APERTADO); }
    if (fecharBilhete()) return;
    if (est.falaAtual) { proximaFala(); return; }
    interacao?.acao();
  }

  function iniciar({ continuando = false } = {}) {
    // the campaign is built before Brisa is placed at the spawn, so take the checkpoint now
    if (!continuando) est.checkpoint.copy(jogador.pos).add(new THREE.Vector3(0, 0.2, 0));
    atualizarVida(); atualizarFragmentos();
    if (!continuando) { falar(FALAS.despertar); setTimeout(() => dica('andar'), 500); }
  }

  // ---------- salvar / continuar ----------
  function exportar() {
    return {
      capitulo: CAPITULO_ATUAL, etapa: est.etapa, vida: est.vida, memorias: memoriasLidas, coracao: !!mundo.coracao.restaurado,
      checkpoint: est.checkpoint.toArray().map(v => Math.round(v * 100) / 100),
      fragmentos: fragmentos.flatMap((f, i) => (f.pega ? [i] : [])),
      ancoras: mundo.ancoras.flatMap((a, i) => (a.restaurada ? [i] : [])),
      cristais: mundo.ancoras.flatMap((a, i) => a.cristais.flatMap((c, k) => (c.quebrado ? [[i, k]] : []))),
      purificados: inimigos.lista.flatMap((e, i) => (e.ativo ? [] : [i])),
      cartas: cartas.filter(c => c.lida).map(c => c.nome),
      concluido: !!est.concluido, chefeVencido: !!est.chefeVencido, raviObservou: !!est.raviObservou, raviEmboscou: !!est.raviEmboscou,
    };
  }
  function salvar() { aoSalvar?.(exportar()); }
  function importar(s) {
    for (const i of s.fragmentos ?? []) { const f = fragmentos[i]; if (f && !f.pega) { f.pega = true; f.grupo.visible = false; est.pegos++; } }
    memoriasLidas = s.memorias ?? 0;
    for (const [a, k] of s.cristais ?? []) { const c = mundo.ancoras[a]?.cristais[k]; if (c && !c.quebrado) { c.quebrado = true; c.grupo.visible = false; c.aura.visible = false; est.cristais++; } }
    for (const i of s.purificados ?? []) { const e = inimigos.lista[i]; if (e?.ativo) { e.ativo = false; e.estado = 'morrendo'; e.tempo = 10; e.g.visible = false; est.purificados++; } }
    for (const i of s.ancoras ?? []) { const a = mundo.ancoras[i]; if (a && !a.restaurada) { mundo.ancoras.restaurar(a); est.mostrouAncora.add(a); } }
    for (const nome of s.cartas ?? []) { const c = cartas.find(x => x.nome === nome); if (c && !c.lida) { c.lida = true; c.brilho.visible = false; cartasLidas++; } }
    if (s.coracao) { mundo.coracao.restaurar(); est.tempoTremor = Infinity; }
    est.etapa = s.etapa ?? est.etapa;
    if (est.etapa === 'final') est.etapa = 'bilhete';
    if (est.etapa === 'fim') mundo.coracao.bilhete.visible = false;
    est.concluido = !!s.concluido || (s.concluidos ?? []).includes(CAPITULO_ATUAL);
    est.chefeVencido = !!s.chefeVencido; est.raviObservou = !!s.raviObservou; est.raviEmboscou = !!s.raviEmboscou;
    if (chefe && est.etapa === 'coracao' && !est.chefeVencido && !s.coracao) est.etapa = 'chefe';
    est.vida = Math.max(1, s.vida ?? vidaMax());
    if (s.checkpoint) est.checkpoint.fromArray(s.checkpoint);
    est.tempoTremor = s.coracao ? Infinity : 30 + (s.ancoras?.length ?? 0) * 25;
    // quem já jogou não precisa rever os tutoriais do começo
    for (const d of ['andar', 'correr', 'pular', 'borda', 'vento', 'combate', 'memoria', 'carta']) est.dicas.add(d);
    est.viuInimigo = true; est.avisouTremor = true;
    atualizarVida(); atualizarFragmentos();
  }

  // dano (quedas fortes, cair no vazio): tira fôlego, pisca a borda vermelha e devolve quanto sobrou
  let tempoDano = null;
  function perderVida(n, texto) {
    est.vida = Math.max(0, est.vida - n); atualizarVida();
    const flash = $('dano');
    if (flash) { flash.style.opacity = 1; clearTimeout(tempoDano); tempoDano = setTimeout(() => { flash.style.opacity = 0; }, 260); }
    if (texto && est.vida > 0) aviso(texto, 1600, 'alerta');
    return est.vida;
  }
  // "Tentar de novo": volta ao último ponto salvo com o fôlego cheio (o progresso continua)
  function reviver() {
    est.vida = vidaMax(); atualizarVida();
    chefe?.reiniciar(); // a luta recomeça quando ela subir de novo
    est.falas.length = 0; proximaFala();
    respawn(est.checkpoint);
  }

  // ---------- o vilão (Cap. 1: Ravi, vilao.js) ----------
  // depois das três âncoras ele espera no alto do morro; vencido, o Coração fica livre
  let chefe = null;
  function definirChefe(c) {
    chefe = c;
    // jogo salvo antes do vilão existir, já na etapa do Coração: a luta vem antes
    if (est.etapa === 'coracao' && !est.chefeVencido && !mundo.coracao.restaurado) est.etapa = 'chefe';
    c.v.aoMudarFase = () => falar(FALAS.chefeFase2);
    c.v.aoTerceiraFase = () => { falar(FALAS.chefeFase3); aviso(AVISOS.ventoArena, 2600, 'alerta'); };
    c.v.aoRecuar = modo => { if (modo === 'emboscada') falar(FALAS.raviRecua); };
    c.v.aoAviso = motivo => {
      if (motivo === 'quebra') aviso(AVISOS.guardaQuebrada, 1300);
      else if (motivo === 'parede') aviso(AVISOS.raviNaParede, 1500);
    };
    c.v.aoDerrotar = () => {
      est.etapa = 'coracao'; est.chefeVencido = true;
      falar(FALAS.chefeDerrota); som.vitoria();
      est.checkpoint.copy(jogador.noChao ? jogador.pos : (jogador.seguro ?? jogador.pos)).add(new THREE.Vector3(0, 0.2, 0));
      est.vida = vidaMax(); atualizarVida();
      salvar();
    };
  }
  // ponto a "dist" m da Brisa, na direção do Coração girada de "giro" rad (ele vem de lá)
  function pontoRavi(dist, giro = 0) {
    const d = mundo.coracao.pos.clone().sub(jogador.pos).setY(0);
    if (d.lengthSq() < 1e-4) d.set(1, 0, 0);
    d.normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), giro);
    return jogador.pos.clone().addScaledVector(d, dist).setY(jogador.pos.y + 1);
  }
  function aparecerRavi(modo) {
    if (!chefe || chefe.visivel || jogador.morta || est.terminou || est.etapa === 'chefe') return;
    if (modo === 'observar') { chefe.iniciar(pontoRavi(18, 0.5), 'observar'); falar(FALAS.raviObserva); }
    else { chefe.iniciar(pontoRavi(6, 0.9), 'emboscada'); falar(FALAS.raviEmboscada); dica('luta'); }
  }
  function vigiarChefe() {
    if (est.etapa !== 'chefe' || !chefe || jogador.morta) return;
    if (chefe.visivel && chefe.v.modo === 'chefe') return;
    if (mundo.coracao.pos.distanceTo(jogador.pos) < 18) {
      if (chefe.visivel) chefe.reiniciar();
      const d = jogador.pos.clone().sub(mundo.coracao.pos).setY(0);
      if (d.lengthSq() < 1e-4) d.set(1, 0, 0);
      chefe.iniciar(mundo.coracao.pos.clone().addScaledVector(d.normalize(), 2.5), 'chefe');
      // os Retalhos que guardavam o Coração se desfazem: a luta é só entre os dois
      for (const e of inimigos.lista) if (e.ativo && e.coracao) inimigos.purificar(e);
      est.falas.length = 0; proximaFala(); falar(FALAS.chefeChegada); dica('luta');
    }
  }

  // purificação e cristal quebrados no combate (por golpes, não pelo E)
  function registrarPurificado() { est.purificados++; aviso(AVISOS.inimigoPurificado, 1400); salvar(); }
  function registrarCristal() { est.cristais++; aviso(AVISOS.cristalQuebrado, 1400); salvar(); }

  return {
    atualizar, interagir, iniciar, fragmentos, estado: est, definirChefe, silenciarDicas, farol, perderVida, reviver, registrarPurificado, registrarCristal, exportar, importar, salvar,
    get tremor() { return est.tremor; },
    get lendo() { return !!est.lendo; },
  };
}
