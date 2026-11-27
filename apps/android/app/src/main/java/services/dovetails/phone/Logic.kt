package services.dovetails.phone

import java.time.Instant

/**
 * Pure rules, kept apart from Android so they run in plain JVM tests.
 */
object Logic {
    /** Android Telephony.Sms.MESSAGE_TYPE_* values. */
    const val SMS_INBOX = 1
    const val SMS_SENT = 2
    const val SMS_OUTBOX = 4
    const val SMS_QUEUED = 6

    /** A text still sending this long is given up on, so the scan moves past it. */
    const val IN_FLIGHT_GRACE_MS = 10 * 60 * 1000L

    data class SmsRow(val id: Long, val type: Int, val dateMs: Long)

    /** What a call log row (CallLog.Calls.TYPE) means for the server. */
    data class CallKind(val direction: String, val result: String)

    fun callKind(type: Int): CallKind? = when (type) {
        1 -> CallKind("inbound", "answered") // INCOMING
        2 -> CallKind("outbound", "answered") // OUTGOING; the server reads duration 0 as no answer
        3 -> CallKind("inbound", "missed") // MISSED
        4 -> CallKind("inbound", "voicemail") // VOICEMAIL
        5 -> CallKind("inbound", "rejected") // REJECTED
        6 -> CallKind("inbound", "blocked") // BLOCKED
        7 -> CallKind("inbound", "answered") // ANSWERED_EXTERNALLY
        else -> null
    }

    /** "in" for a received text, "out" for a sent one, null for drafts, failures, in-flight. */
    fun smsDirection(type: Int): String? = when (type) {
        SMS_INBOX -> "in"
        SMS_SENT -> "out"
        else -> null
    }

    /**
     * How far the SMS scan may move its checkpoint. Rows come oldest id first.
     * A text still in the outbox keeps its id even after it becomes "sent", so
     * the checkpoint stops in front of it, unless it has been stuck so long it
     * will never send.
     */
    fun nextSmsCheckpoint(rows: List<SmsRow>, current: Long, nowMs: Long): Long {
        var checkpoint = current
        for (row in rows.sortedBy { it.id }) {
            val inFlight = row.type == SMS_OUTBOX || row.type == SMS_QUEUED
            if (inFlight && nowMs - row.dateMs < IN_FLIGHT_GRACE_MS) break
            checkpoint = maxOf(checkpoint, row.id)
        }
        return checkpoint
    }

    /** Stable across rescans and app reinstalls on the same phone. */
    fun eventId(deviceId: String, kind: String, rowId: Long, dateMs: Long): String =
        "$deviceId:$kind:$rowId:$dateMs"

    /** Short codes, emails and "Unknown" never match a customer. */
    fun isPhoneNumber(address: String?): Boolean =
        address != null && address.count { it.isDigit() } >= 7 && address.none { it == '@' }

    /** 30 s, 1 min, 2 min ... capped at 30 min. */
    fun backoffMs(attempts: Int): Long {
        val step = 30_000L shl minOf(maxOf(attempts, 0), 6)
        return minOf(step, 30 * 60 * 1000L)
    }

    /**
     * The server address the owner typed. HTTPS anywhere; plain HTTP only on
     * the home network, never over the internet. Null when unusable.
     */
    fun normalizeServerUrl(raw: String): String? {
        val trimmed = raw.trim().trimEnd('/')
        if (trimmed.isEmpty()) return null
        val withScheme = if (trimmed.contains("://")) trimmed else "https://$trimmed"
        val scheme = withScheme.substringBefore("://").lowercase()
        val host = withScheme.substringAfter("://").substringBefore('/').substringBefore(':').lowercase()
        if (host.isEmpty() || host.contains(' ')) return null
        return when (scheme) {
            "https" -> withScheme
            "http" -> if (isLocalHost(host)) withScheme else null
            else -> null
        }
    }

    private fun isLocalHost(host: String): Boolean =
        host.endsWith(".local") || host == "localhost" ||
            host.startsWith("192.168.") || host.startsWith("10.") ||
            Regex("^172\\.(1[6-9]|2[0-9]|3[01])\\.").containsMatchIn(host)

    fun iso(ms: Long): String = Instant.ofEpochMilli(ms).toString()

    /** Result of sending one outbox text in one or more parts. */
    data class SendState(val partsTotal: Int, val partsOk: Int = 0, val partsFailed: Int = 0) {
        val done: Boolean get() = partsOk + partsFailed >= partsTotal
        /** "sent" when every part went, "failed" when any part failed, null while waiting. */
        val outcome: String? get() = when {
            !done -> null
            partsFailed > 0 -> "failed"
            else -> "sent"
        }

        fun withPart(ok: Boolean): SendState =
            if (ok) copy(partsOk = partsOk + 1) else copy(partsFailed = partsFailed + 1)
    }
}
