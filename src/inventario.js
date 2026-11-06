// Inventário da Brisa (design/ux/mochila-loja-popups.md §8): o que ela achou, os Fuxicos, as melhorias,
// os itens do Armarinho e as roupas. Só estado e regras, sem DOM: a UI lê e pede ações; o jogo lê os
// multiplicadores das melhorias. Vale para o jogo todo (não é por capítulo): os Fuxicos atravessam as ilhas.
//
// Eventos (EventTarget, detail no CustomEvent):
//   'item-obtido'    { id, novo }            um item (ou uma parte de coleção) entrou
//   'moeda-mudou'    { saldo, delta, motivo }
//   'melhoria-mudou' { id, nivel }
//   'loja-mudou'     { id }                  comprou ou usou algo do Armarinho
// Toda ação que gasta é uma transação: se o save falhar, o estado volta e nada é cobrado.
import { ITENS, MELHORIAS, NIVEL_MAX, EFEITO_MELHORIA, LOJA, EFEITO_LOJA } from './itens.js';

export const VERSAO_INVENTARIO = 1;
const ESTADO_VAZIO = () => ({
  versao: VERSAO_INVENTARIO,
  fuxicos: 0,
  itens: {},                 // id -> { novo, emUso }
  cartas: {},                // capítulo -> [nomes lidos]
  lembrancas: {},            // capítulo -> [índices lidos]
  capitulos: [],             // capítulos já visitados (itens deles aparecem trancados com "???")
  melhorias: {},             // id -> nível (0 = não tem)
  remendos: 0,
  fitinha: {},               // capítulo -> 'tem' | 'usada'
  mapa: {},                  // capítulo -> true
  roupas: { lacinho: false, vestido: false },
});
const copiar = o => JSON.parse(JSON.stringify(o));

