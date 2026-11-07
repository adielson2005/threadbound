// Catálogo dos itens da Mochila e do Armarinho (design/ux/mochila-loja-popups.md §4, §5, §7).
// Só dados (sem DOM e sem estado): o inventário (inventario.js) guarda o que a Brisa já achou e a UI lê
// os textos daqui. Os textos estão em PT-BR, cada item com um id estável (a chave para tradução futura).
//
// Tipos: 'historia' (LER), 'quebra' (USAR perto do alvo; as mecânicas entram na etapa j), 'arma' (só
// registro e detalhe: as armas continuam no chão, pegas com F), 'melhoria', 'loja', 'contador'.
// cap = capítulo de origem; itens de capítulos ainda não visitados ficam ocultos (não spoilar).

// ---------- armas: números de jogo (combate.js lê daqui; antes eram constantes de lá) ----------
export const ARMAS_BASE = {
  galho: { nome: 'Galho', dano: 2, alcance: 2.1, usos: 8 },
  agulha: { nome: 'Agulha de Prata', dano: 3, alcance: 2.4, usos: 16 },
  // metade da tesoura gigante da oficina de Aurélia: arma branca de verdade, com combo de 3 cortes
  tesoura: { nome: 'Lâmina da Tesoura', dano: 2, alcance: 2.3, usos: 45, corte: true },
};

// ---------- itens de história e de quebra-cabeça (§7.4) ----------
// colecao: o item é um conjunto (cartas, lembranças) e conta quantas partes foram achadas
export const ITENS = {
  // Cap. 1 — Vila de Maré Alta
  'cartas-moradores': { tipo: 'historia', cap: 1, icone: 'it-carta', colecao: 'cartas', nome: 'Cartas dos Moradores',
    desc: 'Cartas guardadas nas casas da vila.', serve: 'Ler. Contam a vida na vila e dão Fuxicos.', onde: 'Espalhadas pela vila.' },
  'lembrancas-ilma': { tipo: 'historia', cap: 1, icone: 'it-lembranca', colecao: 'lembrancas', nome: 'Lembranças de Ilma',
    desc: 'Textos curtos guardados nos fragmentos lilases.', serve: 'Ler. Compõem a memória final no Cap. 4.', onde: 'Fragmentos lilases espalhados pelas ilhas.' },
  'garrafa-tome': { tipo: 'historia', cap: 1, icone: 'it-garrafa', nome: 'Garrafa com Bilhete de Tomé',
    desc: 'Uma garrafa trazida pela maré.', serve: 'Indica o Recife e Tomé.', onde: 'Na praia, perto do primeiro cais.' },
  'renda-celeste': { tipo: 'historia', cap: 1, icone: 'it-renda', nome: 'Renda de Dona Celeste',
    desc: 'Uma renda de bilro inacabada.', serve: 'Pista: o bilro que falta está no Cap. 4.', onde: 'Na casa de Dona Celeste.' },
  // Cap. 2 — Recife das Vozes
  'badalo-boia': { tipo: 'quebra', cap: 2, icone: 'it-badalo', nome: 'Badalo de Boia',
    desc: 'Um pedaço de metal que ressoa.', serve: 'Tocar os sinos de boia na ordem do recife.', onde: 'Nos corais.' },
  'carretel-aurelia': { tipo: 'quebra', cap: 2, icone: 'it-carretel', historia: true, nome: 'Carretel de Aurélia',
    desc: 'O carretel de linha da avó; guarda a voz de Aurélia.', serve: 'Dá o Fio Esticado, que liga âncoras às Flores de Pedra (Cap. 3).', onde: 'Tomé o entrega depois do desafio dos sinos.' },
  'lanterna-tome': { tipo: 'historia', cap: 2, icone: 'it-lanterna', nome: 'Lanterna de Tomé',
    desc: 'A luz fraca do farol.', serve: 'Mostra a rota para as ilhas seguintes.', onde: 'No farol.' },
  // Cap. 3 — Jardim Submerso
  'ponteiro-horas': { tipo: 'quebra', cap: 3, icone: 'it-ponteiro-horas', nome: 'Ponteiro das Horas',
    desc: 'Um ponteiro curto e dourado.', serve: 'Alinhar as horas no Porão do Relógio.', onde: 'No porão ou no jardim.' },
  'ponteiro-minutos': { tipo: 'quebra', cap: 3, icone: 'it-ponteiro-minutos', nome: 'Ponteiro dos Minutos',
    desc: 'Um ponteiro longo e fino.', serve: 'Alinhar as horas no Porão do Relógio.', onde: 'No jardim.' },
  'fita-ilma': { tipo: 'historia', cap: 3, icone: 'it-fita', nome: 'Fita de Ilma',
    desc: 'A fitinha do Bonfim de Ilma, com três nós.', serve: 'Abre uma lembrança e liga Ilma ao Cap. 4.', onde: 'Dentro do Porão aberto.' },
  // Cap. 4 — Costura Final
  'bilro-aurelia': { tipo: 'quebra', cap: 4, icone: 'it-bilro', nome: 'Bilro de Aurélia',
    desc: 'Uma peça de madeira de fazer renda.', serve: 'Amarrar os nós soltos da costura.', onde: 'No caminho da ilha.' },
  'ponta-fio': { tipo: 'historia', cap: 4, icone: 'it-ponta-fio', nome: 'Ponta do Fio',
    desc: 'O fim do fio do Novelo.', serve: 'Final: costurar a vila de volta.', onde: 'Recompensa do chefe Novelo.' },
  // armas (só registro: aparecem quando ela pega uma pela primeira vez)
  galho: { tipo: 'arma', cap: 1, icone: 'it-galho', arma: 'galho', nome: ARMAS_BASE.galho.nome,
    desc: 'Um galho firme achado no chão.', serve: 'Bater nos Retalhos. Quebra depois de alguns golpes.', onde: 'No chão da ilha.' },
  agulha: { tipo: 'arma', cap: 1, icone: 'it-agulha', arma: 'agulha', nome: ARMAS_BASE.agulha.nome,
    desc: 'Uma agulha grande de prata, com linha.', serve: 'Golpes mais fortes e mais longos.', onde: 'No chão da ilha.' },
  tesoura: { tipo: 'arma', cap: 1, icone: 'it-tesoura', arma: 'tesoura', nome: ARMAS_BASE.tesoura.nome,
    desc: 'Metade da tesoura gigante da oficina de Aurélia.', serve: 'Combo de três cortes.', onde: 'Na oficina.' },
};

