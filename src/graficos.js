// Níveis gráficos. "low" é pensado para GPUs integradas (Intel UHD e afins).
export const NIVEIS = {
  low: {
    nome: 'Low',
    // faixa da escala de resolução (ajustada sozinha pelo fps). Abaixo de ~0,75 tudo serrilha
    // e borra demais, então o mínimo fica aí mesmo no Low
    resolucao: [0.75, 1],
    antialias: false,
    suavizacao: 'fxaa',          // antisserrilhado por pós-processo: bem mais barato que MSAA em GPU integrada
    sombra: 0,                   // sem sombra do mapa
    materialSimples: true,       // Lambert: bem mais barato por pixel que o material PBR
    texturaMapa: { cor: 'mapa_cor_1024.jpg' },
    texturaBoneca: { cor: 'boneca_nova_cor_1024.jpg' },
    // distância (m) em que cada bloco troca para o nível de detalhe seguinte. Perto da personagem
    // sempre a malha completa: é a mesma da colisão, então o chão visto é o chão em que ela pisa.
    // (os blocos têm 20 m: a 24 m do centro de um bloco a personagem já está fora dele)
    lod: [0, 24, 45],
    lodInicial: 0,
    distancia: 140, neblina: [40, 130],
    alcanceObjetos: 60,          // fragmentos, correntes, cristais e luzinhas só são desenhados até aqui (m)
  },
  medium: {
    nome: 'Medium',
    resolucao: [0.85, 1.25],     // acima de 1 = supersampling quando a GPU tem folga
    antialias: true,
    suavizacao: 'msaa',          // MSAA do próprio contexto (bordas dos modelos)
    sombraSuave: true,           // borda da sombra filtrada (sem "escadinha")
    sombra: 2048,
    materialSimples: false,
    texturaMapa: { cor: 'mapa_cor_2048.jpg', normal: 'mapa_normal_1024.png', rugosidade: 'mapa_rugosidade_1024.jpg' },
    texturaBoneca: { cor: 'boneca_nova_cor_2048.jpg', normal: 'boneca_nova_normal_1024.png', rugosidade: 'boneca_nova_rugosidade_1024.jpg' },
    lod: [0, 35, 70],
    lodInicial: 0,
    distancia: 320, neblina: [80, 240],
    alcanceObjetos: 95,
  },
  high: {
    nome: 'High',
    resolucao: [1, 2],           // nunca abaixo da nativa; com folga renderiza até 2× e reduz (supersampling)
    antialias: true,
    suavizacao: 'msaa+smaa',     // MSAA 4× no pós-processamento + SMAA no fim (pega também brilhos e texturas)
    // céu físico com luz de ambiente, oclusão de ambiente, bloom, tone mapping, grama, nuvens, pólen
    efeitos: true,
    sombraSuave: true,
    sombra: 4096,
    materialSimples: false,
    texturaMapa: { cor: 'mapa_cor.png', normal: 'mapa_normal.png', rugosidade: 'mapa_rugosidade.png', metal: 'mapa_metal.png' },
    texturaBoneca: { cor: 'boneca_nova_cor_4096.jpg', normal: 'boneca_nova_normal_2048.png', rugosidade: 'boneca_nova_rugosidade_1024.jpg' },
    lod: [0, 55, 110],
    lodInicial: 0,
    distancia: 600, neblina: [110, 380],
    alcanceObjetos: 140,
  },
};

const CHAVE = 'jogo.graficos';

// ---------- Hardware ----------
// perfil: 'semPlaca' (o navegador desenha pela CPU: SwiftShader, llvmpipe, "Microsoft Basic
// Render Driver"), 'celular' (Android, iPhone, iPad: mira 60 fps), 'fraco' (GPU integrada, pouca
// memória ou poucos núcleos) ou 'normal'.
// semWebGL: o navegador não abre WebGL 2 (o jogo não tem como rodar).
let hardware = null;
export function detectarHardware() {
  if (hardware) return hardware;
  const ctx = opcoes => document.createElement('canvas').getContext('webgl2', opcoes);
  let gpu = '', software = false, semWebGL = false;
  try {
    // "failIfMajorPerformanceCaveat" recusa o contexto quando não há aceleração de verdade
    let gl = ctx({ failIfMajorPerformanceCaveat: true });
    if (!gl) { gl = ctx(); if (gl) software = true; else semWebGL = true; }
    if (gl) {
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      gpu = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
      gl.getExtension('WEBGL_lose_context')?.loseContext(); // libera o contexto de teste
    }
  } catch { semWebGL = true; }
  if (/swiftshader|llvmpipe|softpipe|basic render|software|warp/i.test(gpu)) software = true;
  const integrada = /intel|uhd|iris|mali|adreno|powervr|apple gpu|radeon\(tm\) graphics|vega \d+ graphics/i.test(gpu);
  const memoria = navigator.deviceMemory ?? 8, nucleos = navigator.hardwareConcurrency ?? 8;
  const toque = matchMedia('(pointer: coarse)').matches;
  const celular = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || (toque && Math.min(screen.width, screen.height) < 820);
  let perfil = software ? 'semPlaca' : celular ? 'celular' : (integrada || memoria <= 4 || nucleos <= 4 || toque) ? 'fraco' : 'normal';
  // para testar como o jogo fica em outro aparelho: ?perfil=semPlaca | celular | fraco | normal
  const forcado = new URLSearchParams(location.search).get('perfil');
  if (['semPlaca', 'celular', 'fraco', 'normal'].includes(forcado)) perfil = forcado;
  hardware = { gpu, perfil, semWebGL, memoria, nucleos };
  return hardware;
}

