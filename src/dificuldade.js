// Dificuldades, do mais fácil ao mais difícil (nomes de costura e de mar, como o resto da ilha).
// Escolhida no menu Jogar e salva no navegador. Os números multiplicam o que vale em "Ponto Corrido",
// o equilíbrio pensado para o jogo.
//  folego: fôlegos da Brisa · vidaVilao / ritmoVilao: vida e velocidade dos golpes do vilão
//  pausaVilao / avisoVilao: tempo entre os ataques e do aviso em guarda antes de cada golpe
//  ganhoPoder: quão rápido a barra da Explosão de Fios enche · janelaDefesa: s da defesa perfeita
export const DIFICULDADES = [
  {
    id: 'seda', nome: 'Fio de Seda', resumo: 'Muito fácil',
    descricao: 'Para curtir a história: mais fôlego, inimigos lentos e o poder enche rápido.',
    folego: 7, vidaVilao: 0.6, ritmoVilao: 0.8, pausaVilao: 1.5, avisoVilao: 1.6, ganhoPoder: 1.6, janelaDefesa: 0.34,
  },
  {
    id: 'corrido', nome: 'Ponto Corrido', resumo: 'Normal',
    descricao: 'O equilíbrio pensado para o jogo: dá para aprender lutando.',
    folego: 5, vidaVilao: 1, ritmoVilao: 1, pausaVilao: 1, avisoVilao: 1, ganhoPoder: 1, janelaDefesa: 0.22,
  },
  {
    id: 'marinheiro', nome: 'Nó de Marinheiro', resumo: 'Difícil',
    descricao: 'Menos fôlego e inimigos mais rápidos. Defender na hora certa faz falta.',
    folego: 4, vidaVilao: 1.25, ritmoVilao: 1.15, pausaVilao: 0.8, avisoVilao: 0.8, ganhoPoder: 0.85, janelaDefesa: 0.17,
  },
  {
    id: 'mare', nome: 'Maré Negra', resumo: 'Muito difícil',
    descricao: 'Para quem domina a luta: 3 fôlegos, quase sem aviso e o vilão não para.',
    folego: 3, vidaVilao: 1.5, ritmoVilao: 1.3, pausaVilao: 0.65, avisoVilao: 0.65, ganhoPoder: 0.7, janelaDefesa: 0.13,
  },
];

const CHAVE = 'jogo.dificuldade';
let atual = DIFICULDADES[1];
try { atual = DIFICULDADES.find(d => d.id === localStorage.getItem(CHAVE)) ?? atual; } catch { /* sem armazenamento */ }

export const dificuldade = () => atual;
export function definirDificuldade(id) {
  atual = DIFICULDADES.find(d => d.id === id) ?? atual;
  try { localStorage.setItem(CHAVE, atual.id); } catch { /* sem armazenamento */ }
  return atual;
}
