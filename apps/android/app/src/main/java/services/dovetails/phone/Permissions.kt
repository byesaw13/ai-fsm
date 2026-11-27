package services.dovetails.phone

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build

object Permissions {
    val required: Array<String> = buildList {
        add(Manifest.permission.READ_SMS)
        add(Manifest.permission.RECEIVE_SMS)
        add(Manifest.permission.SEND_SMS)
        add(Manifest.permission.READ_CALL_LOG)
        add(Manifest.permission.READ_PHONE_STATE)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) add(Manifest.permission.POST_NOTIFICATIONS)
    }.toTypedArray()

    fun missing(context: Context): List<String> =
        required.filter { context.checkSelfPermission(it) != PackageManager.PERMISSION_GRANTED }
            .map { it.substringAfterLast('.') }
}
