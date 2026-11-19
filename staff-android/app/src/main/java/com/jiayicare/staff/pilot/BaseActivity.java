package com.jiayicare.staff.pilot;

import android.app.Activity;
import android.Manifest;
import android.content.pm.PackageManager;
import android.media.AudioFormat;
import android.media.AudioRecord;
import android.media.MediaRecorder;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Bundle;
import android.util.Base64;
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
import android.webkit.JavascriptInterface;
import android.widget.Button;
import android.widget.ImageView;
import android.widget.LinearLayout;
import java.io.ByteArrayOutputStream;
import java.util.UUID;
import org.json.JSONObject;

public class BaseActivity extends Activity {
    private static final String HOME = "https://staff.jiaycare.com/notifications?tab=userMsgs";
    private static final String STAFF_HOST = "staff.jiaycare.com";
    private static final int FILE_REQUEST = 42;
    private static final int AUDIO_REQUEST = 43;
    protected WebView webView;
    private ValueCallback<Uri[]> fileCallback;
    private PermissionRequest audioPermission;
    private final String audioKey = UUID.randomUUID().toString();
    private volatile boolean trustedPage;
    private final NativeAudioBridge nativeAudio = new NativeAudioBridge();

    private boolean trustedUrl(String value) {
        Uri uri = Uri.parse(value == null ? "" : value);
        return "https".equals(uri.getScheme()) && STAFF_HOST.equals(uri.getHost());
    }

    private final class NativeAudioBridge {
        private AudioRecord recorder;
        private Thread reader;
        private ByteArrayOutputStream pcm;
        private volatile boolean recording;

        private boolean allowed(String key) {
            return trustedPage && audioKey.equals(key) &&
                checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED;
        }

        @JavascriptInterface public synchronized String start(String key) {
            if (!allowed(key)) return "permission_denied";
            if (recorder != null) return "already_recording";
            int size = Math.max(8192, AudioRecord.getMinBufferSize(16000,
                AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT));
            try {
                recorder = new AudioRecord(MediaRecorder.AudioSource.MIC, 16000,
                    AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, size);
                if (recorder.getState() != AudioRecord.STATE_INITIALIZED) throw new IllegalStateException("audio_init_failed");
                pcm = new ByteArrayOutputStream();
                recorder.startRecording();
                recording = true;
                final AudioRecord active = recorder;
                final ByteArrayOutputStream output = pcm;
                reader = new Thread(() -> {
                    byte[] buffer = new byte[4096];
                    while (recording && output.size() < 1920000) {
                        int count = active.read(buffer, 0, buffer.length);
                        if (count > 0) output.write(buffer, 0, Math.min(count, 1920000 - output.size()));
                        else if (count < 0) break;
                    }
                    recording = false;
                }, "staff-native-audio");
                reader.start();
                return "ok";
            } catch (RuntimeException error) {
                abort();
                return "audio_init_failed";
            }
        }

        @JavascriptInterface public synchronized String stop(String key, boolean cancel) {
            if (!trustedPage || !audioKey.equals(key)) return "{\"error\":\"untrusted_page\"}";
            if (recorder == null) return "{\"error\":\"not_recording\"}";
            recording = false;
            try { recorder.stop(); } catch (RuntimeException ignored) { }
            try { reader.join(2000); } catch (InterruptedException error) { Thread.currentThread().interrupt(); }
            byte[] audio = pcm.toByteArray();
            recorder.release();
            recorder = null;
            reader = null;
            pcm = null;
            if (cancel) return "{\"ok\":true}";
            int length = Math.min(audio.length, 1920000);
            byte[] wav = new byte[44 + length];
            wav[0]='R'; wav[1]='I'; wav[2]='F'; wav[3]='F'; put32(wav, 4, 36 + length);
            wav[8]='W'; wav[9]='A'; wav[10]='V'; wav[11]='E';
            wav[12]='f'; wav[13]='m'; wav[14]='t'; wav[15]=' '; put32(wav, 16, 16);
            put16(wav, 20, 1); put16(wav, 22, 1); put32(wav, 24, 16000);
            put32(wav, 28, 32000); put16(wav, 32, 2); put16(wav, 34, 16);
            wav[36]='d'; wav[37]='a'; wav[38]='t'; wav[39]='a'; put32(wav, 40, length);
            System.arraycopy(audio, 0, wav, 44, length);
            return "{\"data\":\"data:audio/wav;base64," + Base64.encodeToString(wav, Base64.NO_WRAP)
                + "\",\"mimeType\":\"audio/wav\",\"duration\":" + (length / 32000.0) + "}";
        }

