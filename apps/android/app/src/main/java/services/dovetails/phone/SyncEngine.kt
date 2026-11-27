package services.dovetails.phone

import android.content.Context
import android.os.BatteryManager
import android.os.PowerManager
import android.util.Log
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import org.json.JSONArray
import org.json.JSONObject

/**
 * One pass of everything: read the logs, upload what is queued, report sends,
 * pull new texts to send, check in. Safe to call from the service, workers and
 * receivers at once; passes run one at a time.
 */
object SyncEngine {
    private const val TAG = "DovetailsPhone"
    private val mutex = Mutex()

    data class Status(val pendingUploads: Int, val lastError: String)

    suspend fun run(context: Context, checkIn: Boolean = true): Status = mutex.withLock {
        val prefs = Prefs(context)
        val store = Store.get(context)
        if (!prefs.configured) return Status(store.pendingEventCount(), "Not set up")
        val api = Api(prefs)
        var error = ""
        fun step(name: String, block: () -> Unit) {
            try {
                block()
            } catch (e: Exception) {
                Log.w(TAG, "$name failed", e)
                if (error.isEmpty()) error = "$name: ${e.message ?: e.javaClass.simpleName}"
            }
        }
        step("Scan") { Scanner(context, prefs, store).scanAll() }
        step("Texts in") { uploadInbound(context, api, store) }
        step("Calls") { uploadBatch(api, store, "call", "/api/internal/phone/calls", "calls") }
        step("Texts out") { uploadBatch(api, store, "sms_out", "/api/internal/phone/texts", "texts") }
        step("Reports") { flushReports(context, api, store) }
        step("Outbox") { pullOutbox(context, api, prefs) }
        step("Reports") { flushReports(context, api, store) }
        if (checkIn) step("Check-in") { checkIn(context, api, prefs, store) }
        prefs.lastError = error
        Status(store.pendingEventCount(), error)
    }

    /** Customer texts go one at a time through the FSM's sorting; its summary becomes a notification. */
    private fun uploadInbound(context: Context, api: Api, store: Store) {
        for (event in store.dueEvents("sms_in", 20)) {
            val payload = JSONObject(event.payload)
            val res = try {
                api.post("/api/internal/sms", payload)
            } catch (e: Exception) {
                store.retryLater(event.id, event.attempts); throw e
            }
            when {
                res.ok -> {
                    store.deleteEvent(event.id)
                    notifyIfBusiness(context, event.id, payload.getString("phone"), res.json)
                }
                res.code == 401 -> throw IllegalStateException("Server refused the key")
                res.code in 400..499 && event.attempts >= 5 -> store.deleteEvent(event.id)
                else -> store.retryLater(event.id, event.attempts)
            }
        }
    }

    private fun notifyIfBusiness(context: Context, key: String, phone: String, json: JSONObject?) {
        if (json == null || json.optBoolean("duplicate") || json.optBoolean("skipped")) return
        val n = json.optJSONObject("notification") ?: return
        val reply = if (json.optBoolean("auto_replied")) null else json.optString("reply").takeIf { it.isNotBlank() }
        Notifier.customerText(
            context, key,
            n.optString("title", "Customer text"), n.optString("body", ""),
            phone, reply, json.optString("client_id").takeIf { it.isNotBlank() && it != "null" },
        )
    }

    private fun uploadBatch(api: Api, store: Store, kind: String, path: String, field: String) {
        while (true) {
            val events = store.dueEvents(kind, 50)
            if (events.isEmpty()) return
            val arr = JSONArray()
            events.forEach { arr.put(JSONObject(it.payload)) }
            val res = try {
                api.post(path, JSONObject().put(field, arr))
            } catch (e: Exception) {
                events.forEach { store.retryLater(it.id, it.attempts) }; throw e
            }
            when {
                res.ok -> events.forEach { store.deleteEvent(it.id) }
                res.code == 401 -> throw IllegalStateException("Server refused the key")
                else -> {
                    events.forEach {
                        if (res.code in 400..499 && it.attempts >= 5) store.deleteEvent(it.id) else store.retryLater(it.id, it.attempts)
                    }
                    throw IllegalStateException("$path answered ${res.code}")
                }
            }
        }
    }

    private fun flushReports(context: Context, api: Api, store: Store) {
        store.failStaleSends(olderThanMs = 10 * 60 * 1000L)
        val reports = store.pendingReports()
        if (reports.isEmpty()) return
        val arr = JSONArray()
        reports.forEach { r ->
            arr.put(JSONObject().put("id", r.outboxId).put("status", r.status).apply { r.error?.let { put("error", it.take(500)) } })
        }
        val res = api.post("/api/internal/phone/outbox/report", JSONObject().put("reports", arr))
        if (!res.ok) throw IllegalStateException("report answered ${res.code}")
        reports.forEach { store.reportAccepted(it.outboxId, it.status) }
    }

    private fun pullOutbox(context: Context, api: Api, prefs: Prefs) {
        val store = Store.get(context)
        val res = api.post("/api/internal/phone/outbox", JSONObject().put("device_id", prefs.deviceId))
        if (!res.ok) throw IllegalStateException("outbox answered ${res.code}")
        val messages = res.json?.optJSONArray("messages") ?: return
        for (i in 0 until messages.length()) {
            val m = messages.getJSONObject(i)
            val id = m.getString("id")
            // Offered again (our report was lost): never send twice, the report goes up next pass.
            if (store.knownSend(id)) { store.requeueReport(id); continue }
            try {
                SmsSender.sendOutbox(context, id, m.getString("phone"), m.getString("body"))
            } catch (e: Exception) {
                store.startSend(id, m.getString("phone"), 1)
                store.markReport(id, "failed", e.message ?: "Send refused")
            }
        }
    }

    private fun checkIn(context: Context, api: Api, prefs: Prefs, store: Store) {
        val battery = context.getSystemService(BatteryManager::class.java)
            ?.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY)
        val power = context.getSystemService(PowerManager::class.java)
        val status = JSONObject()
            .put("battery", battery ?: -1)
            .put("battery_unrestricted", power?.isIgnoringBatteryOptimizations(context.packageName) == true)
            .put("pending_uploads", store.pendingEventCount())
            .put("permissions", Permissions.missing(context).joinToString(","))
        val res = api.post(
            "/api/internal/phone/check-in",
            JSONObject()
                .put("device_id", prefs.deviceId)
                .put("label", android.os.Build.MODEL)
                .put("app_version", BuildConfig.VERSION_NAME)
                .put("status", status),
        )
        if (res.code == 401) throw IllegalStateException("Server refused the key")
        if (!res.ok) throw IllegalStateException("check-in answered ${res.code}")
        prefs.lastCheckInAt = System.currentTimeMillis()
    }
}
