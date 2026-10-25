#!/bin/sh
# Gera o APK do Threadbound (projeto em android/) sem Android Studio nem Gradle: aapt, javac, dx,
# zipalign e apksigner. No Ubuntu/Debian:
#   sudo apt install aapt zipalign apksigner dalvik-exchange android-sdk-platform-23 default-jdk
# uso: ferramentas/gerar-apk.sh          ->  build/Threadbound.apk
#
# A chave de assinatura fica em build/assinatura.keystore (e a senha em build/assinatura.senha),
# criadas na primeira vez e fora do git. Guarde as duas: para atualizar o app já instalado no
# celular o APK novo precisa ser assinado com a mesma chave.
set -e
ANDROID_JAR=${ANDROID_JAR:-/usr/lib/android-sdk/platforms/android-23/android.jar}
DX=${DX:-/usr/lib/android-sdk/build-tools/debian/dx}
cd "$(dirname "$0")/.."
B=build/apk
rm -rf "$B"; mkdir -p "$B/assets/www/assets/boneca" "$B/assets/www/assets/cachoeira" "$B/classes"

# 1. arquivos do jogo (sem o que só serve às ferramentas: as texturas originais gigantes, o FBX da
#    cachoeira, que vira cachoeira.bin, e o mapa antigo do Meshy)
W="$B/assets/www"
cp index.html "$W/"; cp -r src vendor "$W/"
for d in animacoes efeitos menu; do cp -r "assets/$d" "$W/assets/"; done
cp assets/boneca/boneca.fbx assets/boneca/*_1024.* assets/boneca/*_2048.* assets/boneca/*_4096.* "$W/assets/boneca/"
cp assets/cachoeira/cachoeira.bin assets/cachoeira/cachoeira_*.* "$W/assets/cachoeira/"

# 2. manifesto, recursos (ícone, tema) e os arquivos do jogo
aapt package -f -M android/AndroidManifest.xml -S android/res -I "$ANDROID_JAR" -A "$B/assets" -F "$B/base.apk"

# 3. o código Java (a Activity com a WebView) -> classes.dex
javac -source 8 -target 8 -nowarn -Xlint:-options -bootclasspath "$ANDROID_JAR" -d "$B/classes" android/src/com/adielson/threadbound/*.java
"$DX" --dex --min-sdk-version=24 --output="$B/classes.dex" "$B/classes"
(cd "$B" && aapt add base.apk classes.dex >/dev/null)

# 4. alinhamento e assinatura (v1 + v2 + v3)
zipalign -f -p 4 "$B/base.apk" "$B/alinhado.apk"
if [ ! -f build/assinatura.keystore ]; then
  head -c 18 /dev/urandom | base64 | tr -d '/+=' > build/assinatura.senha
  keytool -genkeypair -noprompt -keystore build/assinatura.keystore -alias threadbound -keyalg RSA -keysize 2048 \
    -validity 10000 -storepass "$(cat build/assinatura.senha)" -keypass "$(cat build/assinatura.senha)" \
    -dname "CN=Adielson, O=Threadbound, C=BR" 2>/dev/null
fi
SENHA_APK="$(cat build/assinatura.senha)"; export SENHA_APK
apksigner sign --ks build/assinatura.keystore --ks-key-alias threadbound --ks-pass env:SENHA_APK --key-pass env:SENHA_APK \
  --out build/Threadbound.apk "$B/alinhado.apk"
apksigner verify --print-certs build/Threadbound.apk | head -1
ls -la build/Threadbound.apk
