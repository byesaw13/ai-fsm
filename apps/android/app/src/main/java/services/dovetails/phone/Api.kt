package services.dovetails.phone

import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL

/** The FSM internal phone endpoints, called with the phone key. */
class Api(private val prefs: Prefs) {
    data class Response(val code: Int, val json: JSONObject?) {
        val ok: Boolean get() = code in 200..299
    }

    class NotConfigured : IOException("Server address and key are not set")

    @Throws(IOException::class)
    fun post(path: String, body: JSONObject): Response {
        if (!prefs.configured) throw NotConfigured()
        val conn = URL(prefs.serverUrl + path).openConnection() as HttpURLConnection
        try {
            conn.requestMethod = "POST"
            conn.connectTimeout = 15_000
            conn.readTimeout = 45_000 // inbound texts wait on the AI sort
            conn.doOutput = true
            conn.setRequestProperty("Content-Type", "application/json")
            conn.setRequestProperty("Accept", "application/json")
            conn.setRequestProperty("x-api-key", prefs.apiKey)
            conn.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
            val code = conn.responseCode
            val stream = if (code in 200..299) conn.inputStream else conn.errorStream
            val text = stream?.bufferedReader()?.use { it.readText() } ?: ""
            val json = try { if (text.isBlank()) null else JSONObject(text) } catch (_: Exception) { null }
            return Response(code, json)
        } finally {
            conn.disconnect()
        }
    }
}
