package au.com.opax.voice

import android.content.Context

/**
 * Consent is separate from credentials. Only an explicit UI choice persists a
 * grant; a fresh install, missing value or malformed value is denied.
 */
class StoredVoiceConsent(context: Context, name: String = PREFERENCES) : VoiceConsent {
  private val preferences = context.applicationContext.getSharedPreferences(name, Context.MODE_PRIVATE)

  override suspend fun isGranted() = granted()
  fun granted(): Boolean = preferences.all[KEY] as? Boolean ?: false
  fun setGranted(granted: Boolean) {
    preferences.edit().putBoolean(KEY, granted).commit()
  }

  companion object {
    const val KEY = "opax.voice.consent.v1"
    const val PREFERENCES = "au.com.opax.voice.consent"
  }
}
