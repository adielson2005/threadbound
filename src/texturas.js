import * as THREE from 'three';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';

// Texturas grandes (boneca, cachoeira) também existem em KTX2 (Basis Universal, geradas por
// ferramentas/gerar-ktx2.sh). A GPU guarda essas comprimidas (ETC2/ASTC/BC, o que o aparelho tiver),
// com uns 4× menos memória de vídeo que um JPG/PNG aberto, que é o que mais pesa num celular.
// Se o arquivo faltar ou o navegador não conseguir, carrega o original. ?ktx2=0 desliga (comparar).
// (o transcodificador vem junto com o three.js, em vendor/)
const TRANSCODER = new URL('../vendor/three/examples/jsm/libs/basis/', import.meta.url).href;
const usarKtx2 = new URLSearchParams(location.search).get('ktx2') !== '0';
let ktx2 = null;
const tl = new THREE.TextureLoader();

// url: o original (.jpg/.png). Devolve a textura com flipY já resolvido: a KTX2 vem virada do
// arquivo; o original é virado no upload, como antes.
export function carregarTextura(renderer, url) {
  const original = () => tl.loadAsync(url).then(t => { t.flipY = true; return t; });
  if (!usarKtx2) return original();
  if (!ktx2) ktx2 = new KTX2Loader().setTranscoderPath(TRANSCODER).detectSupport(renderer);
  return ktx2.loadAsync(url.replace(/\.(jpe?g|png)$/i, '.ktx2')).catch(original);
}
