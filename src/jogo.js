import * as THREE from 'three';
import { texturaDeCanvas } from './canvasTextura.js';
import { aplicarEstilo, atualizarNevoaSol } from './estilo.js';
aplicarEstilo(); // estilo de jogo mobile em todos os materiais (antes de qualquer um compilar)
import { criarBoneca, aplicarQualidadeBoneca } from './boneca.js';
import { aplicarCambalhota, aplicarPose } from './cambalhota.js';
import { carregarMapa, aplicarQualidadeMapa, atualizarLodPorVisao, aquecerMapa, CAMADA_SOMBRA } from './mapa.js';
import { gerarIlha } from './ilha.js';
import { criarChuva } from './chuva.js';
import { criarOclusao } from './oclusao.js';
import { criarParticulas } from './particulas.js';
import { lerProgresso, salvarProgresso, apagarProgresso, lerConfig, salvarConfig, lerConcluidos, ultimoCapitulo } from './salvar.js';
import { CAPITULO_ATUAL, TOTAL_CAPITULOS, CONFIG, urlCapitulo } from './capitulo.js';
import { analisarTerreno, calcularLancamento } from './terreno.js';
import { moverComColisao, RAIO, ALTURA } from './fisica.js';
import { incorporarSolidos } from './colisao.js';
import { assentarPes } from './pes.js';
import { criarEfeitosAltos } from './altos.js';
import { criarSuavizacao } from './suavizar.js';
import { criarMundo } from './mundo.js';
import { criarAgua } from './agua.js';
import { criarNevoa } from './nevoa.js';
import { criarPraia } from './praia.js';
import { criarCeu } from './ceu.js';
import { carregarCachoeira, posicionarCachoeiras } from './cachoeira.js';
import { criarInimigos } from './inimigos.js';
import { criarCampanha } from './campanha.js';
import { criarCombate, GOLPES } from './combate.js';
import { INTRO, AVISOS, GAMEOVER, CAPITULO, CHAMADA, FIM, NOMES_CAPITULOS, DESCRICOES_CAPITULOS } from './historia.js';
import { NIVEIS, nivelInicial, salvarNivel, detectarHardware, ajustarAoHardware } from './graficos.js';
import { DIA } from './dia.js';
import { criarDistancia } from './distancia.js';
import { fundirEstaticos } from './lotes.js';

// ---------- Configuração ----------
const FISICA = {
  gravidade: -32,
  // velocidades escolhidas junto com a cadência das animações de correr (ver velocidadeNatural)
  velocidade: 5.8,
  velocidadeDisparada: 8, // segurando Shift
  velocidadeDevagar: 1.5,   // segurando X: um passeio, na cadência natural da animação de andar
  aceleracao: 45,
  aceleracaoAr: 14,
  pulo: 12.5,
  puloDuplo: 11,            // segundo toque no pulo, no ar: cambalhota
  duracaoCambalhota: 0.6,
  coyote: 0.12,             // tempo para ainda pular depois de sair da borda
  bufferPulo: 0.12,         // tempo que um pulo apertado cedo "fica guardado"
  quedaMax: -40,
  // dano de queda pela altura (m) do ponto mais alto do salto até o pouso: cada degrau passado
  // tira uma fôlego. Abaixo de "quedaFatal" a queda nunca apaga a última; acima dela, pode.
  quedaDegraus: [5, 8, 11, 15, 20],
  quedaFatal: 20,
  // planar: no ar, segurando o pulo, Brisa abre os braços e o pano segura o ar
  quedaPlanando: 3.2,       // m/s de descida máxima planando
  velocidadePlanando: 6.8,
  // subir na borda: pulando contra uma parede cuja borda está até esta altura acima dos pés
  bordaMax: 2.2,
  tempoMorte: 3.2,          // segundos da animação de queda antes da tela de game over
};
const CAMERA = { distancia: 5, min: 2.2, max: 11, sensibilidade: 0.0025 };

// ---------- Qualidade gráfica ----------
// cada modo é ajustado ao que o PC aguenta (sem placa de vídeo, GPU integrada…): graficos.js
const hardware = detectarHardware();
let nomeNivel = nivelInicial();
let nivel = ajustarAoHardware(NIVEIS[nomeNivel]);
// Orçamento dentro do modo escolhido: quando o fps não se segura nem na menor resolução, desliga
// primeiro o que menos aparece (oclusão de ambiente, bloom, SMAA, grama e objetos ao longe) e
// por último deixa a imagem menor. Com folga, devolve passo a passo. O modo não muda.
const PASSOS_ORCAMENTO = [
  { piso: null, gtao: true, bloom: true, smaa: true, grama: 55, alcance: 1, longe: 1 },
  { piso: 0.8, gtao: false, bloom: true, smaa: true, grama: 45, alcance: 0.9, longe: 1 },
  { piso: 0.7, gtao: false, bloom: false, smaa: true, grama: 35, alcance: 0.75, longe: 0.9 },
  { piso: 0.6, gtao: false, bloom: false, smaa: false, grama: 25, alcance: 0.6, longe: 0.8 },
  { piso: 0.5, gtao: false, bloom: false, smaa: false, grama: 18, alcance: 0.5, longe: 0.65 },
];
const orcamento = { passo: 0, lento: 0, folga: 0, quedas: 0 };

// sem WebGL 2 não há como desenhar o jogo: explica o que fazer em vez de uma tela quebrada
if (hardware.semWebGL) {
  document.getElementById('msg').textContent = 'Este navegador não conseguiu abrir o WebGL 2, que o jogo precisa para desenhar. ' +
    'Atualize o navegador (Chrome, Edge ou Firefox) e confira se "Usar aceleração de hardware" está ligado nas configurações.';
  throw new Error('WebGL 2 indisponível');
}

// ---------- Cena ----------
// antisserrilhado só pode ser escolhido ao criar o contexto: vale o nível salvo ao abrir o jogo
const renderer = new THREE.WebGLRenderer({ antialias: nivel.antialias, powerPreference: 'high-performance' });
// conferir o log de cada shader força a compilação a terminar na hora (o quadro trava esperando);
// sem a conferência o driver compila em paralelo. ?debug liga de novo para achar erros de shader
renderer.debug.checkShaderErrors = new URLSearchParams(location.search).has('debug');
// GPU fraca às vezes reinicia o driver no meio do jogo: avisa e recarrega quando ela volta
renderer.domElement.addEventListener('webglcontextlost', ev => {
  ev.preventDefault();
  const a = document.getElementById('aviso');
  if (a) { a.textContent = 'A placa de vídeo reiniciou… recarregando o jogo'; a.style.opacity = 1; }
});
renderer.domElement.addEventListener('webglcontextrestored', () => location.reload());
const RESOLUCAO = { atual: THREE.MathUtils.clamp(Math.min(devicePixelRatio, nivel.resolucaoInicial ?? Infinity), ...nivel.resolucao) };
renderer.setPixelRatio(RESOLUCAO.atual);
renderer.setSize(innerWidth, innerHeight);
// tone mapping Neutral (Khronos) no Low e no Medium: até ~80% do branco as cores ficam como estão;
// acima disso o brilho é comprimido em vez de cortado. Sem ele, a grama e as folhas ao sol passavam
// do branco e estouravam (o High usa ACES, altos.js)
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.shadowMap.autoUpdate = false; // a sombra do mapa é calculada uma vez (o mapa não se mexe)
document.body.prepend(renderer.domElement);

const COR_CEU = new THREE.Color('#a9d8ff');
const cena = new THREE.Scene();
cena.background = COR_CEU;
cena.fog = new THREE.Fog(COR_CEU, ...nivel.neblina);

const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, nivel.distancia);
camera.position.set(0, 10, 10);

// céu: degradê com sol (Low/Medium), nuvens andando e reflexos de lente (ceu.js)
const ceuJogo = criarCeu({ cena, camera, corHorizonte: COR_CEU });
// clima: pancadas de chuva que vêm e vão (Y liga/desliga)
const chuva = criarChuva({ cena, camera });
// pólen de dia e vaga-lumes à noite, em todos os níveis (animados na GPU)
const particulas = criarParticulas({ cena, celular: hardware.perfil === 'celular' });
const _tamTela = new THREE.Vector2();
// o clima e o céu de cada capítulo (capitulo.js): a garoa sem fim do recife, o céu dourado do fundo
chuva.definirMinimo(CONFIG.ambiente.chuva);
ceuJogo.definirTom(CONFIG.ambiente.ceu);
{ // título da tela inicial: "Capítulo 2" no selo, o nome embaixo
  const [numero, nome] = CAPITULO.split(' — ');
  document.querySelector('#tela .selo').textContent = numero;
  document.querySelector('#tela .sub').textContent = nome;
  document.title = `Threadbound — ${nome}`;
}

// luz do céu: azul clarinho de cima e, de baixo, o tom quente da areia e da grama refletindo
const luzCeu = new THREE.HemisphereLight('#dcecff', '#b9a77e', 1.4);
cena.add(luzCeu);
let altos = null; // efeitos do nível High (criados depois de carregar o mapa)
let agua = null;  // mar abaixo das ilhas
let nevoa = null; // spray das cachoeiras e bruma do mar
let praia = null; // ilha de areia no mar, sob a ilha
let modeloCachoeira = null, cachoeiras = null;
// Sombra do mapa: calculada uma vez só, cobrindo o mapa inteiro, a partir da malha completa.
// O three.js filtra quem projeta sombra pelas camadas da câmera principal, então a camada
// dessa malha é ligada só no quadro do cálculo. A personagem usa sombra-mancha.
const sol = new THREE.DirectionalLight('#fff0d4', 3.1); // sol de fim de manhã, levemente dourado
sol.shadow.bias = -0.0005;
sol.shadow.normalBias = 0.05;
cena.add(sol, sol.target);
let assarSombra = false;

function configurarSombra() {
  const tam = nivel.sombra;
  sol.castShadow = tam > 0;
  if (!tam || !mapa) return;
  if (sol.shadow.mapSize.x !== tam) {
    sol.shadow.map?.dispose();
    sol.shadow.map = null;
    sol.shadow.mapSize.set(tam, tam);
  }
  const caixa = mapa.geo.boundingBox;
  const centro = caixa.getCenter(new THREE.Vector3()), raio = caixa.getSize(new THREE.Vector3()).length() / 2;
  sol.target.position.copy(centro);
  sol.position.copy(centro).add(new THREE.Vector3(0.55, 0.75, 0.4).normalize().multiplyScalar(raio * 1.5));
  // A sombra (calculada uma vez para o mapa todo) cobre só o que aparece: as ilhas, do nível do mar
  // até o alto das árvores, projetadas na direção da luz. Antes era uma esfera em volta da caixa do
  // mapa inteiro, com a base de rocha embaixo d'água: o mesmo mapa de sombra se espalhava por uma área
  // bem maior e a borda das sombras saía em degraus grandes no chão
  const vol = new THREE.Box3();
  if (mapa.mar?.ilhas) {
    for (const il of mapa.mar.ilhas) vol.expandByPoint(new THREE.Vector3(il.cx - il.R * 1.3, mapa.mar.nivel - 1, il.cz - il.R * 1.3)).expandByPoint(new THREE.Vector3(il.cx + il.R * 1.3, caixa.max.y + 18, il.cz + il.R * 1.3));
  } else vol.copy(caixa);
  const olho = new THREE.OrthographicCamera(); olho.position.copy(sol.position); olho.lookAt(centro); olho.updateMatrixWorld();
  const paraLuz = olho.matrixWorld.clone().invert(), lim = new THREE.Box3(), q = new THREE.Vector3();
  for (let k = 0; k < 8; k++) lim.expandByPoint(q.set(k & 1 ? vol.max.x : vol.min.x, k & 2 ? vol.max.y : vol.min.y, k & 4 ? vol.max.z : vol.min.z).applyMatrix4(paraLuz));
  // (a câmera olha para -z: a profundidade é -z)
  Object.assign(sol.shadow.camera, { left: lim.min.x, right: lim.max.x, top: lim.max.y, bottom: lim.min.y, near: Math.max(0.5, -lim.max.z - 2), far: -lim.min.z + 2 });
  sol.shadow.camera.updateProjectionMatrix();
  sol.updateMatrixWorld(); sol.target.updateMatrixWorld();
  assarSombra = true;
}

// sombra-mancha embaixo da personagem, deitada no chão
const manchaTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(0,0,0,0.55)'); gr.addColorStop(0.6, 'rgba(0,0,0,0.3)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return texturaDeCanvas(c);
})();
// (sem polygonOffset: o deslocamento de profundidade -4 fazia o disco ser desenhado por cima de
// degraus, pedras e pés de mesa perto dela, um círculo cortando o que ela passava por perto; agora
// ele fica só 4 cm acima do chão e o que está na frente o cobre normalmente)
const mancha = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1), new THREE.MeshBasicMaterial({ map: manchaTex, transparent: true, depthWrite: false }));
mancha.renderOrder = 1;
cena.add(mancha);
const rcMancha = new THREE.Raycaster(); rcMancha.firstHitOnly = true; rcMancha.layers.enableAll();
const baixo = new THREE.Vector3(0, -1, 0), frenteZ = new THREE.Vector3(0, 0, 1), origemMancha = new THREE.Vector3();
// chão logo abaixo do centro da personagem (usado para assentar o modelo e para a sombra-mancha)
let chaoAbaixo = null;
function medirChao() {
  rcMancha.set(origemMancha.set(jogador.pos.x, jogador.pos.y + 0.5, jogador.pos.z), baixo);
  rcMancha.far = 30;
  chaoAbaixo = (mapa && rcMancha.intersectObject(mapa.malha)[0]) || null;
}
function atualizarMancha() {
  const h = chaoAbaixo;
  mancha.visible = !!h;
  if (!h) return;
  mancha.position.copy(h.point).addScaledVector(h.face.normal, 0.04);
  mancha.quaternion.setFromUnitVectors(frenteZ, h.face.normal);
  const altura = jogador.pos.y - h.point.y;
  mancha.scale.setScalar(Math.max(0.35, 1 - altura * 0.08));
  mancha.material.opacity = Math.max(0.15, 1 - altura * 0.1);
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  redimensionarPos();
});

