package com.jiayicare.staff.pilot;

import android.Manifest;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.Toast;
import com.huawei.hms.aaid.HmsInstanceId;
import com.huawei.hms.push.HmsMessaging;
import org.json.JSONObject;

public class MainActivity extends BaseActivity {
    private static final int NOTIFICATION_REQUEST = 73;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private volatile String pushToken;
    private boolean pushStarted;
    private Button enableButton;
    private String lastFailure;

    public final class PushStatusBridge {
        @JavascriptInterface public void onBound(boolean bound, String reason) {
            runOnUiThread(() -> setPushStatus(bound ? "提醒已连接" : "提醒未连接", reason));
        }
    }

    private void setPushStatus(String label, String reason) {
        if (enableButton != null) {
            boolean connected = "提醒已连接".equals(label);
            enableButton.setText(connected ? "● 已连接" : "○ " + ("连接中…".equals(label) ? "连接中" : "未连接"));
            enableButton.setContentDescription(label + "，点击检查提醒连接");
            enableButton.setTextColor(connected ? Color.rgb(26, 105, 75) : Color.rgb(154, 89, 30));
            enableButton.setBackground(statusPill(connected ? Color.rgb(234, 246, 238) : Color.rgb(255, 248, 237),
                connected ? Color.rgb(190, 221, 199) : Color.rgb(237, 211, 168)));
        }
        if (reason == null || reason.isEmpty()) lastFailure = null;
        else if (!reason.equals(lastFailure)) {
            lastFailure = reason;
            Toast.makeText(this, reason, Toast.LENGTH_LONG).show();
        }
    }

    public final class BadgeBridge {
        @JavascriptInterface public void onUnread(int count) {
            if (Build.MANUFACTURER.equalsIgnoreCase("HUAWEI")) {
                Bundle bundle = new Bundle();
                bundle.putString("package", getPackageName());
                bundle.putString("class", MainActivity.class.getName());
                bundle.putInt("badgenumber", Math.max(0, Math.min(99, count)));
                try { getContentResolver().call(Uri.parse("content://com.huawei.android.launcher.settings/badge/"),
                    "change_badge", null, bundle); } catch (RuntimeException ignored) { }
            }
        }
    }
    private final Runnable bindDevice = new Runnable() {
        @Override public void run() {
            String token = pushToken;
            if (isTrustedPage()) {
                if (pushStarted && token != null) {
                    String quoted = JSONObject.quote(token);
                    webView.evaluateJavascript("(function(){const t=localStorage.getItem('jy_staff_token');"
                        + "if(!t){StaffPushStatus.onBound(false,'请先登录医护账号');return;}const id=" + quoted + ";const marker=t.slice(-16)+':'+id;"
                        + "fetch('https://jiaycare.com/api/staff/push-devices',{method:'PUT',"
                        + "headers:{'Content-Type':'application/json',Authorization:'Bearer '+t},"
                        + "body:JSON.stringify({token:id})}).then(r=>{if(r.ok){"
                        + "localStorage.setItem('jy_staff_push_marker',marker);"
                        + "localStorage.setItem('jy_staff_push_token',id);StaffPushStatus.onBound(true,'');"
                        + "}else{StaffPushStatus.onBound(false,'设备登记失败（'+r.status+'）');}})"
                        + ".catch(()=>StaffPushStatus.onBound(false,'设备登记网络失败'));})()", null);
                }
                webView.evaluateJavascript("(function(){const t=localStorage.getItem('jy_staff_token');"
                    + "if(!t){StaffPushBadge.onUnread(0);return;}"
                    + "fetch('https://jiaycare.com/api/staff/push-devices/unread-count',"
                    + "{headers:{Authorization:'Bearer '+t}}).then(r=>r.ok?r.json():null)"
                    + ".then(x=>{if(x&&Number.isInteger(x.data?.count))StaffPushBadge.onUnread(x.data.count);})"
                    + ".catch(()=>{});})()", null);
            }
            handler.postDelayed(this, 15000);
        }
    };

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        if (getPreferences(MODE_PRIVATE).getBoolean("pushConsent", false)) startPushIfAllowed();
    }

    @Override protected void addExtraActions(LinearLayout bar) {
        if (!getResources().getBoolean(R.bool.push_configured)) return;
        enableButton = barButton("○ 开提醒");
        enableButton.setTextSize(12);
        enableButton.setBackground(statusPill(Color.rgb(255, 248, 237), Color.rgb(237, 211, 168)));
        enableButton.setOnClickListener(view -> {
            if (getPreferences(MODE_PRIVATE).getBoolean("pushConsent", false)) {
                pushStarted = false;
                startPushIfAllowed();
                return;
            }
            new AlertDialog.Builder(this)
            .setTitle("开启客户消息提醒")
            .setMessage("开启后，华为推送服务将处理本机推送标识，用于发送不含客户姓名和消息正文的提醒。您可以在手机系统设置中关闭通知。")
            .setNeutralButton("查看隐私政策", (dialog, which) -> startActivity(new Intent(Intent.ACTION_VIEW,
                Uri.parse("https://jiaycare.com/privacy-policy.html"))))
            .setNegativeButton("取消", null)
            .setPositiveButton("同意并开启", (dialog, which) -> {
                getPreferences(MODE_PRIVATE).edit().putBoolean("pushConsent", true).apply();
                startPushIfAllowed();
            }).show();
        });
        bar.addView(enableButton, new LinearLayout.LayoutParams(dp(80), dp(34)));
    }

    @Override protected void configureWebView(WebView view) {
        view.addJavascriptInterface(new BadgeBridge(), "StaffPushBadge");
        view.addJavascriptInterface(new PushStatusBridge(), "StaffPushStatus");
    }

    private void startPushIfAllowed() {
        if (!getResources().getBoolean(R.bool.push_configured) || pushStarted) return;
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, NOTIFICATION_REQUEST);
            return;
        }
        pushStarted = true;
        setPushStatus("连接中…", null);
        new Thread(() -> {
            try {
                String token = HmsInstanceId.getInstance(this).getToken(
                    getString(R.string.huawei_app_id), HmsMessaging.DEFAULT_TOKEN_SCOPE);
                if (token == null || token.isEmpty()) throw new IllegalStateException("empty token");
                pushToken = token;
                handler.post(bindDevice);
            } catch (Exception error) {
                pushStarted = false;
                runOnUiThread(() -> setPushStatus("提醒未连接", "华为推送连接失败，请确认华为移动服务正常后点此重试"));
            }
        }, "staff-push-token").start();
    }

    @Override public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(requestCode, permissions, results);
        if (requestCode == NOTIFICATION_REQUEST && results.length > 0
                && results[0] == PackageManager.PERMISSION_GRANTED) startPushIfAllowed();
    }

    @Override protected void onResume() {
        super.onResume();
        handler.removeCallbacks(bindDevice);
        handler.post(bindDevice);
    }

    @Override protected void onPause() {
        handler.removeCallbacks(bindDevice);
        super.onPause();
    }
}
