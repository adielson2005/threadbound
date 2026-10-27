import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { MeshBVH, acceleratedRaycast } from 'three-mesh-bvh';
import { simplificar, simplificarIndices } from './simplificar.js';

// Mapa de ilhas flutuantes (gerado no Meshy). O FBX original tem 66 MB e cada triângulo
// separado; a ferramenta ferramentas/converter-mapa.html gera assets/mapa/mapa.bin com os
// vértices unidos, a malha simplificada e mais dois níveis de detalhe (LOD) para longe.
// Sem o .bin, o FBX é convertido na hora (bem mais lento).
//
// Renderização: o mapa é dividido em blocos; cada bloco só é desenhado se estiver na tela
// (frustum culling) e troca para uma versão mais leve conforme a distância (LOD).
// Colisão e raycasts usam uma malha inteira separada, que nunca é desenhada.

export const ESCALA_MAPA = 0.6; // deixa casas, pontes e trilhas no tamanho da personagem (1,7 m)
const PASTA = new URL('../assets/mapa/', import.meta.url).href; // funciona de qualquer página
const MAGICO = 0x4150414d; // "MAPA"
const LODS = [[0.35, 0.006], [0.12, 0.015]]; // proporção de triângulos e erro de cada nível extra
const TAM_BLOCO = 20; // m (já na escala do jogo)
export const CAMADA_SOMBRA = 1; // camada da malha que projeta a sombra fixa

// ---------- formato .bin ----------
// cabeçalho Uint32: mágico, versão (2), nº de vértices, nº de níveis, nº de índices de cada nível
// depois: posições Float32×3, normais Int16×3 (normalizadas), uv Uint16×2 (normalizadas), índices Uint32 de cada nível
export function geometriaParaBin(geo, niveis) {
  const nV = geo.attributes.position.count;
  const cab = 16 + niveis.length * 4;
  const tamNormais = Math.ceil(nV * 6 / 4) * 4;
  const tam = cab + nV * 12 + tamNormais + nV * 4 + niveis.reduce((s, n) => s + n.length * 4, 0);
  const buf = new ArrayBuffer(tam);
  new Uint32Array(buf, 0, cab / 4).set([MAGICO, 2, nV, niveis.length, ...niveis.map(n => n.length)]);
  let o = cab;
  new Float32Array(buf, o, nV * 3).set(geo.attributes.position.array); o += nV * 12;
  const n = new Int16Array(buf, o, nV * 3), na = geo.attributes.normal.array;
  for (let i = 0; i < na.length; i++) n[i] = Math.round(Math.max(-1, Math.min(1, na[i])) * 32767);
  o += tamNormais;
  const uv = new Uint16Array(buf, o, nV * 2), ua = geo.attributes.uv.array;
  for (let i = 0; i < ua.length; i++) uv[i] = Math.round(Math.max(0, Math.min(1, ua[i])) * 65535);
  o += nV * 4;
  for (const nivel of niveis) { new Uint32Array(buf, o, nivel.length).set(nivel); o += nivel.length * 4; }
  return buf;
}

export function binParaGeometria(buf) {
  const u = new Uint32Array(buf, 0, 4);
  if (u[0] !== MAGICO) throw new Error('mapa.bin inválido');
  const versao = u[1], nV = u[2];
  const qtd = versao >= 2 ? u[3] : 1;
  const tamanhos = versao >= 2 ? [...new Uint32Array(buf, 16, qtd)] : [u[3]];
  let o = versao >= 2 ? 16 + qtd * 4 : 16;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(buf, o, nV * 3), 3)); o += nV * 12;
  geo.setAttribute('normal', new THREE.BufferAttribute(new Int16Array(buf, o, nV * 3), 3, true)); o += Math.ceil(nV * 6 / 4) * 4;
  geo.setAttribute('uv', new THREE.BufferAttribute(new Uint16Array(buf, o, nV * 2), 2, true)); o += nV * 4;
  const niveis = tamanhos.map(t => { const a = new Uint32Array(buf, o, t); o += t * 4; return a; });
  return { geo, niveis };
}

