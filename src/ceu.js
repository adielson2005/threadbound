import * as THREE from 'three';

// Céu do jogo, com ciclo de dia e noite:
//  - DIA ensolarado: azul vivo no alto, horizonte claro na cor da neblina, e o lado do sol
//    aquecendo em dourado (halo largo e quente, disco do sol);
//  - PÔR/NASCER DO SOL: o céu inteiro vira dourado-alaranjado, nuvens acesas em laranja e rosa;
//  - NOITE estrelada: azul-marinho profundo, estrelas que piscam (duas camadas), a faixa da
//    Via Láctea com poeira azulada e lilás, e a lua com crateras e brilho prateado.
//  O sol visível desce até o horizonte no fim da tarde e a lua sobe do outro lado à noite.
//  A luz que faz sombra fica sempre na mesma direção (a sombra do mapa é calculada uma vez):
//  de dia é o sol, à noite é o luar.
//  - camada de nuvens (todos os níveis) que anda com o vento e muda de cor com a hora;
//  - reflexos de lente olhando para o sol (somem atrás da ilha e à noite).

export const DIR_SOL = new THREE.Vector3(0.55, 0.75, 0.4).normalize(); // a direção da luz que faz sombra

// paletas (sRGB) de cada momento
const PALETA = {
  dia: { topo: '#2f86ee', horizonte: '#a9d8ff', baixo: '#c9e6f5', brilho: '#ffd27a' },
  por: { topo: '#3d4c94', horizonte: '#f6b05a', baixo: '#e3955c', brilho: '#ff9238' },
  noite: { topo: '#040920', horizonte: '#1a2a58', baixo: '#0e1733', brilho: '#9fb4ff' },
};
const cor = h => new THREE.Color(h);
const PAL = Object.fromEntries(Object.entries(PALETA).map(([k, v]) => [k, Object.fromEntries(Object.entries(v).map(([n, h]) => [n, cor(h)]))]));
// luzes da cena: sol branco-dourado, pôr do sol laranja, luar azulado; céu e chão (o reflexo de baixo)
const LUZ = {
  sol: { dia: cor('#fff0d4'), por: cor('#ffad66'), noite: cor('#9fb6ff') },
  ceu: { dia: cor('#dcecff'), por: cor('#ffc79a'), noite: cor('#3a4f8c') },
  chao: { dia: cor('#b9a77e'), por: cor('#a8745a'), noite: cor('#1d1a30') },
};

