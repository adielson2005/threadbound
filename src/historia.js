// All player-facing story text (Portuguese, Brazil). Code identifiers stay in Portuguese/English
// as in the rest of the project; this file only holds content.
// Source: docs/ROTEIRO.md (versão 2: Brisa e a Vila de Maré Alta). Chapters 2–4 are planning only.

export const TITULO = 'Threadbound';
export const CAPITULO = 'Capítulo 1 — A Vila de Maré Alta';

// Story card on the start screen (short, read in a few seconds)
export const INTRO = [
  'Há quarenta anos, a Maré Negra subiu do fundo do mar para engolir a Vila de Maré Alta.',
  'Para salvá-la, a costureira e o faroleiro costuraram a ilha nas nuvens com Fios de Maré. A vila subiu… e os moradores, um a um, viraram névoa.',
  'Hoje os fios estão se rompendo. Na praça vazia, uma boneca feita com os retalhos de todos eles abre os olhos.',
];

// Brisa's lines and short scenes. Each entry: [speaker, text]
export const FALAS = {
  // acordar na praça
  despertar: [
    ['Brisa', 'Essa praça tem cheiro de linha nova… e de mar velho.'],
    ['Brisa', 'Uma mesa de costura, carretéis, uma agulha enorme. Alguém trabalhou aqui até o último ponto.'],
    ['Brisa', 'O chão está tremendo! A ilha… está descendo?'],
  ],
  primeiroFragmento: [['Brisa', 'Um Fragmento de Luz! É um pedacinho dos Fios de Maré… ele esquentou meu retalho do peito.']],
  primeiroInimigo: [
    ['Brisa', 'Um retalho andando sozinho… é um pedaço de roupa de alguém daqui.'],
    ['Brisa', 'Você não quer brigar, não é? Está procurando o seu dono. Vou te acalmar com cuidado.'],
  ],
  primeiraAncora: [['Brisa', 'Uma Âncora de Maré. Os fios dela se soltaram… e a névoa endureceu em cristais.']],
  ancoraSemFragmentos: [['Brisa', 'Ainda não tenho luz suficiente. Preciso de mais Fragmentos de Luz.']],
  ancoraComGuardas: [['Brisa', 'Os retalhos assustados ainda guardam a âncora. Primeiro preciso acalmá-los.']],
  ancoraRestaurada: [
    [['Brisa', 'Ela acendeu! O tremor parou… a ilha respira de novo.']],
    [['Brisa', 'Mais uma! Aguenta firme, Maré Alta… falta pouco.']],
    [['Brisa', 'As três âncoras estão acesas. Agora o Coração da Ilha, lá no alto do morro.']],
  ],
  coracaoFechado: [['Brisa', 'O Coração da Ilha está frio. As três âncoras precisam estar acesas primeiro.']],
  restaurarCoracao: [['Brisa', 'Eu vou te costurar de novo. Do jeito que ela fazia: ponto por ponto.']],
  depoisCoracao: [
    ['Brisa', 'Os fios se esticaram até as nuvens… a ilha parou de cair! E o farol… acendeu sozinho?'],
    ['Brisa', 'Tem uma carta presa no Coração. É a mesma letra das outras.'],
  ],
  // depois da carta: o evento final do capítulo
  depoisBilhete: [
    ['Brisa', 'Aurélia… foi você que me fez. Com as roupas de todo mundo.'],
    ['Voz na névoa', 'Vó? Vó, é você?'],
    ['Brisa', 'Essa voz… o meu retalho do peito está quente. O farol está apontando para aquela tempestade. Eu vou até o recife.'],
  ],
  // ao ler uma carta pela primeira vez
  primeiraCarta: [['Brisa', 'Cartas… cada casa guarda um pedaço de quem morava aqui.']],
};

// carta de Aurélia junto ao Coração (fim do capítulo)
export const BILHETE = '“Se você está lendo isto, minha boneca, o Coração voltou a bater. Fui eu que costurei Maré Alta nas nuvens, com o Tomé. Salvamos a ilha da Maré Negra… e o preço foram as pessoas: a névoa levou todo mundo, um por um. Costurei você com um retalho de cada um, para alguém se lembrar deles. Procure o Tomé no Recife das Vozes. Ele sabe o resto. Me perdoe por ter deixado você sozinha. — Aurélia”';

