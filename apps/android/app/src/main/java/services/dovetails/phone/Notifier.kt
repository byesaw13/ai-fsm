package services.dovetails.phone

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri

object Notifier {
    const val CHANNEL_SERVICE = "service"
    const val CHANNEL_CUSTOMER = "customer_texts"
    const val SERVICE_ID = 1

    fun createChannels(context: Context) {
        val nm = context.getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(
            NotificationChannel(CHANNEL_SERVICE, "Connection", NotificationManager.IMPORTANCE_MIN).apply {
                description = "Shows while Dovetails Phone is connected to the FSM."
            },
        )
        nm.createNotificationChannel(
            NotificationChannel(CHANNEL_CUSTOMER, "Customer texts", NotificationManager.IMPORTANCE_HIGH).apply {
                description = "A customer texted the business line."
            },
        )
    }

    fun serviceNotification(context: Context, text: String): Notification {
        val open = PendingIntent.getActivity(
            context, 0, Intent(context, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE,
        )
        return Notification.Builder(context, CHANNEL_SERVICE)
            .setSmallIcon(R.drawable.ic_stat_phone)
            .setContentTitle("Dovetails Phone")
            .setContentText(text)
            .setContentIntent(open)
            .setOngoing(true)
            .build()
    }

    /** The FSM's summary of a customer text, with its suggested reply one tap away. */
    fun customerText(
        context: Context,
        key: String,
        title: String,
        body: String,
        phone: String,
        reply: String?,
        clientId: String?,
    ) {
        val prefs = Prefs(context)
        val notifId = key.hashCode()
        val target = if (clientId != null) "${prefs.serverUrl}/app/clients/$clientId" else "${prefs.serverUrl}/app"
        val open = PendingIntent.getActivity(
            context, notifId, Intent(Intent.ACTION_VIEW, Uri.parse(target)), PendingIntent.FLAG_IMMUTABLE,
        )
        val b = Notification.Builder(context, CHANNEL_CUSTOMER)
            .setSmallIcon(R.drawable.ic_stat_phone)
            .setContentTitle(title)
            .setContentText(body.lineSequence().firstOrNull() ?: body)
            .setStyle(Notification.BigTextStyle().bigText(body))
            .setContentIntent(open)
            .setAutoCancel(true)
        if (!reply.isNullOrBlank()) {
            val send = Intent(context, ReplyReceiver::class.java)
                .putExtra(ReplyReceiver.EXTRA_PHONE, phone)
                .putExtra(ReplyReceiver.EXTRA_TEXT, reply)
                .putExtra(ReplyReceiver.EXTRA_NOTIFICATION, notifId)
            val pi = PendingIntent.getBroadcast(context, notifId, send, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
            b.addAction(Notification.Action.Builder(null, "Send suggested reply", pi).build())
        }
        context.getSystemService(NotificationManager::class.java).notify(notifId, b.build())
    }
}
