// Tela da Mochila (design/ux/mochila-loja-popups.md §2–4, §9–11; interaction-patterns.md 2.1–2.7, 2.11, 2.12).
// Só lê o inventário e pede ações a ele (subirMelhoria, marcarVisto); nunca muda dados direto.
// Teclado: setas movem o foco (grade, categorias, abas, ação), Enter/Espaço ativa, Q/E trocam de categoria,
// Esc/I fecham (o leitor de carta fecha primeiro). Controle: direcional/analógico, A, B, LB/RB, Select.
// O jogo fica pausado enquanto ela está aberta (jogo.js). O retrato da Brisa é tirado UMA vez a cada abertura.
import { ITENS, MELHORIAS, NIVEL_MAX, ARMAS_BASE, MOEDA, CONTADORES } from './itens.js';

const SVG = 'http://www.w3.org/2000/svg';
const MS_CARREGANDO = 300;        // passou disso montando: mostra o esqueleto (estado "carregando")
const MS_VISTO = 1000;            // item focado por 1 s deixa de ser "novo"
const CATEGORIAS = [
  { id: 'historia', nome: 'Itens de história', curto: 'História', icone: 'i-cat-historia' },
  { id: 'quebra', nome: 'Quebra-cabeça', curto: 'Quebra-cabeça', icone: 'i-cat-quebra' },
  { id: 'armas', nome: 'Armas', curto: 'Armas', icone: 'i-cat-armas' },
  { id: 'melhorias', nome: 'Melhorias', curto: 'Melhorias', icone: 'i-cat-melhorias' },
];
const ROTULO_TIPO = { historia: 'HISTÓRIA', quebra: 'QUEBRA-CABEÇA', arma: 'ARMA', melhoria: 'MELHORIA' };
const MELHORIAS_DIRETAS = ['folego', 'explosao', 'ima'];   // compradas na categoria Melhorias
const MELHORIAS_DE_ARMA = ['agulha', 'tesoura'];           // compradas em Armas › MELHORAR

