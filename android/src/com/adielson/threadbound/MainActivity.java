package com.adielson.threadbound;

import android.app.Activity;
import android.content.Intent;
import android.content.res.AssetManager;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.view.WindowManager;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.IOException;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Map;

// O jogo é uma página web (three.js, módulos ES). Módulos e fetch não funcionam em file://, então
// os arquivos de assets/www são servidos num endereço https próprio do app (o mesmo que o
// WebViewAssetLoader do AndroidX usa), lidos direto do APK: nada sai do aparelho.
public class MainActivity extends Activity {
    private static final String HOST = "appassets.androidplatform.net";
    private static final Map<String, String> TIPOS = new HashMap<>();
    static {
        TIPOS.put("html", "text/html"); TIPOS.put("js", "text/javascript"); TIPOS.put("css", "text/css");
        TIPOS.put("json", "application/json"); TIPOS.put("wasm", "application/wasm");
        TIPOS.put("png", "image/png"); TIPOS.put("jpg", "image/jpeg"); TIPOS.put("jpeg", "image/jpeg");
        TIPOS.put("ktx2", "image/ktx2"); TIPOS.put("woff2", "font/woff2"); TIPOS.put("svg", "image/svg+xml");
    }

    private WebView web;

    @Override
    protected void onCreate(Bundle estado) {
        super.onCreate(estado);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON | WindowManager.LayoutParams.FLAG_FULLSCREEN);
        web = new WebView(this);
        web.setBackgroundColor(0xff2e231b);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);                 // localStorage: progresso salvo e configurações
        s.setMediaPlaybackRequiresUserGesture(false); // chuva, trovão e efeitos
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setTextZoom(100);                           // a fonte grande do sistema não desmonta o HUD
        s.setSupportZoom(false);
        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest req) {
                Uri u = req.getUrl();
                if (!HOST.equals(u.getHost())) return null;
                return arquivo(u.getPath());
            }
            // links de fora (o Instagram dos créditos) abrem no navegador ou no app do Instagram
            @Override
            @SuppressWarnings("deprecation")
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                if (Uri.parse(url).getHost() != null && Uri.parse(url).getHost().equals(HOST)) return false;
                try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url))); } catch (Exception e) { /* sem navegador */ }
                return true;
            }
        });
        setContentView(web);
        telaCheia();
        if (estado == null) web.loadUrl("https://" + HOST + "/index.html");
        else web.restoreState(estado);
    }

    private WebResourceResponse arquivo(String caminho) {
        if (caminho == null || caminho.equals("/")) caminho = "/index.html";
        String ext = caminho.substring(caminho.lastIndexOf('.') + 1).toLowerCase();
        String tipo = TIPOS.containsKey(ext) ? TIPOS.get(ext) : "application/octet-stream";
        boolean texto = tipo.startsWith("text/") || tipo.endsWith("json") || tipo.endsWith("javascript");
        try {
            InputStream dados = getAssets().open("www" + caminho, AssetManager.ACCESS_STREAMING);
            Map<String, String> cab = new HashMap<>();
            cab.put("Access-Control-Allow-Origin", "*");
            cab.put("Cache-Control", "no-cache");
            return new WebResourceResponse(tipo, texto ? "utf-8" : null, 200, "OK", cab, dados);
        } catch (IOException e) {
            return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found", new HashMap<String, String>(), null);
        }
    }

    // imersivo: some a barra de status e a de navegação (voltam com um deslize da borda)
    private void telaCheia() {
        web.setSystemUiVisibility(View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
            | View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
            | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN);
    }

    @Override
    public void onWindowFocusChanged(boolean foco) {
        super.onWindowFocusChanged(foco);
        if (foco) telaCheia();
    }

    // em segundo plano o jogo para (o laço de desenho e o som), e volta de onde estava
    @Override
    protected void onPause() { super.onPause(); web.onPause(); web.pauseTimers(); }

    @Override
    protected void onResume() { super.onResume(); web.onResume(); web.resumeTimers(); }

    @Override
    protected void onSaveInstanceState(Bundle estado) { super.onSaveInstanceState(estado); web.saveState(estado); }

    @Override
    protected void onDestroy() { web.destroy(); super.onDestroy(); }
}