// FBX -> geometria indexada (sem a escala do jogo) + índices dos níveis de detalhe
export async function converterFBX(aoProgredir) {
  const gerente = new THREE.LoadingManager();
  gerente.setURLModifier(u => (/\.(png|jpe?g)$/i.test(u) ? PIXEL : u)); // texturas são carregadas à parte
  const obj = await new FBXLoader(gerente).loadAsync(PASTA + 'mapa.fbx', aoProgredir);
  obj.updateMatrixWorld(true);
  let malha;
  obj.traverse(o => { if (o.isMesh && !malha) malha = o; });
  const g = malha.geometry;
  g.applyMatrix4(malha.matrixWorld);
  g.deleteAttribute('normal'); // sem as normais, os vértices das costuras se unem
  const unida = mergeVertices(g);
  g.dispose();
  unida.computeVertexNormals();
  // 1,4 milhão de triângulos é pesado para GPUs integradas; 30% fica visualmente igual
  const geo = await simplificar(unida, 0.3, 0.004);
  const niveis = [geo.index.array];
  for (const [prop, erro] of LODS) niveis.push(await simplificarIndices(geo, prop, erro));
  geo.setIndex(null);
  return { geo, niveis };
}
const PIXEL = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';

async function baixarComProgresso(url, aoProgredir) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  const total = +r.headers.get('content-length') || 0;
  if (!r.body || !total) return r.arrayBuffer();
  const leitor = r.body.getReader(), dados = new Uint8Array(total);
  let lido = 0;
  for (;;) {
    const { done, value } = await leitor.read();
    if (done) break;
    dados.set(value, lido); lido += value.length;
    aoProgredir?.({ loaded: lido, total });
  }
  return dados.buffer;
}

// Divide cada nível de detalhe em blocos pela posição do centro de cada triângulo.
export function montarBlocos(geo, niveis, TAM = TAM_BLOCO) {
  const pos = geo.attributes.position;
  const box = geo.boundingBox;
  const nx = Math.ceil((box.max.x - box.min.x) / TAM), nz = Math.ceil((box.max.z - box.min.z) / TAM);
  const blocos = new Map(); // chave -> [índices por nível]
  niveis.forEach((ind, nivel) => {
    const listas = new Map();
    for (let t = 0; t < ind.length; t += 3) {
      const a = ind[t], b = ind[t + 1], c = ind[t + 2];
      const cx = (pos.getX(a) + pos.getX(b) + pos.getX(c)) / 3, cz = (pos.getZ(a) + pos.getZ(b) + pos.getZ(c)) / 3;
      const i = Math.min(nx - 1, Math.floor((cx - box.min.x) / TAM)), j = Math.min(nz - 1, Math.floor((cz - box.min.z) / TAM));
      const k = i * nz + j;
      let l = listas.get(k); if (!l) listas.set(k, (l = []));
      l.push(a, b, c);
    }
    for (const [k, l] of listas) {
      if (!blocos.has(k)) blocos.set(k, []);
      blocos.get(k)[nivel] = new Uint32Array(l);
    }
  });
  const grupo = new THREE.Group();
  const lods = [];
  for (const niveisBloco of blocos.values()) {
    // o LOD mede a distância da câmera até a posição dele: fica no centro do bloco,
    // e as malhas (em coordenadas do mundo) são deslocadas de volta
    const centro = new THREE.Box3();
    const ind0 = niveisBloco.find(Boolean);
    for (let i = 0; i < ind0.length; i++) centro.expandByPoint(new THREE.Vector3().fromBufferAttribute(pos, ind0[i]));
    const c = centro.getCenter(new THREE.Vector3());
    const lod = new THREE.LOD();
    lod.position.copy(c);
    const malhas = [];
    niveisBloco.forEach((ind, nivel) => {
      if (!ind) return;
      const g = new THREE.BufferGeometry();
      for (const [nome, attr] of Object.entries(geo.attributes)) g.setAttribute(nome, attr); // vértices compartilhados: sobem para a GPU uma vez só
      g.setIndex(new THREE.BufferAttribute(ind, 1));
      // limites só do bloco (calcular pelo atributo inteiro daria o mapa todo e nada seria descartado)
      const b = new THREE.Box3();
      for (let i = 0; i < ind.length; i++) b.expandByPoint(new THREE.Vector3().fromBufferAttribute(pos, ind[i]));
      g.boundingBox = b;
      g.boundingSphere = b.getBoundingSphere(new THREE.Sphere());
      const m = new THREE.Mesh(g);
      m.receiveShadow = true;
      m.position.copy(c).negate();
      m.updateMatrix();
      m.matrixAutoUpdate = false;
      malhas[nivel] = m;
    });
    lod.userData.malhas = malhas;
    lod.updateMatrix();
    lod.matrixAutoUpdate = false;
    grupo.add(lod);
    lods.push(lod);
  }
  return { grupo, lods };
}

