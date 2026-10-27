import * as THREE from 'three';
import { detectarHardware } from './graficos.js';

// Mar em volta das ilhas (logo abaixo da borda delas).
//
// Modelo: malha polar (anéis em progressão geométrica: detalhe perto do centro do mapa, poucos
// triângulos até o horizonte), deslocada no vertex shader por uma soma de ondas de Gerstner.
//
// Vento (direção Vector2 + intensidade 0..1) comanda o mar inteiro, e muda devagar com rajadas:
//  - ondas: direções espalhadas em volta da direção do vento; comprimento e inclinação crescem
//    com a intensidade; a velocidade de cada onda vem da dispersão de águas profundas
//    (c = √(g/k)), então ondas longas andam mais rápido, como no mar de verdade;
//  - micro-relevo: dois normal maps (a mesma textura repetível) deslizando em direções e
//    velocidades um pouco diferentes, puxados pelo vento;
//  - espuma: nas cristas, onde as ondas de Gerstner se "dobram" (Jacobiano < 1) e estão altas,
//    mais forte com vento forte; e em volta de objetos que tocam a água (contatos: base das
//    cachoeiras do mar e respingos), com borda recortada por ruído e pulsando.
//
// Cor: água funda/rasa (luz atravessando as cristas), reflexo do céu com Fresnel, brilho do
// sol; no longe some na neblina/céu para não aparecer a borda da malha.

const DIR_SOL = new THREE.Vector3(0.55, 0.75, 0.4).normalize(); // a mesma luz do sol do jogo
const G = 9.8;
const N_ONDAS = 6;
const N_CONTATOS = 8;
const PASTA = new URL('../assets/efeitos/', import.meta.url).href;
// no celular o mar (visto quase sempre de cima das ilhas) tem menos da metade dos vértices: as ondas são
// calculadas por vértice, e dessa altura a diferença não aparece
const CELULAR = detectarHardware().perfil === 'celular';
const MALHA = CELULAR ? { raioMin: 3, raioMax: 1100, aneis: 72, setores: 128 } : { raioMin: 3, raioMax: 1100, aneis: 110, setores: 192 };

// Espalhamento de cada onda em volta do vento: ângulo (rad), comprimento relativo, parte da
// inclinação total. Ângulos e comprimentos "tortos" evitam que o padrão se repita.
const ESPECTRO = [
  [0.0, 1.0, 0.26],
  [0.38, 0.73, 0.2],
  [-0.52, 0.57, 0.17],
  [0.95, 0.41, 0.14],
  [-1.21, 0.33, 0.12],
  [0.21, 0.23, 0.11],
];

// Impactos (algo que cai no mar): no ponto do impacto a água sobe e volta, e um trem de anéis corre
// para fora (~6 m/s) perdendo força. A malha é grossa longe do centro do mapa, então o vertex
// shader faz só a forma grande (bolha central e anéis longos) e o fragment shader desenha os
// anéis finos pela normal, com espuma na crista dos primeiros.
const N_IMPACTOS = 4;
const IMPACTO_GLSL = /* glsl */`
  #define N_IMPACTOS ${N_IMPACTOS}
  uniform vec4 uImpactos[N_IMPACTOS]; // x, z, momento do impacto (no relógio uTempo), força
  float alturaImpacto(vec2 xz) {
    float h = 0.0;
    for (int i = 0; i < N_IMPACTOS; i++) {
      vec4 c = uImpactos[i];
      if (c.w <= 0.0) continue;
      float idade = uTempo - c.z;
      if (idade < 0.0 || idade > 9.0) continue;
      float r = length(xz - c.xy);
      // centro: a água é empurrada para cima pelo impacto e volta, oscilando e amortecendo
      float centro = exp(-r * r / 18.0) * sin(idade * 5.5) * exp(-idade * 1.8) * 1.4;
      // anéis longos que se espalham
      float frente = r - 6.0 * idade;
      float env = exp(-frente * frente / 20.0) * exp(-idade * 0.4) / (1.0 + r * 0.05);
      h += (centro + cos(frente * 0.55) * env * 0.9) * c.w;
    }
    return h;
  }
  // anéis finos: inclinação (dh/dx, dh/dz) e quanto é crista (para a espuma)
  vec3 ondulacaoImpacto(vec2 xz) {
    vec2 incl = vec2(0.0);
    float crista = 0.0;
    for (int i = 0; i < N_IMPACTOS; i++) {
      vec4 c = uImpactos[i];
      if (c.w <= 0.0) continue;
      float idade = uTempo - c.z;
      if (idade < 0.0 || idade > 9.0) continue;
      vec2 d = xz - c.xy;
      float r = max(length(d), 0.001);
      float frente = r - 6.0 * idade;
      // atrás da frente os anéis continuam, cada vez mais fracos
      float env = (frente > 0.0 ? exp(-frente * frente / 6.0) : exp(frente * 0.12)) * exp(-idade * 0.5) / (1.0 + r * 0.05);
      float k = 2.2;
      incl += -sin(frente * k) * k * env * 0.3 * c.w * d / r;
      crista += smoothstep(0.7, 1.0, cos(frente * k)) * env * c.w * 0.7 * (1.0 - smoothstep(0.0, 3.5, idade));
    }
    return vec3(incl, crista);
  }
`;

