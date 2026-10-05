/** Pure readiness check shared by voice routes and the public app manifest. */
export type VoiceConfig = {VOICE_ENABLED?: string; VOICE_AGENT_ID?: string; ELEVENLABS_API_KEY?: string; VOICE_TOOL_SECRET?: string; VOICE_MONTHLY_SECONDS?: string}

export const voiceConfigured = (env: VoiceConfig): boolean => String(env.VOICE_ENABLED) === 'true'
  && !!env.VOICE_AGENT_ID && !!env.ELEVENLABS_API_KEY && (env.VOICE_TOOL_SECRET?.length ?? 0) >= 32
