import * as THREE from 'three';

// Vida no ar em todos os níveis gráficos: de dia, grãos de pólen dourados flutuando na luz; à
// noite, vaga-lumes piscando perto do chão. Tudo é animado na GPU (a posição de cada ponto sai do
// tempo e de uma semente fixa, e os pontos "dão a volta" numa caixa em torno da Brisa): a CPU só
// atualiza quatro valores por quadro, nada é reenviado. Some na chuva. O pólen do modo High
// (altos.js) continua lá; este fica desligado quando aquele está ativo.

const VERT = /* glsl */`
  attribute vec4 semente;          // xyz: posição na caixa (0..1), w: fase
  uniform float uTempo, uNoite, uCaixa, uTamanho;
  uniform vec3 uCentro;
  varying float vAlfa, vNoite;
  void main() {
    float f = semente.w * 6.2831;
    // dia: sobe devagar e deriva com o vento; noite: voa baixo, em zigue-zague
    float altura = mix(8.0, 2.6, uNoite);
    vec3 p = (semente.xyz - 0.5) * vec3(uCaixa, 0.0, uCaixa);
    p.x += sin(uTempo * 0.31 + f) * 1.3 + uTempo * 0.25;
    p.z += cos(uTempo * 0.27 + f * 1.3) * 1.3 + uTempo * 0.12;
    p.y = mod(semente.y * altura + uTempo * mix(0.14, 0.05, uNoite) + sin(uTempo * 0.9 + f) * mix(0.1, 0.35, uNoite), altura) + mix(0.3, 0.25, uNoite);
    // "dá a volta" em torno da Brisa: os pontos estão sempre perto dela
    p.xz = mod(p.xz - uCentro.xz + uCaixa * 0.5, uCaixa) - uCaixa * 0.5 + uCentro.xz;
    p.y += uCentro.y - 1.0;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    float d = -mv.z;
    gl_PointSize = uTamanho * mix(1.35, 1.8, uNoite) / max(d, 0.5);
    // perto demais ou longe demais some aos poucos; à noite cada vaga-lume pisca no seu ritmo
    float pisca = mix(1.0, smoothstep(0.35, 1.0, sin(uTempo * (1.3 + semente.w) + f * 3.0)), uNoite);
    vAlfa = smoothstep(0.6, 2.0, d) * (1.0 - smoothstep(uCaixa * 0.32, uCaixa * 0.5, d)) * pisca;
    vNoite = uNoite;
  }`;
const FRAG = /* glsl */`
  uniform float uForca;
  varying float vAlfa, vNoite;
  void main() {
    float r = length(gl_PointCoord - 0.5) * 2.0;
    float a = smoothstep(1.0, 0.0, r);
    a *= a;
    vec3 cor = mix(vec3(1.0, 0.93, 0.68), vec3(0.78, 1.0, 0.42), vNoite);
    gl_FragColor = vec4(cor * a * vAlfa * uForca * mix(0.95, 1.4, vNoite), 1.0);
  }`;

export function criarParticulas({ cena, celular }) {
  const N = celular ? 120 : 220;
  const sem = new Float32Array(N * 4);
  for (let i = 0; i < N * 4; i++) sem[i] = Math.random();
  const g = new THREE.BufferGeometry();
  g.setAttribute('semente', new THREE.BufferAttribute(sem, 4));
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3)); // (o three.js exige; a posição sai do shader)
  const uniforms = {
    uTempo: { value: 0 }, uNoite: { value: 0 }, uCaixa: { value: 34 }, uTamanho: { value: 60 }, uForca: { value: 1 },
    uCentro: { value: new THREE.Vector3() },
  };
  const mat = new THREE.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const pts = new THREE.Points(g, mat);
  pts.frustumCulled = false; // os pontos vão para onde a Brisa vai
  pts.renderOrder = 2;
  cena.add(pts);
  return {
    pts,
    // noite: 0..1 (céu); chuva: 0..1; desligado: o pólen do High está ativo; alturaTela: px
    atualizar(t, centro, noite, chuva, desligado, alturaTela) {
      pts.visible = !desligado && chuva < 0.6;
      if (!pts.visible) return;
      uniforms.uTempo.value = t;
      uniforms.uNoite.value = noite;
      uniforms.uCentro.value.copy(centro);
      uniforms.uForca.value = 1 - chuva / 0.6;
      uniforms.uTamanho.value = 0.09 * alturaTela; // ~9 cm de diâmetro a 1 m, em qualquer tela
    },
  };
}