// gravar(estado) -> bool: a persistência (salvar.js); sem ela, o inventário vive só na memória
export function criarInventario({ estado = null, gravar = () => true } = {}) {
  let e = { ...ESTADO_VAZIO(), ...(estado ? copiar(estado) : {}) };
  const eventos = new EventTarget();
  const avisar = (tipo, detalhe) => eventos.dispatchEvent(new CustomEvent(tipo, { detail: detalhe }));

  // aplica uma mudança e salva; se o save falhar, desfaz tudo
  function transacao(mudar) {
    const antes = copiar(e);
    const r = mudar();
    if (r?.ok === false) { e = antes; return r; }
    if (!gravar(e)) { e = antes; return { ok: false, motivo: 'salvar' }; }
    return r ?? { ok: true };
  }

  // ---------- Fuxicos ----------
  function ganhar(n, motivo = '') {
    if (!(n > 0)) return e.fuxicos;
    const r = transacao(() => { e.fuxicos += Math.floor(n); });
    if (r.ok !== false) avisar('moeda-mudou', { saldo: e.fuxicos, delta: Math.floor(n), motivo });
    return e.fuxicos;
  }
  // gastar sozinho é interno (compra/melhoria); de fora, só pelas ações abaixo
  function cobrar(n) {
    if (e.fuxicos < n) return { ok: false, motivo: 'sem-saldo', faltam: n - e.fuxicos };
    e.fuxicos -= n; return { ok: true };
  }

  // ---------- itens achados ----------
  function obter(id) {
    if (!ITENS[id]) return { ok: false, motivo: 'desconhecido' };
    if (e.itens[id]) return { ok: true, novo: false };
    const r = transacao(() => { e.itens[id] = { novo: true, emUso: false }; });
    if (r.ok !== false) avisar('item-obtido', { id, novo: true });
    return { ...r, novo: r.ok !== false };
  }
  function registrarColecao(colecao, cap, parte) {
    const id = Object.keys(ITENS).find(k => ITENS[k].colecao === colecao);
    const lista = (colecao === 'cartas' ? e.cartas : e.lembrancas);
    if ((lista[cap] ?? []).includes(parte)) return { ok: true, novo: false };
    const r = transacao(() => { (lista[cap] ??= []).push(parte); if (!e.itens[id]) e.itens[id] = { novo: true, emUso: false }; else e.itens[id].novo = true; });
    if (r.ok !== false) avisar('item-obtido', { id, novo: true, parte, cap });
    return { ...r, novo: r.ok !== false };
  }
  const registrarCarta = (cap, nome) => registrarColecao('cartas', cap, nome);
  const registrarLembranca = (cap, indice) => registrarColecao('lembrancas', cap, indice);
  function visitarCapitulo(cap) { if (!e.capitulos.includes(cap)) transacao(() => { e.capitulos.push(cap); e.capitulos.sort(); }); }
  function marcarVisto(id) { if (e.itens[id]?.novo) transacao(() => { e.itens[id].novo = false; }); }
  function emUso(id, sim) { if (e.itens[id] && e.itens[id].emUso !== !!sim) transacao(() => { e.itens[id].emUso = !!sim; }); }
  const temNovo = () => Object.values(e.itens).some(i => i.novo);
  const quantosNovos = () => Object.values(e.itens).filter(i => i.novo).length;

  // ---------- melhorias ----------
  const nivel = id => e.melhorias[id] ?? 0;
  function precoMelhoria(id) { const n = nivel(id); return n >= NIVEL_MAX ? null : MELHORIAS[id].precos[n]; }
  function subirMelhoria(id) {
    if (!MELHORIAS[id]) return { ok: false, motivo: 'desconhecido' };
    const preco = precoMelhoria(id);
    if (preco === null) return { ok: false, motivo: 'maximo' };
    const r = transacao(() => { const c = cobrar(preco); if (!c.ok) return c; e.melhorias[id] = nivel(id) + 1; return { ok: true, nivel: e.melhorias[id], preco }; });
    if (r.ok) { avisar('moeda-mudou', { saldo: e.fuxicos, delta: -preco, motivo: 'melhoria' }); avisar('melhoria-mudou', { id, nivel: r.nivel }); }
    return r;
  }

  // ---------- Armarinho ----------
  // por que não dá para comprar agora (null = dá)
  function impedimento(id, cap) {
    const it = LOJA[id];
    if (!it) return 'desconhecido';
    if (it.limite === 'qtd' && e.remendos >= it.max) return 'limite';
    if (it.limite === 'porIlha' && (id === 'fitinha' ? e.fitinha[cap] : e.mapa[cap])) return 'limite';
    if (it.limite === 'unico' && e.roupas[id]) return 'limite';
    if (e.fuxicos < it.preco) return 'sem-saldo';
    return null;
  }
  function comprar(id, cap) {
    const motivo = impedimento(id, cap);
    if (motivo) return { ok: false, motivo, faltam: motivo === 'sem-saldo' ? LOJA[id].preco - e.fuxicos : 0 };
    const preco = LOJA[id].preco;
    const r = transacao(() => {
      cobrar(preco);
      if (id === 'remendo') e.remendos++;
      else if (id === 'fitinha') e.fitinha[cap] = 'tem';
      else if (id === 'mapa') e.mapa[cap] = true;
      else e.roupas[id] = true;
      return { ok: true, preco };
    });
    if (r.ok) { avisar('moeda-mudou', { saldo: e.fuxicos, delta: -preco, motivo: 'compra' }); avisar('loja-mudou', { id }); }
    return r;
  }
  // "Desfazer" (5 s depois de uma compra barata): devolve o preço e tira o item
  function desfazerCompra(id, cap) {
    const preco = LOJA[id]?.preco ?? 0;
    const r = transacao(() => {
      if (id === 'remendo') { if (e.remendos <= 0) return { ok: false, motivo: 'nada' }; e.remendos--; }
      else if (id === 'fitinha') { if (e.fitinha[cap] !== 'tem') return { ok: false, motivo: 'nada' }; delete e.fitinha[cap]; }
      else if (id === 'mapa') { if (!e.mapa[cap]) return { ok: false, motivo: 'nada' }; delete e.mapa[cap]; }
      else { if (!e.roupas[id]) return { ok: false, motivo: 'nada' }; e.roupas[id] = false; }
      e.fuxicos += preco; return { ok: true };
    });
    if (r.ok) { avisar('moeda-mudou', { saldo: e.fuxicos, delta: preco, motivo: 'desfazer' }); avisar('loja-mudou', { id }); }
    return r;
  }
  // Remendo de Chita: quanto de fôlego volta (o jogo aplica); 0 = não tem remendo
  function usarRemendo(folegoMax) {
    if (e.remendos <= 0) return 0;
    const r = transacao(() => { e.remendos--; });
    if (r.ok === false) return 0;
    avisar('loja-mudou', { id: 'remendo' });
    return Math.max(1, Math.ceil(folegoMax * EFEITO_LOJA.remendo));
  }
  // Fitinha do Bonfim: ao zerar o fôlego, volta com 25% (uma por ilha); 0 = não tem
  function usarFitinha(cap, folegoMax) {
    if (e.fitinha[cap] !== 'tem') return 0;
    const r = transacao(() => { e.fitinha[cap] = 'usada'; });
    if (r.ok === false) return 0;
    avisar('loja-mudou', { id: 'fitinha' });
    return Math.max(1, Math.ceil(folegoMax * EFEITO_LOJA.fitinha));
  }

  // ---------- o que o jogo lê (multiplicadores e somas das melhorias) ----------
  const M = EFEITO_MELHORIA;
  const efeitos = {
    get folegoExtra() { return nivel('folego') * M.folegoPorNivel; },
    get ganhoPoder() { return 1 + nivel('explosao') * M.cargaPoderPorNivel; },
    get raioPoder() { return 1 + nivel('explosao') * M.raioPoderPorNivel; },
    usosArma: tipo => (M.usosPorNivel[tipo] ?? 0) * nivel(tipo),
    alcanceArma: tipo => (M.usosPorNivel[tipo] !== undefined ? M.alcancePorNivel * nivel(tipo) : 0),
    get raioIma() { return 1 + nivel('ima') * M.imaPorNivel; },
  };

  return {
    eventos, efeitos,
    get saldo() { return e.fuxicos; },
    get remendos() { return e.remendos; },
    get roupas() { return { ...e.roupas }; },
    ganhar, obter, registrarCarta, registrarLembranca, visitarCapitulo, marcarVisto, emUso, temNovo, quantosNovos,
    nivel, precoMelhoria, subirMelhoria, impedimento, comprar, desfazerCompra, usarRemendo, usarFitinha,
    tem: id => !!e.itens[id], novo: id => !!e.itens[id]?.novo, usado: id => !!e.itens[id]?.emUso,
    cartas: cap => [...(e.cartas[cap] ?? [])], lembrancas: cap => [...(e.lembrancas[cap] ?? [])],
    capitulosVisitados: () => [...e.capitulos], fitinha: cap => e.fitinha[cap] ?? null, mapa: cap => !!e.mapa[cap],
    exportar: () => copiar(e),
    importar(s) { e = { ...ESTADO_VAZIO(), ...copiar(s) }; avisar('moeda-mudou', { saldo: e.fuxicos, delta: 0, motivo: 'importar' }); },
  };
}

// estado inicial a partir dos saves de capítulo de antes do inventário existir: as cartas e as
// lembranças já lidas viram itens de história (a garrafa de Tomé é uma das "cartas" do Cap. 1)
export function migrarDeProgressos(progressos) {
  const e = ESTADO_VAZIO();
  for (const [cap, p] of Object.entries(progressos)) {
    if (!p) continue;
    const n = +cap;
    e.capitulos.push(n);
    const cartas = (p.cartas ?? []).filter(nome => nome !== 'Garrafa na Enseada');
    if (cartas.length) { e.cartas[n] = cartas; e.itens['cartas-moradores'] = { novo: false, emUso: false }; }
    if ((p.cartas ?? []).includes('Garrafa na Enseada')) e.itens['garrafa-tome'] = { novo: false, emUso: false };
    if (p.memorias > 0) { e.lembrancas[n] = Array.from({ length: p.memorias }, (_, i) => i); e.itens['lembrancas-ilma'] = { novo: false, emUso: false }; }
  }
  e.capitulos.sort();
  return e;
}
