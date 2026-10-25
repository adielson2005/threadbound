// Progresso e configurações guardados no navegador (localStorage). Sem armazenamento (modo
// privado restrito), o jogo funciona igual: só não lembra de uma vez para outra.
import { CAPITULO_ATUAL } from './capitulo.js';

const CHAVE_PROGRESSO = 'threadbound.progresso';
const CHAVE_CONFIG = 'threadbound.config';
const CHAVE_CONCLUIDOS = 'threadbound.concluidos'; // capítulos terminados (desbloqueiam o seguinte)
const CHAVE_ULTIMO = 'threadbound.ultimo';         // o último capítulo jogado (o "Continuar" do menu)

function ler(chave) { try { return JSON.parse(localStorage.getItem(chave)); } catch { return null; } }
function gravar(chave, valor) { try { localStorage.setItem(chave, JSON.stringify(valor)); return true; } catch { return false; } }

// ---------- progresso (um por capítulo; o do Cap. 1 fica na chave antiga) ----------
// { versao, capitulo, etapa, fragmentos: [índices pegos], ancoras: [índices reacesas], cristais: [[âncora, cristal]],
//   purificados: [índices de inimigos], cartas: [nomes], memorias, vida, checkpoint: [x, y, z], coracao, concluido }
const chave = n => (n === 1 ? CHAVE_PROGRESSO : `${CHAVE_PROGRESSO}.${n}`);
export function lerProgresso(n = CAPITULO_ATUAL) {
  const p = ler(chave(n));
  return p && p.versao === 1 && (p.capitulo ?? 1) === n ? p : null;
}
export function salvarProgresso(p) {
  gravar(CHAVE_ULTIMO, CAPITULO_ATUAL);
  if (p.concluido) marcarConcluido(CAPITULO_ATUAL);
  return gravar(chave(CAPITULO_ATUAL), { ...p, versao: 1, salvoEm: Date.now() });
}
export function apagarProgresso(n = CAPITULO_ATUAL) { try { localStorage.removeItem(chave(n)); } catch { /* sem armazenamento */ } }

export function lerConcluidos() {
  const lista = new Set(ler(CHAVE_CONCLUIDOS) ?? []);
  // saves antigos do Cap. 1 guardavam "concluidos: [1]" dentro do progresso
  if ((ler(CHAVE_PROGRESSO)?.concluidos ?? []).includes(1)) lista.add(1);
  return [...lista];
}
export function marcarConcluido(n) { gravar(CHAVE_CONCLUIDOS, [...new Set([...lerConcluidos(), n])]); }
export function ultimoCapitulo() { const n = ler(CHAVE_ULTIMO); return Number.isInteger(n) ? n : 1; }

// ---------- configurações ----------
export const CONFIG_PADRAO = { volume: 0.8, sensibilidade: 1, tremor: true, texto: 1 };
export function lerConfig() { return { ...CONFIG_PADRAO, ...(ler(CHAVE_CONFIG) ?? {}) }; }
export function salvarConfig(c) { gravar(CHAVE_CONFIG, c); }