export async function carregarMapa(renderer, aoProgredir) {
  let dados;
  try {
    dados = binParaGeometria(await baixarComProgresso(PASTA + 'mapa.bin', aoProgredir));
  } catch (e) {
    console.warn('mapa.bin indisponível, convertendo o FBX (mais lento):', e.message);
    dados = await converterFBX(aoProgredir);
  }
  const { geo: base, niveis } = dados;
  base.scale(ESCALA_MAPA, ESCALA_MAPA, ESCALA_MAPA);
  base.computeBoundingBox();

  // malha inteira para colisão/raycast (a BVH reorganiza o índice, por isso fica com uma cópia própria)
  const geo = new THREE.BufferGeometry();
  for (const [nome, attr] of Object.entries(base.attributes)) geo.setAttribute(nome, attr);
  geo.setIndex(new THREE.BufferAttribute(new Uint32Array(niveis[0]), 1));
  geo.boundingBox = base.boundingBox.clone();
  geo.boundsTree = new MeshBVH(geo);
  // invisível na imagem (não escreve cor nem profundidade): só serve para colisão e para projetar a sombra
  const malha = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }));
  malha.raycast = acceleratedRaycast;
  // fica numa camada que a câmera só liga no quadro em que a sombra fixa é calculada
  malha.castShadow = true;
  malha.layers.set(CAMADA_SOMBRA);

  const { grupo, lods } = montarBlocos(base, niveis);
  const mapa = { malha, geo, grupo, lods, renderer, texturas: new Map(), amostrar: () => null, qualidade: null };
  return mapa;
}

const tl = new THREE.TextureLoader();
async function textura(mapa, nome, cor) {
  if (!nome) return null;
  if (!mapa.texturas.has(nome)) {
    mapa.texturas.set(nome, tl.loadAsync(PASTA + nome).then(t => {
      t.colorSpace = cor ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      t.anisotropy = Math.min(8, mapa.renderer.capabilities.getMaxAnisotropy());
      return t;
    }).catch(() => null));
  }
  return mapa.texturas.get(nome);
}

