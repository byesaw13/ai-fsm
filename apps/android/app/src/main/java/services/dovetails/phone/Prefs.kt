package services.dovetails.phone

import android.content.Context
import android.content.SharedPreferences
import java.util.UUID

/** Settings and scan checkpoints. Plain prefs: the key is only as safe as the phone's lock. */
class Prefs(context: Context) {
    private val p: SharedPreferences =
        context.applicationContext.getSharedPreferences("dovetails_phone", Context.MODE_PRIVATE)

    var serverUrl: String
        get() = p.getString("server_url", "") ?: ""
        set(v) = p.edit().putString("server_url", v).apply()

    var apiKey: String
        get() = p.getString("api_key", "") ?: ""
        set(v) = p.edit().putString("api_key", v).apply()

    /** SubscriptionManager id of the business SIM; -1 = the phone's default SMS SIM. */
    var subscriptionId: Int
        get() = p.getInt("subscription_id", -1)
        set(v) = p.edit().putInt("subscription_id", v).apply()

    val deviceId: String
        get() = p.getString("device_id", null) ?: UUID.randomUUID().toString().also {
            p.edit().putString("device_id", it).apply()
        }

    /** Highest SMS provider _id handled. -1 = never scanned. */
    var smsCheckpoint: Long
        get() = p.getLong("sms_checkpoint", -1)
        set(v) = p.edit().putLong("sms_checkpoint", v).apply()

    /** Highest call log _id handled. -1 = never scanned. */
    var callCheckpoint: Long
        get() = p.getLong("call_checkpoint", -1)
        set(v) = p.edit().putLong("call_checkpoint", v).apply()

    var lastCheckInAt: Long
        get() = p.getLong("last_check_in_at", 0)
        set(v) = p.edit().putLong("last_check_in_at", v).apply()

    var lastError: String
        get() = p.getString("last_error", "") ?: ""
        set(v) = p.edit().putString("last_error", v).apply()

    val configured: Boolean get() = serverUrl.isNotBlank() && apiKey.isNotBlank()

    companion object {
        /** How far back the first scan reaches. */
        const val BACKFILL_DAYS = 7
    }
}
