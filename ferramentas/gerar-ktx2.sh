#!/bin/sh
# Gera as versões KTX2 (Basis Universal) das texturas grandes, ao lado dos originais.
# O jogo (src/texturas.js) carrega o .ktx2 quando existe e o navegador suporta; senão, o JPG/PNG.
# Precisa do toktx (KTX-Software 4.x, https://github.com/KhronosGroup/KTX-Software/releases).
#   uso: ferramentas/gerar-ktx2.sh [caminho/do/toktx]
#
#  - cor (sRGB) e mapas de um canal (rugosidade, metal): ETC1S, pequeno no download e na GPU
#  - normal maps: UASTC (ETC1S borra o relevo), com supercompressão zstd
#  - --lower_left_maps_to_s0t0: a imagem já sai virada, como o flipY=true dos originais
#    (textura comprimida não pode ser virada na hora do upload)
set -e
TOKTX=${1:-toktx}
cd "$(dirname "$0")/.."
cor() { "$TOKTX" --t2 --genmipmap --lower_left_maps_to_s0t0 --encode etc1s --clevel 4 --qlevel 200 --assign_oetf srgb "${1%.*}.ktx2" "$1"; }
dado() { "$TOKTX" --t2 --genmipmap --lower_left_maps_to_s0t0 --encode etc1s --clevel 4 --qlevel 200 --assign_oetf linear "${1%.*}.ktx2" "$1"; }
normal() { "$TOKTX" --t2 --genmipmap --lower_left_maps_to_s0t0 --encode uastc --uastc_quality 2 --zcmp 18 --assign_oetf linear "${1%.*}.ktx2" "$1"; }
for f in assets/boneca/boneca_cor_1024.jpg assets/boneca/boneca_cor_2048.jpg assets/boneca/boneca_cor_4096.jpg \
         assets/cachoeira/cachoeira_cor_1024.jpg assets/cachoeira/cachoeira_cor_2048.jpg; do cor "$f"; done
for f in assets/boneca/boneca_rugosidade_1024.jpg assets/boneca/boneca_metal_1024.jpg \
         assets/cachoeira/cachoeira_rugosidade_1024.jpg assets/cachoeira/cachoeira_metal_512.jpg; do dado "$f"; done
for f in assets/boneca/boneca_normal_1024.png assets/boneca/boneca_normal_2048.png \
         assets/cachoeira/cachoeira_normal_1024.png; do normal "$f"; done
echo ok