// cartas das casas da vila (opcionais): contam como era a vida em Maré Alta
export const CARTAS = {
  'Casa dos Barcos': '“Hoje o mar estava liso como vidro. Os peixes sumiram faz três dias. O velho Tomé diz que é a Maré Negra voltando. Eu digo que é superstição de faroleiro.” — Bento, pescador',
  'Casa da Parteira': '“Trouxe mais um bebê ao mundo esta noite, uma menina forte. Choveu lá dentro da casa e no céu ao mesmo tempo. A Aurélia costurou uma manta para ela com as cores do pôr do sol.” — Dona Celeste',
  'Casa do Relojoeiro': '“Os relógios da vila pararam todos na mesma hora: 4h40. Desmontei três e não achei defeito. É como se o tempo estivesse esperando alguma coisa.” — Seu Inácio',
  'Casa das Redes': '“A Aurélia veio buscar as linhas mais fortes que eu tinha, as das redes de arrasto. Disse que era para uma costura grande. Não quis contar qual.” — Marisa, rendeira',
  'Casa da Costureira': '“Ilma, minha neta, hoje você riu tanto que o vestido rasgou no peito. Remendei com um retalho azul. Prometo que, aconteça o que acontecer, esse pedaço de você não vai se perder.” — Aurélia',
};

// Contextual tutorials (each shows once)
export const DICAS = {
  andar: 'W A S D (ou setas) para andar · mova o mouse para olhar em volta',
  correr: 'Segure Shift para correr mais rápido',
  pular: 'Espaço para pular · no ar, Espaço de novo dá um impulso · segure Espaço para planar',
  borda: 'Pule contra uma borda e continue empurrando: Brisa se puxa para cima',
  planar: 'Caindo? Segure Espaço para planar devagar até o chão',
  vento: 'Correntes de vento levam até as ilhotas: entre no redemoinho',
  combate: 'Aproxime-se de um Retalho e aperte E para acalmá-lo',
  chute: 'Cristais de névoa podem ser dissolvidos com E',
  especial: 'A luz da Brisa acalma sem machucar',
  cristal: 'Cristais de névoa prendem as âncoras: aproxime-se e aperte E para dissolvê-los',
  ancora: 'Aproxime-se da âncora e aperte E para reacendê-la',
  coracao: 'Suba o morro até o Coração da Ilha e aperte E',
  rocha: 'Rochas flutuantes balançam: pule nelas para alcançar fragmentos',
  memoria: 'Fragmentos lilases guardam lembranças da vila: são opcionais',
  carta: 'As casas guardam cartas dos moradores: entre e aperte E para ler',
};

export const OBJETIVOS = {
  inicio: 'Explore a vila e encontre Fragmentos de Luz',
  ancoras: (n, total) => `Reacenda as Âncoras de Maré nas ilhotas (${n}/${total})`,
  coracao: 'Restaure o Coração da Ilha, no alto do morro',
  bilhete: 'Leia a carta deixada no Coração da Ilha',
  fim: 'O farol aponta para o Recife das Vozes',
};

// lembranças guardadas nos fragmentos lilases: curtas e incompletas
export const MEMORIAS = [
  'Crianças correndo na praça, uma pipa de retalhos presa no telhado da Casa das Redes.',
  'Um homem de capa amarela sobe as escadas do farol, resmungando com a lanterna apagada.',
  '“Se a ilha subir, vocês vão comigo. Ninguém fica para a Maré Negra.” Uma voz firme, uma agulha brilhando.',
  'O céu escurece de baixo para cima. O mar inteiro levanta como um lençol, e a ilha sobe junto com ele.',
  'Uma menina de vestido remendado chama na névoa. Ninguém responde. Só o vento.',
];

export const NOMES = {
  fragmento: 'Fragmento de Luz',
  memoria: 'Fragmento de Lembrança',
  ancora: 'Âncora de Maré',
  coracao: 'Coração da Ilha',
  inimigo: 'Retalho',
  cristal: 'Cristal de Névoa',
};

export const AVISOS = {
  tremor: 'A ilha está perdendo altitude!',
  ancoraRestaurada: 'Âncora de Maré reacesa! A ilha respira de novo.',
  inimigoPurificado: 'Retalho acalmado',
  cristalQuebrado: 'Cristal de névoa dissolvido',
  especialPronto: 'Brilho carregado!',
  capituloCompleto: 'Capítulo 1 concluído!',
  quedaForte: (altura, dano) => `Ai! Queda de ${Math.round(altura)} m · −${dano} de fôlego`,
  caiuNoVazio: 'Brisa caiu da ilha… o vento a trouxe de volta!',
};

// tela de game over: o motivo muda conforme como Brisa perdeu o último fôlego
export const GAMEOVER = {
  queda: 'A queda foi alta demais e o fôlego de Brisa acabou… por enquanto.',
  vazio: 'Brisa despencou das ilhas até o mar lá embaixo.',
  praia: 'Brisa despencou das ilhas e caiu na praia lá embaixo. Cuidado com as bordas!',
  golpe: 'Os Retalhos assustados foram demais desta vez. Defenda-se (Q) e acalme-os com calma.',
};
