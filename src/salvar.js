// Progresso e configurações guardados no navegador (localStorage). Sem armazenamento (modo
// privado restrito), o jogo funciona igual: só não lembra de uma vez para outra.

const CHAVE_PROGRESSO = 'threadbound.progresso';
const CHAVE_CONFIG = 'threadbound.config';

function ler(chave) { try { return JSON.parse(localStorage.getItem(chave)); } catch { return null; } }
function gravar(chave, valor) { try { localStorage.setItem(chave, JSON.stringify(valor)); return true; } catch { return false; } }

// ---------- progresso ----------
// { versao, capitulo, etapa, fragmentos: [índices pegos], ancoras: [índices reacesas], cristais: [[âncora, cristal]],
//   purificados: [índices de inimigos], cartas: [nomes], memorias, vida, checkpoint: [x, y, z], coracao, concluidos: [capítulos] }
export function lerProgresso() {
  const p = ler(CHAVE_PROGRESSO);
  return p && p.versao === 1 ? p : null;
}
export function salvarProgresso(p) { return gravar(CHAVE_PROGRESSO, { ...p, versao: 1, salvoEm: Date.now() }); }
export function apagarProgresso() { try { localStorage.removeItem(CHAVE_PROGRESSO); } catch { /* sem armazenamento */ } }

// ---------- configurações ----------
export const CONFIG_PADRAO = { volume: 0.8, sensibilidade: 1, tremor: true, texto: 1 };
export function lerConfig() { return { ...CONFIG_PADRAO, ...(ler(CHAVE_CONFIG) ?? {}) }; }
export function salvarConfig(c) { gravar(CHAVE_CONFIG, c); }
