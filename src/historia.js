// All player-facing story text (Portuguese, Brazil). Code identifiers stay in Portuguese/English
// as in the rest of the project; this file only holds content.
// Source: narrative bible "Threadbound" (map 1 — A Oficina Esquecida). Maps 2–4 are planning only.

export const TITULO = 'Threadbound';
export const CAPITULO = 'Capítulo 1 — A Oficina Esquecida';

// Story card on the start screen (short, read in a few seconds)
export const INTRO = [
  'O Arquipélago do Céu já foi unido pela Trama Celeste: Fios do Céu que levavam vento, água, sementes e pequenas luzes de ilha em ilha.',
  'Então veio o Vazio de Linha e começou a cortá-los. Sem seus fios, as ilhas se soltam… e afundam nas nuvens.',
  'Numa oficina esquecida, uma pequena boneca lilás, costurada com a última Linha Viva, abre os olhos pela primeira vez.',
];

// Numi's lines and short scenes. Each entry: [speaker, text]
export const FALAS = {
  // Cena 1 — O despertar
  despertar: [
    ['Numi', 'Onde… onde eu estou? Carretéis, uma agulha enorme, uma lanterna… é uma oficina.'],
    ['Numi', 'Alguém costurou tudo isso com cuidado. Será que foi a mesma pessoa que me costurou?'],
    ['Numi', 'Tem um fio quente pulsando no meu peito… e o chão está tremendo. A ilha está perdendo altitude!'],
  ],
  // Cena 2 — A primeira luz
  primeiroFragmento: [['Numi', 'Um Fragmento de Luz! Ele respondeu ao fio dentro de mim… como uma nota de música.']],
  // Cena 3 — A primeira criatura
  primeiroInimigo: [
    ['Numi', 'Um retalho… ele anda como se tentasse lembrar como se caminha.'],
    ['Numi', 'Não é maldade, é medo. Vou purificá-lo com cuidado.'],
  ],
  // Cena 4 — As três Âncoras de Fio
  primeiraAncora: [['Numi', 'Uma Âncora de Fio. O fio dela foi cortado… e tem cristais do Vazio prendendo tudo.']],
  ancoraSemFragmentos: [['Numi', 'Ainda não tenho luz suficiente. Preciso de mais Fragmentos de Luz.']],
  ancoraComGuardas: [['Numi', 'Os retalhos corrompidos ainda guardam a âncora. Primeiro preciso purificá-los.']],
  ancoraRestaurada: [
    [['Numi', 'Ela voltou a brilhar! O tremor diminuiu… a ilha parece respirar.']],
    [['Numi', 'Mais uma acesa! Aguenta firme, ilha… falta pouco.']],
    [['Numi', 'As três âncoras estão acesas! O Coração do Fio está me chamando.']],
  ],
  // Cena 6 — O Coração do Fio
  coracaoFechado: [['Numi', 'O Coração do Fio está apagado. As três âncoras precisam estar acesas primeiro.']],
  restaurarCoracao: [['Numi', 'Coração do Fio… volte a bater!']],
  depoisCoracao: [
    ['Numi', 'Os fios se esticaram pelo céu… a ilha parou de cair! E olha: uma ponte de luz!'],
    ['Numi', 'Tem um bilhete junto ao coração.'],
  ],
  // Cena 7 — O bilhete · Cena 8 — Encerramento
  depoisBilhete: [
    ['Numi', 'T… você está na Ilha das Agulhas. Mas por que partiu? E por que não me contou nada?'],
    ['Numi', 'Eu estou com medo… mas não vou ficar esperando. Vou seguir a ponte.'],
    ['Numi', 'Ali, entre as agulhas de pedra… um fio escuro se mexeu? …Sumiu.'],
  ],
};

// Cena 7: confirma onde T. está, sem explicar por que partiu nem se ainda está bem
export const BILHETE = '“Numi, se você está lendo isto, o Coração da oficina voltou a bater. Eu te costurei com a última Linha Viva do arquipélago — o único fio que o Vazio não consegue cortar. Não fiz você para lutar: fiz você para escutar os fios. Estou na Ilha das Agulhas. Há coisas que eu ainda não tive coragem de te contar. — T.”';

