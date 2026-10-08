Pod::Spec.new do |s|
  s.name           = 'OpaxIPad'
  s.version        = '0.1.0'
  s.summary        = 'iPad keyboard commands and pointer effects'
  s.description    = 'Hardware-keyboard commands registered on the application delegate and the system pointer effect over buttons, rows and cards. No data is read or sent.'
  s.license        = 'AGPL-3.0-only'
  s.author         = 'OPAX contributors'
  s.homepage       = 'https://github.com/jaketracey/opax'
  s.platforms      = { :ios => '18.4' }
  s.swift_version  = '5.9'
  s.source         = { git: 'https://github.com/jaketracey/opax.git' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files   = '**/*.{h,m,swift}'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
