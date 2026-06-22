package com.porokka.jarvismobile

import android.app.ActivityManager
import android.app.AppOpsManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.os.Build
import android.os.Process
import android.provider.Settings
import androidx.core.app.NotificationCompat
import com.facebook.react.bridge.*

class MemoryManagerModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName() = "MemoryManager"

    @ReactMethod
    fun getSystemMemory(promise: Promise) {
        try {
            val am = reactApplicationContext.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
            val info = ActivityManager.MemoryInfo()
            am.getMemoryInfo(info)
            val map = Arguments.createMap()
            map.putDouble("totalMb", info.totalMem / 1048576.0)
            map.putDouble("availMb", info.availMem / 1048576.0)
            map.putDouble("usedMb", (info.totalMem - info.availMem) / 1048576.0)
            map.putBoolean("lowMemory", info.lowMemory)
            promise.resolve(map)
        } catch (e: Exception) {
            promise.reject("ERR_MEMORY", e.message)
        }
    }

    @ReactMethod
    fun hasUsagePermission(promise: Promise) {
        try {
            val appOps = reactApplicationContext.getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
            val mode = appOps.checkOpNoThrow(
                AppOpsManager.OPSTR_GET_USAGE_STATS,
                Process.myUid(),
                reactApplicationContext.packageName
            )
            promise.resolve(mode == AppOpsManager.MODE_ALLOWED)
        } catch (e: Exception) {
            promise.resolve(false)
        }
    }

    @ReactMethod
    fun openUsageSettings(promise: Promise) {
        try {
            val intent = Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS)
            intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK
            reactApplicationContext.startActivity(intent)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("ERR_SETTINGS", e.message)
        }
    }

    @ReactMethod
    fun getTopProcesses(limit: Int, promise: Promise) {
        try {
            val pm = reactApplicationContext.packageManager
            val usm = reactApplicationContext.getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
            val am = reactApplicationContext.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager

            val end = System.currentTimeMillis()
            val start = end - 24 * 60 * 60 * 1000L  // last 24h

            val usageStats = usm.queryUsageStats(UsageStatsManager.INTERVAL_DAILY, start, end)

            if (usageStats == null || usageStats.isEmpty()) {
                // No usage stats permission — list all non-system installed apps
                val flags = if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.N) {
                    PackageManager.MATCH_UNINSTALLED_PACKAGES
                } else {
                    PackageManager.GET_META_DATA
                }
                val apps = pm.getInstalledApplications(0)
                    .filter { (it.flags and ApplicationInfo.FLAG_SYSTEM) == 0 }
                    .sortedBy { pm.getApplicationLabel(it).toString() }
                    .take(limit)

                val array = Arguments.createArray()
                apps.forEach { ai ->
                    val map = Arguments.createMap()
                    map.putString("packageName", ai.packageName)
                    map.putString("appName", pm.getApplicationLabel(ai).toString())
                    map.putInt("memKb", 0)
                    map.putDouble("lastUsed", 0.0)
                    map.putBoolean("needsPermission", true)
                    array.pushMap(map)
                }
                promise.resolve(array)
                return
            }

            // Get system memory for estimating app RAM (PSS not available without root)
            val memInfo = ActivityManager.MemoryInfo()
            am.getMemoryInfo(memInfo)

            val results = usageStats
                .filter { it.totalTimeInForeground > 0 && it.packageName != reactApplicationContext.packageName }
                .sortedByDescending { it.lastTimeUsed }
                .take(limit)

            val array = Arguments.createArray()
            results.forEach { stat ->
                val appName = try {
                    val ai = pm.getApplicationInfo(stat.packageName, 0)
                    pm.getApplicationLabel(ai).toString()
                } catch (_: PackageManager.NameNotFoundException) {
                    stat.packageName
                }
                val map = Arguments.createMap()
                map.putString("packageName", stat.packageName)
                map.putString("appName", appName)
                map.putInt("memKb", 0)  // not available without root
                map.putDouble("lastUsed", stat.lastTimeUsed.toDouble())
                map.putBoolean("needsPermission", false)
                array.pushMap(map)
            }
            promise.resolve(array)
        } catch (e: Exception) {
            promise.reject("ERR_PROCS", e.message)
        }
    }

    @ReactMethod
    fun killApp(packageName: String, promise: Promise) {
        try {
            val am = reactApplicationContext.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
            am.killBackgroundProcesses(packageName)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("ERR_KILL", e.message)
        }
    }

    // ── Foreground download service ───────────────────────────────────────────

    @ReactMethod
    fun startDownloadService(text: String, promise: Promise) {
        try {
            val intent = Intent(reactApplicationContext, ForegroundDownloadService::class.java)
            intent.putExtra(ForegroundDownloadService.EXTRA_TEXT, text)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                reactApplicationContext.startForegroundService(intent)
            } else {
                reactApplicationContext.startService(intent)
            }
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("ERR_SERVICE", e.message)
        }
    }

    @ReactMethod
    fun stopDownloadService(promise: Promise) {
        try {
            val intent = Intent(reactApplicationContext, ForegroundDownloadService::class.java)
            reactApplicationContext.stopService(intent)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("ERR_SERVICE", e.message)
        }
    }

    @ReactMethod
    fun notifyModelReady(promise: Promise) {
        try {
            val nm = reactApplicationContext.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            val channelId = "jarvis_ready"
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                val ch = NotificationChannel(channelId, "JARVIS", NotificationManager.IMPORTANCE_HIGH)
                nm.createNotificationChannel(ch)
            }
            val notif = NotificationCompat.Builder(reactApplicationContext, channelId)
                .setContentTitle("JARVIS ONLINE")
                .setContentText("Model loaded. AI is ready.")
                .setSmallIcon(android.R.drawable.ic_dialog_info)
                .setAutoCancel(true)
                .build()
            nm.notify(43, notif)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("ERR_NOTIF", e.message)
        }
    }
}
