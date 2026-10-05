package com.akili.mobile;

import android.accessibilityservice.AccessibilityService;
import android.accessibilityservice.GestureDescription;
import android.content.Intent;
import android.graphics.Path;
import android.os.Bundle;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;

/**
 * AKILI Accessibility control - tap/doubleTap/longPress/swipe/drag/type
 * openApp/pressBack/pressHome. KEEPS double-press + typing.
 */
public class AkiliAccessibilityService extends AccessibilityService {
  public static AkiliAccessibilityService instance;
  @Override public void onServiceConnected() { instance = this; }
  @Override public void onAccessibilityEvent(AccessibilityEvent e) {}
  @Override public void onInterrupt() {}
  @Override public void onDestroy() { instance = null; super.onDestroy(); }
  private void gesture(Path path, long start, long dur) {
    if (instance == null) return;
    GestureDescription.StrokeDescription s = new GestureDescription.StrokeDescription(path, start, dur);
    instance.dispatchGesture(new GestureDescription.Builder().addStroke(s).build(), null, null);
  }
  public static void globalTap(int x, int y) {
    Path p = new Path(); p.moveTo(x, y);
    if (instance != null) instance.gesture(p, 0, 60);
  }
  public static void globalDoubleTap(final int x, final int y) {
    new Thread(new Runnable() {
      @Override public void run() {
        globalTap(x, y);
        try { Thread.sleep(110); } catch (Exception ignored) {}
        globalTap(x, y);
      }
    }).start();
  }
  public static void globalLongPress(int x, int y) {
    Path p = new Path(); p.moveTo(x, y);
    if (instance != null) instance.gesture(p, 0, 800);
  }
  public static void globalSwipe(int x1, int y1, int x2, int y2, int ms) {
    Path p = new Path(); p.moveTo(x1, y1); p.lineTo(x2, y2);
    if (instance != null) instance.gesture(p, 0, ms <= 0 ? 350 : ms);
  }
  public static void globalDrag(int x1, int y1, int x2, int y2) { globalSwipe(x1, y1, x2, y2, 650); }
  public static boolean globalType(String text) {
    if (instance == null) return false;
    AccessibilityNodeInfo focus = null;
    try { focus = instance.findFocus(AccessibilityNodeInfo.FOCUS_INPUT); } catch (Exception ignored) {}
    if (focus == null) { try { focus = instance.getRootInActiveWindow(); } catch (Exception ignored) {} }
    if (focus == null) return false;
    Bundle b = new Bundle();
    b.putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, text);
    return focus.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, b);
  }
  public void openApp(String pkg) {
    try {
      Intent i = getPackageManager().getLaunchIntentForPackage(pkg);
      if (i == null) i = new Intent(Intent.ACTION_MAIN);
      i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
      startActivity(i);
    } catch (Exception ignored) {}
  }
  public static void pressBack() { if (instance != null) instance.performGlobalAction(GLOBAL_ACTION_BACK); }
  public static void pressHome() { if (instance != null) instance.performGlobalAction(GLOBAL_ACTION_HOME); }
}
