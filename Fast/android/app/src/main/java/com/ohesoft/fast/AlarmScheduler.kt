package com.ohesoft.fast

import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build

object AlarmScheduler {

    private const val CHANNEL_NORMAL = "fasting"
    private const val CHANNEL_STRONG = "fasting-strong-alert-v2"
    private const val REQ_GOAL = 1001
    private const val REQ_CUSTOM1 = 1002
    private const val REQ_CUSTOM2 = 1003
    private const val REQ_CUSTOM3 = 1004

    fun rescheduleAll(context: Context) {
        val prefs = context.getSharedPreferences(WidgetDataModule.PREFS, Context.MODE_PRIVATE)
        val lastMeal = prefs.getLong("last_meal_timestamp", 0L)
        if (lastMeal == 0L) return

        val goalHours = prefs.getFloat("goal_hours", 16f)
        val goalAlertEnabled = prefs.getBoolean("goal_alert_enabled", true)
        val goalStrong = prefs.getBoolean("goal_strong", false)
        val strongSoundUri = prefs.getString("strong_sound_uri", null)

        ensureChannels(context, strongSoundUri)

        val am = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        val now = System.currentTimeMillis()
        val goalTime = lastMeal + (goalHours * 3600000).toLong()

        cancelAlarm(context, am, REQ_GOAL)
        cancelAlarm(context, am, REQ_CUSTOM1)
        cancelAlarm(context, am, REQ_CUSTOM2)
        cancelAlarm(context, am, REQ_CUSTOM3)

        if (goalAlertEnabled && goalTime > now) {
            val goalH = if (goalHours % 1 == 0f) "${goalHours.toInt()}h" else "${goalHours.toInt()}h${Math.round((goalHours % 1) * 60)}m"
            val ch = if (goalStrong) CHANNEL_STRONG else CHANNEL_NORMAL
            val snd = if (goalStrong) strongSoundUri else null
            scheduleAlarm(context, am, REQ_GOAL, goalTime,
                "Goal reached!", "$goalH fasting goal reached.", ch, snd)
        }

        data class RemConf(val enabled: Boolean, val offset: Int, val strong: Boolean)
        val reminders = listOf(
            RemConf(prefs.getBoolean("rem1_enabled", false), prefs.getInt("rem1_offset", 0), prefs.getBoolean("rem1_strong", false)),
            RemConf(prefs.getBoolean("rem2_enabled", false), prefs.getInt("rem2_offset", 0), prefs.getBoolean("rem2_strong", false)),
            RemConf(prefs.getBoolean("rem3_enabled", false), prefs.getInt("rem3_offset", 0), prefs.getBoolean("rem3_strong", false)),
        )
        val reqCodes = listOf(REQ_CUSTOM1, REQ_CUSTOM2, REQ_CUSTOM3)

        for (i in 0..2) {
            val r = reminders[i]
            if (!r.enabled || r.offset <= 0) continue
            val fireTime = goalTime - r.offset.toLong() * 60000
            if (fireTime <= now) continue
            val oh = r.offset / 60
            val om = r.offset % 60
            val offsetStr = if (oh > 0) { if (om > 0) "${oh}h ${om}m" else "${oh}h" } else "${om}m"
            val ch = if (r.strong) CHANNEL_STRONG else CHANNEL_NORMAL
            val snd = if (r.strong) strongSoundUri else null
            scheduleAlarm(context, am, reqCodes[i], fireTime,
                "Fasting reminder", "$offsetStr until fasting goal.", ch, snd)
        }
    }

    private fun scheduleAlarm(
        context: Context, am: AlarmManager, reqCode: Int, time: Long,
        title: String, body: String, channel: String, soundUri: String? = null
    ) {
        val intent = Intent(context, AlarmReceiver::class.java).apply {
            putExtra("title", title)
            putExtra("body", body)
            putExtra("channel", channel)
            putExtra("sound_uri", soundUri)
            putExtra("req_code", reqCode)
        }
        val pi = PendingIntent.getBroadcast(
            context, reqCode, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && !am.canScheduleExactAlarms()) {
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, time, pi)
        } else {
            am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, time, pi)
        }
    }

    private fun cancelAlarm(context: Context, am: AlarmManager, reqCode: Int) {
        val intent = Intent(context, AlarmReceiver::class.java)
        val pi = PendingIntent.getBroadcast(
            context, reqCode, intent,
            PendingIntent.FLAG_NO_CREATE or PendingIntent.FLAG_IMMUTABLE
        )
        if (pi != null) {
            am.cancel(pi)
            pi.cancel()
        }
    }

    private fun ensureChannels(context: Context, soundUri: String? = null) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

        val normal = NotificationChannel(CHANNEL_NORMAL, "Fast Notifications",
            NotificationManager.IMPORTANCE_HIGH)
        nm.createNotificationChannel(normal)

        val strong = NotificationChannel(CHANNEL_STRONG, "Fast Strong Alerts",
            NotificationManager.IMPORTANCE_HIGH).apply {
            enableVibration(true)
            vibrationPattern = longArrayOf(0, 500, 200, 500, 200, 500)
            if (soundUri != null) {
                setSound(android.net.Uri.parse(soundUri),
                    android.media.AudioAttributes.Builder()
                        .setUsage(android.media.AudioAttributes.USAGE_ALARM)
                        .setContentType(android.media.AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .build())
            }
        }
        nm.createNotificationChannel(strong)
    }
}
