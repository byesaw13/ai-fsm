package services.dovetails.phone

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper

/**
 * Durable local queue. A call or text is written here before the checkpoint
 * moves, and leaves only when the server has answered, so nothing is lost when
 * the phone has no signal or the app is stopped.
 */
class Store(context: Context) : SQLiteOpenHelper(context.applicationContext, "dovetails_phone.db", null, 1) {

    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL(
            """CREATE TABLE events (
                 id TEXT PRIMARY KEY,
                 kind TEXT NOT NULL,          -- sms_in | sms_out | call
                 payload TEXT NOT NULL,       -- JSON for the server
                 attempts INTEGER NOT NULL DEFAULT 0,
                 next_at INTEGER NOT NULL DEFAULT 0,
                 created_at INTEGER NOT NULL)""",
        )
        db.execSQL(
            """CREATE TABLE sends (
                 outbox_id TEXT PRIMARY KEY,  -- server phone_outbox id
                 phone TEXT NOT NULL,
                 parts_total INTEGER NOT NULL,
                 parts_ok INTEGER NOT NULL DEFAULT 0,
                 parts_failed INTEGER NOT NULL DEFAULT 0,
                 report TEXT,                 -- sent | delivered | failed, waiting to go up
                 error TEXT,
                 created_at INTEGER NOT NULL)""",
        )
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) = Unit

    data class Event(val id: String, val kind: String, val payload: String, val attempts: Int)

    fun addEvent(id: String, kind: String, payload: String) {
        val v = ContentValues().apply {
            put("id", id); put("kind", kind); put("payload", payload)
            put("created_at", System.currentTimeMillis())
        }
        writableDatabase.insertWithOnConflict("events", null, v, SQLiteDatabase.CONFLICT_IGNORE)
    }

    fun dueEvents(kind: String, limit: Int): List<Event> {
        val out = mutableListOf<Event>()
        readableDatabase.rawQuery(
            "SELECT id, kind, payload, attempts FROM events WHERE kind = ? AND next_at <= ? ORDER BY created_at LIMIT ?",
            arrayOf(kind, System.currentTimeMillis().toString(), limit.toString()),
        ).use { c ->
            while (c.moveToNext()) out += Event(c.getString(0), c.getString(1), c.getString(2), c.getInt(3))
        }
        return out
    }

    fun deleteEvent(id: String) {
        writableDatabase.delete("events", "id = ?", arrayOf(id))
    }

    fun retryLater(id: String, attempts: Int) {
        val v = ContentValues().apply {
            put("attempts", attempts + 1)
            put("next_at", System.currentTimeMillis() + Logic.backoffMs(attempts))
        }
        writableDatabase.update("events", v, "id = ?", arrayOf(id))
    }

    fun pendingEventCount(): Int =
        readableDatabase.rawQuery("SELECT COUNT(*) FROM events", null).use { c -> if (c.moveToFirst()) c.getInt(0) else 0 }

    /** True when this outbox text was already handed to the radio; never send it twice. */
    fun knownSend(outboxId: String): Boolean =
        readableDatabase.rawQuery("SELECT 1 FROM sends WHERE outbox_id = ?", arrayOf(outboxId)).use { it.moveToFirst() }

    fun startSend(outboxId: String, phone: String, parts: Int) {
        val v = ContentValues().apply {
            put("outbox_id", outboxId); put("phone", phone); put("parts_total", parts)
            put("created_at", System.currentTimeMillis())
        }
        writableDatabase.insertWithOnConflict("sends", null, v, SQLiteDatabase.CONFLICT_IGNORE)
    }

    /** Records one part's radio result. Returns "sent" or "failed" once every part is in. */
    @Synchronized
    fun partResult(outboxId: String, ok: Boolean, error: String?): String? {
        val db = writableDatabase
        val state = db.rawQuery(
            "SELECT parts_total, parts_ok, parts_failed, report FROM sends WHERE outbox_id = ?",
            arrayOf(outboxId),
        ).use { c ->
            if (!c.moveToFirst()) return null
            if (!c.isNull(3)) return null // already finished
            Logic.SendState(c.getInt(0), c.getInt(1), c.getInt(2))
        }.withPart(ok)
        val v = ContentValues().apply {
            put("parts_ok", state.partsOk); put("parts_failed", state.partsFailed)
            state.outcome?.let { put("report", it) }
            if (!ok && error != null) put("error", error)
        }
        db.update("sends", v, "outbox_id = ?", arrayOf(outboxId))
        return state.outcome
    }

    fun markReport(outboxId: String, report: String, error: String? = null) {
        val v = ContentValues().apply { put("report", report); if (error != null) put("error", error) }
        writableDatabase.update("sends", v, "outbox_id = ?", arrayOf(outboxId))
    }

    data class Report(val outboxId: String, val status: String, val error: String?)

    fun pendingReports(): List<Report> {
        val out = mutableListOf<Report>()
        readableDatabase.rawQuery(
            "SELECT outbox_id, report, error FROM sends WHERE report IN ('sent','delivered','failed') LIMIT 50",
            null,
        ).use { c -> while (c.moveToNext()) out += Report(c.getString(0), c.getString(1), c.getString(2)) }
        return out
    }

    /** The server has the report. 'reported' rows stay a week so a re-offered id is still known. */
    fun reportAccepted(outboxId: String, status: String) {
        writableDatabase.execSQL(
            "UPDATE sends SET report = 'reported:' || ? WHERE outbox_id = ? AND report = ?",
            arrayOf(status, outboxId, status),
        )
    }

    /** The server offered a text we already reported: send the report again, not the text. */
    fun requeueReport(outboxId: String) {
        writableDatabase.execSQL(
            "UPDATE sends SET report = substr(report, 10) WHERE outbox_id = ? AND report LIKE 'reported:%'",
            arrayOf(outboxId),
        )
    }

    /** A send whose radio result never arrived (app killed) is reported failed, not re-sent. */
    fun failStaleSends(olderThanMs: Long) {
        writableDatabase.execSQL(
            "UPDATE sends SET report = 'failed', error = 'No result from the radio' WHERE report IS NULL AND created_at < ?",
            arrayOf(System.currentTimeMillis() - olderThanMs),
        )
        writableDatabase.execSQL(
            "DELETE FROM sends WHERE report LIKE 'reported:%' AND created_at < ?",
            arrayOf(System.currentTimeMillis() - 7L * 24 * 3600 * 1000),
        )
    }

    companion object {
        @Volatile private var instance: Store? = null
        fun get(context: Context): Store =
            instance ?: synchronized(this) { instance ?: Store(context).also { instance = it } }
    }
}
