import * as THREE from 'three';

// Textura a partir de um canvas desenhado no jogo, com a transparência garantida em qualquer aparelho.
//
// Enviado como canvas (CanvasTexture), o canvas transparente vai para a GPU pelo caminho do
// navegador, e em alguns celulares a transparência se perde: os pixels transparentes chegam opacos e
// brancos. Foi o que deixou os cantos dos cartões de folha como manchas brancas nas copas; brilhos,
// espuma e a sombra redonda dos personagens virariam quadrados. Aqui os pixels vão crus
// (DataTexture), com o alfa exatamente como foi desenhado, e a cor do que está desenhado "vaza" para
// os pixels transparentes em volta (o alfa não muda): as versões reduzidas da textura (mipmaps) não
// misturam mais cor de fundo com o desenho. Canvas sem transparência continua como CanvasTexture.
export function texturaDeCanvas(c) {
  const L = c.width, A = c.height;
  const img = c.getContext('2d').getImageData(0, 0, L, A).data;
  let transparente = false;
  for (let i = 3; i < img.length; i += 4) if (img[i] < 255) { transparente = true; break; }
  if (!transparente) return new THREE.CanvasTexture(c);

  const px = new Uint8Array(img);
  let cheio = new Uint8Array(L * A);
  let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i < L * A; i++) {
    if (img[i * 4 + 3] > 8) cheio[i] = 1;
    if (img[i * 4 + 3] > 200) { r += img[i * 4]; g += img[i * 4 + 1]; b += img[i * 4 + 2]; n++; }
  }
  // três passadas de vizinhança: cada pixel transparente pega a média dos vizinhos já preenchidos
  for (let passada = 0; passada < 3; passada++) {
    const novo = cheio.slice();
    for (let y = 0; y < A; y++) for (let x = 0; x < L; x++) {
      const i = y * L + x;
      if (cheio[i]) continue;
      let rr = 0, gg = 0, bb = 0, k = 0;
      if (x > 0 && cheio[i - 1]) { const j = (i - 1) * 4; rr += px[j]; gg += px[j + 1]; bb += px[j + 2]; k++; }
      if (x < L - 1 && cheio[i + 1]) { const j = (i + 1) * 4; rr += px[j]; gg += px[j + 1]; bb += px[j + 2]; k++; }
      if (y > 0 && cheio[i - L]) { const j = (i - L) * 4; rr += px[j]; gg += px[j + 1]; bb += px[j + 2]; k++; }
      if (y < A - 1 && cheio[i + L]) { const j = (i + L) * 4; rr += px[j]; gg += px[j + 1]; bb += px[j + 2]; k++; }
      if (k) { px[i * 4] = rr / k; px[i * 4 + 1] = gg / k; px[i * 4 + 2] = bb / k; novo[i] = 1; }
    }
    cheio = novo;
  }
  // o que sobrou longe de tudo fica com a cor média do desenho (antes: a cor que o navegador quisesse)
  if (n) for (let i = 0; i < L * A; i++) if (!cheio[i]) { px[i * 4] = r / n; px[i * 4 + 1] = g / n; px[i * 4 + 2] = b / n; }

  const t = new THREE.DataTexture(px, L, A, THREE.RGBAFormat);
  // os mesmos padrões da CanvasTexture: a linha de cima do desenho é v = 1, com mipmaps
  t.flipY = true;
  t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}
