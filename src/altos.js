import * as THREE from 'three';
import { texturaDeCanvas } from './canvasTextura.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
const EXPOSICAO_HIGH = 0.66;
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';

// Efeitos do nível gráfico High:
//  - céu físico (atmosfera) que também ilumina e reflete nos materiais (IBL)
//  - pós-processamento: oclusão de ambiente (GTAO), bloom suave, tone mapping cinematográfico, MSAA + SMAA
//  - grama 3D balançando com o vento, mar de nuvens embaixo das ilhas e pólen no ar

const DIR_SOL = new THREE.Vector3(0.55, 0.75, 0.4).normalize(); // a mesma direção da luz do sol (e da sombra)

// ---------- céu ----------
// O modelo de atmosfera fica bem claro perto do horizonte (a parte que a câmera mais vê);
// para o céu visível, um ajuste de brilho e saturação deixa o azul mais vivo.
// O céu que gera a iluminação de ambiente fica sem o ajuste (luz neutra).
function criarCeu(elevacaoSol, vivo) {
  const ceu = new Sky();
  const m = ceu.material, u = m.uniforms;
  u.turbidity.value = 1.5;   // ar limpo: céu mais azul e sol mais nítido
  u.rayleigh.value = 2.1;
  u.mieCoefficient.value = 0.003;
  u.mieDirectionalG.value = 0.86;
  u.sunPosition.value.copy(elevacaoSol);
  if (vivo) {
    u.brilho = { value: 0.6 };
    u.saturacao = { value: 2.4 };
    m.fragmentShader = m.fragmentShader
      .replace('uniform vec3 up;', 'uniform vec3 up;\nuniform float brilho;\nuniform float saturacao;')
      .replace('gl_FragColor = vec4( retColor, 1.0 );', `float lum = dot( retColor, vec3( 0.2126, 0.7152, 0.0722 ) );
        retColor = max( mix( vec3( lum ), retColor, saturacao ) * brilho, 0.0 );
        // abaixo do horizonte (o vazio sob as ilhas): azul profundo em vez do branco do modelo
        float dy = normalize( vWorldPosition - cameraPosition ).y;
        retColor = mix( retColor, vec3( 0.16, 0.36, 0.72 ), smoothstep( 0.02, -0.45, dy ) );
        gl_FragColor = vec4( retColor, 1.0 );`);
  }
  return ceu;
}

