import * as THREE from 'three';
import { criarBoneca, aplicarQualidadeBoneca } from './boneca.js';
import { aplicarCambalhota, aplicarPose } from './cambalhota.js';
import { carregarMapa, aplicarQualidadeMapa, atualizarLodPorVisao, aquecerMapa, CAMADA_SOMBRA } from './mapa.js';
import { gerarIlha } from './ilha.js';
import { criarChuva } from './chuva.js';
import { lerProgresso, salvarProgresso, apagarProgresso, lerConfig, salvarConfig } from './salvar.js';
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
import { INTRO, AVISOS, GAMEOVER } from './historia.js';
import { NIVEIS, nivelInicial, salvarNivel, detectarHardware, ajustarAoHardware } from './graficos.js';
import { criarDistancia } from './distancia.js';
import { fundirEstaticos } from './lotes.js';

// ---------- Configuração ----------
const FISICA = {
  gravidade: -32,
  // velocidades escolhidas junto com a cadência das animações de correr (ver velocidadeNatural)
  velocidade: 5.8,
  velocidadeDisparada: 8, // segurando Shift
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
// GPU fraca às vezes reinicia o driver no meio do jogo: avisa e recarrega quando ela volta
renderer.domElement.addEventListener('webglcontextlost', ev => {
  ev.preventDefault();
  const a = document.getElementById('aviso');
  if (a) { a.textContent = 'A placa de vídeo reiniciou… recarregando o jogo'; a.style.opacity = 1; }
});
renderer.domElement.addEventListener('webglcontextrestored', () => location.reload());
const RESOLUCAO = { atual: THREE.MathUtils.clamp(devicePixelRatio, ...nivel.resolucao) };
renderer.setPixelRatio(RESOLUCAO.atual);
renderer.setSize(innerWidth, innerHeight);
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
  Object.assign(sol.shadow.camera, { left: -raio, right: raio, top: raio, bottom: -raio, near: 1, far: raio * 3.2 });
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
  return new THREE.CanvasTexture(c);
})();
const mancha = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1), new THREE.MeshBasicMaterial({ map: manchaTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }));
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
  mancha.position.copy(h.point).addScaledVector(h.face.normal, 0.03);
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

// ---------- Menu de gráficos ----------
let menuAberto = false;
function abrirMenu(abrir = !menuAberto) {
  menuAberto = abrir;
  painel.style.display = abrir ? 'flex' : 'none';
  if (abrir) document.exitPointerLock?.();
  atualizarMenu();
}
function atualizarMenu() {
  for (const b of painel.querySelectorAll('[data-nivel]')) b.classList.toggle('ativo', b.dataset.nivel === nomeNivel);
  $('aviso-aa').style.display = renderer.getContextAttributes().antialias === nivel.antialias ? 'none' : 'block';
  $('perfil-pc').textContent = {
    semPlaca: 'Seu PC está desenhando sem placa de vídeo: os três modos foram ajustados para rodar leves.',
    fraco: 'Placa de vídeo integrada ou PC mais simples: os modos foram ajustados para não travar.',
    normal: 'Os três modos se ajustam sozinhos se o fps cair.',
  }[hardware.perfil];
}
for (const b of painel.querySelectorAll('[data-nivel]')) b.addEventListener('click', () => aplicarNivel(b.dataset.nivel));
$('fechar-graficos').addEventListener('click', () => abrirMenu(false));
$('abrir-graficos').addEventListener('click', () => abrirMenu(true));
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
const luzCeuBase = () => (!nivel.efeitos ? 1.55 : nivel.materialSimples ? 1.9 : 0.65);
function aplicarEfeitos() {
  renderer.shadowMap.type = nivel.sombraSuave ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
  // com o céu físico iluminando, a luz de céu simples fica mais fraca (senão tudo lava)
  // dia bem ensolarado: sol forte e céu claro preenchendo as sombras
  luzCeu.intensity = luzCeuBase();
  sol.intensity = nivel.efeitos ? 4.0 : 3.1;
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
  sol.intensity = (nivel.efeitos ? 4.0 : 3.1) * e.forcaLuz;
  luzCeu.color.copy(e.corCeuLuz); luzCeu.groundColor.copy(e.corChaoLuz);
  luzCeu.intensity = luzCeuBase() * e.forcaCeuLuz + chuva.relampago * 2.5; // relâmpago clareia tudo por um instante
  cena.fog.color.copy(e.neblina);
  // na chuva a neblina chega mais perto
  const fb = cena.userData.neblinaBase;
  if (fb) { cena.fog.near = fb[0] * (1 - 0.45 * chuva.intensidade); cena.fog.far = fb[1] * (1 - 0.4 * chuva.intensidade); }
  if (cena.background?.isColor) cena.background.copy(e.neblina);
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
  disparar: ['ShiftLeft', 'ShiftRight', 'GamepadDisparar'],
  camEsq: ['KeyZ'], camDir: ['KeyC'], // E é interagir
  defender: ['KeyQ', 'GamepadDefender', 'ToqueDefesa'], // segurar
};
// golpes: J/clique esquerdo = combo (ou bater com o objeto na mão), K/clique direito = chute, F = pegar/soltar
const TECLAS_COMBATE = { KeyJ: 'combo', KeyK: 'chute', KeyF: 'pegar' };
const camera3p = { yaw: 0, pitch: 0.35, dist: CAMERA.distancia, distAtual: CAMERA.distancia, alvo: new THREE.Vector3() };
const analogico = { x: 0, y: 0, camX: 0, camY: 0 }; // gamepad / toque

