// Som do jogo, todo sintetizado na hora com Web Audio (nenhum arquivo: o APK não cresce e carrega
// na hora). Efeitos de luta, passos, interface e coleta, e uma música de combate que entra quando o
// Ravi luta e esquenta na 2ª fase. A chuva tem o som dela (chuva.js).
// O navegador só deixa tocar depois de um clique ou tecla: o contexto abre no primeiro toque.

let ctx = null, mestre = null, efeitos = null, musica = null, ruidoBranco = null;
let volume = 1;
try { volume = Number(localStorage.getItem('jogo.volume') ?? 1); } catch { /* sem armazenamento */ }

function abrir() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    mestre = ctx.createGain(); mestre.gain.value = volume;
    // um compressor leve no fim: golpes seguidos não estouram e o som baixo continua audível no celular
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.2;
    mestre.connect(comp).connect(ctx.destination);
    efeitos = ctx.createGain(); efeitos.gain.value = 0.9; efeitos.connect(mestre);
    musica = ctx.createGain(); musica.gain.value = 0; musica.connect(mestre);
    const n = ctx.sampleRate, b = ctx.createBuffer(1, n, n), d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    ruidoBranco = b;
  } catch { ctx = null; }
}
addEventListener('pointerdown', abrir, { once: false, passive: true });
addEventListener('keydown', abrir, { once: false });

export function definirVolume(v) { volume = v; if (mestre) mestre.gain.value = v; }

// ---------- peças ----------
const agora = () => ctx.currentTime;
function env(g, t0, ataque, pico, fim, dur) {
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(pico, t0 + ataque);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0001, fim), t0 + dur);
}
// ruído filtrado (whoosh, impacto, passos)
function sopro({ dur = 0.2, tipo = 'bandpass', de = 800, ate = 2000, q = 1.2, vol = 0.3, ataque = 0.01, atraso = 0, destino = efeitos }) {
  const t0 = agora() + atraso;
  const f = ctx.createBufferSource(); f.buffer = ruidoBranco; f.playbackRate.value = 0.7 + Math.random() * 0.6;
  const filtro = ctx.createBiquadFilter(); filtro.type = tipo; filtro.Q.value = q;
  filtro.frequency.setValueAtTime(de, t0); filtro.frequency.exponentialRampToValueAtTime(ate, t0 + dur);
  const g = ctx.createGain(); env(g, t0, ataque, vol, 0.0001, dur);
  f.connect(filtro).connect(g).connect(destino);
  f.start(t0, Math.random() * 0.5); f.stop(t0 + dur + 0.05);
}
// tom (corpo do impacto, metal, sinos)
function tom({ freq = 220, ate = null, dur = 0.3, forma = 'sine', vol = 0.3, ataque = 0.005, atraso = 0, destino = efeitos }) {
  const t0 = agora() + atraso;
  const o = ctx.createOscillator(); o.type = forma;
  o.frequency.setValueAtTime(freq, t0);
  if (ate) o.frequency.exponentialRampToValueAtTime(ate, t0 + dur);
  const g = ctx.createGain(); env(g, t0, ataque, vol, 0.0001, dur);
  o.connect(g).connect(destino);
  o.start(t0); o.stop(t0 + dur + 0.05);
}
const pronto = () => { if (!ctx || ctx.state !== 'running') { abrir(); return false; } return true; };

