// Pop-ups e toast (design/ux/interaction-patterns.md 2.9 e 2.10; mochila-loja-popups.md §6).
// modal(): painel branco com faixa de título, ícone grande opcional, até 2 botões; prende o foco (Tab, setas),
// Esc/B = o botão de cancelar; ao fechar, devolve o foco a quem abriu. Devolve uma Promise com o id do botão.
// toast(): pílula branca no alto (role=status), um de cada vez, NUNCA rouba o foco; some sozinho.
const MS_TOAST = 3000, FATOR_TEXTO_GRANDE = 1.5;   // +50% de tempo com texto Grande/Maior (IP 2.10)
const icone = (id, classe) => `<svg class="${classe}" aria-hidden="true"><use href="#${id}"/></svg>`;

export function criarPopups({ raiz, som }) {
  raiz.innerHTML = `
    <div class="pp-veu" hidden>
      <div class="pp-modal" role="dialog" aria-modal="true" aria-labelledby="ppTitulo" aria-describedby="ppCorpo">
        <h2 class="pp-faixa" id="ppTitulo"></h2>
        <div class="pp-disco" hidden></div>
        <div class="pp-corpo" id="ppCorpo"></div>
        <div class="pp-botoes"></div>
      </div>
    </div>
    <div class="pp-toast" role="status" aria-live="polite" hidden><span class="pp-toast-icone"></span><span class="pp-toast-texto"><b></b><small></small></span></div>`;
  const veu = raiz.querySelector('.pp-veu'), modalEl = raiz.querySelector('.pp-modal'), botoesEl = raiz.querySelector('.pp-botoes');
  const toastEl = raiz.querySelector('.pp-toast');
  let atual = null; // { resolver, cancelar, focoAntes }

  // botoes: [{ id, rotulo, primario, cancelar }]; foco: id do botão com o foco inicial
  function modal({ titulo, corpo = '', icone: ic = null, botoes = [{ id: 'ok', rotulo: 'OK', primario: true, cancelar: true }], foco = null, faixa = 'azul' }) {
    if (atual) fechar(atual.cancelar);
    return new Promise(resolver => {
      modalEl.dataset.faixa = faixa;
      raiz.querySelector('.pp-faixa').textContent = titulo;
      const disco = raiz.querySelector('.pp-disco');
      disco.hidden = !ic; disco.innerHTML = ic ? icone(ic, 'pp-icone') : '';
      raiz.querySelector('.pp-corpo').innerHTML = corpo;
      botoesEl.replaceChildren(...botoes.map(b => {
        const el = document.createElement('button');
        el.type = 'button'; el.className = b.primario ? 'pp-primario' : 'pp-secundario'; el.dataset.id = b.id; el.textContent = b.rotulo;
        el.addEventListener('click', () => fechar(b.id));
        return el;
      }));
      const cancelar = (botoes.find(b => b.cancelar) ?? botoes[botoes.length - 1]).id;
      atual = { resolver, cancelar, focoAntes: document.activeElement };
      veu.hidden = false;
      som?.foco?.();
      (botoesEl.querySelector(`[data-id="${foco ?? botoes.find(b => b.primario)?.id ?? botoes[0].id}"]`) ?? botoesEl.firstChild).focus();
    });
  }
  function fechar(id) {
    if (!atual) return;
    const { resolver, focoAntes } = atual; atual = null;
    veu.hidden = true;
    focoAntes?.focus?.();
    resolver(id);
  }
  // teclado: o foco não sai do modal; Esc cancela; ←/→ e Tab passam entre os botões
  addEventListener('keydown', e => {
    if (!atual) return;
    e.stopImmediatePropagation();
    const bs = [...botoesEl.children], i = bs.indexOf(document.activeElement);
    if (e.code === 'Escape' || e.code === 'KeyI') { e.preventDefault(); fechar(atual.cancelar); }
    else if (e.code === 'Tab' || e.code === 'ArrowLeft' || e.code === 'ArrowRight' || e.code === 'ArrowUp' || e.code === 'ArrowDown') {
      e.preventDefault(); const passo = (e.code === 'Tab' && e.shiftKey) || e.code === 'ArrowLeft' || e.code === 'ArrowUp' ? -1 : 1;
      bs[(Math.max(0, i) + passo + bs.length) % bs.length].focus();
    } else if ((e.code === 'Enter' || e.code === 'Space') && i >= 0) { e.preventDefault(); if (!e.repeat) bs[i].click(); }
  }, true);
  // controle (quem chama repassa as bordas): devolve true se havia modal
  function controle({ esq, dir, cima, baixo, a, b }) {
    if (!atual) return false;
    const bs = [...botoesEl.children], i = Math.max(0, bs.indexOf(document.activeElement));
    if (esq || cima) bs[(i - 1 + bs.length) % bs.length].focus();
    if (dir || baixo) bs[(i + 1) % bs.length].focus();
    if (a) document.activeElement?.click();
    if (b) fechar(atual.cancelar);
    return true;
  }

  // ---------- toast ----------
  const fila = []; let tempoToast = null;
  function toast({ icone: ic = 'i-ok', texto, sub = '', ms = MS_TOAST }) {
    fila.push({ ic, texto, sub, ms });
    if (toastEl.hidden) proximoToast();
  }
  function proximoToast() {
    const t = fila.shift();
    if (!t) { toastEl.hidden = true; return; }
    toastEl.querySelector('.pp-toast-icone').innerHTML = icone(t.ic, 'pp-toast-svg');
    toastEl.querySelector('b').textContent = t.texto;
    toastEl.querySelector('small').textContent = t.sub;
    toastEl.querySelector('small').hidden = !t.sub;
    toastEl.hidden = false;
    const fator = document.documentElement.dataset.textoGrande === 'sim' ? FATOR_TEXTO_GRANDE : 1;
    clearTimeout(tempoToast); tempoToast = setTimeout(() => { toastEl.hidden = true; setTimeout(proximoToast, 120); }, t.ms * fator);
  }

  return { modal, fechar, toast, controle, get aberto() { return !!atual; } };
}
