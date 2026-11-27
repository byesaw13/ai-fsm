package services.dovetails.phone

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings
import android.telephony.SubscriptionManager
import android.text.InputType
import android.view.View
import android.widget.ArrayAdapter
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.Spinner
import android.widget.TextView
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.MainScope
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.text.DateFormat
import java.util.Date

/** Setup and status. Everything else happens in the background. */
class MainActivity : Activity() {
    private val ui: CoroutineScope = MainScope()
    private lateinit var prefs: Prefs
    private lateinit var url: EditText
    private lateinit var key: EditText
    private lateinit var sim: Spinner
    private lateinit var status: TextView
    private var simIds: List<Int> = listOf(-1)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        prefs = Prefs(this)
        Notifier.createChannels(this)
        val pad = (16 * resources.displayMetrics.density).toInt()
        val col = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(pad, pad, pad, pad) }

        fun label(text: String, size: Float = 14f) = TextView(this).apply {
            this.text = text; textSize = size; setPadding(0, pad / 2, 0, pad / 4)
        }
        fun button(text: String, onClick: () -> Unit) = Button(this).apply {
            this.text = text; setOnClickListener { onClick() }
        }

        col.addView(label("Dovetails Phone", 22f))
        col.addView(
            label(
                "Sends the FSM's texts from this phone, and keeps calls and texts with customers on their " +
                    "page. Calls and texts with numbers that are not customers are never stored. No audio is recorded.",
            ),
        )
        col.addView(label("FSM address"))
        url = EditText(this).apply {
            hint = "https://app.example.com"; setText(prefs.serverUrl)
            inputType = InputType.TYPE_TEXT_VARIATION_URI
        }
        col.addView(url)
        col.addView(label("Phone key (PHONE_APP_KEY on the server)"))
        key = EditText(this).apply {
            setText(prefs.apiKey)
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD
        }
        col.addView(key)
        col.addView(label("Business SIM"))
        sim = Spinner(this)
        col.addView(sim)

        col.addView(button("1. Allow texts, calls and notifications") { requestPermissions(Permissions.required, 1) })
        col.addView(button("2. Let it run in the background") { askBatteryExemption() })
        col.addView(button("3. Save and connect") { save() })
        col.addView(button("Sync now") { syncNow() })

        status = label("")
        col.addView(status)
        setContentView(ScrollView(this).apply { addView(col) })
        loadSims()
        refresh()
    }

    override fun onResume() {
        super.onResume()
        refresh()
    }

    override fun onDestroy() {
        ui.cancel()
        super.onDestroy()
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        loadSims()
        refresh()
    }

    @SuppressLint("MissingPermission")
    private fun loadSims() {
        val names = mutableListOf("Default SIM for texts")
        val ids = mutableListOf(-1)
        if (checkSelfPermission(Manifest.permission.READ_PHONE_STATE) == PackageManager.PERMISSION_GRANTED) {
            getSystemService(SubscriptionManager::class.java)?.activeSubscriptionInfoList?.forEach {
                names += "SIM ${it.simSlotIndex + 1}: ${it.displayName} ${it.carrierName}".trim()
                ids += it.subscriptionId
            }
        }
        simIds = ids
        sim.adapter = ArrayAdapter(this, android.R.layout.simple_spinner_dropdown_item, names)
        sim.setSelection(ids.indexOf(prefs.subscriptionId).coerceAtLeast(0))
    }

    @SuppressLint("BatteryLife")
    private fun askBatteryExemption() {
        val power = getSystemService(PowerManager::class.java)
        if (power.isIgnoringBatteryOptimizations(packageName)) {
            status.text = "Already allowed to run in the background."
            return
        }
        startActivity(Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:$packageName")))
    }

    private fun save() {
        val normalized = Logic.normalizeServerUrl(url.text.toString())
        if (normalized == null) {
            status.text = "That address won't work. Use https://, or http:// only on the home network."
            return
        }
        if (key.text.isNullOrBlank()) {
            status.text = "Enter the phone key."
            return
        }
        prefs.serverUrl = normalized
        prefs.apiKey = key.text.toString().trim()
        prefs.subscriptionId = simIds.getOrElse(sim.selectedItemPosition) { -1 }
        url.setText(normalized)
        PhoneService.start(this)
        SyncWorker.schedulePeriodic(this)
        syncNow()
    }

    private fun syncNow() {
        status.text = "Syncing…"
        ui.launch {
            val result = withContext(Dispatchers.IO) { SyncEngine.run(this@MainActivity) }
            refresh()
            if (result.lastError.isEmpty()) status.append("\nSync finished.")
        }
    }

    private fun refresh() {
        if (!::status.isInitialized) return
        val missing = Permissions.missing(this)
        val power = getSystemService(PowerManager::class.java)
        val seen = prefs.lastCheckInAt
        val lines = buildList {
            add(if (prefs.configured) "Server: ${prefs.serverUrl}" else "Not set up yet.")
            add(if (missing.isEmpty()) "Permissions: all allowed" else "Missing permissions: ${missing.joinToString()}")
            add(
                if (power.isIgnoringBatteryOptimizations(packageName)) "Background: allowed"
                else "Background: restricted — texts can be late (step 2)",
            )
            add("Last check-in: " + if (seen > 0) DateFormat.getDateTimeInstance().format(Date(seen)) else "never")
            add("Waiting to upload: ${Store.get(this@MainActivity).pendingEventCount()}")
            if (prefs.lastError.isNotEmpty()) add("Last problem: ${prefs.lastError}")
        }
        status.text = lines.joinToString("\n")
        status.visibility = View.VISIBLE
    }
}