// ---------- HUD / telas ----------
const $ = id => document.getElementById(id);
const hudFps = $('fps');
const tela = $('tela'), msg = $('msg'), botao = $('botao'), barra = document.querySelector('#barra div');
const dica = $('dica'), escuro = $('escuro'), painel = $('graficos');

// ---------- Telas que abrem e fecham com animação ----------
// abrir: a tela aparece (display) e o CSS a anima entrando (opacidade e deslize; nada de desfoque,
// que pesa no celular). fechar: classe "saindo" esmaece em 0,16 s e só então a tela some. Reabrir
// no meio do esmaecer cancela o fechamento.
function sumir(el, esconder, ms = 160) {
  clearTimeout(el._sumir);
  if (getComputedStyle(el).display === 'none') { esconder(); return; }
  el.classList.add('saindo');
  el._sumir = setTimeout(() => { el.classList.remove('saindo'); esconder(); }, ms);
}
function mostrar(el, abrir) { clearTimeout(el._sumir); el.classList.remove('saindo'); abrir(); }

// ---------- Menu de gráficos ----------
let menuAberto = false;
function abrirMenu(abrir = !menuAberto) {
  menuAberto = abrir;
  if (abrir) mostrar(painel, () => { painel.style.display = 'flex'; });
  else sumir(painel, () => { painel.style.display = 'none'; });
  if (abrir) document.exitPointerLock?.();
  atualizarMenu();
}
function atualizarMenu() {
  for (const b of painel.querySelectorAll('[data-nivel]')) b.classList.toggle('ativo', b.dataset.nivel === nomeNivel);
  $('aviso-aa').style.display = renderer.getContextAttributes().antialias === nivel.antialias ? 'none' : 'block';
  $('perfil-pc').textContent = {
    semPlaca: 'Seu PC está desenhando sem placa de vídeo: os três modos foram ajustados para rodar leves.',
    fraco: 'Placa de vídeo integrada ou PC mais simples: os modos foram ajustados para não travar.',
    celular: 'Celular: os modos foram ajustados para mirar 60 fps (resolução, sombra e distância se ajustam sozinhas).',
    normal: 'Os três modos se ajustam sozinhos se o fps cair.',
  }[hardware.perfil];
}
for (const b of painel.querySelectorAll('[data-nivel]')) b.addEventListener('click', () => aplicarNivel(b.dataset.nivel));
$('fechar-graficos').addEventListener('click', () => abrirMenu(false));
$('abrir-graficos-menu').addEventListener('click', () => abrirMenu(true));

async function aplicarNivel(nome) {
  nomeNivel = nome; nivel = ajustarAoHardware(NIVEIS[nome]);
  orcamento.passo = 0; // modo novo: começa com tudo ligado e desce de novo se precisar
  salvarNivel(nome);
  cena.fog.near = nivel.neblina[0]; cena.fog.far = nivel.neblina[1];
  camera.far = nivel.distancia; camera.updateProjectionMatrix();
  distancia.definirAlcance(nivel.alcanceObjetos);
  RESOLUCAO.atual = THREE.MathUtils.clamp(RESOLUCAO.atual, ...nivel.resolucao);
  renderer.setPixelRatio(RESOLUCAO.atual);
  atualizarMenu();
  if (mapa) { await aplicarQualidadeMapa(mapa, nivel); aquecerMapa(mapa, renderer, cena, camera); }
  if (personagem) await aplicarQualidadeBoneca(personagem, renderer, nivel);
  aplicarEfeitos();
  configurarSombra();
}

