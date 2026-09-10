package com.ohesoft.fast

import android.content.Context
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.module.annotations.ReactModule

@ReactModule(name = WidgetDataModule.NAME)
class WidgetDataModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = NAME

    @ReactMethod
    fun update(lastMeal: Double, goalHours: Double) {
        val prefs = reactApplicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        prefs.edit()
            .putLong("last_meal_timestamp", lastMeal.toLong())
            .putFloat("goal_hours", goalHours.toFloat())
            .apply()
        FastWidgetProvider.updateAllWidgets(reactApplicationContext)
    }

    @ReactMethod
    fun updateNotifConfig(
        goalAlertEnabled: Boolean,
        goalStrong: Boolean,
        rem1Enabled: Boolean,
        rem1Offset: Double,
        rem1Strong: Boolean,
        rem2Enabled: Boolean,
        rem2Offset: Double,
        rem2Strong: Boolean,
        rem3Enabled: Boolean,
        rem3Offset: Double,
        rem3Strong: Boolean,
        strongSoundUri: String?
    ) {
        val prefs = reactApplicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        prefs.edit()
            .putBoolean("goal_alert_enabled", goalAlertEnabled)
            .putBoolean("goal_strong", goalStrong)
            .putBoolean("rem1_enabled", rem1Enabled)
            .putInt("rem1_offset", rem1Offset.toInt())
            .putBoolean("rem1_strong", rem1Strong)
            .putBoolean("rem2_enabled", rem2Enabled)
            .putInt("rem2_offset", rem2Offset.toInt())
            .putBoolean("rem2_strong", rem2Strong)
            .putBoolean("rem3_enabled", rem3Enabled)
            .putInt("rem3_offset", rem3Offset.toInt())
            .putBoolean("rem3_strong", rem3Strong)
            .putString("strong_sound_uri", strongSoundUri)
            .apply()
    }

    companion object {
        const val NAME = "WidgetDataModule"
        const val PREFS = "fast_widget_data"
    }
}
