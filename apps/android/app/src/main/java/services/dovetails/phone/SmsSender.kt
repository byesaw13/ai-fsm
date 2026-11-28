package services.dovetails.phone

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import android.telephony.SmsManager

/** Sends on the business SIM. Radio results come back to [SmsResultReceiver]. */
object SmsSender {
    fun manager(context: Context, subscriptionId: Int): SmsManager {
        val base = context.getSystemService(SmsManager::class.java)
        if (subscriptionId < 0) return base
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            base.createForSubscriptionId(subscriptionId)
        } else {
            @Suppress("DEPRECATION")
            SmsManager.getSmsManagerForSubscriptionId(subscriptionId)
        }
    }

    /** Sends one outbox text. Returns the number of parts handed to the radio. */
    fun sendOutbox(context: Context, outboxId: String, phone: String, body: String): Int {
        val prefs = Prefs(context)
        val sms = manager(context, prefs.subscriptionId)
        val parts = sms.divideMessage(body)
        val flags = PendingIntent.FLAG_UPDATE_CURRENT or
            (if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) PendingIntent.FLAG_MUTABLE else 0)
        fun intent(action: String, index: Int) = PendingIntent.getBroadcast(
            context,
            (outboxId + action + index).hashCode(),
            Intent(context, SmsResultReceiver::class.java)
                .setAction(action)
                .putExtra(SmsResultReceiver.EXTRA_OUTBOX_ID, outboxId),
            flags,
        )
        val sent = ArrayList(parts.indices.map { intent(SmsResultReceiver.ACTION_SENT, it) })
        // One delivery report per text, on the last part.
        val delivered = ArrayList(parts.indices.map { i ->
            if (i == parts.lastIndex) intent(SmsResultReceiver.ACTION_DELIVERED, i) else null
        })
        Store.get(context).startSend(outboxId, phone, parts.size)
        if (parts.size == 1) {
            sms.sendTextMessage(phone, null, body, sent[0], delivered[0])
        } else {
            sms.sendMultipartTextMessage(phone, null, parts, sent, delivered)
        }
        return parts.size
    }

    /** The owner tapped "Send suggested reply". It lands in the Sent folder and is logged from there. */
    fun sendReply(context: Context, phone: String, body: String) {
        val sms = manager(context, Prefs(context).subscriptionId)
        val parts = sms.divideMessage(body)
        if (parts.size == 1) sms.sendTextMessage(phone, null, body, null, null)
        else sms.sendMultipartTextMessage(phone, null, parts, null, null)
    }
}