// ---------- grama ----------
function lamina() {
  // tufo de 3 folhas cruzadas, cada uma afinando até a ponta; "altura" (0 base, 1 ponta) para o vento
  const pos = [], uv = [], cor = [];
  // multiplica o tom do chão de cada tufo: base um pouco mais escura, ponta clareando ao sol
  const base = new THREE.Color(0.62, 0.7, 0.5), ponta = new THREE.Color(1.18, 1.16, 0.92);
  for (let f = 0; f < 3; f++) {
    const a = (f / 3) * Math.PI, ca = Math.cos(a), sa = Math.sin(a);
    const curva = (Math.random() - 0.5) * 0.15;
    const pts = [[-0.035, 0], [0.035, 0], [-0.022, 0.5], [0.022, 0.5], [0, 1]];
    const v = pts.map(([x, y]) => [x * ca + curva * y * sa, y, x * sa - curva * y * ca]);
    for (const tri of [[0, 1, 2], [1, 3, 2], [2, 3, 4]]) {
      for (const k of tri) {
        pos.push(...v[k]);
        uv.push(pts[k][1]);
        const c = base.clone().lerp(ponta, pts[k][1]);
        cor.push(c.r, c.g, c.b);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('altura', new THREE.Float32BufferAttribute(uv, 1));
  g.setAttribute('color', new THREE.Float32BufferAttribute(cor, 3));
  // normais para cima: a grama acende como o chão em vez de piscar de lado
  g.setAttribute('normal', new THREE.Float32BufferAttribute(pos.map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  return g;
}

function criarGrama(mapa, terreno, tempo) {
  // Lambert não recebe a luz do céu (IBL) como o chão: um pouco de brilho próprio evita grama preta na sombra
  const material = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, emissive: '#26340f' });
  material.onBeforeCompile = s => {
    s.uniforms.tempo = tempo;
    s.vertexShader = 'uniform float tempo;\nattribute float altura;\n' + s.vertexShader.replace('#include <begin_vertex>', `
      #include <begin_vertex>
      vec4 raizMundo = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
      // antisserrilhado: de longe uma folha de 7 cm fica mais fina que um pixel e "chuvisca";
      // ela engrossa com a distância (cobre o mesmo tanto da tela) e encolhe até sumir no limite
      // de onde a grama é desenhada, em vez de aparecer/desaparecer de uma vez
      float dCam = distance(cameraPosition, (modelMatrix * raizMundo).xyz);
      float some = 1.0 - smoothstep(40.0, 54.0, dCam);
      transformed.xz *= clamp(dCam / 12.0, 1.0, 3.0) * some;
      transformed.y *= some;
      // vento: duas ondas que atravessam o campo, mais forte na ponta da folha
      float h = altura * altura;
      float vento = sin(tempo * 1.6 + raizMundo.x * 0.32 + raizMundo.z * 0.21) * 0.16
                  + sin(tempo * 3.7 + raizMundo.x * 1.4 + raizMundo.z * 0.9) * 0.05;
      transformed.x += vento * h;
      transformed.z += vento * 0.55 * h;`);
    // os dois lados da folha usam a normal para cima (o verso não fica preto)
    s.fragmentShader = s.fragmentShader.replace('#include <normal_fragment_begin>', 'vec3 normal = normalize( vNormal ); vec3 nonPerturbedNormal = normal;');
  };
  const geo = lamina();
  const rc = new THREE.Raycaster(); rc.firstHitOnly = true; rc.layers.enableAll();
  const baixo = new THREE.Vector3(0, -1, 0), o = new THREE.Vector3();
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Vector3(), s = new THREE.Vector3(), cima = new THREE.Vector3(0, 1, 0);
  const cor = new THREE.Color();
  // agrupa por blocos de 16 m: cada bloco é descartado se estiver fora da tela ou longe
  const blocos = new Map();
  // densidade pelo tamanho do gramado: no máximo ~120 mil tufos no mapa inteiro (a ilha gerada é
  // quase toda campina; com 12 por célula passava de 400 mil e o High ficava pesado)
  const POR_CELULA = Math.max(2, Math.min(12, Math.round(120000 / Math.max(1, terreno.gramado.length)))), passo = terreno.passo;
  for (const c of terreno.gramado) {
    for (let k = 0; k < POR_CELULA; k++) {
      const x = c.x + (Math.random() - 0.5) * passo, z = c.z + (Math.random() - 0.5) * passo;
      rc.set(o.set(x, c.y + 1.5, z), baixo); rc.far = 3;
      const h = rc.intersectObject(mapa.malha)[0];
      if (!h || h.face.normal.y < 0.72) continue;
      const chave = `${Math.floor(x / 16)},${Math.floor(z / 16)}`;
      if (!blocos.has(chave)) blocos.set(chave, []);
      // levemente inclinado com o terreno, girado ao acaso, altura variada
      q.setFromUnitVectors(cima, e.copy(h.face.normal).lerp(cima, 0.6).normalize());
      q.multiply(new THREE.Quaternion().setFromAxisAngle(cima, Math.random() * Math.PI * 2));
      const alt = 0.16 + Math.random() * 0.22;
      m.compose(h.point, q, s.set(0.9 + Math.random() * 0.7, alt, 0.9 + Math.random() * 0.7));
      // tom do próprio chão naquele ponto, para a grama "nascer" da textura
      const t = h.uv && mapa.amostrar(h.uv);
      if (t) cor.setRGB(t[0] / 255, t[1] / 255, t[2] / 255, THREE.SRGBColorSpace).multiplyScalar(1.35 + Math.random() * 0.3);
      else cor.setHSL(0.2 + Math.random() * 0.05, 0.5, 0.5);
      blocos.get(chave).push([m.clone(), cor.clone()]);
    }
  }
  const grupo = new THREE.Group();
  for (const lista of blocos.values()) {
    const im = new THREE.InstancedMesh(geo, material, lista.length);
    lista.forEach(([mm, cc], i) => { im.setMatrixAt(i, mm); im.setColorAt(i, cc); });
    im.receiveShadow = true;
    im.computeBoundingSphere();
    grupo.add(im);
  }
  return { grupo, instancias: [...blocos.values()].reduce((a, l) => a + l.length, 0) };
}

// ---------- nuvens ----------
function texturaNuvem() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  for (let i = 0; i < 26; i++) {
    const x = 128 + (Math.random() - 0.5) * 150, y = 140 + (Math.random() - 0.5) * 60, r = 30 + Math.random() * 45;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  }
  const t = texturaDeCanvas(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function criarNuvens(caixa, nivelMar = null) {
  const tex = texturaNuvem(), grupo = new THREE.Group(), centro = caixa.getCenter(new THREE.Vector3());
  const lista = [];
  for (let i = 0; i < 44; i++) {
    // nuvens baixas entre as ilhas e o mar (ralas, para o mar aparecer); o resto, altas ao longe
    // (com o mar logo abaixo da borda das ilhas não há espaço entre elas: todas ficam no alto)
    const embaixo = nivelMar === null && i < 24;
    const ang = Math.random() * Math.PI * 2, raio = embaixo ? 30 + Math.random() * 150 : 140 + Math.random() * 120;
    // cor acima de 1: depois do tone mapping elas continuam brancas (senão ficam cinza)
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: embaixo ? 0.55 : 0.75, fog: false });
    mat.color.setRGB(1.75, 1.78, 1.85);
    const sp = new THREE.Sprite(mat);
    const tam = embaixo ? 34 + Math.random() * 30 : 50 + Math.random() * 60;
    const alt = tam * (embaixo ? 0.32 : 0.55);
    sp.scale.set(tam, alt, 1);
    // o mar fica 20 m abaixo da ilha: a borda de baixo da nuvem fica acima dele, senão a
    // superfície da água corta a nuvem numa linha reta
    const yBaixo = caixa.min.y - 20 + alt / 2 + 1 + Math.random() * 4;
    sp.position.set(centro.x + Math.cos(ang) * raio, embaixo ? yBaixo : caixa.max.y + 25 + Math.random() * 40, centro.z + Math.sin(ang) * raio);
    grupo.add(sp);
    lista.push({ sp, ang, raio, vel: (0.004 + Math.random() * 0.006) * (Math.random() < 0.5 ? 1 : -1) });
  }
  return { grupo, lista, centro };
}

// ---------- pólen ----------
function criarPolen() {
  const N = 420, pos = new Float32Array(N * 3), fase = new Float32Array(N);
  for (let i = 0; i < N; i++) { pos[i * 3] = (Math.random() - 0.5) * 40; pos[i * 3 + 1] = Math.random() * 8; pos[i * 3 + 2] = (Math.random() - 0.5) * 40; fase[i] = Math.random() * 10; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const cx = c.getContext('2d'), gr = cx.createRadialGradient(16, 16, 0, 16, 16, 16);
  gr.addColorStop(0, 'rgba(255,250,210,1)'); gr.addColorStop(1, 'rgba(255,250,210,0)');
  cx.fillStyle = gr; cx.fillRect(0, 0, 32, 32);
  const mat = new THREE.PointsMaterial({ size: 0.09, map: texturaDeCanvas(c), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: '#fff6c8' });
  const pts = new THREE.Points(g, mat);
  pts.frustumCulled = false;
  return { pts, base: pos.slice(), fase };
}

export function criarEfeitosAltos({ renderer, cena, camera, mapa, terreno }) {
  const tempo = { value: 0 };
  const sol = DIR_SOL.clone();

  // céu da cena e um céu menor só para gerar a iluminação de ambiente (reflexos e luz do céu)
  const ceu = criarCeu(sol, true);
  ceu.scale.setScalar(450);
  ceu.material.fog = false;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const cenaCeu = new THREE.Scene();
  const ceuIbl = criarCeu(sol); ceuIbl.scale.setScalar(90);
  cenaCeu.add(ceuIbl);
  const ambiente = pmrem.fromScene(cenaCeu, 0, 0.1, 200).texture;

  const grama = criarGrama(mapa, terreno, tempo);
  const nuvens = criarNuvens(mapa.geo.boundingBox, mapa.mar?.nivel ?? null);
  const polen = criarPolen();

  let composer = null, gtao = null, bloom = null, smaa = null;
  // o que o PC aguenta agora (jogo.js baixa e devolve conforme o fps): pós-processamento inteiro,
  // cada passada cara e até onde a grama é desenhada
  const custo = { pos: true, gtao: true, bloom: true, smaa: true, distGrama: 55 };
  function aplicarCusto() {
    if (gtao) gtao.enabled = custo.gtao;
    if (bloom) bloom.enabled = custo.bloom;
    if (smaa) smaa.enabled = custo.smaa;
  }
  function montarComposer() {
    const tam = renderer.getDrawingBufferSize(new THREE.Vector2());
    const alvo = new THREE.WebGLRenderTarget(tam.x, tam.y, { type: THREE.HalfFloatType, samples: 4 });
    composer = new EffectComposer(renderer, alvo);
    composer.addPass(new RenderPass(cena, camera));
    gtao = new GTAOPass(cena, camera, tam.x, tam.y);
    gtao.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1.4, thickness: 1.2, scale: 1.1, samples: 12 });
    gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
    gtao.blendIntensity = 0.85;
    // o GTAO só esconde pontos e linhas na passada de profundidade: nuvens (sprites), céu e
    // transparentes viravam "paredes" retangulares com sombra em volta
    gtao.overrideVisibility = function () {
      const cache = this._visibilityCache;
      this.scene.traverse(o => {
        cache.set(o, o.visible);
        // o mar também: plano enorme e distante, o GTAO escurecia ele e as nuvens na frente dele
        if (o.isPoints || o.isLine || o.isSprite || o === ceu || o.material?.transparent || o.name === 'mar' || o.name === 'ceu-cupula') o.visible = false;
      });
    };
    composer.addPass(gtao);
    // só o que é bem claro (sol, reflexos fortes) brilha um pouco
    bloom = new UnrealBloomPass(new THREE.Vector2(tam.x, tam.y), 0.14, 0.45, 1.0);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
    // SMAA no fim (na imagem já em sRGB): o MSAA só alisa as bordas da geometria; o SMAA pega
    // também as bordas que o GTAO e o bloom criam e o brilho fino de texturas e reflexos
    smaa = new SMAAPass(tam.x, tam.y);
    composer.addPass(smaa);
    meiaResolucaoGtao();
    aplicarCusto();
  }

  let ativo = false;
  const anterior = {};
  function ativar(sim) {
    if (sim === ativo) return;
    ativo = sim;
    if (sim) {
      Object.assign(anterior, { background: cena.background, environment: cena.environment, toneMapping: renderer.toneMapping, exposicao: renderer.toneMappingExposure, neblina: cena.fog.color.clone() });
      cena.background = null;
      cena.environment = ambiente;
      cena.environmentIntensity = 0.55;
      // Neutral (Khronos, sem a curva de pé: estilo.js), como no Low e no Medium. O ACES de antes
      // leva as cores claras para o branco (o vestido lilás, o reboco e o céu ficavam lavados:
      // metade da saturação do Medium nas mesmas vistas); o Neutral só comprime perto do branco e
      // mantém a cor
      renderer.toneMapping = THREE.NeutralToneMapping;
      renderer.toneMappingExposure = EXPOSICAO_HIGH;
      cena.fog.color.set('#a6c6dc'); // a cor do céu no horizonte: as ilhas distantes somem nele
      // o céu visível é o da cúpula de dia e noite (ceu.js); o céu físico só gera a luz de ambiente
      cena.add(grama.grupo, nuvens.grupo, polen.pts);
      if (!composer && custo.pos) montarComposer();
    } else {
      cena.background = anterior.background;
      cena.environment = anterior.environment ?? null;
      renderer.toneMapping = anterior.toneMapping;
      renderer.toneMappingExposure = anterior.exposicao;
      cena.fog.color.copy(anterior.neblina);
      cena.remove(grama.grupo, nuvens.grupo, polen.pts);
      composer?.dispose?.(); composer = null; gtao = bloom = smaa = null;
    }
    // tone mapping / ambiente mudam os shaders
    cena.traverse(o => { if (o.material) for (const m of [].concat(o.material)) m.needsUpdate = true; });
  }

  const alvoTmp = new THREE.Vector3();
  function atualizar(dt, t, centro) {
    if (!ativo) return;
    tempo.value = t;
    ceu.position.copy(camera.position);
    // grama só perto (o resto ficaria pequeno demais para ver e custaria caro)
    for (const im of grama.grupo.children) im.visible = im.boundingSphere.center.distanceTo(centro) < custo.distGrama + im.boundingSphere.radius;
    for (const n of nuvens.lista) {
      n.ang += n.vel * dt;
      n.sp.position.x = nuvens.centro.x + Math.cos(n.ang) * n.raio;
      n.sp.position.z = nuvens.centro.z + Math.sin(n.ang) * n.raio;
    }
    // pólen: uma nuvem de pontinhos que acompanha a personagem, subindo e flutuando devagar
    const p = polen.pts.geometry.attributes.position, b = polen.base;
    for (let i = 0; i < p.count; i++) {
      const f = polen.fase[i];
      let x = b[i * 3] + Math.sin(t * 0.3 + f) * 1.2, y = (b[i * 3 + 1] + t * 0.15 + f) % 8, z = b[i * 3 + 2] + Math.cos(t * 0.25 + f) * 1.2;
      x = ((x - centro.x + 20) % 40 + 40) % 40 - 20 + centro.x;
      z = ((z - centro.z + 20) % 40 + 40) % 40 - 20 + centro.z;
      p.setXYZ(i, x, centro.y - 1 + y, z);
    }
    p.needsUpdate = true;
    alvoTmp.copy(centro);
  }

  function renderizar() {
    if (ativo && composer && custo.pos) composer.render();
    else renderer.render(cena, camera); // sem pós: o tone mapping vai direto no shader de cada material
  }
  function definirCusto(c) {
    Object.assign(custo, c);
    if (ativo && custo.pos && !composer) { montarComposer(); redimensionar(); }
    aplicarCusto();
  }
  function redimensionar() {
    if (!composer) return;
    const tam = renderer.getDrawingBufferSize(new THREE.Vector2());
    composer.setSize(tam.x / renderer.getPixelRatio(), tam.y / renderer.getPixelRatio());
    composer.setPixelRatio(renderer.getPixelRatio());
    meiaResolucaoGtao();
  }
  // oclusão de ambiente em meia resolução: ~1/4 do custo; o desfoque de limpeza esconde a diferença
  function meiaResolucaoGtao() {
    if (!gtao) return;
    const tam = renderer.getDrawingBufferSize(new THREE.Vector2());
    gtao.setSize(Math.max(1, Math.round(tam.x / 2)), Math.max(1, Math.round(tam.y / 2)));
  }
  return {
    ativar, atualizar, renderizar, redimensionar, definirCusto, get ativo() { return ativo; }, laminas: grama.instancias,
    // hora do dia: as nuvens baixas ficam douradas no pôr do sol e azul-escuras à noite
    tingirNuvens: c => { for (const n of nuvens.lista) n.sp.material.color.setRGB(1.75 * c.r, 1.78 * c.g, 1.85 * c.b); },
    ajuste: { get gtao() { return gtao; }, get composer() { return composer; }, ceu, grama: grama.grupo }, // para calibrar pelo console
  };
}
