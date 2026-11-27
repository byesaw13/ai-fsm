# Dovetails Phone: setup and switch-over (TASK-260)

Our own Android app on the business phone. It replaces the SMS Gateway app.
Code: `apps/android`. Server: `apps/web/app/api/internal/phone/*`,
`apps/web/lib/db/phone.ts`, `apps/web/lib/phone-app/ingest.ts`, migration 223.

## What it does

| On the phone | Reaches the FSM as |
|---|---|
| A customer texts the business line | `/api/internal/sms`, the same AI sorting as before. The phone shows the FSM's summary with **Send suggested reply**. |
| You text a customer from the phone's Messages app | Logged on that customer's page as a text from you. |
| A call with a customer's number (in or out, answered, missed, voicemail) | A timeline line on the customer page with the length of the call. |
| A missed call or voicemail from a customer | A push alert, and **Call back** in Needs Attention until you call or text them. |
| The FSM sends a text (on the way, reminder, quote, invoice, portal link) | Queued in `phone_outbox`, pulled by the phone within about 20 seconds, sent on the business SIM, and marked sent, delivered or failed. |

Not stored: calls and texts with numbers that are not customers (dropped on the
server), and any audio. Inbound texts from unknown numbers still go through the
AI "is this business?" check, as with the gateway; personal ones are skipped.

## Reliability rules

- Every call and text is read from Android's own logs from a checkpoint and
  written to a local queue before the checkpoint moves. Nothing is lost while
  the phone has no signal or the app was stopped; it uploads when it can.
- A text from the server is sent at most once per outbox id. If the app dies
  mid-send it reports "failed", never re-sends.
- A claimed text that is never reported is offered again after 5 minutes, and
  failed after 3 tries. A text not sent within 2 hours is failed, so a late
  "on the way" never goes out.
- The app runs as a foreground service, starts on boot, runs a pass when a
  text arrives, a call log changes or an alarm fires, and has a 15-minute
  WorkManager safety net. The worker's "Business phone is offline" alert
  works for the app the same way it did for the gateway.

## Install (owner, once)

1. **Server.** In `/opt/business/ai-fsm` env, set
   `PHONE_APP_KEY=$(openssl rand -hex 32)`. Leave `SMS_TRANSPORT=gateway` for
   now. Deploy (migration 223 runs).
2. **APK.** Download `dovetails-phone-apk` from the latest "android" GitHub
   Actions run (or build: `cd apps/android && ./gradlew assembleDebug`). On the
   phone, open the file and allow "install unknown apps" for the browser or
   Files app. It is not on the Play Store: Google does not allow call log and
   SMS access for apps that are not the default dialer or texting app.
3. **Open Dovetails Phone.** Enter the FSM address (the HTTPS Cloudflare
   Tunnel hostname, the same one the installed web app uses) and the phone key.
   Pick the business SIM.
4. Tap **1. Allow texts, calls and notifications** and allow all.
5. Tap **2. Let it run in the background** and allow. Without this Android
   delays texts when the phone sleeps. On Samsung, also set Settings → Apps →
   Dovetails Phone → Battery → **Unrestricted**.
6. Tap **3. Save and connect**. The status shows a check-in time. The first
   pass uploads the last 7 days of customer calls and texts.

## Switch over

1. Call the business line from a customer's number (or add your second phone
   as a test customer). Miss it, then check the customer page and Needs
   Attention → Call back. Call back; Call back clears.
2. Set `SMS_TRANSPORT=phone_app` and restart the web container. Send an
   "On the way" from a visit; it should arrive within about 20 seconds and
   show delivered on the customer page.
3. In the SMS Gateway app, turn off its webhooks (or uninstall it), so a
   customer text is not handled twice. If both run for a while, the same text
   gets two different ids and may be logged twice.

**Roll back:** set `SMS_TRANSPORT=gateway`, restart web, and turn the gateway's
webhooks back on. Texts already queued in `phone_outbox` are not moved; they
expire after 2 hours.

## Updates and signing

Android only installs an update signed with the same key. The CI debug APK is
signed with a throwaway key per runner, so an update from a different run needs
an uninstall first (the app's settings and checkpoints are lost; nothing on the
server is). For painless updates, make one release key and keep it safe:

```bash
keytool -genkeypair -v -keystore dovetails-phone.jks -alias dovetails-phone \
  -keyalg RSA -keysize 4096 -validity 10000
base64 -w0 dovetails-phone.jks   # → secret DOVETAILS_PHONE_KEYSTORE_B64
```

Add repository secrets `DOVETAILS_PHONE_KEYSTORE_B64` and
`DOVETAILS_PHONE_KEYSTORE_PASSWORD`; the android workflow then also builds a
signed release APK. Bump `versionCode` in `apps/android/app/build.gradle.kts`
for every release.

## Known limits

- In deep Doze (phone still, screen off, unplugged for a long time) Android
  limits background network. Texts from the server may wait up to about 10
  minutes then. Incoming texts and calls still wake the app at once.
- Dual-SIM: only the chosen SIM sends. Calls and texts on either SIM are read;
  only customers' numbers are kept.
- The phone key sits in the app's private storage. Anyone with the unlocked
  phone and the app can read it. Rotate `PHONE_APP_KEY` if the phone is lost.
