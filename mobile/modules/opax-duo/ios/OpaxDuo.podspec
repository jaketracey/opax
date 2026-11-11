require 'rubygems/version'

# Duo full-screen behaviour and reserved regions need the iOS 27.1 SDK.
# Keep older SDKs building: Swift must not resolve the new UIKit symbols.
sdk_version = `xcrun --sdk iphoneos --show-sdk-version 2>/dev/null`.strip
reserved_regions = !sdk_version.empty? && Gem::Version.new(sdk_version) >= Gem::Version.new('27.1')

Pod::Spec.new do |s|
  s.name           = 'OpaxDuo'
  s.version        = '0.1.0'
  s.summary        = 'Window traits and device reserved regions'
  s.description    = 'Live key-window size classes and local reserved-region geometry for adaptive iOS layouts.'
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
    'SWIFT_COMPILATION_MODE' => 'wholemodule',
    'SWIFT_ACTIVE_COMPILATION_CONDITIONS' => reserved_regions ? '$(inherited) OPAX_RESERVED_REGIONS' : '$(inherited)'
  }
end