// ---------- efeitos ----------
export const som = {
  // golpe no ar: soco curto, chute mais longo, lâmina com um chiado metálico
  golpe(tipo = 'soco') {
    if (!pronto()) return;
    if (tipo === 'corte') { sopro({ dur: 0.22, de: 2500, ate: 7000, q: 3, vol: 0.22 }); tom({ freq: 2400, ate: 3600, dur: 0.12, forma: 'sine', vol: 0.03 }); }
    else if (tipo === 'chute') sopro({ dur: 0.3, de: 400, ate: 1600, q: 1, vol: 0.28 });
    else sopro({ dur: 0.14, de: 700, ate: 2200, q: 1.4, vol: 0.2 });
  },
  // acertou: baque grave (o tamanho cresce com o dano) e o estalo do contato
  acerto(dano = 1, corte = false) {
    if (!pronto()) return;
    const k = Math.min(1, dano / 4);
    tom({ freq: 150 - k * 40, ate: 42, dur: 0.18 + k * 0.12, vol: 0.55 + k * 0.25 });
    sopro({ dur: 0.07, tipo: 'highpass', de: 1800, ate: 900, vol: 0.32 });
    if (corte) { tom({ freq: 1900, ate: 1500, dur: 0.25, forma: 'triangle', vol: 0.06 }); sopro({ dur: 0.18, de: 5000, ate: 3000, q: 4, vol: 0.12 }); }
  },
  // defesa: metal; perfeita, um sino brilhante por cima
  defesa(perfeita = false) {
    if (!pronto()) return;
    for (const f of [820, 1270, 1730]) tom({ freq: f, dur: 0.35, forma: 'triangle', vol: 0.07 });
    sopro({ dur: 0.06, tipo: 'highpass', de: 3000, ate: 2000, vol: 0.25 });
    if (perfeita) for (const [f, a] of [[1568, 0.05], [2093, 0.11], [3136, 0.17]]) tom({ freq: f, dur: 0.6, vol: 0.09, atraso: a });
  },
  esquiva() { if (pronto()) sopro({ dur: 0.28, tipo: 'lowpass', de: 300, ate: 1400, q: 0.8, vol: 0.22 }); },
  // ela apanhou: baque abafado e um gemido de pano
  dano() {
    if (!pronto()) return;
    tom({ freq: 110, ate: 38, dur: 0.35, vol: 0.7 });
    sopro({ dur: 0.25, tipo: 'lowpass', de: 900, ate: 200, vol: 0.3 });
  },
  // Explosão de Fios: acorde subindo e o estouro
  poder() {
    if (!pronto()) return;
    for (const [f, a] of [[262, 0], [330, 0.04], [392, 0.08], [523, 0.12]]) tom({ freq: f, ate: f * 2, dur: 0.5, forma: 'triangle', vol: 0.09, atraso: a });
    tom({ freq: 90, ate: 30, dur: 0.9, vol: 0.8, atraso: 0.16 });
    sopro({ dur: 0.9, tipo: 'lowpass', de: 3000, ate: 200, q: 0.7, vol: 0.5, atraso: 0.16 });
  },
  carregado() { if (pronto()) for (const [f, a] of [[784, 0], [988, 0.07], [1319, 0.14]]) tom({ freq: f, dur: 0.4, vol: 0.07, atraso: a }); },
  // poderes do Ravi: lâmina de névoa (assobio que desce) e o passo de névoa (sopro ao contrário)
  laminaNevoa() {
    if (!pronto()) return;
    tom({ freq: 1400, ate: 500, dur: 0.5, forma: 'sine', vol: 0.08 });
    sopro({ dur: 0.45, de: 1800, ate: 600, q: 6, vol: 0.12 });
  },
  passoNevoa() { if (pronto()) sopro({ dur: 0.35, tipo: 'bandpass', de: 300, ate: 2400, q: 2, vol: 0.2, ataque: 0.3 }); },
  // aviso do vilão antes do golpe (o brilho vermelho): um tique grave
  aviso() { if (pronto()) tom({ freq: 196, dur: 0.12, forma: 'square', vol: 0.03 }); },
  pouso() { if (pronto()) { tom({ freq: 80, ate: 30, dur: 0.5, vol: 0.8 }); sopro({ dur: 0.4, tipo: 'lowpass', de: 1200, ate: 150, vol: 0.4 }); } },
  passo(forca = 1) { if (pronto()) sopro({ dur: 0.06, tipo: 'bandpass', de: 500 + Math.random() * 300, ate: 250, q: 1, vol: 0.05 * forca }); },
  pegar() { if (pronto()) { tom({ freq: 660, dur: 0.12, vol: 0.06 }); tom({ freq: 990, dur: 0.2, vol: 0.06, atraso: 0.06 }); } },
  fragmento() { if (pronto()) for (const [f, a] of [[880, 0], [1175, 0.06], [1568, 0.12]]) tom({ freq: f, dur: 0.35, vol: 0.08, atraso: a }); },
  ancora() { if (pronto()) for (const [f, a] of [[392, 0], [494, 0.12], [587, 0.24], [784, 0.36]]) tom({ freq: f, dur: 1.2, forma: 'triangle', vol: 0.1, atraso: a }); },
  vitoria() { if (pronto()) for (const [f, a] of [[523, 0], [659, 0.15], [784, 0.3], [1047, 0.5]]) tom({ freq: f, dur: 1.4, forma: 'triangle', vol: 0.12, atraso: a }); },
  // interface: passar por uma opção e confirmar
  foco() { if (pronto()) tom({ freq: 1320, dur: 0.04, forma: 'sine', vol: 0.025 }); },
  ok() { if (pronto()) { tom({ freq: 880, dur: 0.08, vol: 0.05 }); tom({ freq: 1320, dur: 0.12, vol: 0.05, atraso: 0.05 }); } },
};