// o céu físico do High ilumina por reflexo (IBL) só os materiais PBR; com material simples
// (PC sem placa de vídeo) a luz de céu comum precisa voltar a preencher as sombras
// (um pouco mais forte que no Low: o tone mapping do High escurece)
// (Low/Medium: 2,1 desde que a luz em faixas saiu (estilo.js), que clareava os meios-tons; antes 1,8
// com o sol a 3,0. Antes 1,55 com o sol a 3,1: na sombra das copas sobrava só um terço
// da luz do sol e a floresta ficava quase preta; agora a sombra fica em ~0,6 da luz cheia)
const luzCeuBase = () => (!nivel.efeitos ? 2.1 : nivel.materialSimples ? 2.2 : 0.65);
function aplicarEfeitos() {
  renderer.shadowMap.type = nivel.sombraBasica ? THREE.BasicShadowMap : nivel.sombraSuave ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
  // com o céu físico iluminando, a luz de céu simples fica mais fraca (senão tudo lava)
  // dia bem ensolarado: sol forte e céu claro preenchendo as sombras
  luzCeu.intensity = luzCeuBase();
  sol.intensity = nivel.efeitos ? 4.0 : 3.0;
  aplicarOrcamento(); // antes de ativar o High: sem placa de vídeo ele nem monta o pós-processamento
  altos?.ativar(!!nivel.efeitos);
  agua?.aplicarNivel(nivel);
  nevoa?.aplicarNivel(nivel);
  praia?.aplicarNivel(nivel);
  mundo?.aplicarNivel(nivel);
  chuva.aplicarNivel(nivel);
  ceuJogo?.aplicarNivel(nivel);
  if (cachoeiras) cachoeiras.aplicarMaterial(modeloCachoeira.materialPara(nomeNivel, nivel.materialSimples));
  if (!usaFXAA()) suavizacao.liberar();
  redimensionarPos();
}
// High: pós-processamento dos efeitos (MSAA + SMAA). Low: FXAA. Medium: MSAA do próprio contexto.
const suavizacao = criarSuavizacao(renderer, cena, camera);
const contextoComMSAA = renderer.getContextAttributes().antialias;
// o MSAA só pode ser escolhido ao criar o contexto: se o jogo abriu no Low e mudou para Medium,
// o FXAA cobre até recarregar a página
const usaFXAA = () => !altos?.ativo && (nivel.suavizacao === 'fxaa' || !contextoComMSAA);
function desenhar() {
  if (altos?.ativo) altos.renderizar();
  else if (usaFXAA()) suavizacao.renderizar();
  else renderer.render(cena, camera);
}
// ---------- Dia e noite ----------
// O céu (ceu.js) diz a hora e as cores do momento; aqui elas vão para as luzes, a neblina, o mar,
// a névoa, as nuvens baixas do High e a luz de ambiente. A direção da luz não muda (sombra fixa):
// de dia é o sol, à noite o luar.
const tintaHora = new THREE.Color(), tintaNuvens = new THREE.Color(), branco = new THREE.Color(1, 1, 1);
const hudHora = $('hora');
let horaMostrada = '';
function aplicarHora() {
  const e = ceuJogo.estado;
  sol.color.copy(e.corLuz);
  sol.intensity = (nivel.efeitos ? 4.0 : 3.0) * e.forcaLuz;
  luzCeu.color.copy(e.corCeuLuz); luzCeu.groundColor.copy(e.corChaoLuz);
  luzCeu.intensity = luzCeuBase() * e.forcaCeuLuz + chuva.relampago * 2.5; // relâmpago clareia tudo por um instante
  cena.fog.color.copy(e.neblina);
  atualizarNevoaSol(e, chuva.intensidade);
  // na chuva a neblina chega mais perto
  const fb = cena.userData.neblinaBase;
  if (fb) { cena.fog.near = fb[0] * (1 - 0.45 * chuva.intensidade); cena.fog.far = fb[1] * (1 - 0.4 * chuva.intensidade); }
  if (cena.background?.isColor) cena.background.copy(e.neblina);
  DIA.valor = e.dia;
  tintaHora.copy(branco).lerp(e.corLuz, 0.45).multiplyScalar(THREE.MathUtils.lerp(0.28, 1, e.dia));
  if (altos?.ativo) {
    cena.environmentIntensity = 0.55 * THREE.MathUtils.lerp(0.12, 1, e.dia);
    // as nuvens baixas são planas (não recebem luz): à noite precisam escurecer bem mais
    altos.tingirNuvens(tintaNuvens.copy(tintaHora).multiplyScalar(THREE.MathUtils.lerp(0.35, 1, Math.max(e.dia, e.por))));
  }
  agua?.definirCeu(e);
  nevoa?.definirLuz(tintaHora);
  // relógio no HUD: ☀ de dia, ☾ à noite
  const h = Math.floor(e.hora), m = Math.floor((e.hora % 1) * 6) * 10;
  const texto = `${h >= 6 && h < 18 ? '☀' : '☾'} ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  if (hudHora && texto !== horaMostrada) { horaMostrada = texto; hudHora.textContent = texto; }
}

function redimensionarPos() { altos?.redimensionar(); suavizacao.redimensionar(); }

// ---------- Entrada ----------
const teclas = new Set();
let pedidoPulo = false;
const algumaTecla = lista => lista.some(k => teclas.has(k));
const T = {
  frente: ['KeyW', 'ArrowUp'], tras: ['KeyS', 'ArrowDown'],
  esq: ['KeyA', 'ArrowLeft'], dir: ['KeyD', 'ArrowRight'],
  pulo: ['Space', 'GamepadPulo', 'ToquePulo'],
  disparar: ['ShiftLeft', 'ShiftRight', 'GamepadDisparar', 'ToqueCorrer'],
  camEsq: ['KeyZ'], camDir: ['KeyC'], // E é interagir
  defender: ['KeyQ', 'GamepadDefender', 'ToqueDefesa'], // segurar
  devagar: ['KeyX'], // segurar: anda devagar
};
// golpes: J/clique esquerdo = combo (ou bater com o objeto na mão), K/clique direito = chute, F = pegar/soltar
const TECLAS_COMBATE = { KeyJ: 'combo', KeyK: 'chute', KeyF: 'pegar' };
const camera3p = { yaw: 0, pitch: 0.35, dist: CAMERA.distancia, distAtual: CAMERA.distancia, alvo: new THREE.Vector3() };
const analogico = { x: 0, y: 0, camX: 0, camY: 0 }; // gamepad / toque

addEventListener('keydown', e => {
  // num botão ou controle de menu as setas e o Espaço são dele (deslizar o volume, apertar a opção)
  const emControle = document.activeElement?.matches?.('button, input, select, a');
  if (!emControle && (e.code.startsWith('Arrow') || e.code === 'Space')) e.preventDefault();
  if (e.code === 'KeyG' && !e.repeat) { abrirMenu(); return; }
  if (menuAberto) { if (e.code === 'Escape') abrirMenu(false); return; }
  // com um painel aberto (capítulos, configurações) as teclas ficam com ele; Esc fecha (abaixo)
  if (paineis.classList.contains('aberto')) return;
  if (estado === 'menu' && (e.code === 'Enter' || e.code === 'Space')) { if (!emControle) reiniciar(); return; }
  if (estado === 'fim') return;
  if (estado === 'gameover') { if ((e.code === 'Enter' || e.code === 'Space') && !e.repeat) tentarDeNovo(); return; }
  if ((e.code === 'KeyE' || (e.code === 'Enter' && campanha?.lendo)) && !e.repeat) { campanha?.interagir(); return; }
  if (e.code === 'Space' && !e.repeat) pedidoPulo = true;
  if (TECLAS_COMBATE[e.code] && !e.repeat && estado === 'jogando' && !pausado) combate?.pedir(TECLAS_COMBATE[e.code]);
  // T: o tempo corre rápido até a próxima fase (dia → noite estrelada, noite → manhã)
  if (e.code === 'KeyT' && !e.repeat && estado === 'jogando') ceuJogo.avancar();
  if (e.code === 'KeyY' && !e.repeat && estado === 'jogando') chuva.alternar();
  // R: volta ao último ponto seguro (se ficar presa em algum lugar)
  if (e.code === 'KeyR' && !e.repeat && estado === 'jogando') comEscuro(() => respawn());
  if ((e.code === 'KeyP' || e.code === 'Escape') && !e.repeat) alternarPausa();
  teclas.add(e.code);
});
addEventListener('keyup', e => teclas.delete(e.code));
// se a janela perde o foco com uma tecla apertada, ela não fica "presa"
addEventListener('blur', () => teclas.clear());

// mouse: clique trava o cursor e o movimento gira a câmera. Sem trava, arrastar também gira.
const canvas = renderer.domElement;
let arrastando = false;
canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('mousedown', e => {
  if (estado !== 'jogando' || menuAberto) return;
  // com o cursor preso: botão esquerdo bate (combo / com o objeto), direito chuta
  if (document.pointerLockElement === canvas) {
    if (!pausado) { if (e.button === 0) combate?.pedir('combo'); if (e.button === 2) combate?.pedir('chute'); }
    return;
  }
  arrastando = true;
  canvas.requestPointerLock?.()?.catch?.(() => {});
});
addEventListener('mouseup', () => { arrastando = false; });
addEventListener('mousemove', e => {
  if (estado !== 'jogando' || pausado || menuAberto) return;
  if (document.pointerLockElement !== canvas && !arrastando) return;
  girarCamera(e.movementX, e.movementY);
});
canvas.addEventListener('wheel', e => {
  camera3p.dist = THREE.MathUtils.clamp(camera3p.dist * (1 + Math.sign(e.deltaY) * 0.12), CAMERA.min, CAMERA.max);
  e.preventDefault();
}, { passive: false });
document.addEventListener('pointerlockchange', () => {
  if (dica) dica.style.opacity = document.pointerLockElement === canvas ? 0 : 1;
});
function girarCamera(dx, dy) {
  camera3p.yaw -= dx * CAMERA.sensibilidade;
  camera3p.pitch = THREE.MathUtils.clamp(camera3p.pitch + dy * CAMERA.sensibilidade, -0.5, 1.25);
}

// toque: metade esquerda = analógico de andar, metade direita = girar câmera e botão = pulo
const toques = new Map();
const bastao = $('bastao');
canvas.addEventListener('pointerdown', e => {
  if (e.pointerType !== 'touch') return;
  toques.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, esquerda: e.clientX < innerWidth / 2 });
  if (e.clientX < innerWidth / 2 && bastao) { bastao.style.display = 'block'; bastao.style.left = `${e.clientX - 50}px`; bastao.style.top = `${e.clientY - 50}px`; }
});
canvas.addEventListener('pointermove', e => {
  const t = toques.get(e.pointerId);
  if (!t) return;
  if (t.esquerda) {
    analogico.x = THREE.MathUtils.clamp((e.clientX - t.x0) / 50, -1, 1);
    analogico.y = THREE.MathUtils.clamp(-(e.clientY - t.y0) / 50, -1, 1);
    // arrastar o bastão bem além da borda (75 px) é correr, como o Shift no teclado
    if (Math.hypot(e.clientX - t.x0, e.clientY - t.y0) > 75) teclas.add('ToqueCorrer'); else teclas.delete('ToqueCorrer');
  } else girarCamera((e.clientX - t.x) * 1.6, (e.clientY - t.y) * 1.6);
  t.x = e.clientX; t.y = e.clientY;
});
for (const ev of ['pointerup', 'pointercancel']) canvas.addEventListener(ev, e => {
  const t = toques.get(e.pointerId);
  if (t?.esquerda) { analogico.x = analogico.y = 0; teclas.delete('ToqueCorrer'); if (bastao) bastao.style.display = 'none'; }
  toques.delete(e.pointerId);
});
const botaoPulo = $('tPulo');
botaoPulo.addEventListener('pointerdown', e => { e.preventDefault(); teclas.add('ToquePulo'); pedidoPulo = true; });
for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) botaoPulo.addEventListener(ev, () => teclas.delete('ToquePulo'));
$('tUsar').addEventListener('pointerdown', e => { e.preventDefault(); campanha?.interagir(); });
$('tSoco').addEventListener('pointerdown', e => { e.preventDefault(); combate?.pedir('combo'); });
$('tChute').addEventListener('pointerdown', e => { e.preventDefault(); combate?.pedir('chute'); });
$('tPegar').addEventListener('pointerdown', e => { e.preventDefault(); combate?.pedir('pegar'); });
const botaoDefesa = $('tDefesa');
botaoDefesa.addEventListener('pointerdown', e => { e.preventDefault(); teclas.add('ToqueDefesa'); });
for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) botaoDefesa.addEventListener(ev, () => teclas.delete('ToqueDefesa'));

// controle (gamepad): analógico esquerdo anda, direito gira a câmera, A pula, B soca, Y chuta,
// RB pega/solta, LT defende, X/RT correm, LB interage, Start pausa e Select abre os gráficos.
let gpAntes = {};
function lerGamepad() {
  const gp = [...(navigator.getGamepads?.() || [])].find(Boolean);
  if (!gp) return;
  const ax = i => (Math.abs(gp.axes[i] || 0) > 0.15 ? gp.axes[i] : 0), b = i => !!gp.buttons[i]?.pressed;
  const borda = i => b(i) && !gpAntes[i];
  analogico.x = ax(0) || (b(15) ? 1 : 0) - (b(14) ? 1 : 0);
  analogico.y = -ax(1) || (b(12) ? 1 : 0) - (b(13) ? 1 : 0);
  analogico.camX = ax(2); analogico.camY = ax(3);
  b(2) || b(7) ? teclas.add('GamepadDisparar') : teclas.delete('GamepadDisparar');
  b(6) ? teclas.add('GamepadDefender') : teclas.delete('GamepadDefender');
  if (estado === 'jogando' && !pausado) {
    if (borda(1)) combate?.pedir('combo');
    if (borda(3)) combate?.pedir('chute');
    if (borda(5)) combate?.pedir('pegar');
  }
  if (borda(0)) { if (estado === 'menu') reiniciar(); else if (estado === 'gameover') tentarDeNovo(); else pedidoPulo = true; }
  if (borda(4)) campanha?.interagir(); // LB: interagir
  b(0) ? teclas.add('GamepadPulo') : teclas.delete('GamepadPulo');
  if (borda(9)) alternarPausa();
  if (borda(8)) abrirMenu();
  gpAntes = Object.fromEntries(gp.buttons.map((x, i) => [i, x.pressed]));
}

function entradaMovimento() {
  if (jogador.morta) return { x: 0, y: 0 };
  let x = (algumaTecla(T.dir) ? 1 : 0) - (algumaTecla(T.esq) ? 1 : 0) + analogico.x;
  let y = (algumaTecla(T.frente) ? 1 : 0) - (algumaTecla(T.tras) ? 1 : 0) + analogico.y;
  const l = Math.hypot(x, y);
  if (l > 1) { x /= l; y /= l; }
  return { x, y };
}

// ---------- Mundo (preenchido ao carregar) ----------
let mapa = null, terreno = null, personagem = null;
let mundo = null, inimigos = null, campanha = null, combate = null, oclusao = null;
const distancia = criarDistancia(); // objetos pequenos só são desenhados perto da câmera
let estado = 'carregando'; // carregando | menu | jogando | fim
let pausado = false;
let correntes = []; // correntes de vento (lançadores calculados pela análise do terreno)

// ---------- Jogador ----------
const jogador = {
  pos: new THREE.Vector3(), vel: new THREE.Vector3(), noChao: false,
  tempoNoAr: 0, tempoPulo: 99, angulo: 0,
  disparando: false, pulou: false, aterrissou: false, velQueda: 0, veioDoTrampolim: false,
  puloDuploUsado: false, cambalhota: -1, comecouCambalhota: false, // cambalhota: progresso 0..1, -1 = nenhuma
  lancado: false, seguro: new THREE.Vector3(), tempoSeguro: 0,
};

function respawn(ponto) {
  const j = jogador;
  j.pos.copy(ponto ?? j.seguro);
  j.vel.set(0, 0, 0);
  Object.assign(j, { noChao: false, lancado: false, puloDuploUsado: false, cambalhota: -1, comecouCambalhota: false, tempoNoAr: 0, aterrissou: false, veioDoTrampolim: true, morta: false, noVazio: false, impacto: 0, golpe: null, pegando: null, machucado: 0, defendendo: false });
  if (personagem) { personagem.mixer.stopAllAction(); animAtual = null; tocar('parada'); }
}

// escurece a tela, executa e clareia de novo
let escurecendo = false;
async function comEscuro(acao) {
  if (escurecendo) return;
  escurecendo = true;
  escuro.style.opacity = 1;
  await new Promise(r => setTimeout(r, 280));
  acao();
  escuro.style.opacity = 0;
  escurecendo = false;
}

// ---------- Morte e game over ----------
// A última fôlego acabou: os controles param, Brisa cai no chão (animação "morte"; se caiu no
// vazio ela só despenca), a câmera se afasta girando devagar e então entra a tela de game over.
let tempoMorte = 0, motivoMorte = 'queda';
function morrer(motivo) {
  const j = jogador;
  if (j.morta) return;
  j.morta = true; motivoMorte = motivo;
  j.cambalhota = -1; j.comecouCambalhota = false;
  tempoMorte = motivo === 'vazio' ? 1.4 : FISICA.tempoMorte;
  document.exitPointerLock?.();
}
function mostrarGameOver() {
  estado = 'gameover';
  const r = campanha?.estado;
  $('gameoverMotivo').textContent = GAMEOVER[motivoMorte] ?? GAMEOVER.queda;
  $('gameoverEstat').textContent = r ? `Fragmentos de Luz: ${r.pegos}/${campanha.fragmentos.length}` : '';
  const g = $('gameover');
  g.style.display = 'flex';
  requestAnimationFrame(() => requestAnimationFrame(() => g.classList.add('visivel')));
  $('tentarDeNovo').focus({ focusVisible: false });
}
function tentarDeNovo() {
  if (estado !== 'gameover') return;
  const g = $('gameover');
  g.classList.remove('visivel');
  setTimeout(() => { g.style.display = 'none'; }, 400);
  comEscuro(() => {
    campanha.reviver(); // fôlego cheia, de volta ao último ponto salvo (respawn limpa "morta")
    camera3p.dist = CAMERA.distancia;
    estado = 'jogando';
    teclas.clear();
  });
}
$('tentarDeNovo').addEventListener('click', tentarDeNovo);
$('recomecar').addEventListener('click', () => { apagarProgresso(); location.reload(); });

// Começar (primeira vez), continuar explorando depois do fim, ou jogar de novo (recarrega:
// a campanha inteira volta ao início)
function reiniciar() {
  if (estado === 'carregando') return;
  // já existe progresso salvo: o primeiro toque em Novo jogo só pede confirmação
  if (estado === 'menu' && lerProgresso() && !confirmandoNovo) {
    confirmandoNovo = true; $('confirmarNovo').style.display = 'block'; return;
  }
  if (estado === 'menu') apagarProgresso();
  if (estado === 'fim') {
    if (campanhaTerminada && proximoCapitulo) { location.href = urlCapitulo(proximoCapitulo); return; }
    if (campanhaTerminada) { apagarProgresso(); location.reload(); return; }
  }
  const primeiraVez = estado === 'menu';
  estado = 'jogando';
  pausado = false;
  sumir(tela, () => { tela.style.display = 'none'; }, 320);
  // tira o foco do botão: senão o Espaço (pulo) "clicaria" nele de novo
  botao.blur();
  teclas.clear();
  if (primeiraVez) campanha.iniciar();
}
let campanhaTerminada = false, confirmandoNovo = false, proximoCapitulo = null;
botao.addEventListener('click', reiniciar);
// Continuar: refaz o progresso salvo (fragmentos, âncoras, cartas…) e volta ao último ponto seguro
function continuarJogo() {
  // o último jogo salvo é de outro capítulo: abre a página dele, que continua sozinha
  if (!lerProgresso() && capituloSalvo()) { location.href = urlCapitulo(capituloSalvo()) + (urlCapitulo(capituloSalvo()).includes('?') ? '&' : '?') + 'continuar=1'; return; }
  const s = lerProgresso();
  if (!s || estado !== 'menu') return;
  campanha.importar(s);
  const p = new THREE.Vector3().fromArray(s.checkpoint ?? terreno.nascimento.toArray());
  respawn(p); jogador.seguro.copy(p);
  estado = 'jogando'; pausado = false;
  sumir(tela, () => { tela.style.display = 'none'; }, 320);
  $('continuarJogo').blur(); teclas.clear();
  campanha.iniciar({ continuando: true });
}
$('continuarJogo').addEventListener('click', continuarJogo);
// outro capítulo com jogo salvo (só quando a página foi aberta sem escolher capítulo)
function capituloSalvo() {
  if (new URLSearchParams(location.search).has('capitulo')) return null;
  const n = ultimoCapitulo();
  return n !== CAPITULO_ATUAL && lerProgresso(n) ? n : null;
}

// lista de capítulos: cada um abre quando o anterior termina
function montarCapitulos() {
  const feitos = lerConcluidos();
  const lista = $('listaCapitulos');
  lista.innerHTML = '';
  for (let n = 1; n <= TOTAL_CAPITULOS; n++) {
    const livre = n === 1 || feitos.includes(n - 1) || n === CAPITULO_ATUAL;
    const [, nome] = NOMES_CAPITULOS[n].split(' — ');
    const li = document.createElement('li');
    li.className = livre ? 'livre' : 'trancado';
    li.innerHTML = `<b>${n} · ${nome}</b><span>${DESCRICOES_CAPITULOS[n]}${feitos.includes(n) ? ' ✓' : ''}</span>`;
    if (livre) {
      const b = document.createElement('button');
      b.className = 'botao principal'; b.textContent = n === CAPITULO_ATUAL ? 'Jogar' : 'Ir';
      b.addEventListener('click', () => {
        fecharPaineis();
        if (n !== CAPITULO_ATUAL) { location.href = urlCapitulo(n); return; }
        lerProgresso() ? continuarJogo() : reiniciar();
      });
      li.appendChild(b);
    } else li.insertAdjacentHTML('beforeend', '<em title="Termine o capítulo anterior">🔒</em>');
    lista.appendChild(li);
  }
}
montarCapitulos();

// ---------- Painéis do menu: capítulos, configurações, créditos ----------
const paineis = $('paineis');
function abrirPainel(nome, aba = 'geral') {
  mostrar(paineis, () => paineis.classList.add('aberto'));
  mostrarAba(aba);
  for (const s of paineis.querySelectorAll('section')) s.classList.toggle('visivel', s.dataset.painel === nome);
  // foco para o teclado/controle, sem rolar o painel até o botão (em tela baixa o título sumia)
  const aberto = paineis.querySelector('section.visivel');
  aberto?.querySelector('.corpo button, .corpo input')?.focus({ preventScroll: true, focusVisible: false });
  if (aberto) aberto.scrollTop = 0;
}
function fecharPaineis() { sumir(paineis, () => paineis.classList.remove('aberto')); }
for (const b of document.querySelectorAll('[data-painel]')) if (b.tagName === 'BUTTON') b.addEventListener('click', () => abrirPainel(b.dataset.painel));
for (const b of document.querySelectorAll('.fechar-painel')) b.addEventListener('click', fecharPaineis);
paineis.addEventListener('click', e => { if (e.target === paineis) fecharPaineis(); });
addEventListener('keydown', e => { if (e.code === 'Escape' && paineis.classList.contains('aberto')) fecharPaineis(); });
// abas das configurações (Geral / Controles)
function mostrarAba(nome) {
  for (const a of paineis.querySelectorAll('.aba')) a.classList.toggle('ativa', a.dataset.aba === nome);
  for (const p of paineis.querySelectorAll('.pagina')) p.classList.toggle('ativa', p.dataset.pagina === nome);
}
for (const a of paineis.querySelectorAll('.aba')) a.addEventListener('click', () => mostrarAba(a.dataset.aba));

// configurações: aplicadas na hora e guardadas
const config = lerConfig();
function aplicarConfig() {
  chuva.definirVolume(config.volume);
  CAMERA.sensibilidade = 0.0025 * config.sensibilidade;
  document.documentElement.style.setProperty('--escala-texto', config.texto);
  $('volumeValor').textContent = Math.round(config.volume * 100) + '%';
  $('sensValor').textContent = config.sensibilidade.toFixed(1) + '×';
  salvarConfig(config);
}
$('cfgVolume').value = config.volume; $('cfgSens').value = config.sensibilidade; $('cfgTexto').value = String(config.texto); $('cfgTremor').checked = config.tremor;
$('cfgVolume').addEventListener('input', e => { config.volume = +e.target.value; aplicarConfig(); });
$('cfgSens').addEventListener('input', e => { config.sensibilidade = +e.target.value; aplicarConfig(); });
$('cfgTexto').addEventListener('change', e => { config.texto = +e.target.value; aplicarConfig(); });
$('cfgTremor').addEventListener('change', e => { config.tremor = e.target.checked; aplicarConfig(); });
aplicarConfig();
$('continuar').addEventListener('click', () => { sumir(tela, () => { tela.style.display = 'none'; }, 320); estado = 'jogando'; $('continuar').style.display = 'none'; $('continuar').blur(); teclas.clear(); });

function terminarCapitulo(r) {
  campanhaTerminada = true;
  estado = 'fim';
  document.exitPointerLock?.();
  mostrar(tela, () => { tela.style.display = 'flex'; });
  // "Capítulo 1 — A Oficina Esquecida": o número vai no selo, o nome no título
  const [numero, nome] = r.capitulo.split(' — ');
  tela.querySelector('.selo').textContent = `${numero} concluído`;
  tela.querySelector('h1').textContent = nome ?? r.capitulo;
  tela.querySelector('.sub').textContent = FIM.sub;
  $('historia').style.display = 'none';
  // resumo da partida em números
  msg.innerHTML = `<span class="resumo">
      <span><b>${r.fragmentos}/${r.total}</b>Fragmentos</span><span><b>${r.memorias}</b>Memórias</span>
      <span><b>${r.purificados}</b>Purificados</span>
    </span><em>${FIM.continua}</em>`;
  // o próximo capítulo acabou de ser desbloqueado; no último, recomeça a história
  proximoCapitulo = r.numero < TOTAL_CAPITULOS ? r.numero + 1 : 1;
  botao.textContent = r.numero < TOTAL_CAPITULOS ? 'Próximo capítulo ▶' : 'Jogar desde o começo';
  botao.className = 'botao principal';
  $('continuar').style.display = 'block';
}

function alternarPausa() {
  if (estado !== 'jogando') return;
  pausado = !pausado;
  if (pausado) mostrar(telaPausa, () => { telaPausa.style.display = 'flex'; });
  else sumir(telaPausa, () => { telaPausa.style.display = 'none'; });
  if (pausado) $('pausaContinuar').focus({ preventScroll: true, focusVisible: false });
  else { fecharPaineis(); abrirMenu(false); }
  pedidoPulo = false;
  if (pausado) document.exitPointerLock?.();
}

// menus como num console: ↑/↓ passam pelas opções da tela de cima, o mouse escolhe ao passar por
// cima (uma opção marcada por vez) e Enter confirma
function telaDeCima() {
  if (menuAberto) return painel;
  if (paineis.classList.contains('aberto')) return paineis.querySelector('section.visivel');
  if (pausado) return telaPausa;
  if ($('gameover').style.display === 'flex') return $('gameover');
  if (tela.style.display !== 'none') return tela;
  return null;
}
addEventListener('keydown', e => {
  if (e.code !== 'ArrowUp' && e.code !== 'ArrowDown') return;
  const camada = telaDeCima();
  if (!camada) return;
  const itens = [...camada.querySelectorAll('button, input, select')].filter(b => b.offsetParent && !b.disabled);
  if (!itens.length) return;
  e.preventDefault();
  const i = itens.indexOf(document.activeElement);
  const prox = i < 0 ? 0 : (i + (e.code === 'ArrowDown' ? 1 : -1) + itens.length) % itens.length;
  itens[prox].focus({ preventScroll: false, focusVisible: false });
}, true);
addEventListener('pointerover', e => {
  if (e.pointerType !== 'mouse') return;
  const b = e.target.closest?.('.item-menu, .botao, .aba, .voltar, [data-nivel]');
  if (b && b !== document.activeElement) b.focus({ preventScroll: true, focusVisible: false });
});

// menu de pausa: continuar, configurações, gráficos, controles e voltar ao menu principal
const telaPausa = $('pausa');
$('abrir-pausa').addEventListener('click', () => alternarPausa());
$('pausaContinuar').addEventListener('click', () => alternarPausa());
$('pausaVoltar').addEventListener('click', () => alternarPausa());
$('pausaGraficos').addEventListener('click', () => abrirMenu(true));
$('pausaControles').addEventListener('click', () => abrirPainel('config', 'controles'));
// o progresso fica salvo nos pontos de controle; recarregar volta à tela inicial com "Continuar"
$('pausaMenu').addEventListener('click', () => location.reload());

// arco de uma corrente de vento até o ponto de pouso (mesma conta usada para posicioná-las)
function lancar(t) {
  const j = jogador;
  j.vel.copy(calcularLancamento(j.pos, t.alvo, FISICA.gravidade, t.folga));
  Object.assign(j, { noChao: false, lancado: true, veioDoTrampolim: true, tempoNoAr: 1, tempoPulo: 99, puloDuploUsado: false, pulou: true });
  t.mola = 1;
}

// ---------- Impactos ----------
// Pouso e batidas sentidos de verdade: a câmera treme e "afunda" junto, o corpo amassa e volta,
// sobe poeira do chão, e depois de um tranco forte as pernas demoram um instante para responder.
const impacto = { tremor: 0, mergulho: 0, amassar: 0 };
const texPoeira = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(214,200,172,0.9)'); gr.addColorStop(0.5, 'rgba(190,176,150,0.45)'); gr.addColorStop(1, 'rgba(180,170,150,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const t = texturaDeCanvas(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
})();
const poeiras = [];
const livresPoeira = [];
function soltarPoeira(centro, quantidade, forca) {
  for (let i = 0; i < quantidade && poeiras.length < 80; i++) {
    // sprites reaproveitados: nada é criado nem descartado no meio do jogo (sem travadinhas de GC)
    const s = livresPoeira.pop() ?? new THREE.Sprite(new THREE.SpriteMaterial({ map: texPoeira, transparent: true, depthWrite: false }));
    const a = Math.random() * Math.PI * 2, v = (0.8 + Math.random()) * forca;
    s.position.copy(centro).add(new THREE.Vector3(Math.cos(a) * 0.2, 0.05, Math.sin(a) * 0.2));
    s.userData = { v: new THREE.Vector3(Math.cos(a) * v, 0.4 + Math.random() * 0.8 * forca, Math.sin(a) * v), vida: 0, dura: 0.6 + Math.random() * 0.5, tam: 0.25 + Math.random() * 0.25 };
    s.material.rotation = Math.random() * 6;
    cena.add(s); poeiras.push(s);
  }
}
function atualizarPoeira(dt) {
  for (const s of [...poeiras]) {
    const u = s.userData;
    u.vida += dt;
    u.v.multiplyScalar(1 - dt * 3.5); u.v.y -= 0.6 * dt; // o ar freia a nuvem e ela assenta devagar
    s.position.addScaledVector(u.v, dt);
    const k = u.vida / u.dura;
    s.scale.setScalar(u.tam * (1 + k * 2.2));
    s.material.opacity = Math.max(0, 1 - k) * 0.8;
    if (k >= 1) { cena.remove(s); poeiras.splice(poeiras.indexOf(s), 1); livresPoeira.push(s); }
  }
}
// v: velocidade vertical no pouso (m/s). ~8 = pulo normal, ~16 = pulo duplo do alto, 25+ = queda grande
function impactoPouso(v) {
  const k = THREE.MathUtils.clamp((v - 8) / 20, 0, 1);
  impacto.tremor = Math.max(impacto.tremor, 0.12 + k * 0.85);
  impacto.mergulho = Math.max(impacto.mergulho, 0.06 + k * 0.3);
  impacto.amassar = Math.max(impacto.amassar, 0.06 + k * 0.16);
  jogador.impacto = Math.max(jogador.impacto || 0, 0.08 + k * 0.45);
  soltarPoeira(jogador.pos, Math.round(5 + k * 14), 1.2 + k * 2.2);
}
// v: velocidade com que entrou na parede (m/s); n: normal da parede (aponta para fora dela)
function impactoParede(v, n) {
  const k = THREE.MathUtils.clamp((v - 4.5) / 6, 0, 1);
  // quique: devolve uma parte da velocidade (coeficiente de restituição baixo, corpo macio)
  jogador.vel.addScaledVector(n, v * 0.22);
  impacto.tremor = Math.max(impacto.tremor, 0.15 + k * 0.45);
  jogador.impacto = Math.max(jogador.impacto || 0, 0.1 + k * 0.2);
  if (n.y > -0.5) soltarPoeira(jogador.pos.clone().addScaledVector(n, -RAIO).add(new THREE.Vector3(0, 0.9, 0)), Math.round(3 + k * 6), 0.6 + k);
}
// Brisa e os Retalhos não se atravessam: cada um empurra o outro (ela é mais pesada que eles).
// O contato é entre a cápsula dela e o corpo dele (inimigos.js); o empurrão é na horizontal.
function empurrarInimigos() {
  if (!inimigos) return;
  const j = jogador;
  for (const e of inimigos.lista) {
    if (!e.ativo) continue;
    const sobra = -inimigos.distanciaJogadora(e, j.pos);
    if (sobra <= 0) continue;
    const dx = j.pos.x - e.pos.x, dz = j.pos.z - e.pos.z, d = Math.hypot(dx, dz);
    const nx = d > 1e-4 ? dx / d : 1, nz = d > 1e-4 ? dz / d : 0;
    j.pos.x += nx * sobra * 0.4; j.pos.z += nz * sobra * 0.4;
    // o resto vira velocidade do inimigo (ele mesmo checa se tem chão antes de andar)
    e.vel.x -= nx * sobra * 4; e.vel.z -= nz * sobra * 4;
    const entra = j.vel.x * nx + j.vel.z * nz;
    if (entra < 0) { j.vel.x -= nx * entra * 0.7; j.vel.z -= nz * entra * 0.7; e.vel.x += nx * entra * 0.6; e.vel.z += nz * entra * 0.6; }
  }
}

// Caiu da ilha (mar ou praia lá embaixo): a fôlego a puxa de volta ao último chão seguro.
// Custa uma fôlego, mas nunca a última: cair não dá game over.
function cairDaIlha() {
  if (jogador.morta || !campanha) return;
  campanha.perderVida(campanha.estado.vida > 1 ? 1 : 0, AVISOS.caiuNoVazio);
}

// ---------- Física ----------
const frente = new THREE.Vector3(), direita = new THREE.Vector3(), desejado = new THREE.Vector3(), horiz = new THREE.Vector3();
const dirEntrada = new THREE.Vector3();
const rcBorda = new THREE.Raycaster(); rcBorda.firstHitOnly = true; rcBorda.layers.enableAll();
const origemBorda = new THREE.Vector3(), baixoBorda = new THREE.Vector3(0, -1, 0), cimaBorda = new THREE.Vector3(0, 1, 0);
// Altura do topo de uma borda logo à frente (na direção do comando), ou null. Precisa ter parede
// na frente do peito, chão plano em cima ao alcance das mãos e espaço livre para o corpo.
function alturaBorda(pos, dir) {
  const d = dir.clone().normalize();
  origemBorda.set(pos.x, pos.y + 0.4, pos.z); // na altura dos joelhos: acha bordas baixas também
  rcBorda.set(origemBorda, d); rcBorda.far = RAIO + 0.45;
  const parede = rcBorda.intersectObject(mapa.malha)[0];
  if (!parede || !parede.face) return null;
  const n = parede.face.normal.clone().transformDirection(mapa.malha.matrixWorld);
  if (Math.abs(n.y) > 0.55) return null; // rampa andável: o andar normal já resolve (fisica.js CHAO_MIN)
  origemBorda.copy(parede.point).addScaledVector(d, RAIO + 0.1);
  origemBorda.y = pos.y + FISICA.bordaMax + 0.3;
  rcBorda.set(origemBorda, baixoBorda); rcBorda.far = FISICA.bordaMax + 0.3;
  const topo = rcBorda.intersectObject(mapa.malha)[0];
  if (!topo || !topo.face) return null;
  const nt = topo.face.normal.clone().transformDirection(mapa.malha.matrixWorld);
  const alt = topo.point.y - pos.y;
  if (nt.y < 0.75 || alt < 0.45 || alt > FISICA.bordaMax) return null;
  // cabe de pé lá em cima?
  origemBorda.copy(topo.point).y += 0.05;
  rcBorda.set(origemBorda, cimaBorda); rcBorda.far = ALTURA;
  if (rcBorda.intersectObject(mapa.malha)[0]) return null;
  return topo.point.y;
}
function passoFisica(dt) {
  const j = jogador;
  const ent = entradaMovimento();

  // movimento relativo à câmera
  frente.set(-Math.sin(camera3p.yaw), 0, -Math.cos(camera3p.yaw));
  direita.set(Math.cos(camera3p.yaw), 0, -Math.sin(camera3p.yaw));
  desejado.copy(direita).multiplyScalar(ent.x).addScaledVector(frente, ent.y);
  // combate: golpes, pegar/soltar e defesa
  combate?.passo(dt);
  j.defendendo = algumaTecla(T.defender) && j.noChao && !j.golpe && !j.pegando && !j.morta && !(j.machucado > 0);
  // golpeando no chão, pegando algo ou acabando de ser atingida: os pés não obedecem ao comando
  const semControle = (j.golpe && j.noChao) || j.pegando || j.machucado > 0;
  if (semControle) desejado.set(0, 0, 0);
  dirEntrada.copy(desejado);
  // no começo de um golpe Brisa dá um passinho para a frente (o combo acompanha o alvo)
  let passoGolpe = 0;
  if (j.golpe && j.noChao) {
    const g = GOLPES[j.golpe.nome], f = j.golpe.t / j.golpe.duracao;
    if (f < g.impacto[1]) passoGolpe = g.avanco * (1 - f / g.impacto[1]);
  }
  j.disparando = algumaTecla(T.disparar) && !j.defendendo;
  // defendendo ela anda devagar, de guarda
  const devagar = algumaTecla(T.devagar) && j.noChao;
  const vmax = j.defendendo ? FISICA.velocidade * 0.35 : j.planando ? FISICA.velocidadePlanando : j.disparando ? FISICA.velocidadeDisparada : devagar ? FISICA.velocidadeDevagar : FISICA.velocidade;

  horiz.set(j.vel.x, 0, j.vel.z);
  const temEntrada = desejado.lengthSq() > 0.0001;
  // no arco do trampolim, sem comando a personagem segue o arco; com comando, corrige devagar
  if (!(j.lancado && !temEntrada)) {
    // logo depois de um impacto forte as pernas ainda estão absorvendo o tranco: responde menos
    const tranco = j.impacto > 0 ? 0.25 : 1;
    const acel = (j.noChao ? FISICA.aceleracao : FISICA.aceleracaoAr * (j.lancado ? 0.4 : j.planando ? 1.4 : 1)) * tranco;
    desejado.multiplyScalar(vmax);
    if (passoGolpe > 0) desejado.set(Math.sin(j.angulo) * passoGolpe, 0, Math.cos(j.angulo) * passoGolpe);
    const dv = desejado.sub(horiz);
    const lim = acel * dt;
    if (dv.length() > lim) dv.setLength(lim);
    j.vel.x += dv.x; j.vel.z += dv.z;
  }

  // um pulo cancela o golpe depois de um trecho dele; pegando algo ou atingida, não pula
  const podePular = !j.morta && !j.pegando && !(j.machucado > 0) && (!j.golpe || j.golpe.t / j.golpe.duracao > j.golpe.cancela);

  // pulo com coyote time + buffer + altura variável; segundo toque no ar = pulo duplo com cambalhota
  const apertouAgora = pedidoPulo && podePular;
  if (pedidoPulo && podePular) { j.tempoPulo = 0; }
  pedidoPulo = false;
  j.tempoPulo += dt;
  j.tempoNoAr = j.noChao ? 0 : j.tempoNoAr + dt;
  if (j.tempoPulo < FISICA.bufferPulo && j.tempoNoAr < FISICA.coyote && podePular) {
    j.vel.y = FISICA.pulo; j.noChao = false; j.tempoNoAr = 1; j.tempoPulo = 99;
    j.pulou = true; j.veioDoTrampolim = false; j.golpe = null;
  } else if (apertouAgora && !j.noChao && !j.puloDuploUsado) {
    // no arco do trampolim a cambalhota é só de enfeite: não muda a trajetória
    if (!j.lancado) j.vel.y = FISICA.puloDuplo;
    j.tempoPulo = 99;
    j.puloDuploUsado = true;
    j.cambalhota = 0;
    j.comecouCambalhota = true;
  }
  // a cambalhota sempre termina num giro completo; se pousar antes, completa rapidinho
  if (j.cambalhota >= 0) {
    j.cambalhota += dt / (j.noChao ? 0.08 : FISICA.duracaoCambalhota);
    if (j.cambalhota >= 1) j.cambalhota = -1;
  }

  // soltar o botão encurta o pulo, exceto na cambalhota e no trampolim
  const segurando = algumaTecla(T.pulo);
  const curto = j.vel.y > 0 && !segurando && j.cambalhota < 0 && !j.lancado && !(j.tempoBorda > 0);
  j.vel.y += FISICA.gravidade * (curto ? 2.2 : 1) * dt;
  if (!j.lancado) j.vel.y = Math.max(j.vel.y, FISICA.quedaMax);

  // planar: caindo e segurando o pulo (depois da subida e da cambalhota), o ar freia a queda aos poucos
  j.planando = !j.noChao && !j.lancado && segurando && j.vel.y < 0 && j.tempoNoAr > 0.3 && j.cambalhota < 0
    && !j.morta && !j.pegando && !j.golpe && !j.noVazio;
  if (j.planando && j.vel.y < -FISICA.quedaPlanando) j.vel.y += (-FISICA.quedaPlanando - j.vel.y) * Math.min(1, dt * 7);

  // subir na borda: no ar, empurrando contra uma parede com a borda ao alcance, ganha o impulso
  // exato para passar por cima dela (o mesmo arco de um pulo, sem teleporte)
  j.tempoBorda = Math.max(0, (j.tempoBorda || 0) - dt);
  if (!j.noChao && !j.lancado && j.tempoBorda <= 0 && j.vel.y < 5 && !j.morta && !j.pegando && !j.noVazio && dirEntrada.lengthSq() > 0.25) {
    const topo = alturaBorda(j.pos, dirEntrada);
    if (topo !== null) {
      const sobe = topo - j.pos.y + 0.35;
      j.vel.y = Math.sqrt(2 * -FISICA.gravidade * sobe);
      j.vel.x = dirEntrada.x * 2.4; j.vel.z = dirEntrada.z * 2.4;
      Object.assign(j, { tempoBorda: 0.45, pulou: true, puloDuploUsado: false, veioDoTrampolim: true, tempoPulo: 99 });
    }
  }

  const vyAntes = j.vel.y, estavaNoChao = j.noChao;
  const grudar = j.tempoNoAr < 0.1 && !j.lancado && j.vel.y <= 0;
  const col = moverComColisao(mapa, j.pos, j.vel, dt, grudar);
  j.noChao = col.noChao;
  if (j.noChao && !estavaNoChao) {
    j.aterrissou = true; j.velQueda = -vyAntes;
    if (j.velQueda > 8) impactoPouso(j.velQueda);
    // queda alta machuca (pousar de uma corrente de vento é sempre seguro: o arco é calculado)
    // (caiu lá embaixo na praia: isso é "cair da ilha", tratado abaixo, não dano de queda)
    const altura = j.alturaMax - j.pos.y;
    if (!j.veioDoTrampolim && !j.morta && campanha && j.pos.y > terreno.limiteQueda) {
      let dano = FISICA.quedaDegraus.filter(h => altura >= h).length;
      if (altura < FISICA.quedaFatal) dano = Math.min(dano, campanha.estado.vida - 1);
      if (dano > 0 && campanha.perderVida(dano, AVISOS.quedaForte(altura, dano)) <= 0) morrer('queda');
    }
    j.veioDoTrampolim = false;
  }
  if (j.noChao) { j.puloDuploUsado = false; j.lancado = false; }
  // altura da queda: o ponto mais alto desde que saiu do chão; planando o pano segura o ar e a
  // conta recomeça de onde ela está (pousar planando não machuca)
  if (j.noChao || j.planando || j.noVazio) j.alturaMax = j.pos.y;
  else j.alturaMax = Math.max(j.alturaMax ?? j.pos.y, j.pos.y);
  // bateu numa parede/objeto com velocidade: tranco, quique e poeira
  if (col.batida > 4.5) impactoParede(col.batida, col.normalBatida);
  j.impacto = Math.max(0, (j.impacto || 0) - dt);
  empurrarInimigos();

  // último ponto seguro (chão plano), para voltar se cair das ilhas
  j.tempoSeguro += dt;
  // (na areia seca: no raso da praia o chão é plano, mas voltar para dentro d'água não adianta)
  if (j.noChao && col.normal.y > 0.85 && j.tempoSeguro > 0.5 && (!agua || j.pos.y > agua.nivel + 0.2)) { j.seguro.copy(j.pos); j.tempoSeguro = 0; }
  // caiu da ilha: despenca até o mar lá embaixo; no impacto a água sobe e as ondas se espalham.
  // Custa uma fôlego e, depois de afundar um pouco, volta ao último chão seguro (se era a
  // última, game over)
  // caiu na areia da praia lá embaixo: sobe uma nuvem de areia, custa uma fôlego e volta
  if (!j.noVazio && j.noChao && j.pos.y < terreno.limiteQueda) {
    j.noVazio = true;
    j.tempoAfundar = 1.2;
    soltarPoeira(j.pos, 26, 3.5);
    impacto.tremor = Math.max(impacto.tremor, 0.8); impacto.mergulho = Math.max(impacto.mergulho, 0.35);
    cairDaIlha();
  }
  // andando pela praia dá para entrar no raso: só a água acima da cintura (ou uma queda) conta
  const superficie = agua ? agua.nivel - (j.noChao ? 0.8 : 0) : terreno.limiteQueda;
  if (j.pos.y < superficie && !j.noVazio) {
    j.noVazio = true;
    j.tempoAfundar = 0;
    // entrou andando (sem cair de cima): volta para a areia sem custar fôlego
    const andando = (j.alturaMax ?? j.pos.y) - j.pos.y < 3;
    if (agua) {
      const forca = andando ? 0.3 : THREE.MathUtils.clamp(-j.vel.y / 30, 0.35, 1.3);
      agua.respingo(j.pos.x, j.pos.z, forca);
      if (!andando) impacto.tremor = Math.max(impacto.tremor, 0.35 + forca * 0.5);
      j.tempoAfundar = andando ? 0.5 : 0.9;
    }
    if (!andando) cairDaIlha();
  }
  if (j.noVazio) {
    // dentro d'água o arrasto é forte: freia na hora e afunda devagar
    if (agua && j.pos.y < agua.nivel) { j.vel.multiplyScalar(Math.exp(-dt * 5)); j.vel.y = Math.max(j.vel.y, -4); }
    if (!j.morta) {
      j.tempoAfundar -= dt;
      if (j.tempoAfundar <= 0) { j.tempoAfundar = Infinity; comEscuro(() => { respawn(); }); }
    }
  }

  for (const t of correntes) {
    const dx = j.pos.x - t.pos.x, dz = j.pos.z - t.pos.z, dy = j.pos.y - t.pos.y;
    if (dx * dx + dz * dz < 0.8 && dy > -0.4 && dy < 0.7 && j.vel.y <= 0.5) lancar(t);
  }
}

// ---------- Animações ----------
// boneca: andar, correr; adaptadas do Human Basic Motions: parada, puloInicio, queda, aterrissar;
// cambalhota: pose feita em código (cambalhota.js) por cima de um quadro do início do pulo
let animAtual = null, tempoAterrissar = 0;
let velAndar = 1, velCorrer = 3.5; // medidas ao carregar a boneca (m/s em que os pés não escorregam)

function tocar(nome, { fade = 0.2, inicio = 0, vel = 1, reiniciar = false } = {}) {
  const acao = personagem.acoes[nome];
  acao.timeScale = vel;
  if (animAtual === nome && !reiniciar) return;
  const anterior = animAtual && personagem.acoes[animAtual];
  if (animAtual === nome) { acao.stop(); acao.reset(); acao.time = inicio; acao.fadeIn(fade).play(); return; }
  acao.reset();
  acao.time = inicio;
  acao.play();
  if (anterior) acao.crossFadeFrom(anterior, fade, false);
  animAtual = nome;
}

// A cápsula de colisão tem a base arredondada: numa rampa ela encosta pela lateral e o ponto
// mais baixo fica alguns centímetros acima do chão. No chão, o modelo é assentado na superfície
// que está logo abaixo do centro dela (suavizado, para não tremer em degraus).
let ajusteChao = 0;
function animarPersonagem(dt) {
  if (!personagem) return;
  const j = jogador, { raiz, corpo } = personagem;
  medirChao();
  let alvoAjuste = 0;
  if (j.noChao && chaoAbaixo) {
    const d = chaoAbaixo.point.y - j.pos.y;
    if (d > -0.35 && d < 0.2) alvoAjuste = d;
  }
  ajusteChao += (alvoAjuste - ajusteChao) * Math.min(1, dt * 20);
  raiz.position.set(j.pos.x, j.pos.y + ajusteChao, j.pos.z);
  // amassa com o tranco do pouso e volta como uma mola (o volume se conserva: achata e alarga)
  impacto.amassar *= Math.exp(-dt * 9);
  const am = impacto.amassar;
  raiz.scale.set(1 + am * 0.5, 1 - am, 1 + am * 0.5);

  // vira para a direção em que está andando
  const v = Math.hypot(j.vel.x, j.vel.z);
  // (golpeando, pegando ou defendendo ela mantém a direção: o golpe mira o alvo, a guarda fica de frente)
  if (v > 0.3 && !(j.lancado && v < 1) && !j.golpe && !j.pegando && !j.defendendo && !(j.machucado > 0)) j.angulo = Math.atan2(j.vel.x, j.vel.z);
  let d = j.angulo - raiz.rotation.y;
  d = Math.atan2(Math.sin(d), Math.cos(d)); // caminho mais curto
  // virada com velocidade limitada: correndo é rápida; parada ou andando é mais calma (meia-volta
  // parada leva uns 0,4 s), e ela dá passinhos no lugar enquanto gira
  const giroMax = (v < 0.5 ? 8 : v < 2.5 ? 11 : 16) * dt;
  raiz.rotation.y += THREE.MathUtils.clamp(d * Math.min(1, dt * 12), -giroMax, giroMax);
  const viradaNoLugar = v < 0.4 && Math.abs(d) > 0.45;

  if (j.pulou) {
    j.pulou = false;
    // pula a parte do agachamento: a física já está subindo
    tocar('puloInicio', { fade: 0.1, inicio: 0.2, vel: 1.3 });
  }
  if (j.comecouCambalhota) {
    j.comecouCambalhota = false;
    // base por baixo da pose em código: quadro agachado do início do pulo, congelado
    tocar('cambalhota', { fade: 0.08, inicio: 0.08, vel: 0 });
  }
  // giro para a frente em volta do centro do corpo, com aceleração suave no começo e no fim
  const p = j.cambalhota;
  corpo.rotation.x = p >= 0 ? p * p * (3 - 2 * p) * Math.PI * 2 : 0;

  if (j.morta) {
    // sem fôlego: no chão ela cai (uma vez só, e fica deitada); no ar continua despencando
    if (j.noChao) tocar('morte', { fade: 0.15 }); else tocar('queda', { fade: 0.3 });
    j.aterrissou = false;
  } else if (j.cambalhota >= 0) {
    // perto do fim a queda normal já entra por baixo da pose da cambalhota, que vai sumindo
    if (j.cambalhota > 0.75 && !j.noChao) tocar('queda', { fade: 0.2 });
  } else if (!j.noChao) {
    const subindo = animAtual === 'puloInicio' && j.vel.y > 1;
    if (!subindo && j.tempoNoAr > 0.1) tocar('queda', { fade: 0.3 });
  } else if (j.golpe) {
    // cada golpe recomeça do início (o mesmo soco de novo mistura com o anterior)
    if (j.golpe.novo) { j.golpe.novo = false; tocar(j.golpe.nome, { fade: 0.12, vel: GOLPES[j.golpe.nome].vel, reiniciar: true }); }
  } else if (j.pegando) {
    // a pose de pegar (combate.aplicarPoses) vai por cima da pose parada
    tocar('parada', { fade: 0.2 });
  } else if (j.defendendo) {
    tocar('guarda', { fade: 0.15, vel: v > 0.3 ? 1.3 : 1 });
  } else {
    if (j.aterrissou) {
      j.aterrissou = false;
      // pousos pequenos (degrau, rampa) não interrompem a corrida
      if (j.velQueda > 6) { tocar('aterrissar', { fade: 0.06, inicio: 0.05, vel: 1.6 }); tempoAterrissar = 0.35; }
    }
    tempoAterrissar -= dt;
    // a animação de aterrissar só segura a personagem parada; se ela já está andando, corta logo
    const aterrissando = tempoAterrissar > 0 && !(v > 0.5 && tempoAterrissar < 0.25);
    if (aterrissando) { /* mantém */ }
    else if (viradaNoLugar) tocar('andar', { vel: 0.9, fade: 0.15 });
    else if (v < 0.4) tocar('parada', { fade: 0.35 });
    // velocidade de reprodução = velocidade real / velocidade natural do clipe (pés não escorregam)
    else if (v < 2) tocar('andar', { vel: THREE.MathUtils.clamp(v / velAndar, 0.6, 2.2), fade: 0.25 });
    // (até 2,6×: na corrida com Shift, 8 m/s, os pés acompanham o chão em vez de deslizar)
    else tocar('correr', { vel: THREE.MathUtils.clamp(v / velCorrer, 0.8, 2.6), fade: 0.25 });
  }
  // os ossos que a postura e os gestos giram por cima voltam ao repouso antes da animação: os que o
  // clipe atual não anima (a animação parada não mexe na coluna) acumulariam o giro de cada quadro
  for (const osso of ossosPorCima()) osso.quaternion.copy(personagem.rig.ligacao.get(osso.name).q);
  personagem.mixer.update(dt);
  // impulso com as pernas, grupado no ar ("bola") e abertura para cair (por cima da animação)
  aplicarCambalhota(personagem.rig, j.cambalhota);
  // planando: braços abertos para cima segurando o ar, corpo arqueado, pernas soltas balançando
  // (por cima da animação de queda, que continua rodando por baixo)
  pesoPlanar += ((j.planando ? 1 : 0) - pesoPlanar) * Math.min(1, dt * 6);
  if (pesoPlanar > 0.01) {
    const s = Math.sin(tempoCena * 3.1);
    aplicarPose(personagem.rig, {
      bacia: 0, quadril: -0.2 + s * 0.12, joelho: 0.35 - s * 0.15, pe: 0.3, coluna: -0.18,
      braco: 2.5 + s * 0.08, cotovelo: 0.2, cabeca: -0.15,
    }, pesoPlanar * 0.85);
    corpo.rotation.z = Math.sin(tempoCena * 1.7) * 0.07 * pesoPlanar;
  } else corpo.rotation.z = 0;
  // agachar e alcançar o objeto do chão
  combate?.aplicarPoses();
  // inclinação do tronco ao acelerar e nas curvas, e a cabeça olhando o que está perto
  posturaViva(dt, v);
  // pés apoiados no chão em rampas (desligado no ar, na cambalhota e agachada pegando algo)
  const apoiada = j.noChao && j.cambalhota < 0 && !j.morta && !j.pegando;
  pesoPes += ((apoiada ? 1 : 0) - pesoPes) * Math.min(1, dt * 10);
  assentarPes(personagem, mapa.malha, pesoPes);
  // atingida: o corpo recua um instante (por cima da animação)
  const recuo = Math.min(1, (j.machucado || 0) / 0.45);
  if (recuo > 0) corpo.rotation.x -= 0.35 * Math.sin(recuo * Math.PI);
  // cabelo solto: balança por cima de tudo o que mexeu no corpo neste quadro
  personagem.raiz.updateMatrixWorld(true);
  personagem.cabelo.atualizar(dt);
  // afundou no mar: some sob a espuma; logo depois de atingida, pisca (invulnerável)
  const piscando = (combate?.invulneravel ?? 0) > 0.4 && Math.floor(tempoCena * 14) % 2 === 0;
  personagem.malha.visible = !(j.noVazio && agua && j.pos.y < agua.nivel - 0.6) && !piscando && camera3p.distAtual > DIST_ESCONDE_BONECA;
  personagem.ajustarDetalhe(camera.position.distanceTo(j.pos));
}
let pesoPes = 0, pesoPlanar = 0;
let _ossosPorCima = null;
function ossosPorCima() {
  if (_ossosPorCima) return _ossosPorCima;
  const { ossos, papeis: P } = personagem.rig;
  _ossosPorCima = [...P.coluna, P.pescoco, P.cabeca, P.bracoL, P.bracoR].map(n => ossos[n]).filter(Boolean);
  return _ossosPorCima;
}

// ---------- Postura viva (por cima de qualquer animação) ----------
// - tronco: inclina para a frente ao acelerar, para trás ao frear e para dentro das curvas (a coluna
//   gira em três partes; os pés não saem do lugar)
// - cabeça: compensa parte da inclinação e vira, suave e com limite, para o que está perto e importa
//   (fragmento, carta, âncora, Retalho), como quem presta atenção no mundo
 const postura = { vAnt: 0, acel: 0, yawAnt: null, giro: 0, frente: 0, lado: 0, olharYaw: 0, olharPitch: 0 };
const _eixo = new THREE.Vector3(), _qPai = new THREE.Quaternion(), _qGiro = new THREE.Quaternion(), _dirOlhar = new THREE.Vector3(), _posCabeca = new THREE.Vector3();
function girarOssoMundo(osso, eixoMundo, ang) {
  if (!osso || Math.abs(ang) < 1e-5) return;
  osso.parent.getWorldQuaternion(_qPai).invert();
  _eixo.copy(eixoMundo).applyQuaternion(_qPai).normalize();
  osso.quaternion.premultiply(_qGiro.setFromAxisAngle(_eixo, ang));
  osso.updateMatrixWorld(true);
}
function alvoDoOlhar() {
  const j = jogador.pos; let melhor = null, dMelhor = Infinity;
  const considerar = (p, alcance, peso = 1) => { const d = p.distanceTo(j) / peso; if (d < alcance && d < dMelhor) { dMelhor = d; melhor = p; } };
  for (const e of inimigos?.lista ?? []) if (e.ativo) considerar(_posCabeca.copy(e.pos).setY(e.pos.y + 0.5).clone(), 9, 1.4);
  for (const f of campanha?.fragmentos ?? []) if (!f.pega) considerar(f.grupo.position, 6);
  for (const a of mundo?.ancoras ?? []) if (!a.restaurada) considerar(a.pos.clone().setY(a.pos.y + 2.5), 10);
  return melhor;
}
// Gestos de quem espera parada (por cima da animação parada): depois de uns segundos sem se mexer,
// de tempos em tempos Brisa olha em volta, troca o peso de perna ou se espreguiça. Qualquer
// movimento corta o gesto na hora (o peso cai rápido).
const GESTOS = { olhar: 3.2, peso: 2.8, espreguicar: 2.6 };
const ocioso = { parada: 0, espera: 6, gesto: null, t: 0, peso: 0, anterior: null, sinal: null };
const _mao = new THREE.Vector3();
function gestoOcioso(dt, v, livre, frente, lateral) {
  const rig = personagem.rig, P = rig.papeis;
  const parada = livre && v < 0.15 && !jogador.planando;
  ocioso.parada = parada ? ocioso.parada + dt : 0;
  if (!parada) ocioso.gesto = null;
  if (parada && !ocioso.gesto && ocioso.parada > 5) {
    ocioso.espera -= dt;
    if (ocioso.espera <= 0) {
      const opcoes = Object.keys(GESTOS).filter(g => g !== ocioso.anterior);
      ocioso.gesto = ocioso.anterior = opcoes[Math.floor(Math.random() * opcoes.length)];
      ocioso.t = 0; ocioso.espera = 6 + Math.random() * 5;
    }
  }
  if (ocioso.gesto) { ocioso.t += dt; if (ocioso.t > GESTOS[ocioso.gesto]) ocioso.gesto = null; }
  const T = ocioso.gesto ? GESTOS[ocioso.gesto] : 1;
  const env = ocioso.gesto ? THREE.MathUtils.smoothstep(ocioso.t, 0, 0.6) * (1 - THREE.MathUtils.smoothstep(ocioso.t, T - 0.6, T)) : 0;
  ocioso.peso += (env - ocioso.peso) * Math.min(1, dt * (ocioso.gesto ? 8 : 6));
  const w = ocioso.peso;
  if (w < 0.01) return;
  const fase = ocioso.t / T, cima = new THREE.Vector3(0, 1, 0);
  const coluna = P.coluna.map(n => rig.ossos[n]);
  if (ocioso.anterior === 'olhar') {
    // olha para um lado, depois para o outro
    const a = Math.sin(fase * Math.PI * 2) * 0.75 * w;
    girarOssoMundo(rig.ossos[P.pescoco], cima, a * 0.4);
    girarOssoMundo(rig.ossos[P.cabeca], cima, a * 0.6);
    for (const o of coluna) girarOssoMundo(o, cima, a * 0.15 / coluna.length);
  } else if (ocioso.anterior === 'peso') {
    // joga o peso numa perna: o tronco tomba um pouco e a cabeça compensa
    const a = Math.sin(fase * Math.PI) * 0.12 * w;
    for (const o of coluna) girarOssoMundo(o, frente, a / coluna.length);
    girarOssoMundo(rig.ossos[P.cabeca], frente, -a * 0.6);
  } else {
    // espreguiça: braços sobem pelos lados, o peito abre para trás e a cabeça olha para cima
    if (!ocioso.sinal) {
      // para que lado cada braço sobe (depende do esqueleto): o que deixa a mão mais alta
      ocioso.sinal = {};
      for (const L of ['L', 'R']) {
        const braco = rig.ossos[P[`braco${L}`]], mao = rig.ossos[P[`mao${L}`]], q0 = braco.quaternion.clone();
        girarOssoMundo(braco, frente, 0.5); const yMais = mao.getWorldPosition(_mao).y;
        braco.quaternion.copy(q0); braco.updateMatrixWorld(true);
        girarOssoMundo(braco, frente, -0.5); const yMenos = mao.getWorldPosition(_mao).y;
        braco.quaternion.copy(q0); braco.updateMatrixWorld(true);
        ocioso.sinal[L] = yMais > yMenos ? 1 : -1;
      }
    }
    const a = Math.sin(Math.min(1, fase * 1.6) * Math.PI * 0.5) * (1 - THREE.MathUtils.smoothstep(fase, 0.7, 1)) * w;
    for (const o of coluna) girarOssoMundo(o, lateral, -0.18 * a / coluna.length);
    for (const L of ['L', 'R']) girarOssoMundo(rig.ossos[P[`braco${L}`]], frente, ocioso.sinal[L] * 2.5 * a);
    girarOssoMundo(rig.ossos[P.cabeca], lateral, 0.25 * a);
  }
}

function posturaViva(dt, v) {
  const j = jogador, rig = personagem.rig, { raiz } = personagem;
  if (!rig || dt <= 0) return;
  const livre = j.noChao && !j.morta && !j.golpe && !j.pegando && j.cambalhota < 0 && !j.defendendo;
  // aceleração e giro (suavizados)
  postura.acel += ((v - postura.vAnt) / dt - postura.acel) * Math.min(1, dt * 6); postura.vAnt = v;
  const yaw = raiz.rotation.y;
  if (postura.yawAnt !== null) { let d = yaw - postura.yawAnt; d = Math.atan2(Math.sin(d), Math.cos(d)); postura.giro += (d / dt - postura.giro) * Math.min(1, dt * 8); }
  postura.yawAnt = yaw;
  const alvoFrente = livre ? THREE.MathUtils.clamp(postura.acel * 0.018 + v * 0.006, -0.14, 0.2) : 0;
  const alvoLado = livre ? THREE.MathUtils.clamp(-postura.giro * v * 0.02, -0.2, 0.2) : 0;
  postura.frente += (alvoFrente - postura.frente) * Math.min(1, dt * 5);
  postura.lado += (alvoLado - postura.lado) * Math.min(1, dt * 5);
  raiz.updateMatrixWorld(true);
  const frente = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)), lateral = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
  const coluna = rig.papeis.coluna.map(n => rig.ossos[n]);
  for (const o of coluna) { girarOssoMundo(o, lateral, postura.frente / coluna.length); girarOssoMundo(o, frente, postura.lado / coluna.length); }
  gestoOcioso(dt, v, livre, frente, lateral);
  // cabeça: devolve metade da inclinação e olha o alvo
  const cabeca = rig.ossos[rig.papeis.cabeca];
  if (!cabeca) return;
  girarOssoMundo(cabeca, lateral, -postura.frente * 0.5);
  let alvoYaw = 0, alvoPitch = 0;
  const alvo = livre || j.noChao ? alvoDoOlhar() : null;
  if (alvo) {
    cabeca.getWorldPosition(_posCabeca);
    _dirOlhar.subVectors(alvo, _posCabeca);
    const local = Math.atan2(_dirOlhar.x, _dirOlhar.z) - yaw;
    alvoYaw = THREE.MathUtils.clamp(Math.atan2(Math.sin(local), Math.cos(local)), -0.9, 0.9);
    alvoPitch = THREE.MathUtils.clamp(Math.atan2(_dirOlhar.y, Math.hypot(_dirOlhar.x, _dirOlhar.z)), -0.35, 0.35);
    if (Math.abs(Math.atan2(Math.sin(local), Math.cos(local))) > 1.9) alvoYaw = alvoPitch = 0; // atrás dela: não torce o pescoço
  }
  postura.olharYaw += (alvoYaw - postura.olharYaw) * Math.min(1, dt * 3);
  postura.olharPitch += (alvoPitch - postura.olharPitch) * Math.min(1, dt * 3);
  girarOssoMundo(rig.ossos[rig.papeis.pescoco], new THREE.Vector3(0, 1, 0), postura.olharYaw * 0.4);
  girarOssoMundo(cabeca, new THREE.Vector3(0, 1, 0), postura.olharYaw * 0.6);
  girarOssoMundo(cabeca, lateral, -postura.olharPitch * 0.7);
}

// ---------- Câmera em terceira pessoa ----------
const rcCamera = new THREE.Raycaster(); rcCamera.firstHitOnly = true; rcCamera.layers.enableAll();
const dirCamera = new THREE.Vector3(), alvoCamera = new THREE.Vector3();
const _ladoCam = new THREE.Vector3(), _cimaCam = new THREE.Vector3(), _origemCam = new THREE.Vector3();
const CANTOS_CAMERA = [[0, 0], [1, 1], [-1, 1], [1, -1], [-1, -1]];
// encostada numa parede com a câmera do lado dela, o obstáculo fica a ~35 cm: com o mínimo antigo
// (0,8 m) a câmera parava dentro da parede. Agora ela chega até 0,25 m sem entrar em nada; antes
// disso (obstáculo a menos de DIST_SUBIR_CAMERA) ela sobe por cima da Brisa. A boneca só é
// escondida se mesmo assim a câmera ficar dentro dela (antes sumia já a 0,55 m: andando rente a
// muros e árvores a personagem desaparecia)
const DIST_MIN_CAMERA = 0.25, DIST_ESCONDE_BONECA = 0.3, DIST_SUBIR_CAMERA = 1.6;
const SUBIDAS_CAMERA = [0.35, 0.7, 1.0];
const _dirTeste = new THREE.Vector3();
function distLivre(pitch) {
  const cp = Math.cos(pitch);
  _dirTeste.set(Math.sin(camera3p.yaw) * cp, Math.sin(pitch), Math.cos(camera3p.yaw) * cp);
  rcCamera.set(camera3p.alvo, _dirTeste); rcCamera.far = camera3p.dist + 0.3;
  const h = rcCamera.intersectObject(mapa.malha)[0];
  return h ? h.distance - 0.3 : camera3p.dist;
}
function atualizarCamera(dt) {
  const giro = (algumaTecla(T.camDir) ? 1 : 0) - (algumaTecla(T.camEsq) ? 1 : 0);
  camera3p.yaw -= (giro * 2.2 + analogico.camX * 3) * dt;
  // morte: a câmera se afasta e circula devagar em volta dela
  if (jogador.morta && estado === 'jogando') {
    camera3p.yaw += dt * 0.35;
    camera3p.dist += (7 - camera3p.dist) * Math.min(1, dt * 0.8);
    camera3p.pitch += (0.55 - camera3p.pitch) * Math.min(1, dt * 0.8);
  }
  camera3p.pitch = THREE.MathUtils.clamp(camera3p.pitch + analogico.camY * 2 * dt, -0.5, 1.25);

  const alvo = camera3p.alvo;
  // caindo no mar, a câmera para acima da superfície e olha o respingo (não mergulha junto)
  const yAlvo = agua ? Math.max(jogador.pos.y + 1.3, agua.nivel + 2.2) : jogador.pos.y + 1.3;
  alvo.lerp(alvoCamera.set(jogador.pos.x, yAlvo, jogador.pos.z), Math.min(1, dt * 12));
  // parede ou tronco logo atrás dela: em vez de chegar a câmera até quase dentro da cabeça (e ter
  // de esconder a boneca), a câmera sobe por cima e olha de cima. "subida" é quanto o ângulo da
  // câmera sobe; vai e volta suave
  if (mapa) {
    let quer = 0;
    if (distLivre(camera3p.pitch) < DIST_SUBIR_CAMERA) {
      quer = SUBIDAS_CAMERA[SUBIDAS_CAMERA.length - 1];
      for (const sobe of SUBIDAS_CAMERA) if (distLivre(Math.min(1.4, camera3p.pitch + sobe)) >= DIST_SUBIR_CAMERA + 0.4) { quer = sobe; break; }
    }
    camera3p.subida = THREE.MathUtils.lerp(camera3p.subida ?? 0, quer, Math.min(1, dt * (quer > (camera3p.subida ?? 0) ? 6 : 2)));
  }
  const pitchFinal = Math.min(1.4, camera3p.pitch + (camera3p.subida ?? 0));
  const cp = Math.cos(pitchFinal);
  dirCamera.set(Math.sin(camera3p.yaw) * cp, Math.sin(pitchFinal), Math.cos(camera3p.yaw) * cp);

  // não deixa a câmera entrar nos penhascos: aproxima até o primeiro obstáculo. Um raio só (o do
  // meio) deixava a borda da imagem atravessar paredes e encostas ao lado da câmera (meia tela
  // dentro da rocha): agora são cinco, o do meio e quatro deslocados para os cantos da imagem perto
  // da câmera, e vale o mais curto
  let dist = camera3p.dist;
  if (mapa) {
    const lado = _ladoCam.crossVectors(dirCamera, camera.up).normalize(), cima = _cimaCam.crossVectors(lado, dirCamera).normalize();
    for (const [sx, sy] of CANTOS_CAMERA) {
      _origemCam.copy(alvo).addScaledVector(lado, sx * 0.22).addScaledVector(cima, sy * 0.14);
      rcCamera.set(_origemCam, dirCamera); rcCamera.far = dist + 0.3;
      const h = rcCamera.intersectObject(mapa.malha)[0];
      // (um raio de canto que nasce colado numa parede ao lado dela bate logo de cara: esse não
      // conta, senão a câmera pularia para perto sempre que ela encostasse num muro)
      if (h && (sx === 0 || h.distance > 0.6)) dist = Math.min(dist, Math.max(DIST_MIN_CAMERA, h.distance - 0.3));
    }
  }
  camera3p.distAtual = dist < camera3p.distAtual ? dist : THREE.MathUtils.lerp(camera3p.distAtual, dist, Math.min(1, dt * 4));
  camera.position.copy(alvo).addScaledVector(dirCamera, camera3p.distAtual);
  if (agua && camera.position.y < agua.nivel + 0.8) camera.position.y = agua.nivel + 0.8;
  camera.lookAt(alvo);
  // tremor da ilha afundando
  const tremor = campanha?.tremor ?? 0;
  if (tremor > 0) camera.position.add(new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(0.22 * tremor));
  // impactos: tranco curto que some rápido, e a câmera desce junto com o pouso e volta
  if (impacto.tremor > 0.01) camera.position.add(new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(0.16 * impacto.tremor * (config.tremor ? 1 : 0)));
  camera.position.y -= impacto.mergulho;
  impacto.tremor *= Math.exp(-dt * 7);
  impacto.mergulho *= Math.exp(-dt * 6);
}

// ---------- Desempenho ----------
// resolução se ajusta sozinha dentro da faixa do nível gráfico
const medidor = { quadros: 0, tempo: 0, fps: 60 };
function medirDesempenho(dt) {
  medidor.quadros++; medidor.tempo += dt;
  if (medidor.tempo < 1) return;
  medidor.fps = medidor.quadros / medidor.tempo;
  medidor.quadros = medidor.tempo = 0;
  hudFps.textContent = `${Math.round(medidor.fps)} fps`;
  if (estado !== 'jogando' || document.hidden || pausado) { orcamento.lento = orcamento.folga = 0; return; }
  const min = pisoResolucao(), max = nivel.resolucao[1];
  let r = RESOLUCAO.atual;
  // meta: 45 fps no PC; no celular, 60 (a tela atualiza a 60 Hz ou mais e menos que isso se sente
  // no toque): abaixo da meta a resolução desce, com folga ela sobe
  const meta = nivel.metaFps ?? 45;
  // cada troca de resolução realoca a tela na GPU (um tranco de vários ms no celular): com o fps
  // oscilando perto da meta ela trocava todo segundo. Agora desce depois de 2 s lentos seguidos
  // (na hora se a queda é grande) e sobe só depois de 4 s seguidos com folga
  RESOLUCAO.lento = medidor.fps < meta ? (RESOLUCAO.lento ?? 0) + 1 : 0;
  RESOLUCAO.folga = medidor.fps > Math.max(58, meta + 1) ? (RESOLUCAO.folga ?? 0) + 1 : 0;
  if (RESOLUCAO.lento >= 2 || medidor.fps < meta * 0.75) { r -= 0.08; RESOLUCAO.lento = 0; }
  else if (RESOLUCAO.folga >= 4) { r += 0.04; RESOLUCAO.folga = 0; }
  r = THREE.MathUtils.clamp(r, min, max);
  if (Math.abs(r - RESOLUCAO.atual) > 0.01) { RESOLUCAO.atual = r; renderer.setPixelRatio(r); redimensionarPos(); }
  // mesmo na menor resolução o fps continua baixo por 3 s: um passo a menos no orçamento.
  // Folga longa devolve um passo (cada queda pede mais folga, para não ficar indo e voltando)
  const noPiso = RESOLUCAO.atual <= min + 0.01;
  orcamento.lento = noPiso && medidor.fps < meta - 5 ? orcamento.lento + 1 : 0;
  // (com vsync, 55–60 já é folga; uma queda curta só desconta, não zera a conta)
  orcamento.folga = medidor.fps > 54 ? orcamento.folga + 1 : Math.max(0, orcamento.folga - 2);
  if (orcamento.lento >= 3 && orcamento.passo < PASSOS_ORCAMENTO.length - 1) {
    orcamento.passo++; orcamento.quedas++; orcamento.lento = orcamento.folga = 0;
    aplicarOrcamento();
  } else if (orcamento.folga >= Math.min(30, 10 * orcamento.quedas) && orcamento.passo > 0) {
    orcamento.passo--; orcamento.folga = 0;
    aplicarOrcamento();
  }
}
function pisoResolucao() {
  const p = PASSOS_ORCAMENTO[orcamento.passo].piso;
  return p === null ? nivel.resolucao[0] : Math.min(nivel.resolucao[0], p);
}
function aplicarOrcamento() {
  const p = PASSOS_ORCAMENTO[orcamento.passo];
  altos?.definirCusto({ pos: nivel.posProcesso !== false, gtao: p.gtao, bloom: p.bloom, smaa: p.smaa, distGrama: p.grama });
  distancia.definirAlcance(nivel.alcanceObjetos * p.alcance);
  cena.fog.near = nivel.neblina[0] * p.longe * CONFIG.ambiente.nevoa; cena.fog.far = nivel.neblina[1] * p.longe * CONFIG.ambiente.nevoa;
  cena.userData.neblinaBase = [cena.fog.near, cena.fog.far];
  camera.far = nivel.distancia * p.longe; camera.updateProjectionMatrix();
  if (RESOLUCAO.atual < pisoResolucao()) { RESOLUCAO.atual = pisoResolucao(); renderer.setPixelRatio(RESOLUCAO.atual); redimensionarPos(); }
}

// ---------- Loop ----------
const relogio = new THREE.Clock();
let acumulado = 0, tempoCena = 0;
// sem placa de vídeo a CPU também desenha a tela: a física roda a 60 passos/s em vez de 120
// (no celular também: a CPU do aparelho fica para o desenho, e 60 passos/s já acompanham a tela)
const PASSO = hardware.perfil === 'semPlaca' || hardware.perfil === 'celular' ? 1 / 60 : 1 / 120;
renderer.setAnimationLoop(() => {
  const dtBruto = relogio.getDelta();
  medirDesempenho(dtBruto);
  const dtReal = Math.min(dtBruto, 0.05);
  lerGamepad();
  const parado = pausado || menuAberto;
  // golpe que acerta "pesa": o tempo quase para por um instante (hitstop)
  const dt = parado ? 0 : dtReal * ((combate?.hitstop ?? 0) > 0 ? 0.08 : 1);
  if (!parado) combate?.avancarHitstop(dtReal); // o hitstop conta em tempo real
  tempoCena += dt;
  const t = tempoCena;

  if (estado === 'jogando' && mapa) {
    acumulado += dt;
    while (acumulado >= PASSO) { passoFisica(PASSO); acumulado -= PASSO; }
      if (jogador.morta) { tempoMorte -= dt; if (tempoMorte <= 0) mostrarGameOver(); }
  }
  mundo?.atualizar(dt, t);
  mapa?.atualizarEnfeites?.(t, camera, Math.min(1, ceuJogo.estado.noite + ceuJogo.estado.por * 0.5));
  agua?.atualizar(dt, t, camera);
  nevoa?.atualizar(dt, t);
  modeloCachoeira?.atualizar(t);
  cachoeiras?.atualizar(t);
  if (estado === 'jogando' && campanha) campanha.atualizar(dt, t);
  combate?.atualizar(dt, t);

  animarPersonagem(dt);
  atualizarPoeira(dt);
  atualizarMancha();
  atualizarCamera(dtReal);
  // detalhe do mapa pela visão: costas no nível mais leve, o lado para onde a câmera vira já pronto
  if (mapa) atualizarLodPorVisao(mapa, camera, dtReal);
  distancia.atualizar(dtReal, camera);
  // o que o relevo esconde não é desenhado (setores de vegetação e blocos de terreno)
  camera.updateMatrixWorld();
  oclusao?.atualizar(camera);
  chuva.atualizar(dt, t, estado === 'jogando');
  ceuJogo.definirChuva(chuva.intensidade);
  ceuJogo.atualizar(estado === 'jogando' ? dt : 0, t);
  aplicarHora();
  altos?.atualizar(dt, t, jogador.pos);
  // a janela na folhagem acompanha o meio do corpo da Brisa
  particulas.atualizar(t, jogador.pos, ceuJogo.estado.noite, chuva.intensidade, !!altos?.ativo, renderer.getDrawingBufferSize(_tamTela).y);
  if (assarSombra) {
    assarSombra = false;
    renderer.shadowMap.needsUpdate = true;
    camera.layers.enable(CAMADA_SOMBRA);
    oclusao?.mostrarTudo(); // a sombra fixa é de tudo, não só do que está à vista agora
    desenhar();
    oclusao?.reaplicar();
    camera.layers.disable(CAMADA_SOMBRA);
  } else desenhar();
});

// ---------- Carregamento ----------
const progresso = { personagem: 0, mapa: 0 };
const mostrarProgresso = () => { barra.style.width = `${(progresso.personagem * 0.5 + progresso.mapa * 0.5) * 100}%`; };
atualizarMenu();
Promise.all([
  criarBoneca(renderer, nivel, e => { if (e.total) { progresso.personagem = e.loaded / e.total; mostrarProgresso(); } }),
  // a ilha é gerada por código (ilha.js); o mapa antigo do Meshy continua em ?mapa=antigo
  (new URLSearchParams(location.search).get('mapa') === 'antigo' ? carregarMapa : gerarIlha)(renderer, e => { if (e.total) { progresso.mapa = e.loaded / e.total; mostrarProgresso(); } }),
  // a cachoeira é decoração: se faltar, o jogo segue sem ela
  carregarCachoeira(renderer).catch(e => { console.warn('cachoeira indisponível:', e.message); return null; }),
])
  .then(async ([p, m, cach]) => {
    msg.textContent = 'Preparando o mapa…';
    personagem = p; mapa = m;
    if (p.velocidades.andar > 0.2) velAndar = p.velocidades.andar;
    if (p.velocidades.correr > 0.5) velCorrer = p.velocidades.correr;
    await aplicarQualidadeMapa(m, nivel);
    cena.add(m.grupo, m.malha);
    if (m.enfeites) cena.add(...m.enfeites); // vegetação e construções da ilha gerada
    terreno = analisarTerreno(m, { gravidade: FISICA.gravidade, quantidadeEstrelas: 22 });
    // primeiro mapa: oficina, âncoras, Coração do Fio, rochas flutuantes, correntes de vento…
    mundo = criarMundo({ cena, mapa: m, terreno });
    correntes = mundo.correntes;
    // o mar em volta da ilha (logo abaixo da borda dela)
    agua = criarAgua({ cena, mapa: m, renderer });
    // a praia de areia na beira do mar (com a rampa que desce da enseada)
    praia = criarPraia({ cena, agua, renderer, mapa: m });
    agua.definirPraia(praia.contorno);
    if (m.mar?.ilhas) agua.definirCosta(m.malha, m.mar.ilhas); // espuma no pé das falésias
    ceuJogo.definirMapa(m); // o sol atrás da ilha apaga os reflexos de lente
    { // (raio que cobre todas as ilhas, a partir do centro do mar)
      const b = m.geo.boundingBox, c = agua.centro;
      const raioIlhas = m.mar ? Math.max(Math.hypot(b.min.x - c.x, b.min.z - c.z), Math.hypot(b.max.x - c.x, b.max.z - c.z), Math.hypot(b.min.x - c.x, b.max.z - c.z), Math.hypot(b.max.x - c.x, b.min.z - c.z)) * 0.8 : null;
      nevoa = criarNevoa({ cena, agua, raioIlhas });
    }
    if (cach) {
      modeloCachoeira = cach;
      cachoeiras = posicionarCachoeiras({ cena, mapa: m, terreno, mundo, agua, nevoa, modelo: cach, praia });
    }
    inimigos = criarInimigos({ cena, mapa: m, posicoes: mundo.posicoesInimigos });
    campanha = criarCampanha({
      cena, mapa: m, mundo, inimigos, jogador,
      respawn: p => { respawn(p); jogador.seguro.copy(p); },
      comEscuro, aoTerminar: terminarCapitulo,
      aoSalvar: salvarProgresso, // progresso guardado no navegador (menu: Continuar)
      aoAtaque: e => combate?.aoSerAtacada(e), // investida de um Retalho que chegou nela
      casas: m.pontos?.casas, // cartas dos moradores nas casas da vila
    });
    altos = criarEfeitosAltos({ renderer, cena, camera, mapa: m, terreno });
    // colisão real de todos os objetos estáticos (somados à malha de colisão do terreno)
    incorporarSolidos(m, [...mundo.solidos(), ...(cachoeiras?.solidos ?? []), praia.malha, ...praia.enfeites.children]);
    // (depois da colisão, que precisa das peças separadas) conchas e pedras da praia: um lote por material
    fundirEstaticos(praia.enfeites);
    // objetos pequenos: desenhados só perto da câmera, sem contrariar a lógica (pego, quebrado…)
    for (const f of campanha.fragmentos) distancia.adicionar(f.grupo, 1, () => !f.pega);
    for (const c of mundo.correntes) distancia.adicionar(c.grupo, 5);
    for (const a of mundo.ancoras) for (const c of a.cristais) {
      distancia.adicionar(c.grupo, 2, () => !c.quebrado);
      distancia.adicionar(c.aura, 2, () => !c.quebrado);
    }
    for (const s of mundo.luzes.children) distancia.adicionar(s, 1);
    distancia.definirAlcance(nivel.alcanceObjetos);
    // socos, chute, pegar/bater com objetos e defesa
    combate = criarCombate({
      cena, mapa: m, mundo, terreno, inimigos, campanha, jogador, personagem: p,
      tremer: k => { impacto.tremor = Math.max(impacto.tremor, k); },
      morrer,
    });
    aplicarEfeitos();
    configurarSombra();
    oclusao = criarOclusao({ malha: m.malha });
    for (const o of [...(m.lods ?? []), ...(m.setores ?? [])]) oclusao.adicionar(o);

    // cópia separada do início do pulo, para a pose da cambalhota não brigar com o pulo normal
    p.acoes.cambalhota = p.mixer.clipAction(p.acoes.puloInicio.getClip().clone());
    for (const nome of ['puloInicio', 'aterrissar', 'cambalhota', 'morte', ...Object.keys(GOLPES)]) {
      p.acoes[nome].setLoop(THREE.LoopOnce, 1);
      p.acoes[nome].clampWhenFinished = true;
    }
    cena.add(p.raiz);
    jogador.seguro.copy(terreno.nascimento);
    respawn(terreno.nascimento);
    camera3p.yaw = Math.atan2(jogador.pos.x, jogador.pos.z);
    camera3p.alvo.copy(jogador.pos);
    tocar('parada');
      // compila os shaders e sobe todos os níveis de detalhe do mapa para a GPU antes de começar
    // (evita travadinhas na primeira vez que algo aparece ou quando a câmera vira)
    // compila TODOS os materiais, inclusive os que ainda estão escondidos (ponte de luz, chuva,
    // objetos longe, faíscas): o compile do three.js só olha o que está visível, e o resto
    // compilava no meio do jogo, com travadinha
    const escondidos = [], recortados = [];
    cena.traverse(o => {
      if (!o.visible) { escondidos.push(o); o.visible = true; }
      if (o.frustumCulled) { recortados.push(o); o.frustumCulled = false; } // inclusive fora da câmera
    });
    renderer.compile(cena, camera);
    // e um quadro de verdade pelo mesmo caminho do jogo (FXAA/pós-processamento desenham numa
    // textura intermediária: o shader de lá é outra variante da que vai direto para a tela)
    desenhar();
    for (const o of escondidos) o.visible = false;
    for (const o of recortados) o.frustumCulled = true;
    aquecerMapa(m, renderer, cena, camera);

    estado = 'menu';
    barra.parentElement.style.display = 'none';
    $('historia').innerHTML = INTRO.map(l => `<p>${l}</p>`).join('');
    msg.textContent = CHAMADA;
    const salvo = lerProgresso() || capituloSalvo();
    botao.textContent = salvo ? 'Novo jogo' : 'Começar';
    botao.className = salvo ? 'botao secundario' : 'botao principal';
    botao.style.display = 'block';
    if (salvo) { $('continuarJogo').style.display = 'block'; $('continuarJogo').focus({ focusVisible: false }); } else botao.focus({ focusVisible: false });
    window.__jogo = {
      jogador, personagem, camera, camera3p, mapa, terreno, correntes, renderer, cena, sol, medidor, altos, mundo, inimigos, campanha, agua, nevoa, cachoeiras, praia, ceu: ceuJogo, get combate() { return combate; },
      animacao: () => animAtual, estado: () => estado, nivel: () => nomeNivel, aplicarNivel, ocioso, get oclusao() { return oclusao; },
    };
    // veio do "Continuar" de outro capítulo: continua sem esperar outro clique
    if (new URLSearchParams(location.search).has('continuar') && lerProgresso()) continuarJogo();
  })
  .catch(err => {
    console.error(err);
    msg.textContent = 'Não foi possível carregar o jogo: ' + err.message;
  });
