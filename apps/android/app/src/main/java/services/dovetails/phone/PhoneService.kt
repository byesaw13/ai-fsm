package services.dovetails.phone

import android.app.AlarmManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.database.ContentObserver
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.os.SystemClock
import android.provider.CallLog
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull
import java.text.DateFormat
import java.util.Date

/**
 * Keeps the bridge to the FSM open. Every [POLL_MS] it pulls texts to send;
 * every minute it checks in. A new text or call in the system logs, a radio
 * result, or an alarm runs a pass at once.
 */
class PhoneService : Service() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val wake = Channel<Unit>(Channel.CONFLATED)
    private var loop: Job? = null
    private val observers = mutableListOf<ContentObserver>()

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        Notifier.createChannels(this)
        goForeground("Connecting…")
        watch(Uri.parse("content://sms"))
        watch(CallLog.Calls.CONTENT_URI)
        SyncWorker.schedulePeriodic(this)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        goForeground(statusLine())
        if (loop == null) loop = scope.launch { runLoop() }
        wake.trySend(Unit)
        scheduleAlarm()
        return START_STICKY
    }

    override fun onDestroy() {
        observers.forEach { contentResolver.unregisterContentObserver(it) }
        scope.cancel()
        super.onDestroy()
    }

    private fun goForeground(text: String) {
        val n = Notifier.serviceNotification(this, text)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            startForeground(Notifier.SERVICE_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
        } else {
            startForeground(Notifier.SERVICE_ID, n)
        }
    }

    private fun watch(uri: Uri) {
        val o = object : ContentObserver(Handler(Looper.getMainLooper())) {
            override fun onChange(selfChange: Boolean) {
                wake.trySend(Unit)
            }
        }
        contentResolver.registerContentObserver(uri, true, o)
        observers += o
    }

    private suspend fun runLoop() {
        val power = getSystemService(PowerManager::class.java)
        var lastCheckIn = 0L
        while (true) {
            val lock = power.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "dovetails:sync").apply { acquire(60_000) }
            try {
                // A burst of log changes (a multipart text) becomes one pass.
                delay(1_500)
                val now = SystemClock.elapsedRealtime()
                val checkIn = now - lastCheckIn >= CHECK_IN_MS
                SyncEngine.run(this, checkIn)
                if (checkIn) lastCheckIn = now
                goForeground(statusLine())
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
            } finally {
                if (lock.isHeld) lock.release()
            }
            withTimeoutOrNull(POLL_MS) { wake.receive() }
        }
    }

    private fun statusLine(): String {
        val prefs = Prefs(this)
        if (!prefs.configured) return "Not set up — open the app"
        val error = prefs.lastError
        val seen = prefs.lastCheckInAt
        val time = if (seen > 0) DateFormat.getTimeInstance(DateFormat.SHORT).format(Date(seen)) else "never"
        return if (error.isNotEmpty()) "Problem: $error" else "Connected · checked in $time"
    }

    /** Doze stops the loop's timer; an idle-allowed alarm wakes it a few times an hour. */
    private fun scheduleAlarm() {
        val am = getSystemService(AlarmManager::class.java)
        val pi = PendingIntent.getBroadcast(
            this, 1, Intent(this, AlarmReceiver::class.java).setAction(ACTION_ALARM),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        am.setAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, SystemClock.elapsedRealtime() + ALARM_MS, pi)
    }

    companion object {
        const val POLL_MS = 20_000L
        const val CHECK_IN_MS = 60_000L
        const val ALARM_MS = 5 * 60_000L
        const val ACTION_ALARM = "services.dovetails.phone.ALARM"

        fun start(context: Context) {
            if (!Prefs(context).configured) return
            try {
                context.startForegroundService(Intent(context, PhoneService::class.java))
            } catch (_: Exception) {
                // Android refused a background start; the periodic worker tries again.
            }
        }

        /** Run a pass now (radio result, reply sent). */
        fun kick(context: Context) = start(context)
    }
}
