# Android link deliveries

`LinkIntentActivityDelegate` runs before ReactActivity starts JS or forwards an
intent. Every incoming VIEW or NDEF intent gets a new random delivery ID and a
monotonic sequence. Equal URLs remain separate user deliveries.

The inbox commits pending deliveries to app-private SharedPreferences before
publishing them. One document contains the FIFO and the latest delivery ID for
each task. Activity saved state also carries the ID. Recreation and process
restoration reuse that identity instead of treating the OS's retained URI as a
new action; a task restored from history without a Bundle uses the durable task
slot. A genuinely new intent always gets a new ID.

JS subscribes and reads the pending snapshot at entry. Initial navigation elects
the oldest pending delivery, even when RN's initial-URL getter returns a newer
intent. Each route carries an internal ID receipt. Only after that receipt
appears on the selected navigation leaf does JS acknowledge the native delivery,
then advance to the next entry. Cancelling an uncommitted navigation or failing
an acknowledgement leaves it pending. A process killed before acknowledgement
can redeliver that pending action; consumed actions are not replayed.

Acknowledgement removes the URL from the inbox and clears the Activity's URL and
VIEW action only if its delivery ID still matches. An older acknowledgement
cannot clear a newer intent. Consumed task metadata contains IDs only. There is
no networking, extra permission, URL-string deduplication or backup of this data
(the app disables Android backup). iOS does not load this native module.

The Robolectric `LinkLifecycleTest` exercises the same delegate used by
MainActivity against real SharedPreferences, including new inbox instances to
simulate loss of process and JS memory. Run it after Android prebuild with:

```sh
./gradlew :app:compileE2eKotlin :opax-links:testDebugUnitTest --max-workers=2
```