// Praia (praia.js): o contorno da areia é um círculo deformado por três senoides; perto dele as
// ondas acalmam (enseada abrigada), a água fica rasa e turquesa e a espuma vai e volta na beira.
const PRAIA_GLSL = /* glsl */`
  // costa das ilhas (definirCosta): distância (m, até 16) da água até o pé da falésia, numa textura
  uniform sampler2D uCosta;
  uniform vec4 uCostaCaixa; // minX, minZ, 1/tamanho, 1 = existe
  float distCosta(vec2 xz) {
    if (uCostaCaixa.w <= 0.0) return 1e4;
    vec2 t = (xz - uCostaCaixa.xy) * uCostaCaixa.z;
    if (t.x < 0.0 || t.y < 0.0 || t.x > 1.0 || t.y > 1.0) return 1e4;
    return texture2D(uCosta, t).r * 16.0;
  }
  uniform vec4 uPraia;   // centro x, centro z, raio base, 1 = existe praia
  uniform vec3 uHarm[3]; // amplitude, frequência, fase de cada senoide do contorno
  // distância (m) até a linha d'água: < 0 dentro da areia, > 0 no mar
  float distPraia(vec2 xz) {
    if (uPraia.w <= 0.0) return 1e4;
    vec2 d = xz - uPraia.xy;
    float a = atan(d.y, d.x);
    float k = 1.0;
    for (int i = 0; i < 3; i++) k += uHarm[i].x * sin(uHarm[i].y * a + uHarm[i].z);
    return length(d) - uPraia.z * k;
  }
`;

const VERTEX = /* glsl */`
  #define N_ONDAS ${N_ONDAS}
  uniform float uTempo;
  ${IMPACTO_GLSL}
  ${PRAIA_GLSL}
  uniform vec4 uOndas[N_ONDAS]; // xy = direção, z = inclinação (steepness), w = comprimento de onda
  varying vec3 vMundo;
  varying vec3 vNormal;
  varying float vAltura;
  varying float vDobra;

  void main() {
    vec3 base = (modelMatrix * vec4(position, 1.0)).xyz;
    vec3 p = base;
    vec3 tangente = vec3(1.0, 0.0, 0.0);
    vec3 binormal = vec3(0.0, 0.0, 1.0);
    float jxx = 1.0, jzz = 1.0, jxz = 0.0;
    // os anéis da malha se afastam com a distância: onda curta demais para o espaçamento
    // (menos de ~6 vértices por comprimento) vira serrilhado, então ela some suavemente
    float passo = max(length(position.xz) * ${(Math.pow(MALHA.raioMax / MALHA.raioMin, 1 / MALHA.aneis) - 1).toFixed(4)}, 0.2);
    // perto da praia o mar é uma enseada calma: as ondas grandes diminuem até a beira
    float calma = mix(0.12, 1.0, smoothstep(0.0, 45.0, distPraia(base.xz)));
    for (int i = 0; i < N_ONDAS; i++) {
      vec2 d = uOndas[i].xy;
      float L = uOndas[i].w;
      float s = uOndas[i].z * clamp((L / passo - 6.0) / 4.0, 0.0, 1.0) * calma;
      float k = 6.28318 / L;
      float c = sqrt(${G.toFixed(1)} / k);          // dispersão em águas profundas
      float f = k * (dot(d, base.xz) - c * uTempo);
      float a = s / k;
      float sf = sin(f), cf = cos(f);
      p.x += d.x * a * cf;
      p.y += a * sf;
      p.z += d.y * a * cf;
      tangente += vec3(-d.x * d.x * s * sf, d.x * s * cf, -d.x * d.y * s * sf);
      binormal += vec3(-d.x * d.y * s * sf, d.y * s * cf, -d.y * d.y * s * sf);
      jxx -= d.x * d.x * s * sf;
      jzz -= d.y * d.y * s * sf;
      jxz -= d.x * d.y * s * sf;
    }
    vNormal = normalize(cross(binormal, tangente));
    // impactos: altura e inclinação (diferenças centrais) somadas às ondas do vento
    float hi = alturaImpacto(base.xz);
    p.y += hi;
    const float E = 0.8;
    vec2 gi = vec2(alturaImpacto(base.xz + vec2(E, 0.0)) - alturaImpacto(base.xz - vec2(E, 0.0)),
                   alturaImpacto(base.xz + vec2(0.0, E)) - alturaImpacto(base.xz - vec2(0.0, E))) / (2.0 * E);
    vNormal = normalize(vNormal + vec3(-gi.x, 0.0, -gi.y));
    vAltura = p.y - base.y;
    vDobra = jxx * jzz - jxz * jxz; // < 1: a superfície se comprime (crista quebrando)
    vMundo = p;
    gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
  }
`;

