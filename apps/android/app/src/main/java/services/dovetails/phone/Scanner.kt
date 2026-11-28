package services.dovetails.phone

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.net.Uri
import android.provider.CallLog
import org.json.JSONObject

/**
 * Reads the phone's own SMS and call logs from the last checkpoint and queues
 * what it finds. The system logs are the source of truth, so a text or call
 * that arrived while this app was stopped is still picked up.
 */
class Scanner(private val context: Context, private val prefs: Prefs, private val store: Store) {

    private fun granted(permission: String) =
        context.checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED

    fun scanAll() {
        if (granted(Manifest.permission.READ_SMS)) scanSms()
        if (granted(Manifest.permission.READ_CALL_LOG)) scanCalls()
    }

    private fun backfillStartMs() = System.currentTimeMillis() - Prefs.BACKFILL_DAYS * 24L * 3600 * 1000

    /** First scan only: the newest row older than the backfill window, so history before it is skipped. */
    private fun baselineId(uri: Uri, idCol: String, dateCol: String): Long =
        context.contentResolver.query(
            uri, arrayOf(idCol), "$dateCol <= ?", arrayOf(backfillStartMs().toString()), "$idCol DESC",
        )?.use { c -> if (c.moveToFirst()) c.getLong(0) else 0L } ?: 0L

    private fun scanSms() {
        val uri = Uri.parse("content://sms")
        if (prefs.smsCheckpoint < 0) prefs.smsCheckpoint = baselineId(uri, "_id", "date")
        val start = prefs.smsCheckpoint
        val rows = mutableListOf<Logic.SmsRow>()
        context.contentResolver.query(
            uri,
            arrayOf("_id", "type", "address", "body", "date"),
            "_id > ?", arrayOf(start.toString()), "_id ASC",
        )?.use { c ->
            while (c.moveToNext()) {
                val id = c.getLong(0)
                val type = c.getInt(1)
                val address = c.getString(2)
                val body = c.getString(3) ?: ""
                val date = c.getLong(4)
                rows += Logic.SmsRow(id, type, date)
                val direction = Logic.smsDirection(type) ?: continue
                if (!Logic.isPhoneNumber(address) || body.isBlank()) continue
                val eventId = Logic.eventId(prefs.deviceId, "sms", id, date)
                if (direction == "in") {
                    store.addEvent(
                        eventId, "sms_in",
                        JSONObject()
                            .put("phone", address)
                            .put("message", body.take(2000))
                            .put("external_id", "phone-sms-in:$eventId")
                            .toString(),
                    )
                } else {
                    store.addEvent(
                        eventId, "sms_out",
                        JSONObject()
                            .put("id", eventId)
                            .put("phone", address)
                            .put("body", body.take(5000))
                            .put("sent_at", Logic.iso(date))
                            .toString(),
                    )
                }
            }
        }
        prefs.smsCheckpoint = Logic.nextSmsCheckpoint(rows, start, System.currentTimeMillis())
    }

    private fun scanCalls() {
        val uri = CallLog.Calls.CONTENT_URI
        if (prefs.callCheckpoint < 0) prefs.callCheckpoint = baselineId(uri, CallLog.Calls._ID, CallLog.Calls.DATE)
        var checkpoint = prefs.callCheckpoint
        context.contentResolver.query(
            uri,
            arrayOf(CallLog.Calls._ID, CallLog.Calls.NUMBER, CallLog.Calls.TYPE, CallLog.Calls.DATE, CallLog.Calls.DURATION),
            "${CallLog.Calls._ID} > ?", arrayOf(checkpoint.toString()), "${CallLog.Calls._ID} ASC",
        )?.use { c ->
            while (c.moveToNext()) {
                val id = c.getLong(0)
                checkpoint = maxOf(checkpoint, id)
                val number = c.getString(1)
                val kind = Logic.callKind(c.getInt(2)) ?: continue
                if (!Logic.isPhoneNumber(number)) continue
                val date = c.getLong(3)
                val eventId = Logic.eventId(prefs.deviceId, "call", id, date)
                store.addEvent(
                    eventId, "call",
                    JSONObject()
                        .put("id", eventId)
                        .put("phone", number)
                        .put("direction", kind.direction)
                        .put("result", kind.result)
                        .put("started_at", Logic.iso(date))
                        .put("duration_seconds", c.getLong(4).coerceIn(0, 86_400))
                        .toString(),
                )
            }
        }
        prefs.callCheckpoint = checkpoint
    }
}