// Contextual tutorials (each shows once)
export const DICAS = {
  andar: 'W A S D (ou setas) para andar · mova o mouse para olhar em volta',
  correr: 'Segure Shift para correr mais rápido',
  pular: 'Espaço para pular · no ar, Espaço de novo dá um impulso · segure Espaço para planar',
  borda: 'Pule contra uma borda e continue empurrando: Numi se puxa para cima',
  planar: 'Caindo? Segure Espaço para planar devagar até o chão',
  vento: 'Correntes de vento levam aos lugares altos: entre no redemoinho',
  combate: 'Aproxime-se de um Retalho e aperte E para purificá-lo',
  chute: 'Cristais do Vazio podem ser dissolvidos com E',
  especial: 'A luz da Numi purifica sem violência',
  cristal: 'Cristais do Vazio prendem as âncoras: aproxime-se e aperte E para dissolvê-los',
  ancora: 'Aproxime-se da âncora e aperte E para restaurá-la',
  coracao: 'Vá até o Coração do Fio e aperte E',
  rocha: 'Rochas flutuantes balançam: pule nelas para alcançar fragmentos',
  memoria: 'Fragmentos lilases guardam memórias: são opcionais, mas contam quem é T.',
};

export const OBJETIVOS = {
  inicio: 'Saia da oficina e encontre Fragmentos de Luz',
  ancoras: (n, total) => `Restaure as Âncoras de Fio (${n}/${total})`,
  coracao: 'Restaure o Coração do Fio',
  bilhete: 'Leia o bilhete deixado junto ao Coração do Fio',
  fim: 'Siga a ponte de luz rumo à Ilha das Agulhas',
};

// Cena 5 — memórias de T. (fragmentos lilases): curtas, sensoriais e incompletas
export const MEMORIAS = [
  'Mãos cuidadosas costuram um laço lilás. Uma voz cantarola baixinho, e a agulha para no meio do ponto.',
  '“As ilhas não vivem da energia dos fios. Vivem do que lembramos de quem passou por elas.”',
  'Um mapa antigo, aberto sobre a mesa. Uma das ilhas está marcada com pequenas agulhas.',
  '“É a última Linha Viva. Se eu usar nela… não vai sobrar outra.” As mãos hesitam. Depois, costuram.',
  '“Desculpe deixar você sozinha, pequena. Você não foi feita para lutar. Foi feita para escutar.”',
];

export const NOMES = {
  fragmento: 'Fragmento de Luz',
  memoria: 'Fragmento de Memória',
  ancora: 'Âncora de Fio',
  coracao: 'Coração do Fio',
  inimigo: 'Retalho Sombrio',
  cristal: 'Cristal do Vazio',
};

export const AVISOS = {
  tremor: 'A ilha está perdendo altitude!',
  ancoraRestaurada: 'Âncora de Fio restaurada! A ilha respira de novo.',
  inimigoPurificado: 'Retalho purificado',
  cristalQuebrado: 'Cristal do Vazio dissolvido',
  especialPronto: 'Brilho do Fio carregado!',
  capituloCompleto: 'Capítulo 1 concluído!',
  quedaForte: (altura, dano) => `Ai! Queda de ${Math.round(altura)} m · −${dano} ${dano > 1 ? 'Linhas Vivas' : 'Linha Viva'}`,
  caiuNoVazio: 'Numi caiu da ilha… a Linha Viva a puxou de volta!',
};

// tela de game over: o motivo muda conforme como Numi perdeu a última Linha Viva
export const GAMEOVER = {
  queda: 'A queda foi alta demais e a Linha Viva de Numi se apagou… por enquanto.',
  vazio: 'Numi despencou das ilhas até o mar lá embaixo, e o Vazio quase a alcançou.',
  praia: 'Numi despencou das ilhas e caiu na praia lá embaixo. Cuidado com as bordas!',
  golpe: 'Os Retalhos Sombrios foram demais desta vez. Defenda-se (Q) e purifique-os com calma.',
};