const CUPULA_VERT = 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
const RUIDO_GLSL = /* glsl */`
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float hash13(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
  float ruido(vec2 p) {
    vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
`;
const CUPULA_FRAG = /* glsl */`
  uniform vec3 uTopo, uHorizonte, uBaixo, uSol, uLua, uCorBrilho;
  uniform float uDia, uPor, uTempo, uBrilho, uChuva, uFase;
  varying vec3 vP;
  ${RUIDO_GLSL}
  // uma camada de estrelas: cada célula de uma grade 3D em volta da câmera tem (ou não) uma estrela
  float estrelas(vec3 d, float escala, float limiar) {
    vec3 p = d * escala, c = floor(p), f = fract(p) - 0.5;
    float h = hash13(c);
    if (h < limiar) return 0.0;
    vec3 desloc = vec3(hash13(c + 1.7), hash13(c + 3.1), hash13(c + 5.3)) - 0.5;
    float k = (h - limiar) / (1.0 - limiar);
    float r = length(f - desloc * 0.6);
    float pisca = 0.7 + 0.3 * sin(uTempo * (1.5 + h * 4.0) + h * 60.0);
    return smoothstep(mix(0.05, 0.12, k), 0.0, r) * pisca * (0.4 + 1.6 * k);
  }
  void main() {
    vec3 d = normalize(vP);
    float h = d.y;
    // degradê (max: alguns drivers calculam os dois lados do "?:", e pow de negativo daria NaN)
    vec3 c = h > 0.0 ? mix(uHorizonte, uTopo, pow(max(h, 0.0), 0.5)) : mix(uHorizonte, uBaixo, pow(max(-h, 0.0), 0.5));
    float noite = 1.0 - uDia;

    // ---- sol: halo dourado largo (bem maior no pôr do sol) e o disco ----
    float s = max(dot(d, uSol), 0.0);
    float acima = smoothstep(-0.08, 0.02, uSol.y);
    float halo = pow(s, 5.0) * (0.18 + 0.35 * uPor) + pow(s, 40.0) * 0.35 + pow(s, 600.0) * 1.4;
    c += uCorBrilho * halo * acima * max(uDia, uPor);
    // o lado do sol aquece em dourado perto do horizonte (o "céu ensolarado" das referências)
    c = mix(c, uCorBrilho * 1.05, pow(s, 2.0) * (1.0 - abs(h)) * (0.45 * uDia + 0.5 * uPor) * acima);
    // disco do sol: centro branco-quente, borda dourada (escurece na borda) e coroa de raios girando devagar
    float limpo = 1.0 - uChuva;
    float angSol = acos(clamp(dot(d, uSol), -1.0, 1.0));
    float rSol = 0.03;
    float discoSol = smoothstep(rSol, rSol * 0.86, angSol);
    float borda = clamp(angSol / rSol, 0.0, 1.0);
    vec3 corDisco = mix(vec3(1.0, 0.98, 0.9) * 2.0, uCorBrilho * 1.6, borda * borda);
    c = mix(c, corDisco, discoSol * acima * max(uDia, uPor) * limpo);
    vec3 sx = normalize(cross(uSol, vec3(0.0, 1.0, 0.0))), sy = cross(sx, uSol);
    float angRaio = atan(dot(d, sy), dot(d, sx));
    float raios = pow(0.5 + 0.5 * sin(angRaio * 14.0 + uTempo * 0.15), 8.0) + pow(0.5 + 0.5 * sin(angRaio * 9.0 - uTempo * 0.1 + 1.7), 10.0) * 0.6;
    c += uCorBrilho * raios * exp(-angSol * 16.0) * smoothstep(rSol * 0.9, rSol * 1.6, angSol) * 0.35 * acima * max(uDia, uPor) * limpo;

    // ---- noite: estrelas, Via Láctea e lua ----
    if (noite > 0.01) {
      float ceuAberto = smoothstep(-0.02, 0.15, h);
      // Via Láctea: faixa em volta de um grande círculo inclinado, com poeira irregular
      vec3 n = normalize(vec3(0.35, 0.55, 0.76));
      float faixa = exp(-pow(dot(d, n) * 4.2, 2.0));
      vec2 q = vec2(atan(d.z, d.x) * 3.0, dot(d, n) * 9.0);
      float poeira = ruido(q * 2.0) * 0.6 + ruido(q * 5.0 + 3.0) * 0.4;
      c += vec3(0.26, 0.28, 0.55) * faixa * (0.25 + 0.75 * poeira) * 0.55 * noite * ceuAberto;
      c += vec3(0.4, 0.25, 0.55) * faixa * smoothstep(0.55, 0.95, poeira) * 0.25 * noite * ceuAberto;
      // estrelas: miúdas por todo o céu, mais densas dentro da Via Láctea, e algumas brilhantes
      float e = estrelas(d, 170.0, 0.972 - faixa * 0.03) * 1.4 + estrelas(d, 60.0, 0.988) * 2.4;
      c += vec3(0.92, 0.95, 1.0) * e * noite * ceuAberto * (1.0 - uChuva);
      // lua: esfera iluminada de lado conforme a fase (a parte escura ainda aparece de leve),
      // com mares escuros e crateras
      float l = dot(d, uLua);
      float rLua = 0.05;
      float angLua = acos(clamp(l, -1.0, 1.0));
      float disco = smoothstep(rLua, rLua * 0.93, angLua);
      if (disco > 0.0) {
        vec3 eixoX = normalize(cross(uLua, vec3(0.0, 1.0, 0.0))), eixoY = cross(eixoX, uLua);
        vec2 q2 = vec2(dot(d, eixoX), dot(d, eixoY)) / sin(rLua);
        vec3 nl = vec3(q2, sqrt(max(0.0, 1.0 - dot(q2, q2))));
        float fase = uFase * 6.2831853;
        vec3 luzLua = normalize(vec3(sin(fase), 0.15, -cos(fase)));
        float acesa = smoothstep(-0.08, 0.12, dot(nl, luzLua));
        float mares = smoothstep(0.45, 0.7, ruido(q2 * 2.2 + 4.0) * 0.6 + ruido(q2 * 4.5) * 0.4);
        // crateras redondas: algumas células de uma grade têm uma cratera (fundo escuro, borda clara)
        float cr = 0.0;
        vec2 gq = q2 * 3.2, gc = floor(gq);
        for (int i = -1; i <= 1; i++) for (int j = -1; j <= 1; j++) {
          vec2 cc = gc + vec2(float(i), float(j));
          float hh = fract(sin(dot(cc, vec2(127.1, 311.7))) * 43758.5453);
          if (hh < 0.45) continue;
          vec2 o = vec2(fract(hh * 13.7), fract(hh * 71.3));
          float rr = 0.14 + 0.22 * fract(hh * 5.1), dd = length(gq - cc - o);
          cr += -0.3 * smoothstep(rr, rr * 0.7, dd) + 0.22 * (smoothstep(rr * 1.3, rr, dd) - smoothstep(rr, rr * 0.8, dd));
        }
        vec3 corLua = mix(vec3(0.92, 0.92, 0.87), vec3(0.5, 0.52, 0.6), mares * 0.85) * (1.0 + cr) * (0.6 + 0.4 * nl.z);
        corLua *= mix(0.06, 1.05, acesa);
        c = mix(c, corLua, disco * noite * (1.0 - uChuva * 0.9));
      }
      float clarao = 0.3 + 0.7 * abs(cos(uFase * 3.14159265)); // lua cheia ilumina mais o céu em volta
      c += vec3(0.55, 0.65, 1.0) * (pow(max(l, 0.0), 300.0) * 0.45 + pow(max(l, 0.0), 22.0) * 0.08) * noite * clarao * (1.0 - uChuva);
    }
    gl_FragColor = vec4(c * uBrilho, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const NUVENS_FRAG = (oitavas) => /* glsl */`
  uniform float uTempo, uCobertura, uBrilho, uDia, uPor, uChuva;
  uniform vec3 uSol, uLua, uCorBrilho;
  uniform vec2 uVento;
  varying vec3 vP;
  ${RUIDO_GLSL}
  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < ${oitavas}; i++) { v += a * ruido(p); p = p * 2.03 + 17.1; a *= 0.5; }
    return v;
  }
  void main() {
    vec3 d = normalize(vP);
    if (d.y <= 0.0) discard;
    // projeta a direção num "teto" de nuvens: perto do horizonte elas ficam achatadas e pequenas
    vec2 uv = d.xz / (d.y + 0.12) * 1.5 + uVento * uTempo;
    float n = fbm(uv);
    // nuvens finas e esgarçadas (como fiapos) estendidas na direção do vento
    float fiapos = fbm(vec2(uv.x * 0.6, uv.y * 2.2) + 9.0);
    n = mix(n, fiapos, 0.35);
    float dens = smoothstep(uCobertura, uCobertura + 0.3, n);
    float a = dens * smoothstep(0.0, 0.2, d.y) * mix(0.4, 0.9, uDia);
    if (a < 0.01) discard;
    float miolo = smoothstep(uCobertura + 0.1, uCobertura + 0.45, n);
    float s = max(dot(d, uSol), 0.0), l = max(dot(d, uLua), 0.0);
    // dia: branca, miolo levemente cinza-azulado, borda dourada do lado do sol
    vec3 dia = mix(vec3(1.0), vec3(0.82, 0.85, 0.93), miolo * 0.7) + uCorBrilho * (pow(s, 8.0) * 0.5 * (1.0 - miolo) + pow(s, 2.0) * 0.1);
    // pôr do sol: base rosada, acesa em laranja do lado do sol
    vec3 por = mix(vec3(1.0, 0.72, 0.55), vec3(0.62, 0.45, 0.55), miolo * 0.8) + uCorBrilho * pow(s, 3.0) * 0.7;
    // noite: azul escuro, com a borda prateada pela lua
    vec3 noite = mix(vec3(0.1, 0.12, 0.22), vec3(0.05, 0.06, 0.12), miolo) + vec3(0.5, 0.6, 0.9) * pow(l, 6.0) * 0.4 * (1.0 - miolo);
    vec3 c = mix(noite, dia, uDia);
    c = mix(c, por, uPor * 0.85);
    // chuva: nuvens carregadas, cinza-chumbo, cobrindo mais o céu
    c = mix(c, vec3(0.42, 0.45, 0.5) * mix(0.35, 1.0, uDia) * (1.0 - miolo * 0.35), uChuva * 0.85);
    a = mix(a, min(1.0, a * 1.6 + uChuva * 0.25), uChuva);
    // o reforço de brilho do High é para o dia; à noite as nuvens ficam escuras e discretas
    gl_FragColor = vec4(c * mix(1.0, uBrilho, max(uDia, uPor)), a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

// texturas dos reflexos de lente
function texturaBrilho(fn, tam = 128) {
  const c = document.createElement('canvas'); c.width = c.height = tam;
  fn(c.getContext('2d'), tam);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const halo = texturaBrilho((g, t) => {
  const gr = g.createRadialGradient(t / 2, t / 2, 0, t / 2, t / 2, t / 2);
  gr.addColorStop(0, 'rgba(255,250,235,1)'); gr.addColorStop(0.12, 'rgba(255,240,200,0.75)'); gr.addColorStop(0.4, 'rgba(255,220,160,0.18)'); gr.addColorStop(1, 'rgba(255,210,150,0)');
  g.fillStyle = gr; g.fillRect(0, 0, t, t);
});
const raios = texturaBrilho((g, t) => {
  g.translate(t / 2, t / 2);
  for (let i = 0; i < 6; i++) {
    g.rotate(Math.PI / 6);
    const gr = g.createLinearGradient(-t / 2, 0, t / 2, 0);
    gr.addColorStop(0, 'rgba(255,240,210,0)'); gr.addColorStop(0.5, 'rgba(255,245,225,0.55)'); gr.addColorStop(1, 'rgba(255,240,210,0)');
    g.fillStyle = gr; g.fillRect(-t / 2, -1.2, t, 2.4);
  }
}, 256);
const anel = texturaBrilho((g, t) => {
  const gr = g.createRadialGradient(t / 2, t / 2, t * 0.3, t / 2, t / 2, t / 2);
  gr.addColorStop(0, 'rgba(180,220,255,0)'); gr.addColorStop(0.75, 'rgba(200,230,255,0.35)'); gr.addColorStop(1, 'rgba(200,230,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, t, t);
});
const disco = texturaBrilho((g, t) => {
  const gr = g.createRadialGradient(t / 2, t / 2, 0, t / 2, t / 2, t / 2);
  gr.addColorStop(0, 'rgba(255,255,255,0.5)'); gr.addColorStop(0.7, 'rgba(220,235,255,0.25)'); gr.addColorStop(1, 'rgba(220,235,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, t, t);
});

// ---------- relógio do dia ----------
// 24 h de jogo em 12 min: o dia (6h–18h) dura 6 min; a noite passa um pouco mais rápido (~3,5 min)
const SEGUNDOS_POR_HORA_DIA = 30, SEGUNDOS_POR_HORA_NOITE = 17.5;
const ELEV_MAX = Math.asin(DIR_SOL.y); // altura do sol ao meio-dia (a mesma da luz)
const AZIMUTE = new THREE.Vector2(DIR_SOL.x, DIR_SOL.z).normalize();

export function criarCeu({ cena, camera, corHorizonte }) {
  let tom = null, tomForca = 0; // tom do lugar (capitulo.js: ambiente.ceu)
  const uniCupula = {
    uTopo: { value: PAL.dia.topo.clone() }, uHorizonte: { value: corHorizonte.clone() }, uBaixo: { value: PAL.dia.baixo.clone() },
    uSol: { value: DIR_SOL.clone() }, uLua: { value: DIR_SOL.clone() }, uCorBrilho: { value: PAL.dia.brilho.clone() },
    uDia: { value: 1 }, uPor: { value: 0 }, uTempo: { value: 0 }, uBrilho: { value: 1 }, uChuva: { value: 0 }, uFase: { value: 0.5 },
  };
  const cupula = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, uniforms: uniCupula, vertexShader: CUPULA_VERT, fragmentShader: CUPULA_FRAG,
  }));
  cupula.renderOrder = -2; cupula.frustumCulled = false; cupula.name = 'ceu-cupula';
  cena.add(cupula);

  // ---- nuvens (compartilham sol, lua, hora e cor do brilho com a cúpula) ----
  const uniNuvens = {
    uTempo: { value: 0 }, uCobertura: { value: 0.6 }, uBrilho: { value: 1 }, uChuva: { value: 0 }, uVento: { value: new THREE.Vector2(0.012, 0.006) },
    uSol: uniCupula.uSol, uLua: uniCupula.uLua, uCorBrilho: uniCupula.uCorBrilho, uDia: uniCupula.uDia, uPor: uniCupula.uPor,
  };
  const materialNuvens = oitavas => new THREE.ShaderMaterial({
    uniforms: uniNuvens, vertexShader: CUPULA_VERT, fragmentShader: NUVENS_FRAG(oitavas),
    side: THREE.BackSide, transparent: true, depthWrite: false, fog: false,
  });
  const nuvens = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), materialNuvens(5));
  nuvens.renderOrder = -1; nuvens.frustumCulled = false;
  cena.add(nuvens);

  // ---- reflexos de lente ----
  const grupoLente = new THREE.Group(); grupoLente.name = 'lente';
  const sprite = (mapa, c, tam, k) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: mapa, color: c, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, fog: false }));
    s.userData = { tam, k }; s.renderOrder = 999; grupoLente.add(s); return s;
  };
  const brilhoSol = sprite(halo, '#ffffff', 0.55, 1);
  const raiosSol = sprite(raios, '#ffffff', 0.5, 1);
  sprite(disco, '#ffd9a0', 0.05, 0.55); sprite(anel, '#bfe2ff', 0.12, 0.25); sprite(disco, '#c9b6ff', 0.035, -0.15);
  sprite(anel, '#a8ffd8', 0.07, -0.45); sprite(disco, '#ffe7b8', 0.09, -0.8);
  cena.add(grupoLente);

  let mapaColisao = null, brilhoLente = 1, visivel = 0, alvoVisivel = 0, quadro = 0;
  const rc = new THREE.Raycaster(); rc.firstHitOnly = true; rc.layers.enableAll();
  const solMundo = new THREE.Vector3(), ndc = new THREE.Vector3(), p = new THREE.Vector3(), frente = new THREE.Vector3();

  // ---- relógio ----
  let hora = 10;           // começa de manhã
  let chuva = 0;           // 0..1 (chuva.js)
  let dias = 4;            // dias passados (a lua começa quase cheia)
  let alvoAvanco = null;   // "T": avança rápido até esta hora
  // estado de luz para o resto do jogo (luzes, neblina, mar, névoa)
  const estado = {
    hora, dia: 1, por: 0, noite: 0,
    neblina: PAL.dia.horizonte.clone(), topo: PAL.dia.topo.clone(), baixo: PAL.dia.baixo.clone(),
    solVisivel: DIR_SOL.clone(), luaVisivel: DIR_SOL.clone(), dirLuzVisivel: DIR_SOL.clone(),
    corLuz: new THREE.Color(), forcaLuz: 1, corCeuLuz: new THREE.Color(), corChaoLuz: new THREE.Color(), forcaCeuLuz: 1,
  };
  const mistura = (alvo, a, b, c, dia, por) => alvo.copy(c).lerp(a, dia).lerp(b, por * 0.85);
  const tmp = new THREE.Color(), BRANCO = new THREE.Color(1, 1, 1);

  function relogio(dt) {
    const noite = hora < 6 || hora >= 18;
    let horas = dt / (noite ? SEGUNDOS_POR_HORA_NOITE : SEGUNDOS_POR_HORA_DIA);
    if (alvoAvanco !== null) {
      horas *= 40;
      const falta = (alvoAvanco - hora + 24) % 24;
      if (falta <= horas) { hora = alvoAvanco; alvoAvanco = null; return; }
    }
    if (hora + horas >= 24) dias++;
    hora = (hora + horas) % 24;
  }
  function calcularLuz() {
    // altura do sol: −1 meia-noite, 0 às 6h e às 18h, 1 ao meio-dia
    const elev = Math.sin(((hora - 6) / 24) * Math.PI * 2);
    const dia = THREE.MathUtils.smoothstep(elev, -0.14, 0.2);
    const por = Math.exp(-(((elev - 0.03) / 0.13) ** 2));
    Object.assign(estado, { hora, dia, por, noite: 1 - dia });
    // sol e lua visíveis andam pelo céu (a lua do lado oposto); a luz das sombras não se mexe
    const el = elev * ELEV_MAX * 1.15;
    estado.solVisivel.set(AZIMUTE.x * Math.cos(el), Math.sin(el), AZIMUTE.y * Math.cos(el)).normalize();
    const elLua = -elev * ELEV_MAX * 1.1;
    estado.luaVisivel.set(-AZIMUTE.x * Math.cos(elLua), Math.sin(elLua), -AZIMUTE.y * Math.cos(elLua)).normalize();
    estado.dirLuzVisivel.copy(dia > 0.5 || por > 0.3 ? estado.solVisivel : estado.luaVisivel);
    // cores do céu
    mistura(estado.topo, PAL.dia.topo, PAL.por.topo, PAL.noite.topo, dia, por);
    mistura(estado.neblina, PAL.dia.horizonte, PAL.por.horizonte, PAL.noite.horizonte, dia, por);
    mistura(estado.baixo, PAL.dia.baixo, PAL.por.baixo, PAL.noite.baixo, dia, por);
    mistura(tmp, PAL.dia.brilho, PAL.por.brilho, PAL.noite.brilho, dia, por);
    uniCupula.uCorBrilho.value.copy(tmp);
    // luzes: sol branco-dourado, pôr do sol laranja e mais fraco, luar azulado e fraco
    mistura(estado.corLuz, LUZ.sol.dia, LUZ.sol.por, LUZ.sol.noite, dia, por);
    estado.forcaLuz = THREE.MathUtils.lerp(0.22, 1, dia) * (1 - por * 0.35);
    mistura(estado.corCeuLuz, LUZ.ceu.dia, LUZ.ceu.por, LUZ.ceu.noite, dia, por);
    mistura(estado.corChaoLuz, LUZ.chao.dia, LUZ.chao.por, LUZ.chao.noite, dia, por);
    estado.forcaCeuLuz = THREE.MathUtils.lerp(0.32, 1, dia) * (1 - por * 0.15);
    // chuva: céu e horizonte acinzentados, sol bem mais fraco (a luz difusa do céu cai menos)
    if (chuva > 0) {
      const k = chuva * 0.75;
      tmp.setRGB(0.36, 0.4, 0.46).multiplyScalar(THREE.MathUtils.lerp(0.18, 1, dia));
      estado.topo.lerp(tmp, k); estado.neblina.lerp(tmp.multiplyScalar(1.25), k); estado.baixo.lerp(tmp, k);
      estado.forcaLuz *= 1 - chuva * 0.6;
      estado.forcaCeuLuz *= 1 - chuva * 0.25;
    }
    // tom próprio do lugar (o céu cinza-esverdeado do recife, o dourado do fundo do mar…)
    if (tom) {
      tmp.copy(tom).multiplyScalar(THREE.MathUtils.lerp(0.15, 1, dia)); // à noite o tom escurece junto
      estado.topo.lerp(tmp, tomForca); estado.neblina.lerp(tmp, tomForca * 1.2); estado.baixo.lerp(tmp, tomForca);
    }
    estado.chuva = chuva;
  }

  function atualizar(dt, t) {
    relogio(dt);
    calcularLuz();
    const r = camera.far * 0.92;
    cupula.position.copy(camera.position); cupula.scale.setScalar(r);
    nuvens.position.copy(camera.position); nuvens.scale.setScalar(r * 0.97);
    uniNuvens.uTempo.value = t;
    uniNuvens.uChuva.value = chuva; uniCupula.uChuva.value = chuva;
    uniCupula.uFase.value = ((dias + hora / 24) / 8) % 1; // ciclo da lua: 8 dias do jogo
    uniNuvens.uCobertura.value = 0.6 - chuva * 0.32;
    uniCupula.uTempo.value = t;
    uniCupula.uTopo.value.copy(estado.topo); uniCupula.uHorizonte.value.copy(estado.neblina); uniCupula.uBaixo.value.copy(estado.baixo);
    uniCupula.uSol.value.copy(estado.solVisivel); uniCupula.uLua.value.copy(estado.luaVisivel);
    uniCupula.uDia.value = estado.dia; uniCupula.uPor.value = estado.por;

    // reflexos: só de dia, com o sol na tela e sem nada na frente dele
    const sol = estado.solVisivel;
    camera.getWorldDirection(frente);
    solMundo.copy(camera.position).addScaledVector(sol, camera.far * 0.8);
    ndc.copy(solMundo).project(camera);
    const naTela = sol.y > -0.02 && frente.dot(sol) > 0 && Math.abs(ndc.x) < 1.3 && Math.abs(ndc.y) < 1.3;
    if (++quadro % 4 === 0) {
      let livre = naTela;
      if (livre && mapaColisao) { rc.set(camera.position, sol); rc.far = 600; livre = rc.intersectObject(mapaColisao).length === 0; }
      alvoVisivel = livre ? 1 : 0;
    }
    visivel += (alvoVisivel - visivel) * Math.min(1, dt * 8);
    const forcaDia = Math.max(estado.dia, estado.por) * visivel * (1 - chuva);
    grupoLente.visible = forcaDia > 0.01;
    if (!grupoLente.visible) return;
    const centro = 1 - Math.min(1, Math.hypot(ndc.x, ndc.y) / 1.3);
    const forca = forcaDia * (0.35 + 0.65 * centro) * brilhoLente;
    const dist = 10;
    for (const s of grupoLente.children) {
      const { tam, k } = s.userData;
      p.set(ndc.x * k, ndc.y * k, 0.5).unproject(camera).sub(camera.position).normalize();
      s.position.copy(camera.position).addScaledVector(p, dist);
      s.scale.setScalar(tam * dist * (s === brilhoSol || s === raiosSol ? 1 : 0.8));
      s.material.opacity = (s === brilhoSol ? 0.9 : s === raiosSol ? 0.55 : 0.4) * forca;
      s.material.color.copy(uniCupula.uCorBrilho.value).lerp(BRANCO, 0.5);
    }
    raiosSol.material.rotation = t * 0.03;
  }

  // High: tone mapping escurece, então céu, nuvens e reflexos clareiam
  function aplicarNivel(nivel) {
    uniCupula.uBrilho.value = nivel.efeitos ? 1.2 : 1;
    uniNuvens.uBrilho.value = nivel.efeitos ? 1.9 : 1;
    brilhoLente = nivel.efeitos ? 1.6 : 1.2;
    const oitavas = nivel.materialSimples ? 3 : 5;
    if (nuvens.userData.oitavas !== oitavas) { nuvens.material.dispose(); nuvens.material = materialNuvens(oitavas); nuvens.userData.oitavas = oitavas; }
  }

  // "T": pula rápido para a próxima fase (de dia → noite, de noite → manhã)
  function avancar() { alvoAvanco = estado.dia > 0.5 ? 21.5 : 8; }

  return {
    cupula, nuvens, estado, atualizar, aplicarNivel, avancar,
    definirMapa: m => { mapaColisao = m.malha; },
    definirHora: h => { hora = ((h % 24) + 24) % 24; alvoAvanco = null; calcularLuz(); },
    definirChuva: k => { chuva = k; },
    definirTom: (cor, forca = 0.35) => { tom = cor ? new THREE.Color(cor) : null; tomForca = forca; },
  };
}