// Cada modo continua sendo ele mesmo (High tem céu físico, grama, nuvens e pós-processamento;
// Medium tem sombra e PBR; Low é o mais leve), mas com limites que o PC aguenta.
export function ajustarAoHardware(base, hw = detectarHardware()) {
  const n = { ...base, resolucao: [...base.resolucao], neblina: [...base.neblina], lod: [...base.lod] };
  if (hw.perfil === 'normal') return n;
  // nenhum supersampling e sombra/texturas no máximo do Medium
  n.resolucao = [Math.min(n.resolucao[0], 0.8), Math.min(n.resolucao[1], 1)];
  n.sombra = Math.min(n.sombra, 2048);
  if (base === NIVEIS.high) {
    n.texturaMapa = NIVEIS.medium.texturaMapa;
    n.texturaBoneca = NIVEIS.medium.texturaBoneca;
  }
  if (hw.perfil === 'celular') {
    // celular: 60 fps primeiro. A tela é pequena e densa, então desenhar na resolução de CSS (1) já
    // fica nítido o bastante; sem MSAA (o FXAA custa bem menos), sombra pequena (só se o jogador
    // escolher Medium/High), material simples no Low, menos coisa ao longe e texturas no máximo do
    // Medium (a memória de vídeo é dividida com o sistema)
    n.resolucao = [Math.min(n.resolucao[0], 0.75), 1];
    n.antialias = false;
    n.suavizacao = 'fxaa';
    // a sombra do mapa é calculada uma vez só (fixa): no celular ela custa só a leitura da textura
    // de sombra por pixel, então fica ligada até no Low (2048 com filtro simples: em 1024 ou sem
    // filtro, a ilha inteira cabe em poucos pixels e a sombra fica quadriculada)
    n.sombra = 2048;
    n.sombraSuave = false;
    if (base !== NIVEIS.low) { n.texturaMapa = NIVEIS.medium.texturaMapa; n.texturaBoneca = NIVEIS.medium.texturaBoneca; }
    // a boneca ocupa boa parte da tela pequena: no Low a cor dela vem em 2048 (2 MB de vídeo em
    // KTX2), não em 1024, para o rosto não borrar de perto
    else n.texturaBoneca = { cor: 'boneca_nova_cor_2048.jpg' };
    n.lod = n.lod.map(d => Math.round(d * 0.75));
    // vista longa o bastante para as ilhotas aparecerem no horizonte (escala e vontade de explorar):
    // o que fica longe já está no nível de detalhe mais leve, então custa pouco
    n.distancia = base === NIVEIS.low ? 210 : Math.min(n.distancia, base === NIVEIS.high ? 320 : 240);
    n.neblina = base === NIVEIS.low ? [55, 195] : [Math.min(n.neblina[0], 60), Math.min(n.neblina[1], base === NIVEIS.high ? 280 : 220)];
    n.alcanceObjetos = Math.min(n.alcanceObjetos, 70);
    n.metaFps = 58;
    n.vegetacaoLonge = base === NIVEIS.high ? 45 : 26; // a vegetação troca para o nível leve mais perto (cartões transparentes custam caro na GPU do celular)
  }
  if (hw.perfil === 'semPlaca') {
    // a CPU desenha cada pixel: poucos pixels, material simples, sem MSAA nem pós-processamento,
    // sombra pequena e menos coisas ao longe. O High mantém céu físico, grama, nuvens e pólen.
    n.resolucao = [0.45, 0.7];
    n.antialias = false;
    n.suavizacao = 'fxaa';
    n.materialSimples = true;
    n.sombraSuave = false;
    n.sombra = Math.min(n.sombra, 1024);
    n.texturaMapa = NIVEIS.low.texturaMapa;
    n.texturaBoneca = NIVEIS.low.texturaBoneca;
    n.lod = [...NIVEIS.low.lod];
    n.distancia = Math.min(n.distancia, 200);
    n.neblina = [Math.min(n.neblina[0], 50), Math.min(n.neblina[1], 180)];
    n.alcanceObjetos = Math.min(n.alcanceObjetos, 50);
    n.posProcesso = false;
  }
  return n;
}

// GPU fraca (integrada ou celular) começa em low; o resto em medium. A escolha do jogador fica salva.
export function nivelInicial() {
  try { const s = localStorage.getItem(CHAVE); if (s && NIVEIS[s]) return s; } catch { /* sem armazenamento */ }
  return detectarHardware().perfil === 'normal' ? 'medium' : 'low';
}

export function salvarNivel(nivel) {
  try { localStorage.setItem(CHAVE, nivel); } catch { /* sem armazenamento */ }
}