// ---------- música de combate ----------
// 120 bpm em lá menor: bumbo nos tempos, baixo em ostinato e um acorde longo; na 2ª fase entram
// chimbal e um bumbo dobrado. Agendada um pouco à frente (o setInterval do navegador atrasa).
const BPM = 120, SEMI = 60 / BPM / 2;
const BAIXO = [45, 45, 52, 45, 48, 45, 52, 50]; // notas MIDI (lá 2, mi 3, dó 3, ré 3)
const ACORDES = [[57, 60, 64], [53, 57, 60], [55, 59, 62], [52, 56, 59]]; // Am F G E
const hz = n => 440 * Math.pow(2, (n - 69) / 12);
let tocando = false, intensa = false, proximo = 0, passoMus = 0, relogio = null;
function agendar() {
  if (!ctx) return;
  while (proximo < agora() + 0.2) {
    const t = proximo, i = passoMus;
    const atraso = t - agora();
    if (i % 2 === 0) tom({ freq: 120, ate: 40, dur: 0.22, vol: intensa ? 0.5 : 0.38, atraso, destino: musica });
    if (intensa && i % 4 === 3) tom({ freq: 120, ate: 40, dur: 0.15, vol: 0.3, atraso, destino: musica });
    if (intensa && i % 2 === 1) sopro({ dur: 0.04, tipo: 'highpass', de: 7000, ate: 6000, vol: 0.08, atraso, destino: musica });
    if (i % 4 === 2) sopro({ dur: 0.12, tipo: 'bandpass', de: 1800, ate: 1200, q: 0.8, vol: 0.12, atraso, destino: musica }); // caixa
    tom({ freq: hz(BAIXO[i % 8]), dur: SEMI * 0.9, forma: 'sawtooth', vol: 0.05, atraso, destino: musica });
    if (i % 16 === 0) for (const n of ACORDES[(i / 16) % 4]) tom({ freq: hz(n), dur: SEMI * 16, forma: 'triangle', vol: 0.025, ataque: 0.4, atraso, destino: musica });
    passoMus++; proximo += SEMI;
  }
}
// ligada: a luta está acontecendo; forte: 2ª fase
export function musicaLuta(ligada, forte = false) {
  intensa = forte;
  if (!ctx) return;
  if (ligada && !tocando) {
    tocando = true; proximo = agora() + 0.05; passoMus = 0;
    musica.gain.cancelScheduledValues(agora()); musica.gain.setTargetAtTime(0.9, agora(), 0.6);
    relogio = setInterval(agendar, 60);
  } else if (!ligada && tocando) {
    tocando = false;
    musica.gain.cancelScheduledValues(agora()); musica.gain.setTargetAtTime(0, agora(), 0.8);
    setTimeout(() => { if (!tocando) clearInterval(relogio); }, 3000);
  }
}
