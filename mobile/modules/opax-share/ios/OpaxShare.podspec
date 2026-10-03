Pod::Spec.new do |s|
  s.name           = 'OpaxShare'
  s.version        = '0.1.0'
  s.summary        = 'Share sheet with locally built link metadata'
  s.description    = 'Presents the system share sheet for a canonical URL with LPLinkMetadata built from loaded data, so the sheet never fetches the page or its share image.'
  s.license        = 'AGPL-3.0-only'
  s.author         = 'OPAX contributors'
  s.homepage       = 'https://github.com/jaketracey/opax'
  s.platforms      = { :ios => '18.4' }
  s.swift_version  = '5.9'
  s.source         = { git: 'https://github.com/jaketracey/opax.git' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.frameworks     = 'LinkPresentation'
  s.source_files   = '**/*.{h,m,swift}'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