addEventListener('keydown', e => {
  if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
  if (e.code === 'KeyG' && !e.repeat) { abrirMenu(); return; }
  if (menuAberto) { if (e.code === 'Escape') abrirMenu(false); return; }
  if (estado === 'menu' && (e.code === 'Enter' || e.code === 'Space')) { reiniciar(); return; }
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
  } else girarCamera((e.clientX - t.x) * 1.6, (e.clientY - t.y) * 1.6);
  t.x = e.clientX; t.y = e.clientY;
});
for (const ev of ['pointerup', 'pointercancel']) canvas.addEventListener(ev, e => {
  const t = toques.get(e.pointerId);
  if (t?.esquerda) { analogico.x = analogico.y = 0; if (bastao) bastao.style.display = 'none'; }
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
let mundo = null, inimigos = null, campanha = null, combate = null;
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
  $('tentarDeNovo').focus();
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
    if (campanhaTerminada) { apagarProgresso(); location.reload(); return; }
  }
  const primeiraVez = estado === 'menu';
  estado = 'jogando';
  pausado = false;
  tela.style.display = 'none';
  // tira o foco do botão: senão o Espaço (pulo) "clicaria" nele de novo
  botao.blur();
  teclas.clear();
  if (primeiraVez) campanha.iniciar();
}
let campanhaTerminada = false, confirmandoNovo = false;
botao.addEventListener('click', reiniciar);
// Continuar: refaz o progresso salvo (fragmentos, âncoras, cartas…) e volta ao último ponto seguro
function continuarJogo() {
  const s = lerProgresso();
  if (!s || estado !== 'menu') return;
  campanha.importar(s);
  const p = new THREE.Vector3().fromArray(s.checkpoint ?? terreno.nascimento.toArray());
  respawn(p); jogador.seguro.copy(p);
  estado = 'jogando'; pausado = false;
  tela.style.display = 'none';
  $('continuarJogo').blur(); teclas.clear();
  campanha.iniciar({ continuando: true });
}
$('continuarJogo').addEventListener('click', continuarJogo);
$('jogarCap1').addEventListener('click', () => { fecharPaineis(); lerProgresso() ? continuarJogo() : reiniciar(); });

// ---------- Painéis do menu: capítulos, configurações, créditos ----------
const paineis = $('paineis');
function abrirPainel(nome) {
  paineis.classList.add('aberto');
  for (const s of paineis.querySelectorAll('section')) s.classList.toggle('visivel', s.dataset.painel === nome);
  paineis.querySelector('section.visivel button, section.visivel input')?.focus();
}
function fecharPaineis() { paineis.classList.remove('aberto'); }
for (const b of document.querySelectorAll('[data-painel]')) if (b.tagName === 'BUTTON') b.addEventListener('click', () => abrirPainel(b.dataset.painel));
for (const b of document.querySelectorAll('.fechar-painel')) b.addEventListener('click', fecharPaineis);
paineis.addEventListener('click', e => { if (e.target === paineis) fecharPaineis(); });
addEventListener('keydown', e => { if (e.code === 'Escape' && paineis.classList.contains('aberto')) fecharPaineis(); });

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
$('continuar').addEventListener('click', () => { tela.style.display = 'none'; estado = 'jogando'; $('continuar').style.display = 'none'; $('continuar').blur(); teclas.clear(); });