// ---------- nível de detalhe pela visão ----------
// Cada bloco escolhe o nível de detalhe pela distância E pela direção do olhar:
//  - dentro do campo de visão (com uma folga de antecipação): detalhe normal pela distância;
//  - nas costas da câmera: o nível mais leve (e o frustum culling nem chega a desenhar);
//  - previsão do giro: a velocidade com que a câmera está virando projeta para onde ela vai
//    olhar daqui a ~0,35 s, e os blocos desse lado já sobem de detalhe antes de entrar na tela.
// Todos os níveis já estão na GPU (aquecerMapa), então trocar de nível é instantâneo.
const ANTECIPACAO = 0.35;              // s de giro previstos
const FOLGA_VISAO = THREE.MathUtils.degToRad(22); // além da borda da tela, ainda em qualidade cheia
const _frente = new THREE.Vector3(), _prevista = new THREE.Vector3(), _para = new THREE.Vector3(), _centro = new THREE.Vector3();
let _yawAntes = null, _giro = 0;
export function atualizarLodPorVisao(mapa, camera, dt) {
  if (!mapa.qualidade) return;
  camera.getWorldDirection(_frente); _frente.y = 0; _frente.normalize();
  // velocidade de giro (rad/s) suavizada, pelo ângulo horizontal da câmera
  const yaw = Math.atan2(_frente.x, _frente.z);
  if (_yawAntes !== null && dt > 0) {
    let d = yaw - _yawAntes; d = Math.atan2(Math.sin(d), Math.cos(d));
    _giro += (d / dt - _giro) * Math.min(1, dt * 12);
  }
  _yawAntes = yaw;
  const avanco = THREE.MathUtils.clamp(_giro * ANTECIPACAO, -1.2, 1.2);
  _prevista.set(Math.sin(yaw + avanco), 0, Math.cos(yaw + avanco));
  // metade do campo de visão horizontal + a folga
  const meiaVisao = Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect) + FOLGA_VISAO;
  const dists = mapa.qualidade.lod;
  const stats = mapa.estatLod || (mapa.estatLod = { visao: 0, costas: 0, niveis: [] });
  stats.visao = stats.costas = 0; stats.niveis = dists.map(() => 0);
  for (const lod of mapa.lods) {
    const n = lod.levels.length;
    if (!n) continue;
    _centro.setFromMatrixPosition(lod.matrixWorld);
    _para.subVectors(_centro, camera.position);
    const dist = _para.length();
    _para.y = 0;
    const dh = _para.length();
    const raio = lod.userData.raio;
    // o bloco ocupa um ângulo: perto, ele está "na visão" mesmo com o centro de lado
    let naVisao = dh < raio * 1.2;
    if (!naVisao) {
      _para.divideScalar(dh);
      const extensao = Math.asin(Math.min(1, raio / dh));
      const ang = Math.min(Math.acos(THREE.MathUtils.clamp(_para.dot(_frente), -1, 1)), Math.acos(THREE.MathUtils.clamp(_para.dot(_prevista), -1, 1)));
      naVisao = ang - extensao < meiaVisao;
    }
    let nivel;
    if (naVisao) {
      // pela distância, com 3% de histerese para não ficar trocando na fronteira
      const atual = lod.userData.nivelAtual;
      nivel = 0;
      for (let i = 1; i < n; i++) {
        const limite = lod.levels[i].distance * (atual < 0 ? 1 : atual >= i ? 0.97 : 1.03);
        if (dist >= limite) nivel = i;
      }
      stats.visao++;
    } else { nivel = n - 1; stats.costas++; }
    stats.niveis[nivel]++;
    if (nivel !== lod.userData.nivelAtual) {
      lod.levels.forEach((l, i) => { l.object.visible = i === nivel; });
      lod.userData.nivelAtual = nivel;
    }
  }
}

// Manda todos os níveis de todos os blocos para a GPU de uma vez (buffers de índice e shaders),
// desenhando tudo uma vez num alvo minúsculo. Sem isso, a primeira vez que um bloco troca de
// nível ao virar a câmera ele ainda precisaria subir para a GPU (uma travadinha).
export function aquecerMapa(mapa, renderer, cena, camera) {
  const guardados = [];
  for (const lod of mapa.lods) for (const l of lod.levels) {
    guardados.push([l.object, l.object.visible, l.object.frustumCulled]);
    l.object.visible = true; l.object.frustumCulled = false;
  }
  const alvo = new THREE.WebGLRenderTarget(4, 4);
  const antes = renderer.getRenderTarget();
  renderer.setRenderTarget(alvo);
  renderer.render(cena, camera);
  renderer.setRenderTarget(antes);
  alvo.dispose();
  for (const [o, v, f] of guardados) { o.visible = v; o.frustumCulled = f; }
  for (const lod of mapa.lods) lod.userData.nivelAtual = -1; // a próxima atualização reaplica
}

