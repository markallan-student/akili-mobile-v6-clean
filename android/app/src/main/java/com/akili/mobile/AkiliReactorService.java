package com.akili.mobile;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Intent;
import android.graphics.PixelFormat;
import android.os.Build;
import android.os.IBinder;
import android.os.Vibrator;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;
import android.widget.ImageView;

/**
 * AKILI Reactor floating bubble - works over ALL apps.
 * Single tap = menu, DOUBLE tap (2 taps <300ms) = activate listening.
 * Draggable. KEEPS double-press activation.
 */
public class AkiliReactorService extends Service {
  private WindowManager wm;
  private ImageView bubble;
  private long lastTap = 0;
  private float downX, downY;
  private int startX, startY;
  private boolean dragging = false;

  @Override public void onCreate() {
    super.onCreate();
    startFg();
    wm = (WindowManager) getSystemService(WINDOW_SERVICE);
    bubble = new ImageView(this);
    bubble.setImageResource(android.R.drawable.presence_online);
    bubble.setAlpha(0.95f);
    int size = (int)(60 * getResources().getDisplayMetrics().density);
    int type = Build.VERSION.SDK_INT >= 26 ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY : WindowManager.LayoutParams.TYPE_PHONE;
    final WindowManager.LayoutParams p = new WindowManager.LayoutParams(size, size, type,
      WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE | WindowManager.LayoutParams.FLAG_WATCH_OUTSIDE_TOUCH,
      PixelFormat.TRANSLUCENT);
    p.gravity = Gravity.TOP | Gravity.START; p.x = 40; p.y = 300;
    try { wm.addView(bubble, p); } catch (Exception e) { stopSelf(); return; }
    bubble.setOnTouchListener(new View.OnTouchListener() {
      @Override public boolean onTouch(View v, MotionEvent e) {
        if (e.getAction() == MotionEvent.ACTION_DOWN) {
          downX = e.getRawX(); downY = e.getRawY(); startX = p.x; startY = p.y; dragging = false;
        } else if (e.getAction() == MotionEvent.ACTION_MOVE) {
          int dx = (int)(e.getRawX() - downX), dy = (int)(e.getRawY() - downY);
          if (Math.hypot(dx, dy) > 12) {
            dragging = true; p.x = startX + dx; p.y = startY + dy;
            try { wm.updateViewLayout(bubble, p); } catch (Exception ignored) {}
          }
        } else if (e.getAction() == MotionEvent.ACTION_UP) {
          if (!dragging) {
            long now = System.currentTimeMillis();
            if (now - lastTap < 300) {
              try { ((Vibrator)getSystemService(VIBRATOR_SERVICE)).vibrate(50); } catch (Exception ignored) {}
              sendBroadcast(new Intent("com.akili.mobile.ACTIVATE"));
            }
            lastTap = now;
          }
        }
        return true;
      }
    });
  }
  private void startFg() {
    try {
      String ch = "akili-reactor";
      if (Build.VERSION.SDK_INT >= 26) {
        NotificationChannel c = new NotificationChannel(ch, "Akili Reactor", NotificationManager.IMPORTANCE_LOW);
        ((NotificationManager)getSystemService(NOTIFICATION_SERVICE)).createNotificationChannel(c);
      }
      Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, ch) : new Notification.Builder(this);
      b.setContentTitle("Akili Reactor Active").setContentText("Double-press bubble to talk").setSmallIcon(android.R.drawable.presence_online);
      startForeground(101, b.build());
    } catch (Exception ignored) {}
  }
  @Override public void onDestroy() { try { if (bubble != null) wm.removeView(bubble); } catch (Exception ignored) {} super.onDestroy(); }
  @Override public IBinder onBind(Intent i) { return null; }
  @Override public int onStartCommand(Intent i, int f, int id) { return START_STICKY; }
}
