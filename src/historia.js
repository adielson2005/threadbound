// All player-facing story text (Portuguese, Brazil). Code identifiers stay in Portuguese/English
// as in the rest of the project; this file only holds content.
// Source: docs/ROTEIRO.md (versão 2: Brisa e a Vila de Maré Alta).
// Chapter 1 is the base; chapters 2–4 (TEXTOS, below) replace what changes. The exports at the end
// are the texts of the chapter being played (capitulo.js).
import { CAPITULO_ATUAL } from './capitulo.js';

export const TITULO = 'Threadbound';
const CAPITULO_1 = 'Capítulo 1 — A Vila de Maré Alta';

// Story card on the start screen (short, read in a few seconds)
const INTRO_1 = [
  'Há quarenta anos, a Maré Negra subiu do fundo do mar para engolir a Vila de Maré Alta.',
  'Para salvá-la, a costureira e o faroleiro costuraram a ilha nas nuvens com Fios de Maré. A vila subiu… e os moradores, um a um, viraram névoa.',
  'Hoje os fios estão se rompendo. Na praça vazia, uma boneca feita com os retalhos de todos eles abre os olhos.',
];

// Brisa's lines and short scenes. Each entry: [speaker, text]
const FALAS_1 = {
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
const BILHETE_1 = '“Se você está lendo isto, minha boneca, o Coração voltou a bater. Fui eu que costurei Maré Alta nas nuvens, com o Tomé. Salvamos a ilha da Maré Negra… e o preço foram as pessoas: a névoa levou todo mundo, um por um. Costurei você com um retalho de cada um, para alguém se lembrar deles. Procure o Tomé no Recife das Vozes. Ele sabe o resto. Me perdoe por ter deixado você sozinha. — Aurélia”';

// cartas das casas da vila (opcionais): contam como era a vida em Maré Alta
const CARTAS_1 = {
  'Casa dos Barcos': '“Hoje o mar estava liso como vidro. Os peixes sumiram faz três dias. O velho Tomé diz que é a Maré Negra voltando. Eu digo que é superstição de faroleiro.” — Bento, pescador',
  'Casa da Parteira': '“Trouxe mais um bebê ao mundo esta noite, uma menina forte. Choveu lá dentro da casa e no céu ao mesmo tempo. A Aurélia costurou uma manta para ela com as cores do pôr do sol.” — Dona Celeste',
  'Casa do Relojoeiro': '“Os relógios da vila pararam todos na mesma hora: 4h40. Desmontei três e não achei defeito. É como se o tempo estivesse esperando alguma coisa.” — Seu Inácio',
  'Casa das Redes': '“A Aurélia veio buscar as linhas mais fortes que eu tinha, as das redes de arrasto. Disse que era para uma costura grande. Não quis contar qual.” — Marisa, rendeira',
  // áreas secretas
  'Gruta dos Recados': '“Aqui embaixo a gente escondia os recados que o mar não podia ler. Se alguém achar este: a Aurélia não é bruxa, é só uma avó com medo. Cuidem dela.” — As crianças da vila',
  'Mirante do Farol': '“Daqui de cima dá para ver as três ilhotas e, num dia limpo, uma tempestade que nunca sai do lugar. Eu sei o que tem lá dentro. Um dia alguém vai ter que ir.” — Tomé',
  'Casa da Costureira': '“Ilma, minha neta, hoje você riu tanto que o vestido rasgou no peito. Remendei com um retalho azul. Prometo que, aconteça o que acontecer, esse pedaço de você não vai se perder.” — Aurélia',
};

// Contextual tutorials (each shows once)
const DICAS_1 = {
  andar: 'W A S D (ou setas) para andar · mova o mouse para olhar em volta',
  correr: 'Segure Shift para correr',
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

const OBJETIVOS_1 = {
  inicio: 'Explore a vila e encontre Fragmentos de Luz',
  ancoras: (n, total) => `Reacenda as Âncoras de Maré nas ilhotas (${n}/${total})`,
  coracao: 'Restaure o Coração da Ilha, no alto do morro',
  bilhete: 'Leia a carta deixada no Coração da Ilha',
  fim: 'O farol aponta para o Recife das Vozes',
};

// lembranças guardadas nos fragmentos lilases: curtas e incompletas
const MEMORIAS_1 = [
  'Crianças correndo na praça, uma pipa de retalhos presa no telhado da Casa das Redes.',
  'Um homem de capa amarela sobe as escadas do farol, resmungando com a lanterna apagada.',
  '“Se a ilha subir, vocês vão comigo. Ninguém fica para a Maré Negra.” Uma voz firme, uma agulha brilhando.',
  'O céu escurece de baixo para cima. O mar inteiro levanta como um lençol, e a ilha sobe junto com ele.',
  'Uma menina de vestido remendado chama na névoa. Ninguém responde. Só o vento.',
];

// os 5 moradores da vila (casas.js monta uma casa para cada um, na ordem)
const CASAS_1 = ['Casa dos Barcos', 'Casa da Parteira', 'Casa do Relojoeiro', 'Casa das Redes', 'Casa da Costureira'];

// o que aparece no aviso "E — …" de cada objetivo
const INTERACOES_1 = {
  ancora: 'Reacender a Âncora de Maré',
  coracao: 'Restaurar o Coração da Ilha',
  bilhete: 'Ler a carta de Aurélia',
  examinar: 'Examinar o Coração da Ilha',
};

// tela de fim de capítulo
// frase sob a história na tela inicial
const CHAMADA_1 = 'Ajude Brisa a reacender as Âncoras de Maré e o Coração da Ilha antes que a vila caia no mar.';

const FIM_1 = {
  sub: 'O Coração da Ilha voltou a bater e o farol acendeu sozinho. Quem chamou na névoa?',
  continua: 'Continua no Recife das Vozes…',
};

const NOMES_1 = {
  fragmento: 'Fragmento de Luz',
  memoria: 'Fragmento de Lembrança',
  ancora: 'Âncora de Maré',
  coracao: 'Coração da Ilha',
  inimigo: 'Retalho',
  cristal: 'Cristal de Névoa',
};

const AVISOS_1 = {
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
  vazio: 'Brisa caiu das falésias no mar.',
  praia: 'Brisa despencou das ilhas e caiu na praia lá embaixo. Cuidado com as bordas!',
  golpe: 'Os Retalhos assustados foram demais desta vez. Defenda-se (Q) e acalme-os com calma.',
};

// ---------------- Capítulos 2 a 4 (o que muda em relação ao Capítulo 1) ----------------
const TEXTOS = {
  2: {
    CAPITULO: 'Capítulo 2 — O Recife das Vozes',
    INTRO: [
      'A corrente de vento nova levou Brisa até a tempestade parada no horizonte.',
      'Lá dentro, um recife de corais flutua no ar, cheio de barcos que a Maré Negra arrancou do mar há quarenta anos. Os sinos das boias tocam sozinhos.',
      'Em algum lugar entre os cascos, o velho faroleiro Tomé ainda espera.',
    ],
    FALAS: {
      despertar: [
        ['Brisa', 'Aqui chove de lado… e os barcos estão presos nas pedras, no meio do céu.'],
        ['Brisa', 'Esses sinos… cada um toca com uma voz diferente. Parece gente chamando.'],
        ['Brisa', 'O recife está afundando na névoa. Preciso achar o Tomé antes que ela engula tudo.'],
      ],
      primeiroFragmento: [['Brisa', 'Mais Fragmentos de Luz! A luz da Maré Alta veio comigo até aqui.']],
      primeiroInimigo: [
        ['Brisa', 'Retalhos de capa de chuva… de pescador. Eles vieram junto com os barcos.'],
        ['Brisa', 'Calma. Eu sei que o mar levou vocês. Eu não vou levar.'],
      ],
      primeiraAncora: [['Brisa', 'Um Sino de Boia, preso pela névoa. Se ele tocar de novo, talvez a névoa escute.']],
      ancoraSemFragmentos: [['Brisa', 'O sino está pesado de névoa. Preciso de mais luz para ele tocar.']],
      ancoraComGuardas: [['Brisa', 'Os retalhos estão agarrados no sino como quem se segura num mastro. Primeiro, acalmá-los.']],
      ancoraRestaurada: [
        [['Brisa', 'Ele tocou! A névoa recuou um pouco… e uma das vozes parou de chorar.']],
        [['Brisa', 'Mais um sino! Mas a névoa está subindo pelos outros lados…']],
        [['Brisa', 'Os três sinos tocam juntos. Lá no alto, uma lanterna acendeu no casco maior: é o Tomé!']],
      ],
      coracaoFechado: [['Brisa', 'Tem alguém dentro desse casco, mas a escotilha está presa pela névoa. Os três sinos precisam tocar.']],
      restaurarCoracao: [['Brisa', 'Seu Tomé? Sou eu… a boneca da Aurélia. Abre, por favor.']],
      depoisCoracao: [
        ['Tomé', 'Uma boneca de retalhos, com o vestido da Ilma no peito… Então ela conseguiu.'],
        ['Tomé', 'Senta aí. O que eu tenho para contar é pesado. Está tudo no meu diário, em cima da mesa.'],
      ],
      depoisBilhete: [
        ['Tomé', 'Quando você reacendeu as âncoras, a névoa subiu para cá. Salvar uma ilha sempre custa alguma coisa.'],
        ['Brisa', 'Então fui eu que fiz o recife afundar?'],
        ['Tomé', 'Você fez a ilha viver. O resto é com a gente. Leva o carretel dela: o jardim da Aurélia ainda está lá embaixo, no fundo.'],
      ],
      primeiraCarta: [['Brisa', 'Um diário de bordo… os barcos também guardam lembranças.']],
    },
    BILHETE: '“Diário do farol, última página. Eu e a Aurélia costuramos a ilha nas nuvens para fugir da Maré Negra. Funcionou: ninguém se afogou. Mas a costura precisava de fio, e o fio que segura uma ilha no céu é feito de gente. Um por um, os moradores viraram névoa: a Névoa Funda. Eles não morreram. Estão presos entre o céu e o mar, sem saber voltar. A Aurélia não aceitou. Desceu ao fundo com o carretel para desfazer o nó e nunca mais voltou. Eu fiquei aqui, tocando os sinos para os barcos perdidos. Se alguém ler isto, desça ao jardim dela. — Tomé”',
    CASAS: ['Barco Estrela-do-Mar', 'Barco Três Irmãos', 'Barco Andorinha', 'Barco da Marisa'],
    CARTAS: {
      'Barco Estrela-do-Mar': '“Diário de bordo. A rede veio vazia de novo e a água estava quente como sopa. O Bento jura que viu o fundo do mar se mexer. Voltamos cedo.” — Mestre Juca',
      'Barco Três Irmãos': '“Somos três irmãos e um barco só. Se a Maré Negra vier, ninguém sai do barco sem os outros dois. Combinado escrito, para ninguém esquecer.” — Davi, Caio e Rui',
      'Barco Andorinha': '“A Ilma, a neta da Aurélia, pediu para pintar uma andorinha no casco. Ficou torta. Ficou linda. Não deixo ninguém repintar.” — Seu Lauro',
      'Barco da Marisa': '“Guardei embaixo do banco as linhas que sobraram da costura grande. Se um dia precisarem desfazer, a ponta está marcada com um nó azul.” — Marisa, rendeira',
    },
    DICAS: {
      ancora: 'Aproxime-se do Sino de Boia e aperte E para ele tocar',
      coracao: 'Suba até o casco grande, no alto do recife, e aperte E',
      cristal: 'Cristais de névoa prendem os sinos: aproxime-se e aperte E para dissolvê-los',
      carta: 'Os cascos guardam diários de bordo: entre pelo rombo e aperte E para ler',
      vento: 'Correntes de vento levam até as boias: entre no redemoinho',
      memoria: 'Fragmentos lilases guardam lembranças dos pescadores: são opcionais',
    },
    OBJETIVOS: {
      inicio: 'Explore o recife e junte Fragmentos de Luz',
      ancoras: (n, total) => `Faça os Sinos de Boia tocarem (${n}/${total})`,
      coracao: 'Encontre Tomé no casco grande, no alto do recife',
      bilhete: 'Leia o diário de Tomé',
      fim: 'Desça ao Jardim Submerso com o carretel de Aurélia',
    },
    MEMORIAS: [
      'Pescadores cantando para chamar o vento, e o vento respondendo de verdade.',
      'Tomé, ainda moço, consertando a lanterna do farol, com a Aurélia segurando a escada.',
      'A noite da subida: os barcos arrancados do mar, girando no ar como folhas secas.',
      'Um sino de boia batendo sozinho, e uma voz de mulher: “Ninguém fica para trás.”',
      'Uma menina de vestido azul acenando de um barco. Depois, só névoa.',
    ],
    NOMES: { ancora: 'Sino de Boia', coracao: 'Casco de Tomé' },
    INTERACOES: { ancora: 'Tocar o Sino de Boia', coracao: 'Chamar Tomé no casco', bilhete: 'Ler o diário de Tomé', examinar: 'Bater no casco' },
    AVISOS: {
      tremor: 'O recife está afundando na névoa!',
      ancoraRestaurada: 'O sino tocou! A névoa recuou.',
      capituloCompleto: 'Capítulo 2 concluído!',
      caiuNoVazio: 'Brisa caiu do recife… o vento a trouxe de volta!',
    },
    CHAMADA: 'Faça os sinos do recife tocarem e encontre Tomé antes que a névoa engula tudo.',
    FIM: { sub: 'Os sinos tocaram, e Tomé contou a verdade sobre a Névoa Funda.', continua: 'Continua no Jardim Submerso…' },
  },
  3: {
    CAPITULO: 'Capítulo 3 — O Jardim Submerso',
    INTRO: [
      'Agarrada ao carretel de Aurélia, Brisa desceu pelo fio até debaixo das ilhas.',
      'Ali fica o antigo fundo do mar, seco desde que o mar subiu ao céu: algas que viraram pedra, a vila velha de antes da subida e, no ponto mais alto, o jardim da costureira.',
      'A voz de menina está mais perto agora. E o retalho do peito de Brisa não para de esquentar.',
    ],
    FALAS: {
      despertar: [
        ['Brisa', 'O chão é de areia e conchas… isto aqui já foi o fundo do mar.'],
        ['Brisa', 'Essas casas são mais velhas que as da Maré Alta. É a vila de antes da subida.'],
        ['Voz na névoa', 'Vó? Você voltou?'],
        ['Brisa', 'Ela está aqui embaixo. Preciso achar o jardim.'],
      ],
      primeiroFragmento: [['Brisa', 'Tem luz aqui embaixo também… o fio da Aurélia deixou um rastro.']],
      primeiroInimigo: [
        ['Brisa', 'Retalhos de avental e de chita… roupa de casa.'],
        ['Brisa', 'Vocês estão guardando alguma coisa, não estão? Eu só quero entender.'],
      ],
      primeiraAncora: [['Brisa', 'Uma Flor de Pedra. A Aurélia plantou estas flores com fio de maré… e a névoa fechou todas.']],
      ancoraSemFragmentos: [['Brisa', 'A flor não abre com tão pouca luz. Preciso de mais fragmentos.']],
      ancoraComGuardas: [['Brisa', 'Os retalhos estão enrolados nas raízes da flor. Primeiro, acalmá-los.']],
      ancoraRestaurada: [
        [['Brisa', 'Ela abriu! E dentro dela tem uma lembrança… uma menina rindo num jardim.']],
        [['Brisa', 'Outra flor. A menina de novo… ela está com o meu vestido. Não. Sou eu que estou com o dela.']],
        [['Brisa', 'As três flores abertas. O caminho para o jardim, lá no alto, está livre.']],
      ],
      coracaoFechado: [['Brisa', 'O jardim está coberto de névoa fechada. As três Flores de Pedra precisam abrir primeiro.']],
      restaurarCoracao: [['Brisa', 'Aurélia? Eu sei que você está aqui. Eu trouxe o seu carretel.']],
      depoisCoracao: [
        ['Ilma', 'Você tem o meu vestido. Você tem a minha risada. Você… é um pouco eu?'],
        ['Brisa', 'Ilma! É por isso que a voz me chama. Eu guardo as suas lembranças.'],
        ['Brisa', 'Tem um bilhete preso no banco do jardim. A letra é a da Aurélia.'],
      ],
      depoisBilhete: [
        ['Brisa', 'A Aurélia não sumiu como os outros. Ela é o coração da Névoa Funda… está segurando todo mundo.'],
        ['Ilma', 'A vó tem medo de que a gente se perca. Por isso ninguém consegue descansar.'],
        ['Brisa', 'Se eu desfizer a costura, eu perco as suas lembranças… e talvez deixe de ser eu. Mas vocês vão poder voltar. Eu vou subir até o olho da tempestade.'],
      ],
      primeiraCarta: [['Brisa', 'Cartas de antes da subida… a vila inteira escrevia para alguém.']],
    },
    BILHETE: '“Minha Ilma, se esta boneca chegou até o jardim, foi você que a trouxe. Eu desci para desfazer o nó da costura e não consegui: quando puxei o fio, senti todos eles escorregando para o mar, e segurei. Segurei com tanta força que eu mesma virei o nó. Agora sou eu que prendo a Névoa Funda, e não sei soltar. Quem desfizer a costura vai perder o que guarda de nós. Me perdoe por pedir isso. Venha me encontrar no olho da tempestade. — Vó Aurélia”',
    CASAS: ['Casa do Moleiro', 'Casa da Professora', 'Casa do Sineiro', 'Casa da Avó Aurélia'],
    CARTAS: {
      'Casa do Moleiro': '“O moinho parou de girar: agora o vento vem de baixo, do mar. Minha mulher diz que é aviso. Eu digo que é hora de consertar o telhado.” — Anselmo',
      'Casa da Professora': '“Hoje ensinei as crianças a contar as ondas. A Ilma contou até cem e disse que o mar estava respirando devagar, como quem dorme. Fiquei com medo e não sei por quê.” — Dona Laura',
      'Casa do Sineiro': '“Toquei o sino da vila três vezes esta noite e ninguém acordou com o barulho. Acordaram com o silêncio, quando o mar recuou de uma vez.” — Bartolomeu',
      'Casa da Avó Aurélia': '“Plantei no alto do morro um canteiro para cada morador. Se um dia a gente tiver que ir embora, o jardim fica lembrando de nós.” — Aurélia',
    },
    DICAS: {
      ancora: 'Aproxime-se da Flor de Pedra e aperte E para abri-la',
      coracao: 'Suba até o jardim de Aurélia, no ponto mais alto, e aperte E',
      cristal: 'Cristais de névoa fecham as flores: aproxime-se e aperte E para dissolvê-los',
      carta: 'As casas velhas guardam cartas: entre e aperte E para ler',
      vento: 'Correntes de vento levam até as ilhotas do jardim: entre no redemoinho',
      memoria: 'Fragmentos lilases guardam lembranças de Ilma: são opcionais',
    },
    OBJETIVOS: {
      inicio: 'Explore o fundo do mar e junte Fragmentos de Luz',
      ancoras: (n, total) => `Abra as Flores de Pedra (${n}/${total})`,
      coracao: 'Chegue ao jardim de Aurélia, no ponto mais alto',
      bilhete: 'Leia o bilhete deixado no banco do jardim',
      fim: 'Suba até o olho da tempestade',
    },
    MEMORIAS: [
      'Uma menina plantando sementes de pano, uma por canteiro, dizendo o nome de cada vizinho.',
      'Aurélia costurando à luz de vela, a agulha tremendo na mão.',
      'O mar recuando de uma vez, peixes pulando na areia e a vila inteira olhando em silêncio.',
      'Ilma escondida embaixo da mesa de costura, ouvindo a avó chorar baixinho.',
      '“Se eu soltar, eles vão embora. Se eu segurar, eles nunca descansam.” A mesma voz, cansada.',
    ],
    NOMES: { ancora: 'Flor de Pedra', coracao: 'Jardim de Aurélia' },
    INTERACOES: { ancora: 'Abrir a Flor de Pedra', coracao: 'Chamar Aurélia no jardim', bilhete: 'Ler o bilhete de Aurélia', examinar: 'Examinar o jardim' },
    AVISOS: {
      tremor: 'A névoa está descendo sobre o jardim!',
      ancoraRestaurada: 'A Flor de Pedra abriu! Uma lembrança se soltou.',
      capituloCompleto: 'Capítulo 3 concluído!',
      caiuNoVazio: 'Brisa caiu da borda… o vento a trouxe de volta!',
    },
    CHAMADA: 'Abra as Flores de Pedra e chegue ao jardim de Aurélia, no ponto mais alto do fundo do mar.',
    FIM: { sub: 'Ilma falou com Brisa, e o bilhete de Aurélia revelou quem segura a Névoa Funda.', continua: 'Continua no olho da tempestade…' },
  },
  4: {
    CAPITULO: 'Capítulo 4 — A Costura Final',
    INTRO: [
      'A névoa subiu em espiral e levou Brisa junto, até acima das nuvens.',
      'No olho da tempestade, a costura de Aurélia é do tamanho de um mundo: retalhos gigantes, carretéis como torres e pontos de linha grossos como pontes.',
      'No alto, uma silhueta de névoa segura agulha e linha. Não há como vencê-la à força: só desfazendo os nós, um a um.',
    ],
    FALAS: {
      despertar: [
        ['Brisa', 'O chão é uma colcha… cada retalho é de uma roupa da vila.'],
        ['Brisa', 'Três nós grandes estão segurando tudo. É neles que as vozes estão presas.'],
        ['Ilma', 'Eu vou com você até o fim. Escuta cada um antes de soltar, tá?'],
      ],
      primeiroFragmento: [['Brisa', 'Os últimos Fragmentos de Luz. Os Fios de Maré começaram aqui.']],
      primeiroInimigo: [
        ['Brisa', 'Retalhos de todos os moradores juntos… eles têm medo de soltar, igual a ela.'],
        ['Brisa', 'Eu sei. Soltar dá medo. Eu também estou com medo.'],
      ],
      primeiraAncora: [['Brisa', 'Um Nó da Costura. Dá para ouvir alguém lá dentro… é o Bento, o pescador.']],
      ancoraSemFragmentos: [['Brisa', 'Esse nó está apertado demais. Preciso de mais luz para afrouxar.']],
      ancoraComGuardas: [['Brisa', 'Os retalhos estão agarrados ao nó. Primeiro, acalmá-los.']],
      ancoraRestaurada: [
        [['Bento', 'Obrigado, menina. O mar está me chamando de volta… e eu quero ir.']],
        [['Dona Celeste', 'Eu trouxe tanta gente ao mundo. Agora me deixa ir embora devagar, como quem dorme.']],
        [['Brisa', 'Os três nós se desfizeram. Só falta o nó do meio: a própria Aurélia.']],
      ],
      coracaoFechado: [['Aurélia', 'Não! Se você soltar os nós, eles se perdem no mar. Eu não vou deixar ninguém se perder.']],
      restaurarCoracao: [['Brisa', 'Aurélia, eles não estão se perdendo. Estão indo para casa. Pode soltar.']],
      depoisCoracao: [
        ['Aurélia', 'Ilma? Você está aí, dentro dessa boneca?'],
        ['Ilma', 'Estou, vó. Pode soltar a minha mão.'],
        ['Brisa', 'A linha está afrouxando… ela deixou um último bilhete, preso na agulha.'],
      ],
      depoisBilhete: [
        ['Brisa', 'Os moradores viraram vento… estão voltando para o mar, como brisa.'],
        ['Tomé', '(lá embaixo, no farol) Boa viagem, todo mundo.'],
        ['Brisa', 'Eu esqueci quase tudo… mas tenho um fio de cada um na barra do vestido. Continuo sendo eu. Agora sou só Brisa.'],
      ],
      primeiraCarta: [],
    },
    BILHETE: '“Minha boneca, minha Ilma, meus vizinhos: eu segurei vocês por amor e por medo, e confundi os dois. Agora eu solto. As ilhas vão descer devagar até o mar, ao amanhecer, e cada um de vocês vai virar o vento que enche as velas dos barcos. Brisa, você vai esquecer o que guardou de nós, mas não vai deixar de existir. Você foi costurada para lembrar. Agora pode viver. — Aurélia”',
    CASAS: [],
    CARTAS: {},
    DICAS: {
      ancora: 'Aproxime-se do Nó da Costura e aperte E para desfazê-lo',
      coracao: 'Vá até a silhueta de Aurélia, no alto da costura, e aperte E',
      cristal: 'Cristais de névoa apertam os nós: aproxime-se e aperte E para dissolvê-los',
      vento: 'Correntes de vento levam até os nós: entre no redemoinho',
      memoria: 'Fragmentos lilases guardam as últimas lembranças da vila: são opcionais',
    },
    OBJETIVOS: {
      inicio: 'Explore a costura e junte Fragmentos de Luz',
      ancoras: (n, total) => `Desfaça os Nós da Costura (${n}/${total})`,
      coracao: 'Encontre Aurélia no alto da costura',
      bilhete: 'Leia o último bilhete de Aurélia',
      fim: 'Fim. Obrigada por jogar Threadbound',
    },
    MEMORIAS: [
      'Todos os moradores na praça, no dia antes da subida, rindo de uma pipa presa no telhado.',
      'Tomé e Aurélia discutindo no farol: “A costura vai cobrar.” “Então eu pago.”',
      'A primeira vez que Brisa abriu os olhos, e o primeiro tremor da ilha.',
      'Ilma pondo o próprio vestido rasgado na mesa da avó: “Usa esse, vó. Para eu ficar junto.”',
      'O amanhecer visto de cima das nuvens, quando ninguém mais estava com medo.',
    ],
    NOMES: { ancora: 'Nó da Costura', coracao: 'Aurélia' },
    INTERACOES: { ancora: 'Desfazer o Nó da Costura', coracao: 'Falar com Aurélia', bilhete: 'Ler o último bilhete', examinar: 'Falar com Aurélia' },
    AVISOS: {
      tremor: 'A tempestade aperta a costura!',
      ancoraRestaurada: 'O nó se desfez! Uma voz foi para casa.',
      capituloCompleto: 'Fim da história!',
      caiuNoVazio: 'Brisa caiu da costura… o vento a trouxe de volta!',
    },
    CHAMADA: 'Desfaça os nós da costura e ajude Aurélia a soltar os moradores.',
    FIM: { sub: 'Aurélia soltou a costura, e os moradores voltaram ao mar como brisa.', continua: 'Fim. As ilhas descem devagar até o mar, ao amanhecer.' },
  },
};

const T = TEXTOS[CAPITULO_ATUAL] ?? {};
export const CAPITULO = T.CAPITULO ?? CAPITULO_1;
export const INTRO = T.INTRO ?? INTRO_1;
export const FALAS = { ...FALAS_1, ...T.FALAS };
export const BILHETE = T.BILHETE ?? BILHETE_1;
export const CASAS = T.CASAS ?? CASAS_1;
export const CARTAS = T.CARTAS ?? CARTAS_1;
export const DICAS = { ...DICAS_1, ...T.DICAS };
// na tela de toque as dicas falam dos botões, não do teclado (as que não estão aqui são adaptadas:
// "aperte E" vira "toque em E", Espaço vira ▲)
export const DICAS_TOQUE = {
  andar: 'Arraste no lado esquerdo da tela para andar · arraste no direito para olhar em volta',
  correr: 'Arraste o bastão além da borda para correr',
  pular: '▲ pula · no ar, ▲ de novo dá um impulso · segure ▲ para planar',
  planar: 'Caindo? Segure ▲ para planar devagar até o chão',
};
export const paraToque = texto => texto.replace(/[Aa]perte E/g, m => (m[0] === 'A' ? 'Toque em E' : 'toque em E')).replace(/Espaço/g, '▲');
export const OBJETIVOS = { ...OBJETIVOS_1, ...T.OBJETIVOS };
export const MEMORIAS = T.MEMORIAS ?? MEMORIAS_1;
export const NOMES = { ...NOMES_1, ...T.NOMES };
export const INTERACOES = { ...INTERACOES_1, ...T.INTERACOES };
export const AVISOS = { ...AVISOS_1, ...T.AVISOS };
export const FIM = T.FIM ?? FIM_1;
export const CHAMADA = T.CHAMADA ?? CHAMADA_1;
// nome curto de cada capítulo (menu de capítulos e tela de fim)
export const NOMES_CAPITULOS = { 1: CAPITULO_1, 2: TEXTOS[2].CAPITULO, 3: TEXTOS[3].CAPITULO, 4: TEXTOS[4].CAPITULO };
export const DESCRICOES_CAPITULOS = {
  1: 'A ilha que foi costurada no céu. Reacenda as Âncoras de Maré e o Coração da Ilha.',
  2: 'Um recife de destroços sob uma tempestade parada. Faça os sinos tocarem e encontre Tomé.',
  3: 'O fundo do mar antigo, debaixo das ilhas. Abra as Flores de Pedra e chegue ao jardim.',
  4: 'O olho da tempestade, acima das nuvens. Desfaça os nós da costura.',
};
