Pod::Spec.new do |s|
  s.name = 'OpaxVoice'
  s.version = '0.1.0'
  s.summary = 'OPAX Expo voice bridge'
  s.description = 'One controller and explicit sanitised events.'
  s.license = { :type => 'AGPL-3.0' }
  s.author = 'OPAX'
  s.homepage = 'https://github.com/jaketracey/opax'
  s.source = { :git => 'https://github.com/jaketracey/opax.git' }
  s.platform = :ios, '18.4'
  s.swift_version = '5.9'
  s.static_framework = true
  s.source_files = 'Bridge/*.swift'
  s.dependency 'ExpoModulesCore'
  s.dependency 'OpaxVoiceCore', '0.1.0'
  xcconfig = { 'DEFINES_MODULE' => 'YES' }
  if ENV['OPAX_VARIANT'] == 'e2e'
    xcconfig['SWIFT_ACTIVE_COMPILATION_CONDITIONS'] = '$(inherited) OPAX_VOICE_E2E'
  elsif ENV['OPAX_VARIANT'] == 'production' && ENV['OPAX_PRODUCTION_VOICE'] == '1'
    xcconfig['SWIFT_ACTIVE_COMPILATION_CONDITIONS'] = '$(inherited) OPAX_VOICE_PRODUCTION'
  end
  s.pod_target_xcconfig = xcconfig
end
