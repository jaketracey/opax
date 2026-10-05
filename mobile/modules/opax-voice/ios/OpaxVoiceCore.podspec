Pod::Spec.new do |s|
  s.name = 'OpaxVoiceCore'
  s.version = '0.1.0'
  s.summary = 'OPAX scoped native voice core'
  s.description = 'Voice session, relay, evidence and audio stay native.'
  s.license = { :type => 'AGPL-3.0' }
  s.author = 'OPAX'
  s.homepage = 'https://github.com/jaketracey/opax'
  s.source = { :git => 'https://github.com/jaketracey/opax.git' }
  s.platform = :ios, '18.4'
  s.swift_version = '6.0'
  s.static_framework = true
  s.source_files = 'OpaxVoiceCore/Sources/OpaxVoiceCore/*.swift'
  s.frameworks = 'AVFAudio', 'Security', 'UIKit'
  xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_STRICT_CONCURRENCY' => 'complete',
    'SWIFT_DEFAULT_ACTOR_ISOLATION' => 'nonisolated'
  }
  if ENV['OPAX_VARIANT'] == 'e2e'
    xcconfig['SWIFT_ACTIVE_COMPILATION_CONDITIONS'] = '$(inherited) OPAX_VOICE_E2E'
  end
  s.pod_target_xcconfig = xcconfig
end
