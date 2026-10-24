import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';

// Antisserrilhado do Low: FXAA (um passe de tela cheia que suaviza as bordas pela imagem pronta).
// Bem mais barato que MSAA numa GPU integrada. O FXAA trabalha na imagem já em sRGB, então vem
// depois do OutputPass (que converte as cores).
export function criarSuavizacao(renderer, cena, camera) {
  let composer = null, fxaa = null;
  function montar() {
    const tam = renderer.getDrawingBufferSize(new THREE.Vector2());
    composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(tam.x, tam.y, { type: THREE.HalfFloatType }));
    composer.addPass(new RenderPass(cena, camera));
    composer.addPass(new OutputPass());
    fxaa = new ShaderPass(FXAAShader);
    composer.addPass(fxaa);
    redimensionar();
  }
  function redimensionar() {
    if (!composer) return;
    const pr = renderer.getPixelRatio();
    const tam = renderer.getDrawingBufferSize(new THREE.Vector2());
    composer.setPixelRatio(pr);
    composer.setSize(tam.x / pr, tam.y / pr);
    fxaa.material.uniforms.resolution.value.set(1 / tam.x, 1 / tam.y);
  }
  function renderizar() {
    if (!composer) montar();
    composer.render();
  }
  function liberar() { composer?.dispose?.(); composer = null; }
  return { renderizar, redimensionar, liberar };
}
