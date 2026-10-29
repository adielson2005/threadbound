#!/usr/bin/env python3
"""Preenche o fundo entre as ilhas de UV das texturas da boneca nova ("edge padding").

As texturas do Meshy têm fundo claro entre as ilhas (22% dele quase branco). O cabelo é feito de
muitas tiras finas de UV: na borda de cada tira a filtragem bilinear e os mipmaps (a textura reduzida
para longe) misturavam esse fundo com o cabelo, e apareciam pontinhos brancos nas mechas (e riscos
escuros de cabelo nos braços, pelo mesmo motivo do outro lado). Aqui todo pixel fora das ilhas
recebe a cor das ilhas mais próximas (push-pull: médias numa pirâmide de resoluções e de volta),
então a borda só encontra a própria cor em qualquer distância.

Uso: python3 preencher_bordas.py uvs textura_entrada.png textura_saida.png
uvs: as UVs da malha ORIGINAL do Meshy (1,1 milhão de triângulos), como Float32 cru, três pares
(u, v) por triângulo (.f32), ou um .obj. Tem de ser a original: na malha leve vários triângulos do
cabelo, ao serem unidos, passaram a cobrir o vão claro entre duas mechas na textura, e com a máscara
dela esse vão contava como "dentro" e continuava claro (os riscos brancos sobravam).
O resultado tem o tamanho da entrada.
"""
import sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter


def mascara_uv(origem, n):
    m = Image.new('L', (n, n), 0)
    d = ImageDraw.Draw(m)
    if origem.endswith('.f32'):
        uv = np.fromfile(origem, dtype=np.float32).reshape(-1, 3, 2)
        xy = np.stack([uv[..., 0] * n, (1 - uv[..., 1]) * n], axis=-1).tolist()
        for t in xy:
            d.polygon([tuple(p) for p in t], fill=255)
        return np.asarray(m.filter(ImageFilter.MaxFilter(3))) > 0
    obj = origem
    U, F = [], []
    for l in open(obj):
        a = l.split()
        if not a:
            continue
        if a[0] == 'vt':
            U.append((float(a[1]), float(a[2])))
        elif a[0] == 'f':
            F.append([int(x.split('/')[1]) - 1 for x in a[1:4]])
    for t in F:
        d.polygon([(U[i][0] * n, (1 - U[i][1]) * n) for i in t], fill=255)
    # um pixel a mais em volta: a borda rasterizada de cada triângulo fica dentro da ilha
    return np.asarray(m.filter(ImageFilter.MaxFilter(3))) > 0


def push_pull(cor, peso):
    """cor: HxWxC float, peso: HxW (1 dentro das ilhas, 0 fora). Preenche onde peso == 0."""
    niveis = [(cor * peso[..., None], peso)]
    while niveis[-1][1].shape[0] > 1:
        c, w = niveis[-1]
        h2, w2 = c.shape[0] // 2, c.shape[1] // 2
        c2 = c[:h2 * 2, :w2 * 2].reshape(h2, 2, w2, 2, -1).sum(axis=(1, 3))
        p2 = w[:h2 * 2, :w2 * 2].reshape(h2, 2, w2, 2).sum(axis=(1, 3))
        niveis.append((c2, p2))
    # volta: cada nível herda do de baixo onde não tem nada próprio
    c, w = niveis[-1]
    atual = c / np.maximum(w, 1e-8)[..., None]
    for c, w in reversed(niveis[:-1]):
        cima = np.repeat(np.repeat(atual, 2, axis=0), 2, axis=1)
        cima = np.pad(cima, ((0, c.shape[0] - cima.shape[0]), (0, c.shape[1] - cima.shape[1]), (0, 0)), mode='edge')
        proprio = c / np.maximum(w, 1e-8)[..., None]
        k = np.clip(w, 0, 1)[..., None]
        atual = proprio * k + cima * (1 - k)
    return atual


def main(obj, entrada, saida):
    img = Image.open(entrada)
    modo = img.mode
    a = np.asarray(img.convert('RGB')).astype(np.float32)
    n = a.shape[0]
    mask = mascara_uv(obj, n)
    out = push_pull(a, mask.astype(np.float32))
    out[mask] = a[mask]  # dentro das ilhas, exatamente o original
    r = Image.fromarray(np.clip(out + 0.5, 0, 255).astype(np.uint8))
    if modo == 'L':
        r = r.convert('L')
    r.save(saida)
    print(f'{entrada}: {n}x{n}, ilhas {mask.mean() * 100:.1f}%, fundo preenchido -> {saida}')


if __name__ == '__main__':
    main(*sys.argv[1:4])
