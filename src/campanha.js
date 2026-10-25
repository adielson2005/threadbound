import * as THREE from 'three';
import { FALAS, DICAS, OBJETIVOS, MEMORIAS, AVISOS, BILHETE, CAPITULO, CARTAS } from './historia.js';

// Chapter 1 progression: fragments, purification by interaction, restoring the anchors and the
// Heart of the Thread, short dialogues, tremors while the island sinks, and the ending.
// Everything here is lightweight and driven by the game loop (atualizar) and the E key (interagir).

const VIDA_MAX = 5;

const $ = id => document.getElementById(id);

export function criarCampanha({ cena, mundo, inimigos, jogador, respawn, comEscuro, aoTerminar, aoAtaque, casas = [], aoSalvar = null }) {
  const ui = {
    vida: $('vida'), objetivo: $('objetivo'),
    fala: $('fala'), falaQuem: document.querySelector('#fala b'), falaTexto: document.querySelector('#fala span'),
    dica: $('dicaTutorial'), aviso: $('aviso'), interagir: $('interagir'), memoria: $('memoria'), bilhete: $('bilhete'),
    fragmentos: $('moedas'),
  };

  // ---------- fragments ----------
  const geoFrag = new THREE.OctahedronGeometry(0.22, 0); geoFrag.scale(1, 1.7, 1);
  const matFrag = new THREE.MeshBasicMaterial({ color: '#ffe9a0' });
  const matMem = new THREE.MeshBasicMaterial({ color: '#d9b8ff' });
  const halo = (cor) => {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, cor); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    return new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
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

  // ---------- state ----------
  const est = {
    vida: VIDA_MAX, pegos: 0, purificados: 0, cristais: 0,
    etapa: 'inicio', checkpoint: jogador.pos.clone(), tempoTremor: 22, tremor: 0,
    dicas: new Set(), andou: 0, falas: [], falaTempo: 0, mostrouAncora: new Set(), viuInimigo: false, terminou: false,
  };

  // ---------- UI helpers ----------
  function atualizarVida() {
    ui.vida.innerHTML = '';
    for (let i = 0; i < VIDA_MAX; i++) {
      const s = document.createElement('i');
      if (i >= est.vida) s.className = 'vazio';
      ui.vida.appendChild(s);
    }
  }
  function atualizarFragmentos() {
    const k = Math.round((est.pegos / Math.max(1, fragmentos.length)) * 100);
    ui.fragmentos.innerHTML = `<span class="icone">✦</span><b>${est.pegos}</b>/ ${fragmentos.length}<i class="barrinha"><i style="width:${k}%"></i></i>`;
  }
  // o HUD é atualizado todo quadro: só mexe no HTML quando o conteúdo muda
  const ultimoHtml = new Map();
  function html(el, conteudo) { if (ultimoHtml.get(el) !== conteudo) { ultimoHtml.set(el, conteudo); el.innerHTML = conteudo; } }
  const escapar = s => s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  // "E — Purificar o Retalho" vira a tecla desenhada + o texto
  const comTecla = t => { const m = /^(\w) — (.*)$/.exec(t); return m ? `<kbd>${m[1]}</kbd>${escapar(m[2])}` : escapar(t); };
  let tempoAviso = null;
  function aviso(texto, ms = 2600) {
    ui.aviso.textContent = texto; ui.aviso.style.opacity = 1;
    clearTimeout(tempoAviso); tempoAviso = setTimeout(() => { ui.aviso.style.opacity = 0; }, ms);
  }
  let tempoDica = null;
  function dica(chave, forcar = false) {
    if (est.dicas.has(chave) && !forcar) return;
    est.dicas.add(chave);
    ui.dica.textContent = DICAS[chave]; ui.dica.style.opacity = 1;
    clearTimeout(tempoDica); tempoDica = setTimeout(() => { ui.dica.style.opacity = 0; }, 7000);
  }
  function falar(linhas) { est.falas.push(...linhas); if (!est.falaAtual) proximaFala(); }
  function proximaFala() {
    const f = est.falas.shift();
    est.falaAtual = f || null;
    if (!f) { ui.fala.style.opacity = 0; return; }
    ui.falaQuem.textContent = f[0]; ui.falaTexto.textContent = f[1];
    ui.fala.style.opacity = 1;
    est.falaTempo = Math.max(2.8, f[1].length * 0.055);
  }
  function objetivo() {
    const restauradas = mundo.ancoras.filter(a => a.restaurada).length;
    let txt;
    if (est.etapa === 'inicio') txt = OBJETIVOS.inicio;
    else if (est.etapa === 'ancoras') txt = OBJETIVOS.ancoras(restauradas, mundo.ancoras.length);
    else if (est.etapa === 'coracao') txt = OBJETIVOS.coracao;
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
    html(ui.objetivo, `<small>Objetivo</small><b>${escapar(titulo)}</b>${detalhes.length ? `<span>${escapar(detalhes.join(' · '))}</span>` : ''}`);
  }
  function memoria(texto, titulo = '✧ Fragmento de Lembrança ✧') {
    ui.memoria.querySelector('h3').textContent = titulo;
    ui.memoria.querySelector('p').textContent = texto;
    ui.memoria.style.opacity = 1;
    setTimeout(() => { ui.memoria.style.opacity = 0; }, 7500);
  }

  function ancoraProxima(raio) {
    let melhor = null, d = raio;
    for (const a of mundo.ancoras) { const x = a.pos.distanceTo(jogador.pos); if (x < d) { d = x; melhor = a; } }
    return melhor;
  }

  function alvoPurificavel() {
    let melhor = null, distancia = 2.5;
    for (const e of inimigos.lista) if (e.ativo) { const d = e.pos.distanceTo(jogador.pos); if (d < distancia) { melhor = { tipo: 'retalho', obj: e }; distancia = d; } }
    for (const a of mundo.ancoras) for (const c of a.cristais) if (!c.quebrado) { const d = c.pos.distanceTo(jogador.pos); if (d < distancia) { melhor = { tipo: 'cristal', obj: c }; distancia = d; } }
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
      if (a && !a.restaurada) interacao = { texto: 'E — Reacender a Âncora de Maré', acao: () => tentarAncora(a) };
    }
    const dCor = mundo.coracao.pos.distanceTo(jogador.pos);
    if (dCor < 3.4) {
      if (est.etapa === 'coracao') interacao = { texto: 'E — Restaurar o Coração da Ilha', acao: restaurarCoracao };
      else if (est.etapa === 'bilhete') interacao = { texto: 'E — Ler a carta de Aurélia', acao: lerBilhete };
      else if (est.etapa === 'ancoras' || est.etapa === 'inicio') interacao = { texto: 'E — Examinar o Coração da Ilha', acao: () => falar(FALAS.coracaoFechado) };
    }
    html(ui.interagir, interacao ? comTecla(interacao.texto) : '');
    ui.interagir.style.opacity = interacao ? 1 : 0;
  }
  function lerCarta(c) {
    memoria(CARTAS[c.nome], `✉ ${c.nome}`);
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
    est.vida = VIDA_MAX; atualizarVida();
    aviso(AVISOS.ancoraRestaurada);
    falar(FALAS.ancoraRestaurada[Math.min(n, 3) - 1]);
    est.tempoTremor = 30 + n * 25;
    if (n === mundo.ancoras.length) { est.etapa = 'coracao'; dica('coracao'); }
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
  function fecharBilhete() {
    if (!est.lendo) return false;
    est.lendo = false; ui.bilhete.style.display = 'none';
    mundo.coracao.bilhete.visible = false;
    falar(FALAS.depoisBilhete);
    est.concluido = true; salvar();
    setTimeout(() => { est.terminou = true; aoTerminar({ capitulo: CAPITULO, fragmentos: est.pegos, total: fragmentos.length, purificados: est.purificados, memorias: memoriasLidas + cartasLidas }); }, 6500);
    return true;
  }

  // ---------- per-frame ----------
  const antes = jogador.pos.clone();
  function atualizar(dt, t) {
    // dialogue timing
    if (est.falaAtual) { est.falaTempo -= dt; if (est.falaTempo <= 0) proximaFala(); }

    // fragments
    const corpo = jogador.pos.clone().add(new THREE.Vector3(0, 0.8, 0));
    for (const f of fragmentos) {
      if (f.pega) continue;
      const y = f.rocha ? f.rocha.col.topo + 1 : f.y;
      f.grupo.position.y = y + Math.sin(t * 2 + f.fase) * 0.12;
      f.malha.rotation.y = t * 1.8 + f.fase;
      if (f.grupo.position.distanceToSquared(corpo) < 1.2) {
        f.pega = true; f.grupo.visible = false; est.pegos++;
        est.vida = Math.min(VIDA_MAX, est.vida + 1); atualizarVida(); atualizarFragmentos();
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
      if (!est.avisouTremor) { est.avisouTremor = true; aviso(AVISOS.tremor); }
    }
    est.tremor = Math.max(0, est.tremor - dt * 1.1);
    // salvamento automático de tempos em tempos (o ponto seguro onde ela está agora)
    est.tempoSalvar = (est.tempoSalvar ?? 15) - dt;
    if (est.tempoSalvar <= 0 && jogador.noChao && !jogador.morta) { est.tempoSalvar = 15; est.checkpoint.copy(jogador.seguro ?? jogador.pos).add(new THREE.Vector3(0, 0.2, 0)); salvar(); }

    procurarInteracao();
    objetivo();
  }

  function interagir() {
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
      capitulo: 1, etapa: est.etapa, vida: est.vida, memorias: memoriasLidas, coracao: !!mundo.coracao.restaurado,
      checkpoint: est.checkpoint.toArray().map(v => Math.round(v * 100) / 100),
      fragmentos: fragmentos.flatMap((f, i) => (f.pega ? [i] : [])),
      ancoras: mundo.ancoras.flatMap((a, i) => (a.restaurada ? [i] : [])),
      cristais: mundo.ancoras.flatMap((a, i) => a.cristais.flatMap((c, k) => (c.quebrado ? [[i, k]] : []))),
      purificados: inimigos.lista.flatMap((e, i) => (e.ativo ? [] : [i])),
      cartas: cartas.filter(c => c.lida).map(c => c.nome),
      concluidos: est.concluido ? [1] : [],
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
    est.concluido = (s.concluidos ?? []).includes(1);
    est.vida = Math.max(1, s.vida ?? VIDA_MAX);
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
    if (texto && est.vida > 0) aviso(texto, 1600);
    return est.vida;
  }
  // "Tentar de novo": volta ao último ponto salvo com o fôlego cheio (o progresso continua)
  function reviver() {
    est.vida = VIDA_MAX; atualizarVida();
    est.falas.length = 0; proximaFala();
    respawn(est.checkpoint);
  }

  // purificação e cristal quebrados no combate (por golpes, não pelo E)
  function registrarPurificado() { est.purificados++; aviso(AVISOS.inimigoPurificado, 1400); salvar(); }
  function registrarCristal() { est.cristais++; aviso(AVISOS.cristalQuebrado, 1400); salvar(); }

  return {
    atualizar, interagir, iniciar, fragmentos, estado: est, perderVida, reviver, registrarPurificado, registrarCristal, exportar, importar, salvar,
    get tremor() { return est.tremor; },
    get lendo() { return !!est.lendo; },
  };
}