const FRAGMENT = /* glsl */`
  #define N_CONTATOS ${N_CONTATOS}
  uniform float uTempo;
  uniform vec3 uRasoPraia, uAreiaFundo;
  ${IMPACTO_GLSL}
  ${PRAIA_GLSL}
  uniform sampler2D uNormalMap;
  uniform float uLonge, uGradiente, uEspuma, uBrilho, uVentoForca, uAlturaMax;
  uniform vec2 uDeslocA, uDeslocB;               // rolagem dos dois normal maps (acumulada no JS)
  uniform vec4 uContatos[N_CONTATOS];            // x, z, raio, intensidade
  uniform vec3 uSol, uProfundo, uRaso, uTopo, uHorizonte, uBaixo, uCorEspuma;
  uniform vec3 uLuzAgua, uCorSol; // luz do momento do dia (dia claro, pôr do sol, luar) e cor do brilho
  uniform float uForcaSol;
  uniform vec3 fogColor;
  uniform float fogNear, fogFar;
  uniform vec4 fogSol, fogBrilho; // o dourado do lado do sol (estilo.js)
  varying vec3 vMundo;
  varying vec3 vNormal;
  varying float vAltura;
  varying float vDobra;

  vec3 amostraNormal(vec2 uv) { return texture2D(uNormalMap, uv).xyz * 2.0 - 1.0; }

  void main() {
    vec2 uv = vMundo.xz;
    float dist = length(cameraPosition - vMundo);
    // no longe o micro-relevo vira ruído: some aos poucos
    float perto = 1.0 - clamp(dist / 280.0, 0.0, 1.0);

    // dois normal maps em direções/velocidades diferentes + uma amostra larga contra repetição
    vec3 na = amostraNormal(uv * 0.045 + uDeslocA);
    vec3 nb = amostraNormal(uv * 0.11 + uDeslocB);
    vec3 nc = amostraNormal(uv * 0.009 + uDeslocA * 0.3);
    float relevo = (0.35 + uVentoForca * 0.5) * perto;
    vec2 micro = (na.xy * 0.55 + nb.xy * 0.45) * relevo + nc.xy * 0.25;
    vec3 oi = ondulacaoImpacto(uv); // anéis finos dos impactos
    vec3 N = normalize(vNormal + vec3(micro.x - oi.x, 0.0, micro.y - oi.y));

    vec3 V = normalize(cameraPosition - vMundo);
    vec3 R = reflect(-V, N);
    R.y = abs(R.y);

    // reflexo do céu (o mesmo degradê do céu do jogo) com Fresnel (Schlick, água ≈ 0,02)
    vec3 ceu = mix(uHorizonte, uTopo, pow(R.y, 0.6));
    float fres = 0.02 + 0.98 * pow(1.0 - max(dot(N, V), 0.0), 5.0);

    // cor: funda nos vales, turquesa nas cristas (luz atravessando a onda)
    float crista = clamp(vAltura / max(uAlturaMax, 0.01) * 0.5 + 0.5, 0.0, 1.0);
    float luz = max(dot(N, uSol), 0.0) * 0.35 + 0.65;
    vec3 agua = mix(uProfundo, uRaso, crista * 0.85 + nb.z * 0.1) * luz;
    // perto da praia: água rasa turquesa e, bem na beira, a areia aparecendo por baixo
    float sp = distPraia(uv);
    float raso = 1.0 - smoothstep(0.0, 24.0, sp);
    agua = mix(agua, uRasoPraia * luz, raso * 0.85);
    agua = mix(agua, uAreiaFundo * luz, (1.0 - smoothstep(0.0, 5.0, sp)) * 0.55);
    fres *= 1.0 - raso * 0.5; // água rasa reflete menos o céu (vê-se o fundo)
    agua *= uLuzAgua;         // à noite o mar escurece; no pôr do sol fica dourado
    vec3 cor = mix(agua, ceu, fres);

    // sol: brilho forte e um halo largo.
    // Antisserrilhado especular: onde a normal varia muito dentro de um pixel (longe, ondinhas
    // menores que o pixel) um brilho fino viraria pontos piscando; ali ele se abre e enfraquece,
    // conservando mais ou menos a mesma energia
    float varN = clamp(length(fwidth(N)) * 3.0, 0.0, 1.0);
    float expoente = mix(380.0, 28.0, varN);
    float rs = max(dot(R, uSol), 0.0);
    cor += uCorSol * uForcaSol * (pow(rs, expoente) * mix(6.0, 0.45, varN) + pow(rs, 45.0) * 0.25);

    // ---- espuma ----
    // padrão recortado (mesma textura, outra escala), para a espuma não ser uma mancha lisa
    float padrao = clamp(0.5 + (amostraNormal(uv * 0.21 - uDeslocB * 1.7).x + na.y) * 0.9, 0.0, 1.0);
    // cristas: superfície comprimida (Jacobiano baixo) e alta; vento forte quebra mais ondas
    float dobra = smoothstep(0.75 - uVentoForca * 0.25, 0.35, vDobra);
    float alta = smoothstep(0.25, 0.85, crista);
    float espCrista = dobra * alta * smoothstep(0.25, 0.7, padrao) * (0.35 + uVentoForca);
    // contatos: anel turbulento em volta de quem toca a água
    float espContato = 0.0;
    for (int i = 0; i < N_CONTATOS; i++) {
      vec4 c = uContatos[i];
      if (c.w <= 0.0) continue;
      float d = length(uv - c.xy) - c.z;
      float largura = c.z * 0.55 + 2.0;
      float anel = 1.0 - smoothstep(0.0, largura * (0.6 + padrao * 0.7), d);
      anel *= smoothstep(-c.z * 0.6, 0.0, d); // não pinta dentro do objeto (ele cobre)
      float pulso = 0.75 + 0.25 * sin(uTempo * 2.3 + d * 0.9);
      espContato = max(espContato, anel * c.w * pulso * smoothstep(0.15, 0.6, padrao + 0.25));
    }
    espContato = max(espContato, oi.z * smoothstep(0.2, 0.6, padrao + 0.15)); // crista dos anéis do impacto
    // espuma da praia: a linha que vai e volta na areia e uma segunda faixa chegando
    float vaiVem = sin(uTempo * 1.2 - sp * 0.9 + padrao * 2.0);
    float espPraia = (1.0 - smoothstep(0.0, 1.6 + 0.9 * vaiVem, sp)) * smoothstep(-1.5, 0.0, sp);
    espPraia = max(espPraia, smoothstep(0.75, 1.0, vaiVem) * (1.0 - smoothstep(2.0, 9.0, sp)) * 0.6);
    espContato = max(espContato, espPraia * smoothstep(0.15, 0.55, padrao + 0.2));
    // espuma no pé das falésias: a onda bate na rocha, uma faixa branca rente a ela e outra que vem
    // chegando, e a água um pouco mais clara perto da costa
    float sc = distCosta(uv);
    if (sc < 16.0) {
      float bate = sin(uTempo * 1.5 - sc * 1.2 + padrao * 2.5);
      float espCosta = (1.0 - smoothstep(0.2, 1.4 + 0.9 * bate, sc));
      espCosta = max(espCosta, smoothstep(0.7, 1.0, bate) * (1.0 - smoothstep(1.5, 7.0, sc)) * 0.55);
      espContato = max(espContato, espCosta * smoothstep(0.12, 0.5, padrao + 0.25));
      cor = mix(cor, cor * 1.12 + uRaso * 0.08, (1.0 - smoothstep(0.0, 10.0, sc)) * (1.0 - fres));
    }
    float esp = clamp(max(espCrista, espContato) * uEspuma, 0.0, 1.0) * (0.35 + 0.65 * perto);
    cor = mix(cor, uCorEspuma * luz * uLuzAgua, esp);

    cor *= uBrilho; // compensa a exposição baixa do tone mapping do High

    // longe: some na neblina (ou no degradê de baixo do céu, que é o que aparece além do mar)
    vec3 D = -V;
    vec3 ceuBaixo = mix(uHorizonte, uBaixo, pow(clamp(-D.y, 0.0, 1.0), 0.5));
    vec3 longe = mix(fogColor, ceuBaixo, uGradiente);
    float sLonge = max(dot(D, fogSol.xyz), 0.0);
    longe = mix(longe, fogBrilho.rgb, sLonge * sLonge * (1.0 - abs(D.y)) * fogSol.w) + fogBrilho.rgb * pow(sLonge, 5.0) * fogBrilho.a;
    float f = smoothstep(fogNear, fogFar, dist * 0.72);
    // some aos poucos até o limite do desenho (uma faixa estreita aparecia como um disco de borda
    // redonda no mar visto do alto, no celular, onde o limite é mais perto)
    f = max(f, smoothstep(uLonge * 0.3, uLonge * 0.97, dist) * smoothstep(uLonge * 0.3, uLonge * 0.97, dist));
    cor = mix(cor, longe, f);

    gl_FragColor = vec4(cor, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

// grade polar: anéis em progressão geométrica (detalhe perto, poucos triângulos no longe)
function geometriaMar(raioMin, raioMax, aneis, setores) {
  const pos = [0, 0, 0], idx = [];
  for (let i = 0; i <= aneis; i++) {
    const r = raioMin * Math.pow(raioMax / raioMin, i / aneis);
    for (let s = 0; s < setores; s++) {
      const a = (s / setores) * Math.PI * 2;
      pos.push(Math.cos(a) * r, 0, Math.sin(a) * r);
    }
  }
  const v = (i, s) => 1 + i * setores + (s % setores);
  for (let s = 0; s < setores; s++) idx.push(0, v(0, s + 1), v(0, s));
  for (let i = 0; i < aneis; i++) for (let s = 0; s < setores; s++) {
    const a = v(i, s), b = v(i, s + 1), c = v(i + 1, s), d = v(i + 1, s + 1);
    idx.push(a, b, d, a, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), raioMax);
  return g;
}

export function criarAgua({ cena, mapa, renderer }) {
  const caixa = mapa.geo.boundingBox;
  const centro = caixa.getCenter(new THREE.Vector3());
  // abaixo da ilha e do mar de nuvens; quem cai da ilha chega até aqui (respingo + ondas)
  const nivel = mapa.mar?.nivel ?? caixa.min.y - 20; // o mapa gerado diz onde fica o mar (logo abaixo da borda das ilhas)

  // ---- vento ----
  // direção e intensidade "de base" (ajustáveis) + rajadas lentas e um giro suave da direção
  const vento = { direcao: new THREE.Vector2(0.8, 0.6).normalize(), forca: 0.55, rajadas: true };
  const ventoAtual = { direcao: vento.direcao.clone(), forca: vento.forca };

  const normalMap = new THREE.TextureLoader().load(PASTA + 'agua_normal.png');
  normalMap.wrapS = normalMap.wrapT = THREE.RepeatWrapping;
  normalMap.anisotropy = Math.min(8, renderer?.capabilities.getMaxAnisotropy() ?? 4);

  const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
    uTempo: { value: 0 },
    uOndas: { value: Array.from({ length: N_ONDAS }, () => new THREE.Vector4(1, 0, 0, 30)) },
    uAlturaMax: { value: 1 },
    uVentoForca: { value: vento.forca },
    uDeslocA: { value: new THREE.Vector2() },
    uDeslocB: { value: new THREE.Vector2() },
    uContatos: { value: Array.from({ length: N_CONTATOS }, () => new THREE.Vector4()) },
    uImpactos: { value: Array.from({ length: N_IMPACTOS }, () => new THREE.Vector4()) },
    uPraia: { value: new THREE.Vector4(0, 0, 0, 0) },
    uCosta: { value: null },
    uCostaCaixa: { value: new THREE.Vector4(0, 0, 0, 0) },
    uHarm: { value: [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()] },
    uRasoPraia: { value: new THREE.Color('#5fdcd2') },
    uLuzAgua: { value: new THREE.Color(1, 1, 1) },
    uCorSol: { value: new THREE.Color(1.0, 0.95, 0.82) },
    uForcaSol: { value: 1 },
    uAreiaFundo: { value: new THREE.Color('#d9c48f') },
    uLonge: { value: 300 },
    uGradiente: { value: 1 },
    uEspuma: { value: 1 },
    uBrilho: { value: 1 },
    uNormalMap: { value: null },
    uSol: { value: DIR_SOL.clone() },
    uProfundo: { value: new THREE.Color('#0c3f5c') },
    uRaso: { value: new THREE.Color('#2a9fae') },
    uCorEspuma: { value: new THREE.Color('#eef8ff') },
    uTopo: { value: new THREE.Color('#4f9be8') },
    uHorizonte: { value: new THREE.Color('#a9d8ff') },
    uBaixo: { value: new THREE.Color('#d8ecff') },
  }]);
  uniforms.uNormalMap.value = normalMap; // merge clona as texturas; a original é a que carrega
  const material = new THREE.ShaderMaterial({ uniforms, vertexShader: VERTEX, fragmentShader: FRAGMENT, fog: true });
  const mar = new THREE.Mesh(geometriaMar(MALHA.raioMin, MALHA.raioMax, MALHA.aneis, MALHA.setores), material);
  mar.position.set(centro.x, nivel, centro.z);
  mar.frustumCulled = false; // a malha é enorme e quase sempre aparece
  mar.name = 'mar';
  cena.add(mar);

  // ondas de Gerstner a partir do vento: inclinação total < 1 (senão as cristas se cruzam)
  function atualizarOndas() {
    const { direcao, forca } = ventoAtual;
    const base = Math.atan2(direcao.y, direcao.x);
    const comprimento = 22 + forca * 58; // m: vento forte forma ondas longas
    const inclinacaoTotal = 0.25 + forca * 0.55;
    let alturaMax = 0;
    ESPECTRO.forEach(([ang, rel, parte], i) => {
      const a = base + ang, L = comprimento * rel, s = inclinacaoTotal * parte;
      uniforms.uOndas.value[i].set(Math.cos(a), Math.sin(a), s, L);
      alturaMax += s / ((Math.PI * 2) / L);
    });
    uniforms.uAlturaMax.value = alturaMax;
    uniforms.uVentoForca.value = forca;
  }
  atualizarOndas();

  // ---- contatos (espuma de interseção) ----
  // fixos: objetos parados na água (cachoeiras); temporários: respingos, que somem sozinhos
  const fixos = [], temporarios = [];
  function adicionarContato(x, z, raio, intensidade = 1) { fixos.push({ x, z, raio, intensidade }); }
  function atualizarContatos(dt) {
    for (const c of [...temporarios]) { c.vida -= dt; if (c.vida <= 0) temporarios.splice(temporarios.indexOf(c), 1); }
    const lista = [...fixos, ...temporarios.map(c => ({ ...c, raio: c.raio * (1 + (1.6 - c.vida) * 1.5), intensidade: Math.min(1, c.vida) }))];
    uniforms.uContatos.value.forEach((v, i) => {
      const c = lista[i];
      if (c) v.set(c.x, c.z, c.raio, c.intensidade); else v.set(0, 0, 0, 0);
    });
  }

  // ---- respingo (quando algo cai no mar) ----
  const respingos = [];
  const gotaMat = new THREE.SpriteMaterial({
    map: (() => {
      const c = document.createElement('canvas'); c.width = c.height = 32;
      const g = c.getContext('2d'), gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 32, 32);
      return new THREE.CanvasTexture(c);
    })(),
    transparent: true, depthWrite: false, color: '#e8f8ff',
  });
  // A água que sobe: uma coroa (parede fina que abre para fora, com a borda recortada em
  // filetes) logo no impacto, e depois o jato do meio, que sobe quando a cavidade se fecha e cai
  // de volta. Gotas voam e caem com gravidade. Tudo do tamanho da força do impacto.
  const alfaCoroa = (() => {
    const c = document.createElement('canvas'); c.width = 128; c.height = 64;
    const g = c.getContext('2d');
    // v = 0 embaixo (na água), 1 em cima: a borda de cima sobe em "dedos" de alturas diferentes
    for (let x = 0; x < 128; x++) {
      const topo = 0.55 + Math.random() * 0.45;
      const gr = g.createLinearGradient(0, 64, 0, 0);
      gr.addColorStop(0, 'rgba(255,255,255,0.95)'); gr.addColorStop(topo * 0.7, 'rgba(255,255,255,0.8)'); gr.addColorStop(topo, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(x, 0, 1, 64);
    }
    const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping;
    return t;
  })();
  const matSpray = new THREE.MeshStandardMaterial({
    color: '#eafaff', emissive: '#7fc4d8', emissiveIntensity: 0.35, roughness: 0.15, metalness: 0,
    transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide,
  });
  // perfil da coroa (raio, altura) girado em volta do eixo: abre para fora conforme sobe
  const geoCoroa = new THREE.LatheGeometry([[0.85, -0.3], [0.95, 0], [1.05, 0.3], [1.3, 0.7], [1.65, 1.0], [2.0, 1.15]].map(([r, y]) => new THREE.Vector2(r, y)), 32);
  // jato: mais largo na base, fino em cima, base na água
  const geoJato = new THREE.CylinderGeometry(0.12, 0.5, 1, 14, 6, true).translate(0, 0.5, 0);
  { // irregularidade fixa nos vértices para não parecer um tubo perfeito
    const p = geoJato.attributes.position;
    for (let i = 0; i < p.count; i++) { const k = 1 + (Math.random() - 0.5) * 0.25; p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k); }
    geoJato.computeVertexNormals();
  }
  const impactos = uniforms.uImpactos.value;
  let proximoImpacto = 0;

  function respingo(x, z, forca = 1) {
    // ondas na superfície (shader): ocupa o espaço do impacto mais antigo
    impactos[proximoImpacto].set(x, z, uniforms.uTempo.value, forca);
    proximoImpacto = (proximoImpacto + 1) % N_IMPACTOS;

    const grupo = new THREE.Group();
    grupo.position.set(x, nivel, z);
    const coroa = new THREE.Mesh(geoCoroa, matSpray.clone());
    coroa.material.alphaMap = alfaCoroa;
    coroa.material.alphaMap.repeat.set(3, 1);
    coroa.scale.set(1, 0.01, 1);
    const jato = new THREE.Mesh(geoJato, matSpray.clone());
    jato.material.alphaMap = alfaCoroa; // filetes e topo que se desfaz, como na coroa
    jato.material.emissiveIntensity = 0.5;
    jato.scale.set(1, 0.01, 1); jato.visible = false;
    grupo.add(coroa, jato);
    const gotas = [];
    const n = Math.round(14 + forca * 26);
    for (let i = 0; i < n; i++) {
      const s = new THREE.Sprite(gotaMat.clone());
      s.scale.setScalar((0.25 + Math.random() * 0.5) * (0.7 + forca * 0.5));
      const a = Math.random() * Math.PI * 2, v = (2 + Math.random() * 4) * forca;
      s.position.set(Math.cos(a) * 0.9, 0.3, Math.sin(a) * 0.9);
      s.userData.v = new THREE.Vector3(Math.cos(a) * v, (5 + Math.random() * 8) * forca, Math.sin(a) * v);
      grupo.add(s); gotas.push(s);
    }
    cena.add(grupo);
    respingos.push({ grupo, coroa, jato, gotas, t: 0, forca });
    temporarios.push({ x, z, raio: 0.9 + forca * 0.5, vida: 1.6 }); // anel de espuma em volta
  }

  // ---- por quadro ----
  let tRajada = 0;
  function atualizar(dt, t, camera) {
    // rajadas: a intensidade oscila em volta da base e a direção gira devagar
    if (vento.rajadas) {
      tRajada += dt;
      const rajada = Math.sin(tRajada * 0.13) * 0.6 + Math.sin(tRajada * 0.31 + 1.7) * 0.4;
      ventoAtual.forca = THREE.MathUtils.clamp(vento.forca + rajada * 0.18, 0.05, 1);
      const giro = Math.sin(tRajada * 0.021) * 0.35;
      ventoAtual.direcao.copy(vento.direcao).rotateAround(new THREE.Vector2(), giro);
    } else {
      ventoAtual.forca = vento.forca; ventoAtual.direcao.copy(vento.direcao);
    }
    atualizarOndas();
    // os normal maps rolam a favor do vento, um mais rápido e um pouco desviado
    const d = ventoAtual.direcao, v = 0.004 + ventoAtual.forca * 0.02;
    const cA = Math.cos(0.3), sA = Math.sin(0.3), cB = Math.cos(-0.45), sB = Math.sin(-0.45);
    uniforms.uDeslocA.value.x += (d.x * cA - d.y * sA) * v * dt;
    uniforms.uDeslocA.value.y += (d.x * sA + d.y * cA) * v * dt;
    uniforms.uDeslocB.value.x += (d.x * cB - d.y * sB) * v * 1.6 * dt;
    uniforms.uDeslocB.value.y += (d.x * sB + d.y * cB) * v * 1.6 * dt;
    uniforms.uTempo.value = t;
    uniforms.uLonge.value = camera.far;
    atualizarContatos(dt);

    for (const r of [...respingos]) {
      r.t += dt;
      const f = r.forca;
      // coroa: sobe rápido (0,35 s), abre para fora e desmorona, ficando transparente
      const kc = Math.min(1, r.t / 1.1);
      const alturaC = Math.sin(Math.min(1, r.t / 0.35) * Math.PI / 2) * (1 - THREE.MathUtils.smoothstep(r.t, 0.45, 1.1));
      r.coroa.scale.set(1 + kc * 1.3 * f, Math.max(0.01, alturaC * 1.9 * f), 1 + kc * 1.3 * f);
      r.coroa.material.opacity = 0.9 * (1 - THREE.MathUtils.smoothstep(r.t, 0.6, 1.15));
      // jato: nasce quando a cavidade fecha (0,25 s), sobe até ~5 m e cai de volta
      const kj = (r.t - 0.25) / 1.15;
      r.jato.visible = kj > 0 && kj < 1;
      if (r.jato.visible) {
        const sobe = Math.pow(Math.sin(kj * Math.PI), 0.8);
        r.jato.scale.set(0.8 + f * 0.5, Math.max(0.01, sobe * 5 * f), 0.8 + f * 0.5);
        r.jato.material.opacity = 0.7 * (1 - THREE.MathUtils.smoothstep(kj, 0.7, 1));
        r.jato.rotation.y += dt * 2; // os filetes giram um pouco: a água escorrendo não fica parada
      }
      // gotas: balística com gravidade; ao voltar para a água, somem
      for (const g of r.gotas) {
        g.userData.v.y -= 20 * dt;
        g.position.addScaledVector(g.userData.v, dt);
        if (g.position.y < 0) g.visible = false;
        g.material.opacity = Math.max(0, 1 - r.t / 1.8);
      }
      if (r.t > 1.9) {
        cena.remove(r.grupo);
        for (const g of r.gotas) g.material.dispose();
        r.coroa.material.dispose(); r.jato.material.dispose();
        respingos.splice(respingos.indexOf(r), 1);
      }
    }
  }

  // High troca o céu pelo céu físico: o longe do mar passa a sumir na neblina dele
  function aplicarNivel(nivelGrafico) {
    uniforms.uGradiente.value = nivelGrafico.efeitos ? 0 : 1;
    uniforms.uBrilho.value = nivelGrafico.efeitos ? 2.3 : 1;
    uniforms.uEspuma.value = nivelGrafico.materialSimples ? 0.7 : 1;
  }

  // hora do dia (ceu.js): o mar reflete as cores do céu, brilha com o sol (ou com a lua) e escurece à noite
  function definirCeu(e) {
    uniforms.uTopo.value.copy(e.topo);
    uniforms.uHorizonte.value.copy(e.neblina);
    uniforms.uBaixo.value.copy(e.baixo);
    uniforms.uSol.value.copy(e.dirLuzVisivel);
    uniforms.uLuzAgua.value.setRGB(1, 1, 1).lerp(e.corLuz, 0.35).multiplyScalar(THREE.MathUtils.lerp(0.16, 1, e.dia));
    uniforms.uCorSol.value.copy(e.corLuz);
    uniforms.uForcaSol.value = THREE.MathUtils.lerp(0.35, 1, e.dia);
  }

  // contorno da praia (praia.js) para a água rasa, a espuma da beira e as ondas mais calmas
  function definirPraia({ cx, cz, R0, harmonicos }) {
    uniforms.uPraia.value.set(cx, cz, R0, 1);
    harmonicos.forEach(([a, k, f], i) => uniforms.uHarm.value[i].set(a, k, f));
  }

  // Costa: onde cada ilha encontra a água (raios do centro para fora, rente à água, até a
  // falésia) vira uma textura de distância até a costa (calculada uma vez, ~256 KB) que o shader
  // usa para a espuma no pé das falésias. Sem textura ainda, o shader recebe um pixel "longe".
  uniforms.uCosta.value = (() => { const t = new THREE.DataTexture(new Uint8Array([255]), 1, 1, THREE.RedFormat); t.unpackAlignment = 1; t.needsUpdate = true; return t; })();
  function definirCosta(malhaColisao, ilhas) {
    const rc = new THREE.Raycaster(); rc.firstHitOnly = true; rc.layers.enableAll();
    const K = 256, y = nivel + 0.05, o = new THREE.Vector3(), d = new THREE.Vector3();
    // (os raios saem de dentro da ilha: a falésia é vista por trás, então vale dos dois lados)
    const lado = malhaColisao.material.side;
    malhaColisao.material.side = THREE.DoubleSide;
    const contornos = ilhas.map(il => {
      const r = new Float32Array(K);
      for (let k = 0; k < K; k++) {
        const a = (k / K) * Math.PI * 2;
        o.set(il.cx, y, il.cz); d.set(Math.cos(a), 0, Math.sin(a));
        rc.set(o, d); rc.far = il.R * 2;
        r[k] = rc.intersectObject(malhaColisao)[0]?.distance ?? 0;
      }
      return { ...il, r, rMax: Math.max(...r) };
    });
    malhaColisao.material.side = lado;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const c of contornos) { minX = Math.min(minX, c.cx - c.rMax); maxX = Math.max(maxX, c.cx + c.rMax); minZ = Math.min(minZ, c.cz - c.rMax); maxZ = Math.max(maxZ, c.cz + c.rMax); }
    const margem = 20, tam = Math.max(maxX - minX, maxZ - minZ) + margem * 2;
    const x0 = (minX + maxX) / 2 - tam / 2, z0 = (minZ + maxZ) / 2 - tam / 2;
    const N = 512, passo = tam / N, dist = new Float32Array(N * N);
    // terra (dentro de algum contorno) = 0; água = "longe"
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const x = x0 + (i + 0.5) * passo, z = z0 + (j + 0.5) * passo;
      let terra = false;
      for (const c of contornos) {
        const dx = x - c.cx, dz = z - c.cz, dd = Math.hypot(dx, dz);
        if (dd > c.rMax) continue;
        const f = ((Math.atan2(dz, dx) / (Math.PI * 2) + 1) % 1) * K, k = Math.floor(f) % K, k2 = (k + 1) % K, t = f - Math.floor(f);
        if (dd < c.r[k] + (c.r[k2] - c.r[k]) * t) { terra = true; break; }
      }
      dist[j * N + i] = terra ? 0 : 1e9;
    }
    // distância por chanfro (duas passadas, vizinhos retos e diagonais): erro de poucos por cento
    const a = passo, b = passo * Math.SQRT2;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      let v = dist[j * N + i];
      if (i > 0) v = Math.min(v, dist[j * N + i - 1] + a);
      if (j > 0) { v = Math.min(v, dist[(j - 1) * N + i] + a); if (i > 0) v = Math.min(v, dist[(j - 1) * N + i - 1] + b); if (i < N - 1) v = Math.min(v, dist[(j - 1) * N + i + 1] + b); }
      dist[j * N + i] = v;
    }
    for (let j = N - 1; j >= 0; j--) for (let i = N - 1; i >= 0; i--) {
      let v = dist[j * N + i];
      if (i < N - 1) v = Math.min(v, dist[j * N + i + 1] + a);
      if (j < N - 1) { v = Math.min(v, dist[(j + 1) * N + i] + a); if (i < N - 1) v = Math.min(v, dist[(j + 1) * N + i + 1] + b); if (i > 0) v = Math.min(v, dist[(j + 1) * N + i - 1] + b); }
      dist[j * N + i] = v;
    }
    const dados = new Uint8Array(N * N);
    for (let k = 0; k < N * N; k++) dados[k] = Math.min(255, Math.round(dist[k] / 16 * 255));
    const tex = new THREE.DataTexture(dados, N, N, THREE.RedFormat);
    tex.unpackAlignment = 1;
    tex.magFilter = tex.minFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
    uniforms.uCosta.value.dispose();
    uniforms.uCosta.value = tex;
    uniforms.uCostaCaixa.value.set(x0, z0, 1 / tam, 1);
  }

  return { mar, nivel, centro, vento, ventoAtual, respingo, adicionarContato, atualizar, aplicarNivel, definirPraia, definirCeu, definirCosta };
}
