import * as THREE from 'three';

// Chuva: o tempo alterna sozinho entre céu limpo e pancadas de chuva (Y liga/desliga na hora).
//  - gotas: um único LineSegments numa caixa que acompanha a câmera; a queda, o vento e a volta
//    ao topo são calculados no shader (nada é alocado nem movido pela CPU a cada quadro)
//  - quantidade pelo nível gráfico (Low 600, Medium 1400, High 2400) e pela intensidade
//  - som de chuva (ruído filtrado gerado na hora, sem arquivo) e trovões raros com relâmpago
//  - "intensidade" (0..1) é lida pelo resto do jogo: céu, luz, neblina e lente escurecem com ela

const CAIXA = new THREE.Vector3(38, 26, 38);
const MAX_GOTAS = 2400;

const VERT = /* glsl */`
  attribute vec4 semente;   // xyz: posição na caixa (0..1), w: limiar de intensidade
  attribute float ponta;    // 0 = cabeça da gota, 1 = cauda
  uniform float uTempo, uIntensidade, uQuantidade;
  uniform vec3 uCentro, uCaixa;
  uniform vec2 uVento;
  varying float vAlfa;
  #include <fog_pars_vertex>
  void main() {
    float vel = 17.0 + semente.w * 6.0;
    vec3 p = semente.xyz * uCaixa;
    p.y = mod(p.y - uTempo * vel, uCaixa.y);
    // a caixa "dá a volta" em torno da câmera: as gotas nunca acabam nem se acumulam
    vec3 base = uCentro - uCaixa * 0.5;
    p.xz = base.xz + mod(p.xz - base.xz + uVento * (uCaixa.y - p.y) * 0.08, uCaixa.xz);
    p.y += base.y;
    vec3 dir = normalize(vec3(uVento.x * 0.08, -1.0, uVento.y * 0.08));
    p -= dir * ponta * (0.95 + semente.w * 0.55);
    // só as gotas abaixo do limiar aparecem: menos intensidade = menos gotas
    float ativa = step(semente.w, uIntensidade * uQuantidade);
    vAlfa = ativa * (1.0 - ponta * 0.85);
    vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;
const FRAG = /* glsl */`
  uniform vec3 uCor;
  uniform float uOpacidade;
  varying float vAlfa;
  #include <fog_pars_fragment>
  void main() {
    if (vAlfa < 0.01) discard;
    gl_FragColor = vec4(uCor, vAlfa * uOpacidade);
    #include <fog_fragment>
  }
