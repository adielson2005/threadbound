#!/usr/bin/env python3
"""Reescreve o FBX da boneca só com o esqueleto e as animações (sem a malha antiga).

A Brisa usa a malha redesenhada (assets/boneca/boneca_nova.bin, ver src/bonecaNova.js); do FBX vêm
só os ossos e as animações. Aqui saem a malha, os pesos dela (Skin/Cluster), a pose de ligação,
materiais, texturas e imagens, e as conexões que apontavam para eles.
    uso: python3 ferramentas/fbx-so-esqueleto.py entrada.fbx saida.fbx
"""
import importlib.util, pathlib, struct, sys

spec = importlib.util.spec_from_file_location('fbx', pathlib.Path(__file__).with_name('fbx-sem-imagens.py'))
fbx = importlib.util.module_from_spec(spec); spec.loader.exec_module(fbx)

TIRAR = {b'Geometry', b'Deformer', b'Pose', b'Material', b'Texture', b'Video'}

def primeira_prop(props):
    # objetos começam pelo id (tipo 'L', inteiro de 64 bits)
    return struct.unpack_from('<q', props, 1)[0] if props[:1] == b'L' else None

def props_texto(props):
    # as três primeiras propriedades de um Model: id, nome, tipo ('S' = texto)
    saida, p = [], 0
    while p < len(props) and len(saida) < 3:
        t = props[p:p + 1]; p += 1
        if t == b'L': saida.append(struct.unpack_from('<q', props, p)[0]); p += 8
        elif t in (b'S', b'R'): n = struct.unpack_from('<I', props, p)[0]; p += 4; saida.append(props[p:p + n]); p += n
        else: break
    return saida

if __name__ == '__main__':
    dados = open(sys.argv[1], 'rb').read()
    versao, largo, nos, resto = fbx.ler(dados)
    tirados = set()
    for i, (nome, nprop, props, filhos) in enumerate(nos):
        if nome != b'Objects': continue
        ficam = []
        for f in filhos:
            p = props_texto(f[2])
            malha = f[0] == b'Model' and len(p) == 3 and p[2] == b'Mesh'
            if f[0] in TIRAR or malha: tirados.add(primeira_prop(f[2]))
            else: ficam.append(f)
        nos[i] = (nome, nprop, props, ficam)
    for i, (nome, nprop, props, filhos) in enumerate(nos):
        if nome != b'Connections': continue
        ficam = [f for f in filhos if not ({props_texto(f[2])[1], props_texto(f[2])[2]} & tirados)]
        nos[i] = (nome, nprop, props, ficam)
    novo = fbx.escrever(versao, largo, nos, resto, dados[:27])
    open(sys.argv[2], 'wb').write(novo)
    print(f'FBX {versao}: {len(dados) / 1e6:.1f} MB -> {len(novo) / 1e6:.1f} MB, {len(tirados)} objetos tirados')
