package au.com.opax.voice

import okhttp3.HttpUrl
import okhttp3.Request

/** Production compiles no fixture guard: the hooks the shared code calls do nothing. */
internal object VoiceTestSafety {
  @Suppress("UNUSED_PARAMETER") fun validate(request: Request) = Unit
  @Suppress("UNUSED_PARAMETER") fun validate(url: HttpUrl) = Unit
  fun willOpenAudio() = Unit
  fun blocksHardware() = false
}
