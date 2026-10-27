import * as THREE from 'three';
import { detectarHardware } from './graficos.js';

// Praia lá embaixo: uma ilha baixa de areia no mar, logo abaixo da ilha flutuante.
// O contorno (linha d'água) é um círculo deformado por três senoides, a mesma função usada no
// shader do mar (água rasa turquesa e espuma na beira) — por isso os parâmetros saem daqui.
// A areia sobe em dunas suaves até ~3 m no meio, molhada e mais escura perto da água, e continua
// descendo por baixo d'água (aparece como água rasa). Pedras e troncos na beira.

const PASTA = new URL('../assets/efeitos/', import.meta.url).href;
const TOPO = 3.0;            // m acima do nível do mar no meio da praia
const HARMONICOS = [[0.09, 2, 0.7], [0.06, 3, 2.1], [0.04, 5, 4.0]]; // amplitude, frequência, fase

const rnd = (() => { let s = 4242; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();

export function criarPraia({ cena, agua, renderer }) {
  const cx = agua.centro.x, cz = agua.centro.z, nivel = agua.nivel;
  const R0 = 46;
  const raio = ang => R0 * (1 + HARMONICOS.reduce((s, [a, k, f]) => s + a * Math.sin(k * ang + f), 0));
  const dunas = (x, z) => Math.sin(x * 0.13 + 1.3) * Math.sin(z * 0.11 + 0.4) * 0.5 + Math.sin(x * 0.051 - z * 0.047) * 0.6;
  // altura da areia acima do nível do mar (negativa embaixo d'água)
  function perfil(x, z) {
    const dx = x - cx, dz = z - cz, d = Math.hypot(dx, dz), R = raio(Math.atan2(dz, dx)), t = d / R;
    if (t <= 1) {
      const sobe = 1 - THREE.MathUtils.smoothstep(t, 0.2, 1);
      return TOPO * sobe + dunas(x, z) * sobe * 0.9 + (1 - t) * 0.25;
    }
    return -Math.min(8, (t - 1) * R * 0.14); // continua descendo debaixo d'água
  }

  // malha polar: anéis até 1,45× o raio (a parte submersa vira a água rasa)
  // (no celular, metade: é a praia lá embaixo, vista de longe)
  const celular = detectarHardware().perfil === 'celular';
  const ANEIS = celular ? 46 : 70, SETORES = celular ? 120 : 180, pos = [], uv = [], idx = [];
  for (let i = 0; i <= ANEIS; i++) {
    const f = i / ANEIS;
    for (let s = 0; s < SETORES; s++) {
      const a = (s / SETORES) * Math.PI * 2, R = raio(a) * 1.45 * f;
      const x = cx + Math.cos(a) * R, z = cz + Math.sin(a) * R;
      pos.push(x, nivel + perfil(x, z), z);
      uv.push(x * 0.22, z * 0.22); // a textura repete a cada ~4,5 m
    }
  }
  const v = (i, s) => i * SETORES + (s % SETORES);
  for (let i = 0; i < ANEIS; i++) for (let s = 0; s < SETORES; s++) {
    const a = v(i, s), b = v(i, s + 1), c = v(i + 1, s), d = v(i + 1, s + 1);
    idx.push(a, b, d, a, d, c); // sentido anti-horário visto de cima: normais para cima
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();

  const carregar = (nome, cor) => {
    const t = new THREE.TextureLoader().load(PASTA + nome);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = cor ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    return t;
  };
  const corAreia = carregar('areia_cor.jpg', true), normalAreia = carregar('areia_normal.png', false);

  // areia molhada perto da água: mais escura e mais lisa (brilha)
  const molhada = (material, pbr) => {
    material.onBeforeCompile = sh => {
      sh.uniforms.uNivel = { value: nivel };
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying float vAlturaAgua;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvAlturaAgua = (modelMatrix * vec4(transformed, 1.0)).y;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uNivel;\nvarying float vAlturaAgua;\nfloat molhado = 0.0;')
        .replace('#include <map_fragment>', `#include <map_fragment>
          // a mesma textura numa escala ~10× maior varia o tom em manchas: de longe a repetição
          // do ladrilho de 4,5 m não forma mais um padrão
          float macro = dot(texture2D(map, vMapUv * 0.093 + 0.37).rgb, vec3(0.333)) * 0.6 + dot(texture2D(map, vMapUv * 0.031).rgb, vec3(0.333)) * 0.4;
          diffuseColor.rgb *= 0.72 + 0.38 * macro / 0.75;
          molhado = 1.0 - smoothstep(0.05, 0.5, vAlturaAgua - uNivel);
          diffuseColor.rgb *= mix(1.0, 0.6, molhado);`)
        .replace('#include <roughnessmap_fragment>', pbr ? `#include <roughnessmap_fragment>
          roughnessFactor *= mix(1.0, 0.35, molhado);` : '#include <roughnessmap_fragment>');
    };
    material.customProgramCacheKey = () => 'praia-' + (pbr ? 'p' : 's');
    return material;
  };
  const malha = new THREE.Mesh(geo);
  malha.receiveShadow = true;
  malha.name = 'praia';
  cena.add(malha);

  // ----- pedras e troncos na beira -----
  const enfeites = new THREE.Group(); enfeites.name = 'praia-enfeites';
  const matPedra = new THREE.MeshStandardMaterial({ color: '#8a8478', roughness: 0.9, flatShading: true });
  const matTronco = new THREE.MeshStandardMaterial({ color: '#9b8466', roughness: 0.95 });
  for (let k = 0; k < 16; k++) {
    const a = rnd() * Math.PI * 2, t = 0.72 + rnd() * 0.32, R = raio(a) * t;
    const x = cx + Math.cos(a) * R, z = cz + Math.sin(a) * R;
    const r = 0.4 + rnd() * 1.1;
    const p = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), matPedra);
    p.scale.set(1, 0.55 + rnd() * 0.3, 0.8 + rnd() * 0.4);
    p.position.set(x, nivel + perfil(x, z) + r * 0.15, z);
    p.rotation.set(rnd(), rnd() * 6, rnd());
    p.receiveShadow = true;
    enfeites.add(p);
  }
  for (let k = 0; k < 5; k++) {
    const a = rnd() * Math.PI * 2, R = raio(a) * (0.8 + rnd() * 0.12);
    const x = cx + Math.cos(a) * R, z = cz + Math.sin(a) * R;
    const comp = 2.5 + rnd() * 3;
    const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, comp, 7), matTronco);
    tr.rotation.set(Math.PI / 2, 0, rnd() * Math.PI);
    tr.position.set(x, nivel + perfil(x, z) + 0.15, z);
    tr.receiveShadow = true;
    enfeites.add(tr);
  }
  cena.add(enfeites);

  function aplicarNivel(nivelGrafico) {
    malha.material?.dispose();
    malha.material = nivelGrafico.materialSimples
      ? molhada(new THREE.MeshLambertMaterial({ map: corAreia }), false)
      : molhada(new THREE.MeshStandardMaterial({ map: corAreia, normalMap: normalAreia, normalScale: new THREE.Vector2(0.8, 0.8), roughness: 0.95 }), true);
  }

  // altura da areia (mundo) se o ponto está na parte seca da praia; senão null
  function alturaEm(x, z) {
    const h = perfil(x, z);
    return h > 0 ? nivel + h : null;
  }

  return {
    malha, enfeites, aplicarNivel, alturaEm,
    // para o shader do mar: centro, raio base e os harmônicos do contorno
    contorno: { cx, cz, R0, harmonicos: HARMONICOS },
  };
}