`;

export function criarChuva({ cena, camera }) {
  const geo = new THREE.BufferGeometry();
  const sem = new Float32Array(MAX_GOTAS * 2 * 4), ponta = new Float32Array(MAX_GOTAS * 2), pos = new Float32Array(MAX_GOTAS * 2 * 3);
  for (let i = 0; i < MAX_GOTAS; i++) {
    const s = [Math.random(), Math.random(), Math.random(), (i + Math.random()) / MAX_GOTAS];
    for (let k = 0; k < 2; k++) { sem.set(s, (i * 2 + k) * 4); ponta[i * 2 + k] = k; }
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); // (calculada no shader)
  geo.setAttribute('semente', new THREE.BufferAttribute(sem, 4));
  geo.setAttribute('ponta', new THREE.BufferAttribute(ponta, 1));
  const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
    uTempo: { value: 0 }, uIntensidade: { value: 0 }, uQuantidade: { value: 1 },
    uCentro: { value: new THREE.Vector3() }, uCaixa: { value: CAIXA.clone() }, uVento: { value: new THREE.Vector2(2.5, 1) },
    uCor: { value: new THREE.Color('#e4eef8') }, uOpacidade: { value: 0.55 },
  }]);
  const material = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms, transparent: true, depthWrite: false, fog: true });
  const gotas = new THREE.LineSegments(geo, material);
  gotas.frustumCulled = false; gotas.name = 'chuva'; gotas.visible = false;
  cena.add(gotas);

  // ---------- tempo (clima) ----------
  let intensidade = 0, alvo = 0, espera = 120 + Math.random() * 120, manual = false;
  let relampago = 0, proximoTrovao = 15;

  // ---------- som ----------
  let audio = null, ganhoChuva = null, volume = 1;
  try { volume = Number(localStorage.getItem('jogo.volume') ?? 1); } catch { /* sem armazenamento */ }
  function ruido(ctx, segundos, cor = 0.98) {
    const n = Math.floor(ctx.sampleRate * segundos), b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0);
    let ultimo = 0;
    for (let i = 0; i < n; i++) { ultimo = ultimo * cor + (Math.random() * 2 - 1) * (1 - cor) * 6; d[i] = ultimo; } // ruído "marrom-rosado"
    return b;
  }
  function ligarSom() {
    if (audio) { if (audio.state === 'suspended') audio.resume(); return; }
    try {
      audio = new (window.AudioContext || window.webkitAudioContext)();
      const fonte = audio.createBufferSource(); fonte.buffer = ruido(audio, 3, 0.9); fonte.loop = true;
      const passaAlta = audio.createBiquadFilter(); passaAlta.type = 'highpass'; passaAlta.frequency.value = 400;
      const passaBaixa = audio.createBiquadFilter(); passaBaixa.type = 'lowpass'; passaBaixa.frequency.value = 4200;
      ganhoChuva = audio.createGain(); ganhoChuva.gain.value = 0;
      fonte.connect(passaAlta).connect(passaBaixa).connect(ganhoChuva).connect(audio.destination);
      fonte.start();
    } catch { audio = null; }
  }
  function trovao() {
    relampago = 1;
    if (!audio) return;
    const atraso = 0.4 + Math.random() * 1.6; // a luz chega antes do som
    const fonte = audio.createBufferSource(); fonte.buffer = ruido(audio, 4, 0.995);
    const filtro = audio.createBiquadFilter(); filtro.type = 'lowpass'; filtro.frequency.value = 160;
    const g = audio.createGain(), t0 = audio.currentTime + atraso;
    g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(1.6 * volume, t0 + 0.15); g.gain.exponentialRampToValueAtTime(0.001, t0 + 3.8);
    fonte.connect(filtro).connect(g).connect(audio.destination);
    fonte.start(t0); fonte.stop(t0 + 4);
  }
  // o navegador só deixa tocar som depois de um clique/tecla
  addEventListener('pointerdown', ligarSom, { once: true });
  addEventListener('keydown', ligarSom, { once: true });

  function atualizar(dt, t, ativo = true) {
    if (ativo && !manual) {
      espera -= dt;
      if (espera <= 0) {
        alvo = alvo > 0 ? 0 : 0.55 + Math.random() * 0.45;
        espera = alvo > 0 ? 70 + Math.random() * 60 : 140 + Math.random() * 120;
      }
    }
    intensidade += (alvo - intensidade) * Math.min(1, dt * 0.25); // entra e sai devagar (uns 8 s)
    if (intensidade < 0.002 && alvo === 0) intensidade = 0;
    gotas.visible = intensidade > 0.01;
    uniforms.uTempo.value = t;
    uniforms.uIntensidade.value = intensidade;
    uniforms.uCentro.value.copy(camera.position);
    uniforms.uOpacidade.value = 0.55 + 0.35 * intensidade;
    if (ganhoChuva) ganhoChuva.gain.value = Math.min(1, intensidade * 1.2) * 0.32 * volume;
    // trovões só na chuva forte
    if (intensidade > 0.75) { proximoTrovao -= dt; if (proximoTrovao <= 0) { trovao(); proximoTrovao = 18 + Math.random() * 30; } }
    relampago = Math.max(0, relampago - dt * 3.5);
  }

  return {
    atualizar,
    get intensidade() { return intensidade; },
    // clarão do relâmpago (0..1, pisca e some): o jogo soma na luz do céu
    get relampago() { return relampago > 0.6 ? 1 : relampago * 0.4; },
    alternar() { manual = true; alvo = alvo > 0 ? 0 : 0.9; },
    aplicarNivel(nivel) { uniforms.uQuantidade.value = nivel.materialSimples ? 0.4 : nivel.efeitos ? 1 : 0.6; },
    definirVolume(v) { volume = v; },
    definirVento(x, z) { uniforms.uVento.value.set(x, z); },
  };
}