// Detalhe de perto: a textura do Meshy cobre o mapa inteiro, então de perto cada texel vira um
// borrão. Uma textura pequena e repetível (assets/efeitos/detalhe.png: RG = relevo, B = variação
// de cor) é projetada em espaço de mundo pelos três eixos (triplanar, sem depender das UVs) em
// duas escalas, e some com a distância (longe a textura original já basta e não tremula).
// No Low (Lambert) entra só a variação de cor e uma escala.
const PASTA_EFEITOS = new URL('../assets/efeitos/', import.meta.url).href;
let texDetalhe = null, texGrama = null;

// Textura de grama vista de cima (gerada uma vez, 256×256, repetível):
//  R = folhinhas finas (tracinhos claros e escuros em várias direções), para o gramado perto da
//      câmera deixar de ser uma cor lisa;
//  G = manchas grandes e suaves (moitas mais densas e falhas), usadas numa escala bem maior;
//  B = capim seco x viçoso, em outra escala, para o campo variar de tom como um campo de verdade.
function texturaGrama() {
  const N = 256, c = document.createElement('canvas'); c.width = c.height = N;
  const g = c.getContext('2d'), img = g.createImageData(N, N), d = img.data;
  let sem = 1234567; const rnd = () => ((sem = (sem * 16807) % 2147483647) / 2147483647);
  // G e B: ruído suave repetível (soma de senos com períodos inteiros na tela)
  const onda = (x, y, f, fase) => Math.sin((x * f.a + y * f.b) * 2 * Math.PI / N + fase);
  const ondas = Array.from({ length: 6 }, (_, i) => ({ a: 1 + Math.floor(rnd() * 4), b: 1 + Math.floor(rnd() * 4), fase: rnd() * 6, peso: 1 / (1 + i * 0.4) }));
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let m = 0, t = 0;
    ondas.forEach((o, i) => { const v = onda(x, y, o, o.fase) * o.peso; if (i % 2) t += v; else m += v; });
    const k = (y * N + x) * 4;
    d[k] = 128; d[k + 1] = Math.max(0, Math.min(255, 128 + m * 55)); d[k + 2] = Math.max(0, Math.min(255, 128 + t * 60)); d[k + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  // R: folhinhas (desenhadas só no canal vermelho, em 9 cópias deslocadas para repetir sem emenda)
  g.globalCompositeOperation = 'source-over';
  const tracos = [];
  for (let i = 0; i < 2600; i++) tracos.push({ x: rnd() * N, y: rnd() * N, a: rnd() * Math.PI, l: 2 + rnd() * 5, claro: rnd() < 0.55 });
  const camadaR = document.createElement('canvas'); camadaR.width = camadaR.height = N;
  const r = camadaR.getContext('2d');
  r.fillStyle = 'rgb(128,0,0)'; r.fillRect(0, 0, N, N);
  r.lineCap = 'round';
  for (const t of tracos) {
    r.strokeStyle = t.claro ? `rgba(${200 + rnd() * 55},0,0,0.8)` : `rgba(${30 + rnd() * 40},0,0,0.7)`;
    r.lineWidth = 0.7 + rnd() * 0.8;
    for (const dx of [-N, 0, N]) for (const dy of [-N, 0, N]) {
      r.beginPath(); r.moveTo(t.x + dx, t.y + dy); r.lineTo(t.x + dx + Math.cos(t.a) * t.l, t.y + dy + Math.sin(t.a) * t.l); r.stroke();
    }
  }
  const pr = r.getImageData(0, 0, N, N).data, final = g.getImageData(0, 0, N, N);
  for (let i = 0; i < N * N; i++) final.data[i * 4] = pr[i * 4];
  g.putImageData(final, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.colorSpace = THREE.NoColorSpace;
  return tex;
}
export function aplicarDetalhe(material, simples, renderer) {
  if (!texDetalhe) {
    texDetalhe = tl.load(PASTA_EFEITOS + 'detalhe.png');
    texDetalhe.wrapS = texDetalhe.wrapT = THREE.RepeatWrapping;
    texDetalhe.colorSpace = THREE.NoColorSpace;
    texDetalhe.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    texGrama = texturaGrama();
    texGrama.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  }
  material.onBeforeCompile = sh => {
    sh.uniforms.uDetalhe = { value: texDetalhe };
    sh.uniforms.uGrama = { value: texGrama };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vMundoDet;\nvarying vec3 vNormalDet;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vMundoDet = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vNormalDet = normalize(mat3(modelMatrix) * objectNormal);`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform sampler2D uDetalhe;
        uniform sampler2D uGrama;
        varying vec3 vMundoDet;
        varying vec3 vNormalDet;
        vec3 pesoDet;
        float pertoDet;
        // amostra triplanar: x = relevo u, y = relevo v, z = cor
        vec3 amostraDet(float escala) {
          vec3 p = vMundoDet * escala;
          vec3 a = texture2D(uDetalhe, p.zy).xyz, b = texture2D(uDetalhe, p.xz).xyz, c = texture2D(uDetalhe, p.xy).xyz;
          return a * pesoDet.x + b * pesoDet.y + c * pesoDet.z;
        }`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        pesoDet = pow(abs(normalize(vNormalDet)), vec3(4.0));
        pesoDet /= (pesoDet.x + pesoDet.y + pesoDet.z);
        pertoDet = 1.0 - smoothstep(6.0, 45.0, distance(vMundoDet, cameraPosition));
        vec3 det1 = amostraDet(0.45);
        ${simples ? 'vec3 det2 = det1;' : 'vec3 det2 = amostraDet(1.7);'}
        float corDet = (det1.z - 0.5) * 0.55 + (det2.z - 0.5) * 0.35;
        diffuseColor.rgb *= 1.0 + corDet * pertoDet;
        // gramado: só onde o chão é verde e plano (trilha, areia, rocha e falésia ficam como estão)
        {
          float verde = smoothstep(0.0, 0.05, diffuseColor.g - max(diffuseColor.r, diffuseColor.b) * 0.92) * smoothstep(0.55, 0.8, normalize(vNormalDet).y);
          if (verde > 0.0) {
            float distG = distance(vMundoDet, cameraPosition);
            float folhas = texture2D(uGrama, vMundoDet.xz * 0.9).r;
            vec2 macro = texture2D(uGrama, vMundoDet.xz * 0.021).gb;
            float tom = texture2D(uGrama, vMundoDet.xz * 0.0093 + 0.37).b;
            vec3 g = diffuseColor.rgb;
            g *= mix(1.0, 0.5 + 1.0 * folhas, 1.0 - smoothstep(5.0, 38.0, distG)); // folhinhas perto
            g *= 0.74 + 0.52 * macro.x;                                             // moitas e falhas
            g *= mix(vec3(0.88, 1.06, 0.86), vec3(1.16, 1.03, 0.72), smoothstep(0.3, 0.72, tom)); // viçoso x seco
            diffuseColor.rgb = mix(diffuseColor.rgb, g, verde);
          }
        }`);
    if (!simples) {
      // relevo: inclina a normal (no espaço de mundo, convertida para o da câmera) pelos dois detalhes
      sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          vec2 r1 = det1.xy * 2.0 - 1.0, r2 = det2.xy * 2.0 - 1.0;
          vec2 r = r1 * 0.6 + r2 * 0.4;
          vec3 inclina = pesoDet.x * vec3(0.0, r.y, r.x) + pesoDet.y * vec3(r.x, 0.0, r.y) + pesoDet.z * vec3(r.x, r.y, 0.0);
          normal = normalize(normal + (viewMatrix * vec4(inclina * 0.55 * pertoDet, 0.0)).xyz);
        }`);
    }
  };
  material.customProgramCacheKey = () => 'mapa-detalhe2-' + (simples ? 's' : 'p');
}

