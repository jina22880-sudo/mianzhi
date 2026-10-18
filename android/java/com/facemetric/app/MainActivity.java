package com.facemetric.app;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.WindowManager;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import java.io.IOException;
import java.io.InputStream;

public class MainActivity extends Activity {
    private WebView web;
    private static final int REQ_CAM = 1001;
    private static final int REQ_FILE = 2001;
    private ValueCallback<Uri[]> fileCb;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        setContentView(R.layout.activity_main);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        web = (WebView) findViewById(R.id.web);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(true);
        s.setAllowContentAccess(true);
        s.setCacheMode(WebSettings.LOAD_NO_CACHE);
        if (Build.VERSION.SDK_INT >= 21) {
            s.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        }
        web.setBackgroundColor(Color.parseColor("#0d1116"));
        WebView.setWebContentsDebuggingEnabled(true);

        // 用 https 源 + 本地拦截：getUserMedia 需要安全上下文（file:// 在部分机型会被拒）
        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest req) {
                return serve(req.getUrl().getPath());
            }
        });

        // ★ 关键：把相机权限交给网页
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(final PermissionRequest request) {
                runOnUiThread(new Runnable() {
                    public void run() {
                        try { request.grant(request.getResources()); } catch (Exception e) { }
                    }
                });
            }
            @Override
            public void onPermissionRequestCanceled(PermissionRequest request) { }

            // ★ 关键：网页里的 <input type=file> 必须由原生打开选择器
            @Override
            public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb,
                                             FileChooserParams params) {
                if (fileCb != null) { fileCb.onReceiveValue(null); }
                fileCb = cb;
                try {
                    Intent i = params.createIntent();
                    i.addCategory(Intent.CATEGORY_OPENABLE);
                    startActivityForResult(i, REQ_FILE);
                    return true;
                } catch (Exception e) {
                    fileCb = null;
                    return false;
                }
            }
        });

        if (Build.VERSION.SDK_INT >= 23
                && checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.CAMERA}, REQ_CAM);
        }

        web.loadUrl("https://app.local/index.html");
    }

    private WebResourceResponse serve(String path) {
        if (path == null || path.equals("/")) path = "/index.html";
        String name = path.startsWith("/") ? path.substring(1) : path;
        String mime = name.endsWith(".html") ? "text/html"
                    : name.endsWith(".js") ? "application/javascript"
                    : name.endsWith(".css") ? "text/css"
                    : "application/octet-stream";
        try {
            InputStream in = getAssets().open(name);
            WebResourceResponse r = new WebResourceResponse(mime, "utf-8", in);
            return r;
        } catch (IOException e) {
            return null;
        }
    }

    @Override
    protected void onActivityResult(int req, int res, Intent data) {
        if (req == REQ_FILE) {
            if (fileCb != null) {
                fileCb.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(res, data));
                fileCb = null;
            }
            return;
        }
        super.onActivityResult(req, res, data);
    }

    @Override
    public void onRequestPermissionsResult(int code, String[] ps, int[] res) {
        super.onRequestPermissionsResult(code, ps, res);
        if (code == REQ_CAM) {
            if (res.length > 0 && res[0] == PackageManager.PERMISSION_GRANTED) web.reload();
        }
    }

    private long lastBack = 0;
    @Override
    public void onBackPressed() {
        long now = System.currentTimeMillis();
        if (now - lastBack < 2000) { super.onBackPressed(); }
        else { lastBack = now; android.widget.Toast.makeText(this, "再按一次退出", android.widget.Toast.LENGTH_SHORT).show(); }
    }
}