        private void put16(byte[] bytes, int at, int value) {
            bytes[at] = (byte)value; bytes[at + 1] = (byte)(value >> 8);
        }
        private void put32(byte[] bytes, int at, int value) {
            for (int i = 0; i < 4; i++) bytes[at + i] = (byte)(value >> (8 * i));
        }
        private synchronized void abort() {
            recording = false;
            if (recorder != null) {
                try { recorder.stop(); } catch (RuntimeException ignored) { }
                recorder.release();
                recorder = null;
            }
            reader = null;
            pcm = null;
        }
    }

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.WHITE);

        LinearLayout bar = new LinearLayout(this);
        bar.setGravity(Gravity.CENTER_VERTICAL);
        bar.setPadding(dp(12), dp(4), dp(10), dp(4));
        bar.setBackgroundColor(Color.WHITE);
        ImageView logo = new ImageView(this);
        logo.setImageResource(getResources().getIdentifier("logo", "drawable", getPackageName()));
        logo.setScaleType(ImageView.ScaleType.FIT_START);
        bar.addView(logo, new LinearLayout.LayoutParams(dp(92), dp(30)));
        bar.addView(new View(this), new LinearLayout.LayoutParams(0, 1, 1));
        Button home = barButton("消息");
        home.setOnClickListener(v -> webView.loadUrl(HOME));
        bar.addView(home, new LinearLayout.LayoutParams(dp(46), dp(38)));
        Button refresh = barButton("↻");
        refresh.setContentDescription("刷新页面");
        refresh.setTextSize(24);
        refresh.setOnClickListener(v -> webView.reload());
        bar.addView(refresh, new LinearLayout.LayoutParams(dp(40), dp(38)));
        addExtraActions(bar);
        root.addView(bar, new LinearLayout.LayoutParams(-1, dp(48)));
        View divider = new View(this);
        divider.setBackgroundColor(Color.rgb(226, 235, 230));
        root.addView(divider, new LinearLayout.LayoutParams(-1, dp(1)));

        webView = new WebView(this);
        WebSettings settings = webView.getSettings();
        settings.setUserAgentString(settings.getUserAgentString() + " JiayiCareStaffAndroid/0.1.6");
        settings.setJavaScriptEnabled(true);
        webView.addJavascriptInterface(nativeAudio, "StaffNativeAudio");
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        CookieManager.getInstance().setAcceptCookie(true);
        configureWebView(webView);
        webView.setWebViewClient(new WebViewClient() {
            @Override public void onPageStarted(WebView view, String url, android.graphics.Bitmap icon) {
                trustedPage = false;
            }
            @Override public void onPageFinished(WebView view, String url) {
                trustedPage = trustedUrl(url);
                if (trustedPage) view.evaluateJavascript("window.__JIAYI_NATIVE_AUDIO_KEY=" + JSONObject.quote(audioKey), null);
            }
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
        button.setTextSize(13);
        button.setTextColor(Color.rgb(30, 107, 80));
        button.setAllCaps(false);
        button.setMinWidth(0);
        button.setMinimumWidth(0);
        button.setMinHeight(0);
        button.setMinimumHeight(0);
        button.setPadding(0, 0, 0, 0);
        button.setBackgroundColor(Color.TRANSPARENT);
        return button;
    }

    protected GradientDrawable statusPill(int background, int border) {
        GradientDrawable shape = new GradientDrawable();
        shape.setColor(background);
        shape.setCornerRadius(dp(10));
        shape.setStroke(dp(1), border);
        return shape;
    }

    protected int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }

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

    @Override protected void onPause() {
        nativeAudio.abort();
        super.onPause();
    }

    @Override protected void onDestroy() {
        nativeAudio.abort();
        if (audioPermission != null) { audioPermission.deny(); audioPermission = null; }
        if (fileCallback != null) fileCallback.onReceiveValue(null);
        if (webView != null) webView.destroy();
        super.onDestroy();
    }
}
