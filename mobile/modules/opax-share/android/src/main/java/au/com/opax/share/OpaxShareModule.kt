package au.com.opax.share

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.view.HapticFeedbackConstants
import androidx.core.content.FileProvider
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import java.io.File
import java.util.UUID

class ShareRequest : Record {
  @Field var url: String = ""
  @Field var title: String = ""
}

class TextShareRequest : Record {
  @Field var text: String = ""
  @Field var filename: String = "record.txt"
}

// No transport, metadata fetch, microphone or storage permission. The system
// chooser receives loaded text or a temporary file through a private provider.
class OpaxShareModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("OpaxShare")

    AsyncFunction("copyText") { text: String ->
      val activity = appContext.throwingActivity
      val clipboard = activity.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
      clipboard.setPrimaryClip(ClipData.newPlainText("OPAX record", text))
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("share") { request: ShareRequest ->
      val uri = Uri.parse(request.url)
      require(uri.scheme == "https" && uri.host == "opax.com.au" &&
        uri.userInfo == null && uri.port == -1) { "Only canonical https links can be shared" }
      val intent = Intent(Intent.ACTION_SEND).apply {
        type = "text/plain"
        putExtra(Intent.EXTRA_TEXT, request.url)
        putExtra(Intent.EXTRA_SUBJECT, request.title)
      }
      appContext.throwingActivity.startActivity(Intent.createChooser(intent, request.title))
      // Android reports chooser presentation, not whether a recipient sends.
      true
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("shareText") { request: TextShareRequest ->
      require(Regex("^[a-z0-9-]+\\.(txt|bib|ris)$").matches(request.filename))
      val activity = appContext.throwingActivity
      val root = File(activity.cacheDir, "opax-share").apply { mkdirs() }
      // Retain recent files while a recipient reads; expire old exports.
      root.listFiles()?.filter { System.currentTimeMillis() - it.lastModified() > 86_400_000 }
        ?.forEach { it.deleteRecursively() }
      val directory = File(root, UUID.randomUUID().toString()).apply { mkdirs() }
      val file = File(directory, request.filename).apply { writeText(request.text) }
      val uri = FileProvider.getUriForFile(activity, "${activity.packageName}.opax.share", file)
      val intent = Intent(Intent.ACTION_SEND).apply {
        type = "text/plain"
        putExtra(Intent.EXTRA_STREAM, uri)
        clipData = ClipData.newRawUri(request.filename, uri)
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
      }
      activity.startActivity(Intent.createChooser(intent, request.filename))
      true
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("haptic") { kind: String ->
      val feedback = if (kind == "selection") HapticFeedbackConstants.CLOCK_TICK
        else HapticFeedbackConstants.CONFIRM
      appContext.throwingActivity.window.decorView.performHapticFeedback(feedback)
      Unit
    }.runOnQueue(Queues.MAIN)
  }
}