// Troca material, texturas e distâncias de LOD conforme o nível gráfico.
export async function aplicarQualidadeMapa(mapa, nivel) {
  // ilha gerada por código (ilha.js): cor por vértice, sem texturas grandes para baixar
  if (mapa.procedural) {
    const antigoP = mapa.material;
    mapa.material = nivel.materialSimples
      ? new THREE.MeshLambertMaterial({ vertexColors: true })
      : new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
    aplicarDetalhe(mapa.material, nivel.materialSimples, mapa.renderer);
    mapa.material.customProgramCacheKey = () => 'ilha-detalhe2-' + (nivel.materialSimples ? 's' : 'p');
    trocarNiveis(mapa, nivel);
    antigoP?.dispose();
    mapa.aoMudarQualidade?.(nivel);
    mapa.qualidade = nivel;
    return;
  }
  const t = nivel.texturaMapa;
  const [cor, normal, rugosidade, metal] = await Promise.all([
    textura(mapa, t.cor, true), textura(mapa, t.normal), textura(mapa, t.rugosidade), textura(mapa, t.metal),
  ]);
  // no High as texturas usam a anisotropia máxima da GPU (chão visto de lado fica nítido)
  const aniso = nivel.efeitos ? mapa.renderer.capabilities.getMaxAnisotropy() : Math.min(8, mapa.renderer.capabilities.getMaxAnisotropy());
  for (const tx of [cor, normal, rugosidade, metal]) if (tx && tx.anisotropy !== aniso) { tx.anisotropy = aniso; tx.needsUpdate = true; }
  const antigo = mapa.material;
  mapa.material = nivel.materialSimples
    ? new THREE.MeshLambertMaterial({ map: cor })
    : new THREE.MeshStandardMaterial({ map: cor, normalMap: normal, roughnessMap: rugosidade, metalnessMap: metal, roughness: 1, metalness: metal ? 1 : 0 });
  aplicarDetalhe(mapa.material, nivel.materialSimples, mapa.renderer);
  trocarNiveis(mapa, nivel);
  antigo?.dispose();
  mapa.qualidade = nivel;
  // amostra de cor da textura (para distinguir chão de copa de árvore na análise do terreno)
  if (cor?.image && !mapa.amostraPronta) {
    const S = 512, cv = document.createElement('canvas');
    cv.width = cv.height = S;
    const cx = cv.getContext('2d', { willReadFrequently: true });
    cx.drawImage(cor.image, 0, 0, S, S);
    const px = cx.getImageData(0, 0, S, S).data;
    mapa.amostrar = uv => {
      const u = Math.min(S - 1, Math.max(0, Math.floor(uv.x * S)));
      const v = Math.min(S - 1, Math.max(0, Math.floor((1 - uv.y) * S)));
      const k = (v * S + u) * 4;
      return [px[k], px[k + 1], px[k + 2]];
    };
    mapa.amostraPronta = true;
  }
}

// monta os níveis de detalhe de cada bloco com o material atual e as distâncias do nível gráfico
function trocarNiveis(mapa, nivel) {
  for (const lod of mapa.lods) {
    while (lod.levels.length) { const l = lod.levels.pop(); lod.remove(l.object); }
    const malhas = lod.userData.malhas;
    nivel.lod.forEach((dist, i) => {
      const m = malhas[Math.min(malhas.length - 1, Math.max(i, nivel.lodInicial))];
      if (!m) return;
      // o mesmo bloco pode aparecer em dois níveis (low pula o mais detalhado): usa uma cópia leve
      const obj = lod.levels.some(l => l.object === m) ? m.clone() : m;
      obj.material = mapa.material;
      lod.addLevel(obj, dist);
    });
    // a troca de nível é feita por atualizarLodPorVisao (distância + direção do olhar), não pelo three.js
    lod.autoUpdate = false;
    lod.userData.nivelAtual = -1;
    lod.userData.raio = malhas.find(Boolean).geometry.boundingSphere.radius;
  }
}
