// Ajuste automático da resolução pelo fps, sem "caçar" de um lado para o outro.
//
// Cada troca de resolução recria a imagem da tela na GPU (no celular, uma travadinha visível). A
// versão anterior descia 0,08 depois de 2 s lentos e subia 0,04 depois de 4 s com folga: com o fps
// perto da meta ela subia, ficava lenta, descia, sobrava folga, subia de novo… uma travadinha a
// cada poucos segundos. Aqui:
//  - a resolução anda em degraus fixos (DEGRAU), então cada troca vale a pena;
//  - desce depois de 2 s abaixo da meta (ou na hora, se a queda for grande);
//  - sobe só depois de 8 s seguidos na meta, nunca logo depois de uma descida, e não volta ao
//    degrau que acabou de falhar por um bom tempo (o "teto" lembra onde o aparelho não aguentou;
//    a cada nova falha no mesmo degrau a espera dobra, até 10 min).
// Puro (sem three.js nem DOM): testado com sequências de fps em ferramentas/testar-resolucao.mjs.

export const DEGRAU = 0.25;
const SEG_LENTO = 2, SEG_FOLGA = 8, ESPERA_DEPOIS_DE_DESCER = 6, VALIDADE_TETO = 45, VALIDADE_MAX = 600;

export function criarAjusteResolucao(inicial) {
  return { atual: inicial, lento: 0, folga: 0, espera: 0, teto: Infinity, idadeTeto: 0, validade: VALIDADE_TETO, falhou: null, trocas: 0 };
}

// chamado uma vez por segundo com o fps medido; devolve a resolução nova (ou a mesma)
export function ajustarResolucao(e, fps, { min, max, meta }) {
  e.espera = Math.max(0, e.espera - 1);
  e.idadeTeto++;
  if (e.idadeTeto > e.validade) e.teto = Infinity;
  e.lento = fps < meta - 6 ? e.lento + 1 : 0;
  e.folga = fps >= meta ? e.folga + 1 : 0;
  let r = Math.min(max, Math.max(min, e.atual));
  if ((e.lento >= SEG_LENTO || fps < meta * 0.7) && r > min + 0.001) {
    // este degrau não se sustentou (de novo: espera o dobro antes de tentar outra vez)
    e.validade = e.falhou !== null && Math.abs(e.falhou - r) < 0.001 ? Math.min(VALIDADE_MAX, e.validade * 2) : VALIDADE_TETO;
    e.teto = e.falhou = r; e.idadeTeto = 0;
    r = Math.max(min, r - DEGRAU);
    e.lento = e.folga = 0; e.espera = ESPERA_DEPOIS_DE_DESCER;
  } else if (e.folga >= SEG_FOLGA && e.espera === 0 && r < max - 0.001) {
    const prox = Math.min(max, r + DEGRAU);
    if (prox < e.teto - 0.001) r = prox;
    e.folga = 0;
  }
  if (Math.abs(r - e.atual) > 0.001) e.trocas++;
  e.atual = r;
  return r;
}