const icone = (id, classe = 'i') => `<svg class="${classe}" aria-hidden="true"><use href="#${id}"/></svg>`;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// raiz: o elemento #mochila (vazio no index.html). capitulo: o capítulo atual.
// textos: { cartas: {nome: texto}, lembrancas: [texto] } do capítulo atual (historia.js)
// fragmentos(): { pegos, total }. retrato(): dataURL da Brisa ou null. aoFechar(origem). som: o de som.js
export function criarMochila({ raiz, inventario, capitulo, textos, fragmentos, retrato, aoFechar, som }) {
  raiz.innerHTML = `
    <header class="mb-topo">
      <button class="mb-voltar" type="button" aria-label="Voltar">${icone('i-voltar')}<span>Voltar</span></button>
      <h1 class="mb-titulo" id="mbTitulo">Mochila</h1>
      <div class="mb-moedas">
        <span class="pilula-moeda" id="mbFragmentos" role="img">${icone('i-fragmento')}<b></b></span>
        <span class="pilula-moeda" id="mbFuxicos" role="img">${icone('i-fuxico')}<b></b></span>
      </div>
    </header>
    <nav class="mb-categorias" role="tablist" aria-label="Categorias"></nav>
    <div class="mb-centro" aria-hidden="true"><div class="mb-retrato"></div><div class="mb-pedestal"></div></div>
    <section class="mb-painel">
      <div class="mb-abas" role="tablist" aria-label="Armas">
        <button class="mb-aba" type="button" role="tab" data-aba="ver">Armas</button>
        <button class="mb-aba" type="button" role="tab" data-aba="melhorar">Melhorar</button>
      </div>
      <div class="mb-grade" role="grid" aria-label="Itens"></div>
      <p class="mb-vazio" hidden>${icone('i-mochila', 'i mb-vazio-icone')}<span>Nada aqui ainda. Explore a ilha!</span></p>
      <aside class="mb-detalhe" aria-live="polite"></aside>
      <button class="mb-acao" type="button"></button>
    </section>
    <div class="mb-leitor" role="dialog" aria-modal="true" aria-labelledby="mbLeitorTitulo" hidden>
      <div class="mb-papel">
        <h2 class="mb-faixa" id="mbLeitorTitulo"></h2>
        <p class="mb-texto"></p>
        <div class="mb-leitor-botoes">
          <button class="mb-sec" type="button" data-ler="-1">${icone('i-voltar')}Anterior</button>
          <button class="mb-sec" type="button" data-ler="1">Próxima${icone('i-avancar')}</button>
          <button class="mb-acao mb-fechar-leitor" type="button">Fechar</button>
        </div>
      </div>
    </div>
    <div class="mb-erro" role="alertdialog" aria-modal="true" aria-labelledby="mbErroTitulo" hidden>
      <div class="mb-papel"><h2 class="mb-faixa" id="mbErroTitulo">Não consegui abrir a mochila</h2>
        <p class="mb-texto">Alguma coisa nos dados salvos não deu para ler. O jogo continua normalmente.</p>
        <div class="mb-leitor-botoes"><button class="mb-sec" type="button" data-erro="voltar">Voltar</button><button class="mb-acao" type="button" data-erro="tentar">Tentar de novo</button></div></div>
    </div>`;
  const $ = s => raiz.querySelector(s);
  const ui = {
    cats: $('.mb-categorias'), grade: $('.mb-grade'), detalhe: $('.mb-detalhe'), acao: $('.mb-acao'), abas: $('.mb-abas'),
    vazio: $('.mb-vazio'), retrato: $('.mb-retrato'), leitor: $('.mb-leitor'), erro: $('.mb-erro'),
    fux: $('#mbFuxicos'), frag: $('#mbFragmentos'),
  };
  for (const c of CATEGORIAS) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'mb-cat'; b.setAttribute('role', 'tab'); b.dataset.cat = c.id;
    b.innerHTML = `<span class="mb-losango">${icone(c.icone, 'i mb-cat-icone')}</span><span class="mb-cat-nome">${c.curto}</span><span class="mb-cat-conta"></span><span class="mb-novo" hidden>NOVO</span>`;
    ui.cats.appendChild(b);
  }

  const est = { aberta: false, origem: null, cat: 'historia', aba: 'ver', slots: [], sel: 0, leitura: null, retratos: 0, tempoVisto: null, msAbrir: 0, focoAntes: null };

  // ---------- o que aparece em cada categoria ----------
  const visitados = () => inventario.capitulosVisitados();
  // um item aparece se já foi achado ou se é de um capítulo visitado (trancado, "???"); capítulos futuros: oculto
  function itensDe(tipo) {
    const vis = visitados();
    return Object.entries(ITENS).filter(([, it]) => it.tipo === tipo)
      .filter(([id, it]) => inventario.tem(id) || vis.includes(it.cap))
      .map(([id, it]) => ({ id, it, achado: inventario.tem(id) }));
  }
  function slotsDa(cat, aba) {
    if (cat === 'historia') return itensDe('historia').map(s => ({ ...s, tipo: 'item' }));
    if (cat === 'quebra') return itensDe('quebra').map(s => ({ ...s, tipo: 'item' }));
    if (cat === 'armas' && aba === 'melhorar') return MELHORIAS_DE_ARMA.map(id => ({ id, it: MELHORIAS[id], achado: true, tipo: 'melhoria' }));
    if (cat === 'armas') return itensDe('arma').map(s => ({ ...s, tipo: 'item' }));
    return [...MELHORIAS_DIRETAS, ...MELHORIAS_DE_ARMA].map(id => ({ id, it: MELHORIAS[id], achado: true, tipo: 'melhoria' }));
  }
  function contagem(cat) {
    if (cat === 'melhorias') { const ids = Object.keys(MELHORIAS); return [ids.reduce((s, id) => s + inventario.nivel(id), 0), ids.length * NIVEL_MAX]; }
    const l = slotsDa(cat, 'ver'); return [l.filter(s => s.achado).length, l.length];
  }
  const novosDa = cat => slotsDa(cat, 'ver').some(s => s.tipo === 'item' && inventario.novo(s.id));

  // ---------- desenho ----------
  function desenharTopo() {
    const f = fragmentos();
    ui.frag.querySelector('b').textContent = `${f.pegos}/${f.total}`;
    ui.frag.setAttribute('aria-label', `${CONTADORES.fragmentos.nome}: ${f.pegos} de ${f.total}`);
    ui.fux.querySelector('b').textContent = inventario.saldo.toLocaleString('pt-BR');
    ui.fux.setAttribute('aria-label', `${MOEDA.plural}: ${inventario.saldo}`);
  }
  function desenharCategorias() {
    for (const b of ui.cats.children) {
      const c = CATEGORIAS.find(x => x.id === b.dataset.cat), ativa = c.id === est.cat;
      const [a, t] = contagem(c.id);
      b.classList.toggle('ativa', ativa);
      b.setAttribute('aria-selected', ativa);
      b.querySelector('.mb-cat-conta').textContent = c.id === 'melhorias' ? `nív. ${a}/${t}` : `${a}/${t}`;
      const novo = novosDa(c.id);
      b.querySelector('.mb-novo').hidden = !novo;
      b.setAttribute('aria-label', `${c.nome}, ${a} de ${t}${novo ? ', tem item novo' : ''}`);
    }
  }
  function desenharGrade() {
    est.slots = slotsDa(est.cat, est.aba);
    ui.abas.hidden = est.cat !== 'armas';
    for (const b of ui.abas.children) { const at = b.dataset.aba === est.aba; b.classList.toggle('ativa', at); b.setAttribute('aria-selected', at); }
    ui.grade.replaceChildren();
    est.slots.forEach((s, i) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'mb-slot'; b.dataset.i = i; b.setAttribute('role', 'gridcell');
      if (!s.achado) { b.classList.add('trancado'); b.innerHTML = `${icone('i-cadeado', 'i mb-cadeado')}<span class="mb-slot-nome">???</span>`; b.setAttribute('aria-label', `Trancado, ainda não encontrado (Cap. ${s.it.cap})`); }
      else {
        const nivel = s.tipo === 'melhoria' ? inventario.nivel(s.id) : null;
        b.innerHTML = icone(s.it.icone, 'i mb-slot-icone') + (nivel !== null ? `<span class="mb-nivel">${nivel}/${NIVEL_MAX}</span>` : '') +
          (s.tipo === 'item' && inventario.novo(s.id) ? '<span class="mb-novo">NOVO</span>' : '');
        b.setAttribute('aria-label', `${s.it.nome}${nivel !== null ? `, nível ${nivel} de ${NIVEL_MAX}` : ''}${s.tipo === 'item' && inventario.novo(s.id) ? ', novo' : ''}, ${i + 1} de ${est.slots.length}`);
      }
      ui.grade.appendChild(b);
    });
    ui.vazio.hidden = est.slots.length > 0;
    est.sel = Math.min(est.sel, Math.max(0, est.slots.length - 1));
    marcarSelecionado();
  }
  function marcarSelecionado() {
    [...ui.grade.children].forEach((b, i) => { b.classList.toggle('selecionado', i === est.sel); b.setAttribute('aria-selected', i === est.sel); });
    desenharDetalhe();
    clearTimeout(est.tempoVisto);
    const s = est.slots[est.sel];
    if (s?.tipo === 'item' && s.achado && inventario.novo(s.id)) est.tempoVisto = setTimeout(() => { inventario.marcarVisto(s.id); desenharGrade(); desenharCategorias(); }, MS_VISTO);
  }
  function linhaStat(nome, valor, max) {
    const k = Math.max(0, Math.min(1, valor / max));
    return `<div class="mb-stat"><span>${nome}</span><span class="mb-barra" role="progressbar" aria-valuenow="${valor}" aria-valuemax="${max}"><i style="width:${Math.round(k * 100)}%"></i></span><b>${valor}</b></div>`;
  }
  function desenharDetalhe() {
    const s = est.slots[est.sel];
    let html = '', acao = null;
    if (!s) { ui.detalhe.innerHTML = ''; ui.acao.hidden = true; return; }
    if (!s.achado) {
      html = `<div class="mb-det-cab">${icone('i-cadeado', 'i mb-det-icone trancado')}<div><h3>???</h3><span class="mb-etiqueta">${ROTULO_TIPO[s.it.tipo]}</span></div></div>
        <p>Ainda não encontrado. Procure no Cap. ${s.it.cap}.</p>`;
    } else if (s.tipo === 'melhoria') {
      const m = s.it, n = inventario.nivel(s.id), preco = inventario.precoMelhoria(s.id);
      html = `<div class="mb-det-cab">${icone(m.icone, 'i mb-det-icone')}<div><h3>${esc(m.nome)}</h3><span class="mb-etiqueta">${ROTULO_TIPO.melhoria}</span></div></div>
        <p>${esc(m.desc)}</p>
        <div class="mb-niveis" role="progressbar" aria-valuenow="${n}" aria-valuemax="${NIVEL_MAX}" aria-label="Nível ${n} de ${NIVEL_MAX}">${Array.from({ length: NIVEL_MAX }, (_, i) => `<i class="${i < n ? 'cheio' : ''}"></i>`).join('')}<b>${n >= NIVEL_MAX ? 'MÁX.' : `${n}/${NIVEL_MAX}`}</b></div>`;
      const deArma = MELHORIAS_DE_ARMA.includes(s.id);
      if (est.cat === 'melhorias' && deArma) acao = { rotulo: 'Ver em Armas', fazer: () => { est.cat = 'armas'; est.aba = 'melhorar'; est.sel = MELHORIAS_DE_ARMA.indexOf(s.id); redesenhar(); focarSlot(); } };
      else if (preco === null) acao = { rotulo: 'Nível máximo', desabilitado: true };
      else if (inventario.saldo < preco) acao = { rotulo: `Sem Fuxicos (faltam ${preco - inventario.saldo})`, desabilitado: true, preco };
      else acao = { rotulo: 'Melhorar', preco, fazer: () => melhorar(s.id) };
      if (preco !== null && !(est.cat === 'melhorias' && deArma)) html += `<p class="mb-preco">Custo: <span class="pilula-moeda">${icone('i-fuxico')}<b>${preco}</b></span></p>`;
    } else {
      const it = s.it;
      html = `<div class="mb-det-cab">${icone(it.icone, 'i mb-det-icone')}<div><h3>${esc(it.nome)}</h3><span class="mb-etiqueta">${ROTULO_TIPO[it.tipo]}</span></div></div>
        <p>${esc(it.desc)}</p><p><b>Para que serve:</b> ${esc(it.serve)}</p><p><b>Onde achei:</b> ${esc(it.onde)}</p>`;
      if (it.colecao) { const n = paginasDe(s.id).length; html += `<p><b>${it.colecao === 'cartas' ? 'Cartas lidas' : 'Lembranças'}:</b> ${n}</p>`; }
      if (it.tipo === 'arma') {
        const a = ARMAS_BASE[it.arma], ef = inventario.efeitos;
        html += linhaStat('Dano', a.dano, 4) + linhaStat('Usos', a.usos + ef.usosArma(it.arma), 70) + linhaStat('Alcance (m)', +(a.alcance + ef.alcanceArma(it.arma)).toFixed(1), 3);
        acao = MELHORIAS[it.arma] ? { rotulo: 'Melhorar', fazer: () => { est.aba = 'melhorar'; est.sel = MELHORIAS_DE_ARMA.indexOf(it.arma); redesenhar(); focarSlot(); } } : { rotulo: 'Arma inicial: sem melhoria', desabilitado: true };
      } else if (it.tipo === 'historia' || it.historia) acao = { rotulo: 'Ler', fazer: () => abrirLeitor(s.id) };
      else acao = { rotulo: 'Detalhes', fazer: () => { ui.detalhe.classList.toggle('aberto'); ui.detalhe.focus?.(); } };
    }
    ui.detalhe.innerHTML = html;
    ui.acao.hidden = !acao;
    if (acao) {
      ui.acao.textContent = acao.rotulo;
      ui.acao.disabled = !!acao.desabilitado;
      ui.acao.setAttribute('aria-label', `${acao.rotulo}${s.achado ? ' ' + s.it.nome : ''}`);
      est.fazer = acao.fazer ?? null;
    }
  }
  function redesenhar() { desenharTopo(); desenharCategorias(); desenharGrade(); }

  // ---------- ações (sempre pelo inventário) ----------
  function melhorar(id) {
    const r = inventario.subirMelhoria(id);
    if (r.ok) som?.carregado?.(); else som?.aviso?.();
    redesenhar(); focarAcaoOuSlot();
    return r;
  }
  // páginas para LER: cartas e lembranças do capítulo atual têm texto aqui; de outros capítulos, um aviso curto
  function paginasDe(id) {
    const it = ITENS[id];
    if (it.colecao === 'cartas') {
      const p = [];
      for (const cap of visitados()) for (const nome of inventario.cartas(cap)) p.push({ titulo: nome, texto: cap === capitulo ? (textos.cartas[nome] ?? '') : `Esta carta ficou guardada na ilha do Cap. ${cap}.` });
      return p;
    }
    if (it.colecao === 'lembrancas') {
      const p = [];
      for (const cap of visitados()) for (const i of inventario.lembrancas(cap)) p.push({ titulo: 'Lembrança', texto: cap === capitulo ? (textos.lembrancas[i % textos.lembrancas.length] ?? '') : `Uma lembrança guardada no Cap. ${cap}.` });
      return p;
    }
    if (id === 'garrafa-tome') return [{ titulo: it.nome, texto: textos.cartas['Garrafa na Enseada'] ?? it.desc }];
    return [{ titulo: it.nome, texto: `${it.desc} ${it.serve}` }];
  }
  function abrirLeitor(id) {
    const paginas = paginasDe(id);
    if (!paginas.length) return;
    est.leitura = { paginas, i: 0, id };
    inventario.marcarVisto(id);
    mostrarPagina();
    ui.leitor.hidden = false;
    som?.ok?.();
    ui.leitor.querySelector('.mb-fechar-leitor').focus();
  }
  function mostrarPagina() {
    const { paginas, i } = est.leitura;
    ui.leitor.querySelector('.mb-faixa').textContent = paginas[i].titulo;
    ui.leitor.querySelector('.mb-texto').textContent = paginas[i].texto;
    const [ant, prox] = ui.leitor.querySelectorAll('[data-ler]');
    ant.hidden = prox.hidden = paginas.length < 2;
    ant.disabled = i === 0; prox.disabled = i === paginas.length - 1;
  }
  function fecharLeitor() { ui.leitor.hidden = true; est.leitura = null; redesenhar(); focarAcaoOuSlot(); }

  // ---------- foco e navegação ----------
  function focarSlot(i = est.sel) { const b = ui.grade.children[i]; if (b) { est.sel = i; marcarSelecionado(); b.focus(); } else (ui.acao.hidden ? ui.cats.querySelector('.ativa') : ui.acao).focus(); }
  function focarAcaoOuSlot() { if (!ui.acao.hidden && !ui.acao.disabled) ui.acao.focus(); else focarSlot(); }
  function colunas() { return getComputedStyle(ui.grade).gridTemplateColumns.split(' ').length || 3; }
  function trocarCategoria(passo) {
    const i = CATEGORIAS.findIndex(c => c.id === est.cat);
    est.cat = CATEGORIAS[(i + passo + CATEGORIAS.length) % CATEGORIAS.length].id; est.aba = 'ver'; est.sel = 0;
    redesenhar(); focarSlot(0); som?.foco?.();
  }
  // direção: 'cima' | 'baixo' | 'esq' | 'dir'
  function mover(dir) {
    const a = document.activeElement;
    if (est.leitura || !ui.erro.hidden) { const bs = [...(est.leitura ? ui.leitor : ui.erro).querySelectorAll('button:not([hidden]):not(:disabled)')]; const i = bs.indexOf(a); bs[(i + (dir === 'dir' || dir === 'baixo' ? 1 : bs.length - 1)) % bs.length]?.focus(); return; }
    if (a?.classList.contains('mb-slot')) {
      const c = colunas(), i = +a.dataset.i, n = est.slots.length;
      if (dir === 'esq') { if (i % c === 0) ui.cats.querySelector('.ativa').focus(); else focarSlot(i - 1); }
      else if (dir === 'dir') { if (i % c === c - 1 || i === n - 1) { if (!ui.acao.hidden) ui.acao.focus(); } else focarSlot(i + 1); }
      else if (dir === 'cima') { if (i - c >= 0) focarSlot(i - c); else (ui.abas.hidden ? raiz.querySelector('.mb-voltar') : ui.abas.querySelector('.ativa')).focus(); }
      else if (i + c < n) focarSlot(i + c); else if (!ui.acao.hidden) ui.acao.focus();
    } else if (a?.classList.contains('mb-cat')) {
      const cs = [...ui.cats.children], i = cs.indexOf(a);
      if (dir === 'cima' || dir === 'baixo') { const j = (i + (dir === 'baixo' ? 1 : -1) + cs.length) % cs.length; est.cat = cs[j].dataset.cat; est.aba = 'ver'; est.sel = 0; redesenhar(); cs[j].focus(); som?.foco?.(); }
      else if (dir === 'dir') focarSlot(0);
    } else if (a?.classList.contains('mb-aba')) {
      if (dir === 'esq' || dir === 'dir') { est.aba = dir === 'dir' ? 'melhorar' : 'ver'; est.sel = 0; redesenhar(); ui.abas.querySelector('.ativa').focus(); }
      else if (dir === 'baixo') focarSlot(0); else raiz.querySelector('.mb-voltar').focus();
    } else if (a === ui.acao) { if (dir === 'cima' || dir === 'esq') focarSlot(); }
    else if (a?.classList.contains('mb-voltar')) { if (dir === 'baixo') ui.cats.querySelector('.ativa').focus(); else if (dir === 'dir') focarSlot(); }
    else focarSlot();
  }
  function ativar() { const a = document.activeElement; if (a && raiz.contains(a) && !a.disabled) a.click(); }
  function voltar() {
    if (est.leitura) return fecharLeitor();
    if (!ui.erro.hidden) { ui.erro.hidden = true; return fechar(); }
    if (est.cat === 'armas' && est.aba === 'melhorar' && document.activeElement?.closest('.mb-painel')) { est.aba = 'ver'; est.sel = 0; redesenhar(); return focarSlot(0); }
    fechar();
  }

  // cliques e toques
  raiz.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b || b.disabled) return;
    if (b.classList.contains('mb-voltar')) return voltar();
    if (b.classList.contains('mb-cat')) { est.cat = b.dataset.cat; est.aba = 'ver'; est.sel = 0; redesenhar(); som?.foco?.(); return focarSlot(0); }
    if (b.classList.contains('mb-aba')) { est.aba = b.dataset.aba; est.sel = 0; redesenhar(); return b.focus(); }
    if (b.classList.contains('mb-slot')) {
      const i = +b.dataset.i;
      if (i === est.sel && est.fazer && !ui.acao.disabled) return est.fazer(); // 2º toque no mesmo slot = ação principal
      est.sel = i; marcarSelecionado(); return;
    }
    if (b.classList.contains('mb-fechar-leitor')) return fecharLeitor();
    if (b.dataset.ler) { est.leitura.i = Math.max(0, Math.min(est.leitura.paginas.length - 1, est.leitura.i + +b.dataset.ler)); return mostrarPagina(); }
    if (b.dataset.erro === 'tentar') { ui.erro.hidden = true; return montar(); }
    if (b.dataset.erro === 'voltar') { ui.erro.hidden = true; return fechar(); }
    if (b === ui.acao && est.fazer) return est.fazer();
  });
  raiz.addEventListener('focusin', e => { const b = e.target.closest?.('.mb-slot'); if (b && +b.dataset.i !== est.sel) { est.sel = +b.dataset.i; marcarSelecionado(); } });

  // teclado: só com ela aberta (fase de captura: o jogo não recebe as teclas)
  const TECLAS = { ArrowUp: 'cima', ArrowDown: 'baixo', ArrowLeft: 'esq', ArrowRight: 'dir' };
  addEventListener('keydown', e => {
    if (!est.aberta) return;
    e.stopPropagation();
    if (TECLAS[e.code]) { e.preventDefault(); mover(TECLAS[e.code]); }
    else if (e.code === 'Enter' || e.code === 'Space') { e.preventDefault(); if (!e.repeat) ativar(); }
    else if ((e.code === 'Escape' || e.code === 'KeyI') && !e.repeat) { e.preventDefault(); voltar(); }
    else if ((e.code === 'KeyQ' || e.code === 'KeyE') && !e.repeat && !est.leitura) trocarCategoria(e.code === 'KeyE' ? 1 : -1);
  }, true);
  addEventListener('keyup', e => { if (est.aberta) e.stopPropagation(); }, true);

  // ---------- abrir e fechar ----------
  function montar() {
    const t0 = performance.now();
    raiz.classList.add('carregando');
    try {
      redesenhar();
    } catch (err) {
      console.error('mochila:', err);
      ui.erro.hidden = false; ui.erro.querySelector('[data-erro="tentar"]').focus();
      raiz.classList.remove('carregando');
      return false;
    }
    // (montar é síncrono e leva poucos ms; o esqueleto só apareceria se passasse de MS_CARREGANDO)
    if (performance.now() - t0 < MS_CARREGANDO) raiz.classList.remove('carregando');
    else requestAnimationFrame(() => raiz.classList.remove('carregando'));
    return true;
  }
  function abrir(origem = 'hud', foco = null) {
    if (est.aberta) return;
    const t0 = performance.now();
    est.aberta = true; est.origem = origem; est.retratoUrl = undefined; est.focoAntes = document.activeElement;
    raiz.hidden = false;
    som?.foco?.();
    if (montar()) {
      if (foco) { const c = Object.entries(ITENS).find(([id]) => id === foco)?.[1]; if (c) { est.cat = c.tipo === 'arma' ? 'armas' : c.tipo; est.sel = Math.max(0, slotsDa(est.cat, 'ver').findIndex(s => s.id === foco)); redesenhar(); } }
      focarSlot(est.sel);
      // o retrato da Brisa (uma vez por abertura) vem no quadro seguinte: a tela já abriu e responde
      if (est.retratoUrl === undefined) {
        ui.retrato.innerHTML = icone('i-mochila', 'i mb-retrato-falta');
        requestAnimationFrame(() => setTimeout(tirarRetrato, 0));
      }
    }
    est.msAbrir = performance.now() - t0;
  }
  function tirarRetrato() {
    if (!est.aberta || est.retratoUrl !== undefined) return;
    const t0 = performance.now();
    est.retratos++;
    let url = null; try { url = retrato(); } catch (err) { console.warn('retrato da Brisa:', err); url = null; }
    est.retratoUrl = url;
    if (url) ui.retrato.innerHTML = `<img src="${url}" alt="">`; // (sem retrato: fica o ícone da mochila)
    est.msRetrato = performance.now() - t0;
  }
  function fechar() {
    if (!est.aberta) return;
    est.aberta = false; clearTimeout(est.tempoVisto);
    ui.leitor.hidden = true; est.leitura = null;
    raiz.hidden = true;
    som?.foco?.();
    const o = est.origem; est.origem = null;
    aoFechar?.(o);
  }

  // controle (jogo.js chama a cada quadro com as bordas dos botões): devolve true se tratou
  function controle({ cima, baixo, esq, dir, a, b, lb, rb, select }) {
    if (!est.aberta) return false;
    if (cima) mover('cima'); if (baixo) mover('baixo'); if (esq) mover('esq'); if (dir) mover('dir');
    if (a) ativar(); if (b || select) voltar();
    if ((lb || rb) && !est.leitura) trocarCategoria(rb ? 1 : -1);
    return true;
  }

  return {
    abrir, fechar, controle,
    get aberta() { return est.aberta; },
    get retratosTirados() { return est.retratos; },
    get msAbrir() { return est.msAbrir; },
    get msRetrato() { return est.msRetrato; },
    get categoria() { return est.cat; },
  };
}