// contadores fora da grade (no topo da Mochila e no HUD)
export const CONTADORES = {
  fragmentos: { nome: 'Fragmentos de Luz', icone: 'it-fragmento', desc: 'Luz que paga as âncoras. Nunca sai da mochila.' },
  nos: { nome: 'Nós da Costura', icone: 'it-no', cap: 4, desc: 'Nós a desfazer.' },
};

// ---------- moeda (§7.1, §7.2) ----------
export const MOEDA = { id: 'fuxico', nome: 'Fuxico', plural: 'Fuxicos', icone: 'it-fuxico', iconeUi: 'i-fuxico' };
// ganhos (aplicados no jogo na etapa h)
export const GANHOS = {
  fuxicoSolto: 1, retalho: 1, retalhoForte: 5, ancora: 5, carta: 3, segredo: 15,
  chefe: { 1: 40, 4: 60 }, // Ravi (Cap. 1) e Novelo (Cap. 4), só na primeira vez
};

// ---------- melhorias (§7.3): preço de cada nível e o que cada nível soma ----------
export const NIVEL_MAX = 3;
export const MELHORIAS = {
  folego: { nome: 'Fôlego Fundo', icone: 'it-up-folego', precos: [30, 60, 110], desc: '+1 fôlego máximo por nível.' },
  explosao: { nome: 'Explosão de Fios', icone: 'it-up-explosao', precos: [40, 80, 140], desc: '+15% de carga do poder por golpe, defesa e esquiva, e +10% de alcance da onda por nível.' },
  agulha: { nome: 'Agulha Afiada', icone: 'it-up-agulha', arma: 'agulha', precos: [35, 70, 120], desc: '+4 usos e +0,1 m de alcance da Agulha por nível. O dano fica 3.' },
  tesoura: { nome: 'Tesoura Amolada', icone: 'it-up-tesoura', arma: 'tesoura', precos: [35, 70, 120], desc: '+8 usos e +0,1 m de alcance da Lâmina por nível. O dano fica 2.' },
  ima: { nome: 'Ímã de Retalho', icone: 'it-up-ima', precos: [20, 40, 80], desc: '+25% do raio de coleta de Fuxicos e itens por nível.' },
};
// efeito por nível (somado ou multiplicado pelo número base do jogo)
export const EFEITO_MELHORIA = {
  folegoPorNivel: 1,          // fôlegos a mais
  cargaPoderPorNivel: 0.15,   // multiplica GANHO_PODER
  raioPoderPorNivel: 0.10,    // multiplica PODER.raio
  usosPorNivel: { agulha: 4, tesoura: 8 },
  alcancePorNivel: 0.1,       // metros (agulha e tesoura)
  imaPorNivel: 0.25,          // multiplica o raio de coleta
};

// ---------- Armarinho de Dona Celeste (§5.1) ----------
// limite: 'qtd' (até N guardados), 'porIlha' (1 por capítulo), 'unico' (compra uma vez)
export const LOJA = {
  remendo: { nome: 'Remendo de Chita', icone: 'it-remendo', categoria: 'consumiveis', preco: 15, limite: 'qtd', max: 5,
    desc: 'Recupera 30% do fôlego (arredonda para cima, no mínimo 1).' },
  fitinha: { nome: 'Fitinha do Bonfim', icone: 'it-fitinha', categoria: 'ajudas', preco: 60, limite: 'porIlha',
    desc: 'Uma segunda chance por ilha: ao zerar o fôlego, volta com 25% (no mínimo 1).' },
  mapa: { nome: 'Mapa de Bordado', icone: 'it-mapa-bordado', categoria: 'ajudas', preco: 40, limite: 'porIlha',
    desc: 'Marca no mapa das ilhas as regiões dos segredos que faltam.' },
  lacinho: { nome: 'Lacinho de Chita', icone: 'it-lacinho', categoria: 'roupas', preco: 50, limite: 'unico',
    desc: 'Um laço de chita para a Brisa. Só enfeite.' },
  vestido: { nome: 'Vestido de Chita Florida', icone: 'it-vestido', categoria: 'roupas', preco: 120, limite: 'unico',
    desc: 'Um vestido de chita florida para a Brisa. Só enfeite.' },
};
export const EFEITO_LOJA = { remendo: 0.30, fitinha: 0.25 };
// compra a partir deste preço pede confirmação (abaixo: compra direta com "Desfazer" por 5 s)
export const PRECO_CONFIRMAR = 100;
