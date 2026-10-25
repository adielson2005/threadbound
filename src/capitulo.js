// Qual capítulo está sendo jogado e como é o mapa de cada um.
// O capítulo vem da URL (?capitulo=2). Cada capítulo é uma página carregada do zero: o mundo inteiro
// (ilha, vegetação, construções, colisão) é gerado uma vez no carregamento, então trocar de
// capítulo é recarregar a página com outro número. Os textos de cada capítulo ficam em historia.js.

export const TOTAL_CAPITULOS = 4;

const n = parseInt(new URLSearchParams(location.search).get('capitulo'), 10);
export const CAPITULO_ATUAL = n >= 1 && n <= TOTAL_CAPITULOS ? n : 1;

// endereço da página de outro capítulo (mantém os outros parâmetros, como ?grafico=)
export function urlCapitulo(numero) {
  const p = new URLSearchParams(location.search);
  if (numero === 1) p.delete('capitulo'); else p.set('capitulo', numero);
  const q = p.toString();
  return location.pathname + (q ? '?' + q : '');
}

const C = (r, g, b) => [r, g, b];

// mapa: o arquipélago (ilha.js). praca = clareira onde Brisa começa; morro = o ponto alto;
// ilhotas = as três ilhas pequenas ligadas por correntes de vento (onde ficam os três objetivos);
// obra = a que distância do centro da ilhota fica a construção dela (raio obraR, 7 m se faltar).
// paleta = cores do chão e das falésias; vegetacao = o que cresce; construcoes = o que foi construído.
// ambiente: chuva fixa (0 = só a tecla Y), névoa mais perto e tom do céu.
// marcos: como se parecem os três objetivos e o objetivo final (mundo.js).
export const CAPITULOS = {
  1: {
    mapa: {
      semente: 20241024,
      principal: { R: 105, prof: 62, semente: 11 },
      praca: { x: 34, z: 30, r: 15 },
      morro: { x: -28, z: -22, altura: 24 },
      ilhotas: [
        { nome: 'farol', ang: -0.5, R: 24, topo: 15, vao: 12, prof: 30, semente: 23, obra: 10 },
        { nome: 'ruinas', ang: 2.68, R: 30, topo: 5, vao: 13, prof: 36, semente: 37, obra: 11, obraR: 9 },
        { nome: 'pomar', ang: 1.29, R: 23, topo: -5, vao: 11, prof: 28, semente: 41 },
      ],
      paleta: {
        grama: [C(0.40, 0.53, 0.25), C(0.50, 0.60, 0.30), C(0.31, 0.45, 0.22), C(0.62, 0.60, 0.38)],
        terra: C(0.62, 0.52, 0.37), trilha: C(0.74, 0.64, 0.45), rocha: C(0.53, 0.5, 0.46), musgo: C(0.33, 0.45, 0.22),
        estratos: [C(0.6, 0.51, 0.4), C(0.47, 0.42, 0.37), C(0.66, 0.58, 0.47), C(0.29, 0.27, 0.26)],
      },
      vegetacao: 'campo',
      construcoes: 'vila',
      // enseada de areia na borda da ilha principal (ângulo a partir do centro, largura em radianos)
      praia: { ang: -1.75, largura: 0.42 },
      // áreas secretas: a gruta no morro da floresta e o mirante no alto do farol
      gruta: { x: -54, z: 47 },
    },
    ambiente: { chuva: 0, nevoa: 1, ceu: null },
    marcos: { ancora: 'ancora', coracao: 'coracao', chegada: 'oficina' },
  },
  // O Recife das Vozes: corais pendurados no ar, cascos de barco presos na rocha, garoa constante
  2: {
    mapa: {
      semente: 7720115,
      principal: { R: 88, prof: 54, semente: 53 },
      praca: { x: 26, z: 20, r: 11 },
      morro: { x: -24, z: -18, altura: 20 },
      ilhotas: [
        { nome: 'boiaNorte', ang: -0.9, R: 21, topo: 9, vao: 12, prof: 26, semente: 61, obra: 9 },
        { nome: 'boiaOeste', ang: 2.4, R: 24, topo: 2, vao: 13, prof: 30, semente: 67, obra: 9 },
        { nome: 'boiaSul', ang: 1.05, R: 20, topo: -6, vao: 11, prof: 24, semente: 71, obra: 8 },
      ],
      paleta: {
        grama: [C(0.30, 0.47, 0.44), C(0.40, 0.55, 0.50), C(0.22, 0.38, 0.38), C(0.72, 0.48, 0.47)],
        terra: C(0.55, 0.52, 0.46), trilha: C(0.68, 0.64, 0.56), rocha: C(0.36, 0.37, 0.40), musgo: C(0.28, 0.44, 0.42),
        estratos: [C(0.42, 0.42, 0.45), C(0.30, 0.31, 0.35), C(0.55, 0.50, 0.50), C(0.18, 0.19, 0.22)],
      },
      vegetacao: 'recife',
      construcoes: 'naufragios',
    },
    ambiente: { chuva: 0.45, nevoa: 0.7, ceu: '#9fb3c0' },
    marcos: { ancora: 'sino', coracao: 'casaBarco', chegada: 'barco' },
  },
  // O Jardim Submerso: o fundo do mar antigo, seco; algas petrificadas, a vila velha e o jardim
  3: {
    mapa: {
      semente: 3310987,
      principal: { R: 100, prof: 58, semente: 83 },
      praca: { x: -30, z: 26, r: 14 },
      morro: { x: 30, z: -26, altura: 16 },
      ilhotas: [
        { nome: 'concha', ang: -2.2, R: 22, topo: 6, vao: 12, prof: 26, semente: 89, obra: 8 },
        { nome: 'poco', ang: 0.2, R: 25, topo: 12, vao: 13, prof: 30, semente: 97, obra: 9 },
        { nome: 'canteiro', ang: 1.75, R: 23, topo: -4, vao: 11, prof: 26, semente: 101, obra: 8 },
      ],
      paleta: {
        grama: [C(0.64, 0.60, 0.46), C(0.71, 0.66, 0.52), C(0.52, 0.52, 0.40), C(0.46, 0.55, 0.38)],
        terra: C(0.72, 0.64, 0.50), trilha: C(0.80, 0.73, 0.58), rocha: C(0.70, 0.66, 0.58), musgo: C(0.45, 0.50, 0.36),
        estratos: [C(0.76, 0.70, 0.60), C(0.62, 0.57, 0.50), C(0.84, 0.78, 0.66), C(0.40, 0.37, 0.33)],
      },
      vegetacao: 'fundo',
      construcoes: 'vilaAntiga',
    },
    ambiente: { chuva: 0, nevoa: 0.85, ceu: '#d8c7a6' },
    marcos: { ancora: 'flor', coracao: 'jardim', chegada: 'fio' },
  },
  // A Costura Final: o olho da tempestade, chão de retalhos gigantes costurados
  4: {
    mapa: {
      semente: 4404040,
      principal: { R: 92, prof: 60, semente: 113 },
      praca: { x: 0, z: 34, r: 12 },
      morro: { x: 0, z: -30, altura: 22 },
      ilhotas: [
        { nome: 'noAzul', ang: -0.35, R: 22, topo: 14, vao: 12, prof: 28, semente: 127, obra: 8 },
        { nome: 'noRosa', ang: 3.5, R: 22, topo: 8, vao: 13, prof: 28, semente: 131, obra: 8 },
        { nome: 'noOuro', ang: 1.6, R: 25, topo: 4, vao: 11, prof: 28, semente: 137, obra: 9 },
      ],
      paleta: {
        retalhos: true, // chão em quadrados de tecido com pontos de costura nas emendas
        grama: [C(0.62, 0.50, 0.78), C(0.86, 0.56, 0.66), C(0.52, 0.68, 0.82), C(0.88, 0.80, 0.52), C(0.58, 0.74, 0.56)],
        terra: C(0.55, 0.45, 0.60), trilha: C(0.93, 0.88, 0.78), rocha: C(0.48, 0.42, 0.55), musgo: C(0.62, 0.50, 0.72),
        estratos: [C(0.52, 0.45, 0.60), C(0.40, 0.34, 0.48), C(0.66, 0.56, 0.70), C(0.20, 0.17, 0.26)],
      },
      vegetacao: 'costura',
      construcoes: 'costura',
    },
    ambiente: { chuva: 0.25, nevoa: 0.75, ceu: '#b7a6c9' },
    marcos: { ancora: 'no', coracao: 'aurelia', chegada: 'fio' },
  },
};

export const CONFIG = CAPITULOS[CAPITULO_ATUAL];
