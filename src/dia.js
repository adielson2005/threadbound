// Quanto é dia agora (0 = noite, 1 = dia cheio), atualizado pelo céu a cada quadro (jogo.js).
// Brilhos aditivos (luzinhas mágicas, lanternas, a marca de luz dos objetos) usam isto para ficar
// discretos de dia: em pleno sol eles viravam halos brancos em volta da Brisa ao entrar no mapa.
export const DIA = { valor: 1 };
// fator de brilho de uma luz pequena: 1 à noite, "minimo" ao meio-dia
export const brilhoDeDia = (minimo = 0.25) => 1 - (1 - minimo) * DIA.valor;
