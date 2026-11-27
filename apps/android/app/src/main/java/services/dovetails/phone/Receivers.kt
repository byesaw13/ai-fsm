package services.dovetails.phone

import android.app.Activity
import android.app.NotificationManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.telephony.SmsManager

/** Radio results for texts the app sent from the outbox. */
class SmsResultReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val id = intent.getStringExtra(EXTRA_OUTBOX_ID) ?: return
        val store = Store.get(context)
        when (intent.action) {
            ACTION_SENT -> {
                val ok = resultCode == Activity.RESULT_OK
                val error = if (ok) null else describe(resultCode)
                if (store.partResult(id, ok, error) != null) PhoneService.kick(context)
            }
            ACTION_DELIVERED -> {
                // Delivery status lives in the PDU; a delivered report with RESULT_OK is enough here.
                if (resultCode == Activity.RESULT_OK) {
                    store.markReport(id, "delivered")
                    PhoneService.kick(context)
                }
            }
        }
    }

    private fun describe(code: Int): String = when (code) {
        SmsManager.RESULT_ERROR_GENERIC_FAILURE -> "Carrier refused the text"
        SmsManager.RESULT_ERROR_NO_SERVICE -> "No service"
        SmsManager.RESULT_ERROR_RADIO_OFF -> "Radio off (airplane mode?)"
        SmsManager.RESULT_ERROR_NULL_PDU -> "Bad message"
        else -> "Send failed (code $code)"
    }

    companion object {
        const val ACTION_SENT = "services.dovetails.phone.SMS_SENT"
        const val ACTION_DELIVERED = "services.dovetails.phone.SMS_DELIVERED"
        const val EXTRA_OUTBOX_ID = "outbox_id"
    }
}

/** "Send suggested reply" on a customer-text notification. */
class ReplyReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val phone = intent.getStringExtra(EXTRA_PHONE) ?: return
        val text = intent.getStringExtra(EXTRA_TEXT) ?: return
        SmsSender.sendReply(context, phone, text)
        context.getSystemService(NotificationManager::class.java)
            .cancel(intent.getIntExtra(EXTRA_NOTIFICATION, 0))
        PhoneService.kick(context)
    }

    companion object {
        const val EXTRA_PHONE = "phone"
        const val EXTRA_TEXT = "text"
        const val EXTRA_NOTIFICATION = "notification_id"
    }
}

/**
 * Wake-ups: phone started, app updated, a text arrived, or the alarm fired.
 * A text arriving wakes the app even when Android stopped it.
 */
open class WakeReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action !in WAKE_ACTIONS || !Prefs(context).configured) return
        PhoneService.start(context)
        SyncWorker.runSoon(context)
    }

    companion object {
        val WAKE_ACTIONS = setOf(
            "android.provider.Telephony.SMS_RECEIVED",
            Intent.ACTION_BOOT_COMPLETED,
            Intent.ACTION_MY_PACKAGE_REPLACED,
            PhoneService.ACTION_ALARM,
        )
    }
}

/** Phone started or app updated. */
class BootReceiver : WakeReceiver()

/** PhoneService's idle-allowed alarm. */
class AlarmReceiver : WakeReceiver()
