#!/usr/bin/env python3
"""Reescreve um FBX binário sem as imagens embutidas (a propriedade Content dos nós Video).

O jogo carrega as texturas da boneca à parte, no tamanho do nível gráfico (boneca.js), então as
imagens que vêm dentro do FBX só ocupavam download, memória e tempo de carregamento.
    uso: python3 ferramentas/fbx-sem-imagens.py entrada.fbx saida.fbx
Tudo o mais (malha, esqueleto, pesos, animações) é copiado byte a byte; só os deslocamentos dos
nós são recalculados.
"""
import struct, sys

def ler(dados):
    versao = struct.unpack_from('<I', dados, 23)[0]
    largo = versao >= 7500  # 7.5+: campos de 64 bits no cabeçalho de cada nó
    cab = '<QQQ' if largo else '<III'
    tam_cab = struct.calcsize(cab)
    def no(pos):
        fim, nprop, tam_props = struct.unpack_from(cab, dados, pos)
        if fim == 0: return None, pos + tam_cab + 1
        nlen = dados[pos + tam_cab]
        nome = dados[pos + tam_cab + 1: pos + tam_cab + 1 + nlen]
        p = pos + tam_cab + 1 + nlen
        props_bytes = dados[p: p + tam_props]
        p += tam_props
        filhos = []
        while p < fim:
            f, p = no(p)
            if f is None: break
            filhos.append(f)
        return (nome, nprop, props_bytes, filhos), fim
    nos, p = [], 27
    while p < len(dados):
        n, p2 = no(p)
        if n is None: break
        nos.append(n); p = p2
    return versao, largo, nos, dados[p:]

def props_sem_conteudo(nome, nprop, props):
    # Content: uma propriedade 'R' (bytes crus) -> vira 'R' vazia
    if nome != b'Content' or nprop != 1 or props[:1] != b'R': return nprop, props
    return 1, b'R' + struct.pack('<I', 0)

def escrever(versao, largo, nos, resto, cabecalho):
    cab = '<QQQ' if largo else '<III'
    tam_cab = struct.calcsize(cab)
    saida = bytearray(cabecalho)
    def esc(n):
        nome, nprop, props, filhos = n
        nprop, props = props_sem_conteudo(nome, nprop, props)
        inicio = len(saida)
        saida.extend(b'\0' * tam_cab); saida.append(len(nome)); saida.extend(nome); saida.extend(props)
        for f in filhos: esc(f)
        if filhos or True:
            # registro nulo que fecha a lista de filhos (presente sempre que há filhos; o FBX SDK
            # também o escreve em nós sem propriedades)
            if filhos or nprop == 0: saida.extend(b'\0' * (tam_cab + 1))
        struct.pack_into(cab, saida, inicio, len(saida), nprop, len(props))
    for n in nos: esc(n)
    saida.extend(b'\0' * (tam_cab + 1))
    saida.extend(resto[tam_cab + 1:] if resto[:tam_cab + 1] == b'\0' * (tam_cab + 1) else resto)
    return bytes(saida)

if __name__ == '__main__':
    dados = open(sys.argv[1], 'rb').read()
    versao, largo, nos, resto = ler(dados)
    novo = escrever(versao, largo, nos, resto, dados[:27])
    open(sys.argv[2], 'wb').write(novo)
    print(f'FBX {versao}: {len(dados) / 1e6:.1f} MB -> {len(novo) / 1e6:.1f} MB')
