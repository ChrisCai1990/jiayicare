package com.jiayicare.staff.pilot;

import android.Manifest;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.widget.Button;
import android.widget.LinearLayout;
import com.huawei.hms.aaid.HmsInstanceId;
import com.huawei.hms.push.HmsMessaging;
import org.json.JSONObject;

public class MainActivity extends BaseActivity {
    private static final int NOTIFICATION_REQUEST = 73;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private volatile String pushToken;
    private boolean pushStarted;

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
                        + "if(!t)return;const id=" + quoted + ";const marker=t.slice(-16)+':'+id;"
                        + "if(localStorage.getItem('jy_staff_push_marker')===marker)return;"
                        + "fetch('https://jiaycare.com/api/staff/push-devices',{method:'PUT',"
                        + "headers:{'Content-Type':'application/json',Authorization:'Bearer '+t},"
                        + "body:JSON.stringify({token:id})}).then(r=>{if(r.ok){"
                        + "localStorage.setItem('jy_staff_push_marker',marker);"
                        + "localStorage.setItem('jy_staff_push_token',id);}}).catch(()=>{});})()", null);
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
        Button enable = barButton("开启提醒");
        enable.setOnClickListener(view -> new AlertDialog.Builder(this)
            .setTitle("开启客户消息提醒")
            .setMessage("开启后，华为推送服务将处理本机推送标识，用于发送不含客户姓名和消息正文的提醒。您可以在手机系统设置中关闭通知。")
            .setNeutralButton("查看隐私政策", (dialog, which) -> startActivity(new Intent(Intent.ACTION_VIEW,
                Uri.parse("https://jiaycare.com/privacy-policy.html"))))
            .setNegativeButton("取消", null)
            .setPositiveButton("同意并开启", (dialog, which) -> {
                getPreferences(MODE_PRIVATE).edit().putBoolean("pushConsent", true).apply();
                startPushIfAllowed();
            }).show());
        bar.addView(enable);
    }

    @Override protected void configureWebView(WebView view) {
        view.addJavascriptInterface(new BadgeBridge(), "StaffPushBadge");
    }

    private void startPushIfAllowed() {
        if (!getResources().getBoolean(R.bool.push_configured) || pushStarted) return;
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, NOTIFICATION_REQUEST);
            return;
        }
        pushStarted = true;
        new Thread(() -> {
            try { pushToken = HmsInstanceId.getInstance(this).getToken(
                getString(R.string.huawei_app_id), HmsMessaging.DEFAULT_TOKEN_SCOPE); }
            catch (Exception ignored) { pushStarted = false; }
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
