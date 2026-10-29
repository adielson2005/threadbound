#!/usr/bin/env python3
"""Versiona os módulos do jogo no index.html (rodar antes de cada commit que mexe em src/).

O GitHub Pages manda o navegador guardar cada arquivo por 10 minutos. Depois de uma atualização o
navegador misturava módulos novos com antigos (um ilha.js novo importando algo que o mapa.js antigo
ainda não exporta) e o jogo não carregava, sem mensagem nenhuma. Aqui cada arquivo de src/ ganha
"?v=<pedaço do hash do conteúdo>": o mapa de importação do index.html troca cada "./src/x.js" pelo
endereço com a versão (vale também para os imports entre os próprios módulos), então arquivo
novo = endereço novo, e o que não mudou continua vindo do cache. O APK ignora o "?v=".

Uso: python3 ferramentas/versionar.py
"""
import hashlib, json, pathlib, re, sys

raiz = pathlib.Path(__file__).resolve().parent.parent
index = raiz / 'index.html'
html = index.read_text(encoding='utf-8')

versao = lambda p: hashlib.sha1(p.read_bytes()).hexdigest()[:10]
modulos = sorted(p for p in (raiz / 'src').glob('*.js'))

m = re.search(r'<script type="importmap">(.*?)</script>', html, re.S)
if not m:
    sys.exit('index.html: mapa de importação não encontrado')
mapa = json.loads(m.group(1))
imports = {k: v for k, v in mapa['imports'].items() if not k.startswith('./src/')}
for p in modulos:
    imports[f'./src/{p.name}'] = f'./src/{p.name}?v={versao(p)}'
mapa['imports'] = imports
html = html[:m.start(1)] + json.dumps(mapa, ensure_ascii=False, separators=(',', ':')) + html[m.end(1):]

jogo = raiz / 'src' / 'jogo.js'
html, n = re.subn(r'<script type="module" src="src/jogo\.js(\?v=[0-9a-f]+)?"></script>',
                  f'<script type="module" src="src/jogo.js?v={versao(jogo)}"></script>', html)
if n != 1:
    sys.exit('index.html: <script type="module" src="src/jogo.js"> não encontrado')

# número da versão no menu de Gráficos (para conferir se o navegador pegou a atualização)
import datetime
carimbo = datetime.datetime.now().strftime('%d/%m/%Y %H:%M') + ' · ' + versao(jogo)[:6]
html, n = re.subn(r'<p id="versao"([^>]*)>[^<]*</p>', lambda m: f'<p id="versao"{m.group(1)}>versão {carimbo}</p>', html)
index.write_text(html, encoding='utf-8')
print(f'{len(modulos)} módulos versionados')
