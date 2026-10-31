import * as THREE from 'three';

// Sombra de verdade da Brisa. A sombra do sol no mapa é calculada uma vez só (o mapa não se mexe) e a
// personagem tinha só uma mancha redonda embaixo dos pés. Aqui, a cada quadro, o corpo dela (só ele,
// numa camada própria) é desenhado do ponto de vista do sol num mapa de profundidade pequeno que
// cobre só a volta dela (2,7 m). O chão, as casas e as pedras leem esse mapa: onde o corpo está entre
// o ponto e o sol, a luz do sol (e só ela: a do céu continua) é cortada. Assim a sombra tem a forma
// dela, mexe braços e pernas, se estica no fim da tarde e cai em degraus e paredes.
// A profundidade evita sombra no que está entre ela e o sol (o telhado em cima dela, por exemplo).

export const CAMADA_SOMBRA_BONECA = 6;
const MEIO = 1.35; // meia largura da área coberta (m): o corpo inteiro com os braços abertos

const uniforms = {
  uSbMapa: { value: null },
  uSbMatriz: { value: new THREE.Matrix4() },
  uSbForca: { value: 0 },
  uSbTexel: { value: 1 / 512 },
};

// trechos de shader colocados em cada material que recebe a sombra
const VERT_DECL = 'varying vec3 vSbPos;\n';
const VERT_POS = `
  vec4 sbP = vec4( transformed, 1.0 );
  #ifdef USE_INSTANCING
    sbP = instanceMatrix * sbP;
  #endif
  vSbPos = ( modelMatrix * sbP ).xyz;`;
const FRAG_DECL = `
varying vec3 vSbPos;
uniform sampler2D uSbMapa;
uniform mat4 uSbMatriz;
uniform float uSbForca;
uniform float uSbTexel;
// fração da luz do sol que o corpo da Brisa tapa neste ponto (PCF de 3 × 3, borda macia)
float sombraBoneca() {
  if ( uSbForca <= 0.0 ) return 0.0;
  vec4 p = uSbMatriz * vec4( vSbPos, 1.0 );
  vec3 c = p.xyz * 0.5 + 0.5;
  if ( c.x < 0.0 || c.x > 1.0 || c.y < 0.0 || c.y > 1.0 || c.z > 1.0 ) return 0.0;
  float tapa = 0.0;
  for ( int i = -1; i <= 1; i ++ ) for ( int j = -1; j <= 1; j ++ ) {
    float d = texture2D( uSbMapa, c.xy + vec2( float( i ), float( j ) ) * uSbTexel * 2.5 ).r;
    tapa += step( d + 0.0015, c.z );
  }
  // perto da borda da área coberta some aos poucos (nunca um corte reto)
  vec2 b = min( c.xy, 1.0 - c.xy );
  return tapa / 9.0 * uSbForca * smoothstep( 0.0, 0.06, min( b.x, b.y ) );
}
`;
const FRAG_LUZ = 'getDirectionalLightInfo( directionalLight, directLight );';

function adaptar(material) {
  if (material.userData.sombraBoneca) return;
  material.userData.sombraBoneca = true;
  const antes = material.onBeforeCompile, chaveAntes = material.customProgramCacheKey;
  material.onBeforeCompile = (s, r) => {
    antes?.call(material, s, r);
    if (!s.fragmentShader.includes('#include <lights_fragment_begin>') || !s.vertexShader.includes('#include <project_vertex>')) return;
    Object.assign(s.uniforms, uniforms);
    s.vertexShader = VERT_DECL + s.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>' + VERT_POS);
    // o trecho de luz é aberto aqui para cortar só a luz direcional (o sol ou a lua)
    const luz = THREE.ShaderChunk.lights_fragment_begin.replace(FRAG_LUZ, FRAG_LUZ + '\n\t\tdirectLight.color *= 1.0 - sbTapa;');
    s.fragmentShader = FRAG_DECL + s.fragmentShader.replace('#include <lights_fragment_begin>', 'float sbTapa = sombraBoneca();\n' + luz);
  };
  material.customProgramCacheKey = () => (chaveAntes ? chaveAntes.call(material) : '') + '|sombraBoneca';
  material.needsUpdate = true;
}

export function criarSombraBoneca({ renderer, cena, dirSol, tamanho = 512 }) {
  const rt = new THREE.WebGLRenderTarget(tamanho, tamanho, { depthBuffer: true });
  rt.depthTexture = new THREE.DepthTexture(tamanho, tamanho);
  uniforms.uSbMapa.value = rt.depthTexture;
  uniforms.uSbTexel.value = 1 / tamanho;
  const cam = new THREE.OrthographicCamera(-MEIO, MEIO, MEIO, -MEIO, 0.5, 40);
  cam.layers.set(CAMADA_SOMBRA_BONECA);
  const soProfundidade = new THREE.MeshBasicMaterial({ colorWrite: false });
  const dir = dirSol.clone().normalize();
  const corLimpa = new THREE.Color();
  let ligada = true;

  // o corpo (e o cabelo, as roupas) entra na camada que a câmera do sol vê
  function marcar(raiz) { raiz.traverse(o => { if (o.isMesh) o.layers.enable(CAMADA_SOMBRA_BONECA); }); }

  // todo material de quem recebe sombra (chão, casas, pedras, árvores), menos a própria Brisa
  function receberEm(raiz, excluir) {
    const fora = new Set(); excluir?.traverse(o => fora.add(o));
    raiz.traverse(o => {
      if (!o.isMesh || !o.receiveShadow || fora.has(o)) return;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        if (m && (m.isMeshStandardMaterial || m.isMeshLambertMaterial || m.isMeshPhongMaterial)) adaptar(m);
      }
    });
  }

  // centro: meio do corpo; visivel: desenha a sombra neste quadro
  function atualizar(centro, visivel) {
    uniforms.uSbForca.value = ligada && visivel ? 1 : 0;
    if (!uniforms.uSbForca.value) return;
    cam.position.copy(centro).addScaledVector(dir, 20);
    cam.lookAt(centro);
    cam.updateMatrixWorld();
    uniforms.uSbMatriz.value.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    const fundo = cena.background, troca = cena.overrideMaterial, alvo = renderer.getRenderTarget();
    const autoLimpa = renderer.autoClear;
    renderer.getClearColor(corLimpa); const alfa = renderer.getClearAlpha();
    cena.background = null; cena.overrideMaterial = soProfundidade;
    renderer.setRenderTarget(rt);
    renderer.autoClear = true;
    renderer.render(cena, cam);
    renderer.setRenderTarget(alvo);
    renderer.autoClear = autoLimpa;
    renderer.setClearColor(corLimpa, alfa);
    cena.background = fundo; cena.overrideMaterial = troca;
  }

  return {
    marcar, receberEm, atualizar,
    set ligada(v) { ligada = v; if (!v) uniforms.uSbForca.value = 0; },
    get ligada() { return ligada; },
    dispose() { rt.dispose(); rt.depthTexture.dispose(); },
  };
}