function terminarCapitulo(r) {
  campanhaTerminada = true;
  estado = 'fim';
  document.exitPointerLock?.();
  tela.style.display = 'flex';
  // "Capítulo 1 — A Oficina Esquecida": o número vai no selo, o nome no título
  const [numero, nome] = r.capitulo.split(' — ');
  tela.querySelector('.selo').textContent = `${numero} concluído`;
  tela.querySelector('h1').textContent = nome ?? r.capitulo;
  tela.querySelector('.sub').textContent = 'O Coração da Ilha voltou a bater e o farol acendeu sozinho. Quem chamou na névoa?';
  $('historia').style.display = 'none';
  // resumo da partida em números
  msg.innerHTML = `<span class="resumo">
      <span><b>${r.fragmentos}/${r.total}</b>Fragmentos</span><span><b>${r.memorias}</b>Memórias</span>
      <span><b>${r.purificados}</b>Purificados</span>
    </span><em>Continua no Recife das Vozes…</em>`;
  botao.textContent = 'Jogar de novo';
  $('continuar').style.display = 'inline-block';
}

function alternarPausa() {
  if (estado !== 'jogando') return;
  pausado = !pausado;
  const aviso = $('aviso'); aviso.textContent = pausado ? 'Pausado · P para continuar' : ''; aviso.style.opacity = pausado ? 1 : 0;
  pedidoPulo = false;
  if (pausado) document.exitPointerLock?.();
}

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
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
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
// Brisa e os Retalhos não se atravessam: cada um empurra o outro (ela é mais pesada que eles)
function empurrarInimigos() {
  if (!inimigos) return;
  const j = jogador;
  for (const e of inimigos.lista) {
    if (!e.ativo) continue;
    const dx = j.pos.x - e.pos.x, dz = j.pos.z - e.pos.z, dy = j.pos.y - e.pos.y;
    const d = Math.hypot(dx, dz), min = RAIO + 0.42;
    if (d >= min || dy > 0.9 || dy < -1.5) continue;
    const nx = d > 1e-4 ? dx / d : 1, nz = d > 1e-4 ? dz / d : 0, sobra = min - d;
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
  const vmax = j.defendendo ? FISICA.velocidade * 0.35 : j.planando ? FISICA.velocidadePlanando : j.disparando ? FISICA.velocidadeDisparada : FISICA.velocidade;

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
  if (j.noChao && col.normal.y > 0.85 && j.tempoSeguro > 0.5) { j.seguro.copy(j.pos); j.tempoSeguro = 0; }
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
  const superficie = agua ? agua.nivel : terreno.limiteQueda;
  if (j.pos.y < superficie && !j.noVazio) {
    j.noVazio = true;
    j.tempoAfundar = 0;
    if (agua) {
      const forca = THREE.MathUtils.clamp(-j.vel.y / 30, 0.35, 1.3);
      agua.respingo(j.pos.x, j.pos.z, forca);
      impacto.tremor = Math.max(impacto.tremor, 0.35 + forca * 0.5);
      j.tempoAfundar = 0.9;
    }
    cairDaIlha();
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
  raiz.rotation.y += d * Math.min(1, dt * 12);

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
    else if (v < 0.4) tocar('parada', { fade: 0.35 });
    // velocidade de reprodução = velocidade real / velocidade natural do clipe (pés não escorregam)
    else if (v < 2) tocar('andar', { vel: THREE.MathUtils.clamp(v / velAndar, 0.6, 2.2), fade: 0.25 });
    // (até 2,6×: na corrida com Shift, 8 m/s, os pés acompanham o chão em vez de deslizar)
    else tocar('correr', { vel: THREE.MathUtils.clamp(v / velCorrer, 0.8, 2.6), fade: 0.25 });
  }
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
  // afundou no mar: some sob a espuma; logo depois de atingida, pisca (invulnerável)
  const piscando = (combate?.invulneravel ?? 0) > 0.4 && Math.floor(tempoCena * 14) % 2 === 0;
  personagem.malha.visible = !(j.noVazio && agua && j.pos.y < agua.nivel - 0.6) && !piscando;
}
let pesoPes = 0, pesoPlanar = 0;

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
  const cp = Math.cos(camera3p.pitch);
  dirCamera.set(Math.sin(camera3p.yaw) * cp, Math.sin(camera3p.pitch), Math.cos(camera3p.yaw) * cp);

  // não deixa a câmera entrar nos penhascos: aproxima até o primeiro obstáculo
  let dist = camera3p.dist;
  if (mapa) {
    rcCamera.set(alvo, dirCamera); rcCamera.far = dist + 0.3;
    const h = rcCamera.intersectObject(mapa.malha)[0];
    if (h) dist = Math.max(0.8, h.distance - 0.3);
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
  if (medidor.fps < 45) r -= 0.08; else if (medidor.fps > 58) r += 0.04;
  r = THREE.MathUtils.clamp(r, min, max);
  if (Math.abs(r - RESOLUCAO.atual) > 0.01) { RESOLUCAO.atual = r; renderer.setPixelRatio(r); redimensionarPos(); }
  // mesmo na menor resolução o fps continua baixo por 3 s: um passo a menos no orçamento.
  // Folga longa devolve um passo (cada queda pede mais folga, para não ficar indo e voltando)
  const noPiso = RESOLUCAO.atual <= min + 0.01;
  orcamento.lento = noPiso && medidor.fps < 40 ? orcamento.lento + 1 : 0;
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
  cena.fog.near = nivel.neblina[0] * p.longe; cena.fog.far = nivel.neblina[1] * p.longe;
  cena.userData.neblinaBase = [cena.fog.near, cena.fog.far];
  camera.far = nivel.distancia * p.longe; camera.updateProjectionMatrix();
  if (RESOLUCAO.atual < pisoResolucao()) { RESOLUCAO.atual = pisoResolucao(); renderer.setPixelRatio(RESOLUCAO.atual); redimensionarPos(); }
}

// ---------- Loop ----------
const relogio = new THREE.Clock();
let acumulado = 0, tempoCena = 0;
// sem placa de vídeo a CPU também desenha a tela: a física roda a 60 passos/s em vez de 120
const PASSO = hardware.perfil === 'semPlaca' ? 1 / 60 : 1 / 120;
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
  chuva.atualizar(dt, t, estado === 'jogando');
  ceuJogo.definirChuva(chuva.intensidade);
  ceuJogo.atualizar(estado === 'jogando' ? dt : 0, t);
  aplicarHora();
  altos?.atualizar(dt, t, jogador.pos);
  if (assarSombra) {
    assarSombra = false;
    renderer.shadowMap.needsUpdate = true;
    camera.layers.enable(CAMADA_SOMBRA);
    desenhar();
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
    // mar lá embaixo, ao redor da ilha
    agua = criarAgua({ cena, mapa: m, renderer });
    // praia de areia lá embaixo, no mar, sob a ilha
    praia = criarPraia({ cena, agua, renderer });
    agua.definirPraia(praia.contorno);
    ceuJogo.definirMapa(m); // o sol atrás da ilha apaga os reflexos de lente
    nevoa = criarNevoa({ cena, agua });
    if (cach) {
      modeloCachoeira = cach;
      cachoeiras = posicionarCachoeiras({ cena, mapa: m, terreno, mundo, agua, nevoa, modelo: cach, praia });
    }
    inimigos = criarInimigos({ cena, mapa: m, posicoes: mundo.posicoesInimigos });
    campanha = criarCampanha({
      cena, mundo, inimigos, jogador,
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
    renderer.compile(cena, camera);
    aquecerMapa(m, renderer, cena, camera);

    estado = 'menu';
    barra.parentElement.style.display = 'none';
    $('historia').innerHTML = INTRO.map(l => `<p>${l}</p>`).join('');
    msg.textContent = 'Ajude Brisa a reacender as Âncoras de Maré e o Coração da Ilha antes que a vila caia no mar.';
    const salvo = lerProgresso();
    botao.textContent = salvo ? 'Novo jogo' : 'Começar';
    botao.className = salvo ? 'botao secundario' : 'botao principal';
    botao.style.display = 'block';
    if (salvo) { $('continuarJogo').style.display = 'block'; $('continuarJogo').focus(); } else botao.focus();
    window.__jogo = {
      jogador, personagem, camera, camera3p, mapa, terreno, correntes, renderer, cena, sol, medidor, altos, mundo, inimigos, campanha, agua, nevoa, cachoeiras, praia, ceu: ceuJogo, get combate() { return combate; },
      animacao: () => animAtual, estado: () => estado, nivel: () => nomeNivel, aplicarNivel,
    };
  })
  .catch(err => {
    console.error(err);
    msg.textContent = 'Não foi possível carregar o jogo: ' + err.message;
  });
