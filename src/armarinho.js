// Armarinho de Dona Celeste (design/ux/mochila-loja-popups.md §5 e §6; visual-design §1.10).
// Abre por cima da Mochila (botão ARMARINHO ou o "+" da pílula de Fuxicos); Voltar devolve à Mochila.
// Só pede ações ao inventário (comprar, desfazerCompra); nunca mexe no saldo.
// Compra < PRECO_CONFIRMAR: direta, com toast e DESFAZER por 5 s. >= PRECO_CONFIRMAR: confirmação, foco em CANCELAR.
// Sem saldo: o botão já diz "SEM FUXICOS" antes de tocar. Limites: 5 remendos, 1 Fitinha e 1 Mapa por ilha, roupas únicas.
import { LOJA, PRECO_CONFIRMAR, MOEDA } from './itens.js';

const MS_DESFAZER = 5000;
const CATEGORIAS = [
  { id: 'consumiveis', nome: 'Consumíveis', icone: 'i-cat-consumivel' },
  { id: 'ajudas', nome: 'Ajudas', icone: 'i-cat-ajuda' },
  { id: 'roupas', nome: 'Roupas', icone: 'i-cat-roupa' },
];
const FALAS_CELESTE = {
  consumiveis: 'Um remendinho resolve muita coisa, minha filha.',
  ajudas: 'Fitinha amarrada no pulso dá sorte. E o mapa bordado ajuda a achar o que falta.',
  roupas: 'Chita nova para a boneca mais corajosa da vila!',
};
const icone = (id, classe = 'i') => `<svg class="${classe}" aria-hidden="true"><use href="#${id}"/></svg>`;

