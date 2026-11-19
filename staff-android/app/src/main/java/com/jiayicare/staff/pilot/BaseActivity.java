package com.jiayicare.staff.pilot;

import android.app.Activity;
import android.Manifest;
import android.content.pm.PackageManager;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.webkit.CookieManager;
import android.webkit.ValueCallback;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.ImageView;
import android.widget.LinearLayout;

public class BaseActivity extends Activity {
    private static final String HOME = "https://staff.jiaycare.com/notifications?tab=userMsgs";
    private static final String STAFF_HOST = "staff.jiaycare.com";
    private static final int FILE_REQUEST = 42;
    private static final int AUDIO_REQUEST = 43;
    protected WebView webView;
    private ValueCallback<Uri[]> fileCallback;
    private PermissionRequest audioPermission;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.WHITE);

        LinearLayout bar = new LinearLayout(this);
        bar.setGravity(Gravity.CENTER_VERTICAL);
        bar.setPadding(dp(16), 0, dp(8), 0);
        bar.setBackgroundColor(Color.WHITE);
        ImageView logo = new ImageView(this);
        logo.setImageResource(getResources().getIdentifier("logo", "drawable", getPackageName()));
        logo.setScaleType(ImageView.ScaleType.FIT_START);
        bar.addView(logo, new LinearLayout.LayoutParams(0, dp(48), 1));
        Button home = barButton("消息");
        home.setOnClickListener(v -> webView.loadUrl(HOME));
        bar.addView(home);
        Button refresh = barButton("刷新");
        refresh.setOnClickListener(v -> webView.reload());
        bar.addView(refresh);
        addExtraActions(bar);
        root.addView(bar);

        webView = new WebView(this);
        WebSettings settings = webView.getSettings();
        settings.setUserAgentString(settings.getUserAgentString() + " JiayiCareStaffAndroid/0.1.4");
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        CookieManager.getInstance().setAcceptCookie(true);
        configureWebView(webView);
        webView.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if ("https".equals(uri.getScheme()) && STAFF_HOST.equals(uri.getHost())) return false;
                try { startActivity(new Intent(Intent.ACTION_VIEW, uri)); } catch (Exception ignored) {}
                return true;
            }
        });
        webView.setWebChromeClient(new WebChromeClient() {
            @Override public void onPermissionRequest(PermissionRequest request) {
                runOnUiThread(() -> {
                    if (!isTrustedPage() || !"https".equals(request.getOrigin().getScheme())
                            || !STAFF_HOST.equals(request.getOrigin().getHost())
                            || request.getResources().length != 1
                            || !PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(request.getResources()[0])) {
                        request.deny();
                        return;
                    }
                    if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
                        request.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});
                        return;
                    }
                    if (audioPermission != null) audioPermission.deny();
                    audioPermission = request;
                    requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, AUDIO_REQUEST);
                });
            }
            @Override public void onPermissionRequestCanceled(PermissionRequest request) {
                if (audioPermission == request) audioPermission = null;
            }
            @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback,
                                                       FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                try {
                    startActivityForResult(params.createIntent(), FILE_REQUEST);
                    return true;
                } catch (Exception error) {
                    callback.onReceiveValue(null);
                    fileCallback = null;
                    return true;
                }
            }
        });
        root.addView(webView, new LinearLayout.LayoutParams(-1, 0, 1));
        setContentView(root);
        webView.loadUrl(HOME);
    }

    protected void addExtraActions(LinearLayout bar) {}
    protected void configureWebView(WebView view) {}

    protected boolean isTrustedPage() {
        Uri uri = Uri.parse(webView.getUrl() == null ? "" : webView.getUrl());
        return "https".equals(uri.getScheme()) && STAFF_HOST.equals(uri.getHost());
    }

    protected Button barButton(String label) {
        Button button = new Button(this);
        button.setText(label);
        button.setTextColor(Color.rgb(30, 107, 80));
        button.setAllCaps(false);
        button.setBackgroundColor(Color.TRANSPARENT);
        return button;
    }

    private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }

    @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == FILE_REQUEST && fileCallback != null) {
            fileCallback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data));
            fileCallback = null;
        }
    }

    @Override public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(requestCode, permissions, results);
        if (requestCode == AUDIO_REQUEST && audioPermission != null) {
            PermissionRequest request = audioPermission;
            audioPermission = null;
            if (results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED && isTrustedPage())
                request.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});
            else request.deny();
        }
    }

    @Override public void onBackPressed() {
        if (webView != null && webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }

    @Override protected void onDestroy() {
        if (audioPermission != null) { audioPermission.deny(); audioPermission = null; }
        if (fileCallback != null) fileCallback.onReceiveValue(null);
        if (webView != null) webView.destroy();
        super.onDestroy();
    }
}