export function criarArmarinho({ raiz, inventario, capitulo, popups, som, aoFechar }) {
  raiz.innerHTML = `
    <header class="mb-topo">
      <button class="mb-voltar" type="button" aria-label="Voltar para a Mochila">${icone('i-voltar')}<span>Voltar</span></button>
      <h1 class="mb-titulo" id="amTitulo">Armarinho</h1>
      <div class="mb-moedas"><span class="pilula-moeda" id="amFuxicos" role="img">${icone('i-fuxico')}<b></b></span></div>
    </header>
    <nav class="mb-categorias" role="tablist" aria-label="Categorias da loja"></nav>
    <div class="am-celeste" aria-hidden="true">${icone('i-armarinho', 'i am-celeste-icone')}<p class="am-balao"></p></div>
    <section class="mb-painel">
      <div class="mb-grade" role="grid" aria-label="Itens à venda"></div>
      <aside class="mb-detalhe" aria-live="polite"></aside>
      <div class="am-acoes"><button class="mb-sec am-desfazer" type="button" hidden></button><button class="mb-acao" type="button"></button></div>
    </section>`;
  const $ = s => raiz.querySelector(s);
  const ui = { cats: $('.mb-categorias'), grade: $('.mb-grade'), detalhe: $('.mb-detalhe'), acao: $('.mb-acao'), desfazer: $('.am-desfazer'), balao: $('.am-balao'), fux: $('#amFuxicos') };
  for (const c of CATEGORIAS) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'mb-cat'; b.setAttribute('role', 'tab'); b.dataset.cat = c.id;
    b.innerHTML = `<span class="mb-losango">${icone(c.icone, 'i mb-cat-icone')}</span><span class="mb-cat-nome">${c.nome}</span><span class="mb-cat-conta"></span>`;
    ui.cats.appendChild(b);
  }
  const est = { aberta: false, cat: 'consumiveis', sel: 0, ids: [], desfazer: null, tempoDesfazer: null, tempoConta: null };

  // estado de compra de um item: o que o botão e a etiqueta dizem
  function situacao(id) {
    const it = LOJA[id], motivo = inventario.impedimento(id, capitulo);
    if (motivo === 'limite') return { pode: false, rotulo: it.limite === 'qtd' ? `Limite (${inventario.remendos}/${it.max})` : 'Já comprado', etiqueta: it.limite === 'qtd' ? `${inventario.remendos}/${it.max} ✓` : 'COMPRADO ✓', limite: true };
    if (motivo === 'sem-saldo') return { pode: false, rotulo: `Sem Fuxicos (faltam ${it.preco - inventario.saldo})`, etiqueta: String(it.preco), semSaldo: true };
    return { pode: true, rotulo: `Comprar · ${it.preco}`, etiqueta: String(it.preco) };
  }
  function desenhar() {
    ui.fux.querySelector('b').textContent = inventario.saldo.toLocaleString('pt-BR');
    ui.fux.setAttribute('aria-label', `${MOEDA.plural}: ${inventario.saldo}`);
    for (const b of ui.cats.children) {
      const at = b.dataset.cat === est.cat;
      b.classList.toggle('ativa', at); b.setAttribute('aria-selected', at);
      const n = Object.values(LOJA).filter(it => it.categoria === b.dataset.cat).length;
      b.querySelector('.mb-cat-conta').textContent = `${n} ${n === 1 ? 'item' : 'itens'}`;
    }
    ui.balao.textContent = FALAS_CELESTE[est.cat];
    est.ids = Object.keys(LOJA).filter(id => LOJA[id].categoria === est.cat);
    est.sel = Math.min(est.sel, est.ids.length - 1);
    ui.grade.replaceChildren(...est.ids.map((id, i) => {
      const it = LOJA[id], s = situacao(id), b = document.createElement('button');
      b.type = 'button'; b.className = 'mb-slot am-slot'; b.dataset.i = i; b.setAttribute('role', 'gridcell');
      b.classList.toggle('selecionado', i === est.sel);
      b.innerHTML = `${icone(it.icone, 'i mb-slot-icone')}<span class="am-preco${s.semSaldo ? ' sem' : ''}${s.limite ? ' limite' : ''}">${s.limite ? '' : icone(s.semSaldo ? 'i-alerta' : 'i-fuxico', 'i')}${s.etiqueta}</span>`;
      b.setAttribute('aria-label', `${it.nome}, ${s.limite ? s.etiqueta.replace('✓', '') : `${it.preco} Fuxicos${s.semSaldo ? ', sem Fuxicos suficientes' : ''}`}`);
      return b;
    }));
    desenharDetalhe();
  }
  function desenharDetalhe() {
    const id = est.ids[est.sel], it = LOJA[id], s = situacao(id);
    ui.detalhe.innerHTML = `<div class="mb-det-cab">${icone(it.icone, 'i mb-det-icone')}<div><h3>${it.nome}</h3><span class="mb-etiqueta">${CATEGORIAS.find(c => c.id === it.categoria).nome.toUpperCase()}</span></div></div>
      <p>${it.desc}</p>${it.limite === 'qtd' ? `<p><b>Na mochila:</b> ${inventario.remendos} de ${it.max}</p>` : ''}${it.limite === 'porIlha' ? '<p><b>Limite:</b> 1 por ilha.</p>' : ''}
      <p class="mb-preco">Preço: <span class="pilula-moeda">${icone('i-fuxico')}<b>${it.preco}</b></span></p>`;
    ui.acao.textContent = s.rotulo; ui.acao.disabled = !s.pode;
    ui.acao.setAttribute('aria-label', s.pode ? `Comprar ${it.nome} por ${it.preco} Fuxicos` : `${it.nome}: ${s.rotulo}`);
  }

  async function comprar() {
    const id = est.ids[est.sel], it = LOJA[id];
    if (!situacao(id).pode) return;
    if (it.preco >= PRECO_CONFIRMAR) {
      const resta = inventario.saldo - it.preco;
      const r = await popups.modal({ titulo: 'Confirmar compra', icone: it.icone, foco: 'cancelar',
        corpo: `<p><b>${it.nome}</b></p><p>Gastar ${it.preco} Fuxicos? Restam ${resta}.</p>`,
        botoes: [{ id: 'comprar', rotulo: 'Comprar', primario: true }, { id: 'cancelar', rotulo: 'Cancelar', cancelar: true }] });
      if (r !== 'comprar') return focar();
    }
    const r = inventario.comprar(id, capitulo);
    if (!r.ok) {
      som?.aviso?.();
      if (r.motivo === 'salvar') await popups.modal({ titulo: 'Não deu para salvar', corpo: '<p>A compra não aconteceu e nada foi cobrado. Tente de novo.</p>', icone: 'i-alerta' });
      desenhar(); return focar();
    }
    som?.pegar?.();
    popups.toast({ icone: it.icone, texto: `Você comprou: ${it.nome}`, sub: id === 'remendo' ? 'Use na Mochila ou no HUD' : 'Está na sua mochila' });
    if (it.preco < PRECO_CONFIRMAR) mostrarDesfazer(id);
    desenhar(); focar();
  }
  // DESFAZER por 5 s (só compras baratas, diretas); o botão mostra os segundos que faltam
  function mostrarDesfazer(id) {
    clearTimeout(est.tempoDesfazer); clearInterval(est.tempoConta);
    est.desfazer = id; const fim = performance.now() + MS_DESFAZER;
    const contar = () => { const s = Math.ceil((fim - performance.now()) / 1000); ui.desfazer.textContent = `Desfazer (${s})`; };
    contar(); ui.desfazer.hidden = false;
    est.tempoConta = setInterval(contar, 250);
    est.tempoDesfazer = setTimeout(esconderDesfazer, MS_DESFAZER);
  }
  function esconderDesfazer() { clearInterval(est.tempoConta); clearTimeout(est.tempoDesfazer); est.desfazer = null; const tinhaFoco = document.activeElement === ui.desfazer; ui.desfazer.hidden = true; if (tinhaFoco) focar(); }
  function desfazer() {
    if (!est.desfazer) return;
    const id = est.desfazer, r = inventario.desfazerCompra(id, capitulo);
    esconderDesfazer();
    if (r.ok) popups.toast({ icone: 'i-voltar', texto: `Compra desfeita: ${LOJA[id].nome}`, sub: `${LOJA[id].preco} Fuxicos de volta` });
    desenhar(); focar();
  }

  // ---------- foco e teclado ----------
  function focar() { if (!ui.acao.disabled) ui.acao.focus(); else ui.grade.children[est.sel]?.focus(); }
  function focarSlot(i) { est.sel = i; desenhar(); ui.grade.children[i]?.focus(); }
  function trocarCategoria(passo) { const i = CATEGORIAS.findIndex(c => c.id === est.cat); est.cat = CATEGORIAS[(i + passo + CATEGORIAS.length) % CATEGORIAS.length].id; est.sel = 0; desenhar(); ui.grade.children[0]?.focus(); som?.foco?.(); }
  function mover(dir) {
    const a = document.activeElement, cols = getComputedStyle(ui.grade).gridTemplateColumns.split(' ').length || 3;
    if (a?.classList.contains('mb-slot')) {
      const i = +a.dataset.i, n = est.ids.length;
      if (dir === 'esq') { if (i % cols === 0) ui.cats.querySelector('.ativa').focus(); else focarSlot(i - 1); }
      else if (dir === 'dir') { if (i % cols === cols - 1 || i === n - 1) (ui.acao.disabled ? (ui.desfazer.hidden ? a : ui.desfazer) : ui.acao).focus(); else focarSlot(i + 1); }
      else if (dir === 'cima') { if (i - cols >= 0) focarSlot(i - cols); else raiz.querySelector('.mb-voltar').focus(); }
      else if (i + cols < n) focarSlot(i + cols); else (ui.acao.disabled ? (ui.desfazer.hidden ? a : ui.desfazer) : ui.acao).focus();
    } else if (a?.classList.contains('mb-cat')) {
      const cs = [...ui.cats.children], i = cs.indexOf(a);
      if (dir === 'cima' || dir === 'baixo') { const j = (i + (dir === 'baixo' ? 1 : -1) + cs.length) % cs.length; est.cat = cs[j].dataset.cat; est.sel = 0; desenhar(); cs[j].focus(); }
      else if (dir === 'dir') focarSlot(est.sel);
    } else if (a === ui.acao || a === ui.desfazer) {
      if (dir === 'esq' && a === ui.acao && !ui.desfazer.hidden) ui.desfazer.focus();
      else if (dir === 'dir' && a === ui.desfazer && !ui.acao.disabled) ui.acao.focus();
      else if (dir === 'cima' || dir === 'esq') ui.grade.children[est.sel]?.focus();
    } else if (a?.classList.contains('mb-voltar')) { if (dir === 'baixo') ui.cats.querySelector('.ativa').focus(); else if (dir === 'dir') focarSlot(est.sel); }
    else focarSlot(est.sel);
  }
  raiz.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b || b.disabled) return;
    if (b.classList.contains('mb-voltar')) return fechar();
    if (b.classList.contains('mb-cat')) { est.cat = b.dataset.cat; est.sel = 0; desenhar(); return b.focus(); }
    if (b.classList.contains('mb-slot')) { const i = +b.dataset.i; if (i === est.sel && !ui.acao.disabled) return comprar(); est.sel = i; desenhar(); return ui.grade.children[i].focus(); }
    if (b === ui.desfazer) return desfazer();
    if (b === ui.acao) return comprar();
  });
  raiz.addEventListener('focusin', e => { const b = e.target.closest?.('.mb-slot'); if (b && +b.dataset.i !== est.sel) { est.sel = +b.dataset.i; [...ui.grade.children].forEach((x, i) => x.classList.toggle('selecionado', i === est.sel)); desenharDetalhe(); } });
  const TECLAS = { ArrowUp: 'cima', ArrowDown: 'baixo', ArrowLeft: 'esq', ArrowRight: 'dir' };
  addEventListener('keydown', e => {
    if (!est.aberta || popups.aberto) return;
    e.stopImmediatePropagation();
    if (TECLAS[e.code]) { e.preventDefault(); mover(TECLAS[e.code]); }
    else if (e.code === 'Enter' || e.code === 'Space') { e.preventDefault(); if (!e.repeat) document.activeElement?.click(); }
    else if ((e.code === 'Escape' || e.code === 'KeyI') && !e.repeat) { e.preventDefault(); fechar(); }
    else if ((e.code === 'KeyQ' || e.code === 'KeyE') && !e.repeat) trocarCategoria(e.code === 'KeyE' ? 1 : -1);
  }, true);

  function abrir() { if (est.aberta) return; est.aberta = true; raiz.hidden = false; est.sel = 0; desenhar(); ui.grade.children[0]?.focus(); som?.foco?.(); }
  function fechar() { if (!est.aberta) return; est.aberta = false; esconderDesfazer(); raiz.hidden = true; som?.foco?.(); aoFechar?.(); }
  function controle({ cima, baixo, esq, dir, a, b, lb, rb }) {
    if (!est.aberta) return false;
    if (popups.controle({ cima, baixo, esq, dir, a, b })) return true;
    if (cima) mover('cima'); if (baixo) mover('baixo'); if (esq) mover('esq'); if (dir) mover('dir');
    if (a) document.activeElement?.click(); if (b) fechar();
    if (lb || rb) trocarCategoria(rb ? 1 : -1);
    return true;
  }
  return { abrir, fechar, controle, get aberta() { return est.aberta; } };
}
