require 'rubygems/version'

sdk_version = `xcrun --sdk iphoneos --show-sdk-version 2>/dev/null`.strip
vertical_bars = !sdk_version.empty? && Gem::Version.new(sdk_version) >= Gem::Version.new('27.1')

Pod::Spec.new do |s|
  s.name = 'OpaxRootBar'
  s.version = '0.1.0'
  s.summary = 'Fading backing for native large-title bars'
  s.description = 'A non-interactive backing beneath the owning navigation bar. No appearance replacement or network requests.'
  s.license = 'AGPL-3.0-only'
  s.author = 'OPAX contributors'
  s.homepage = 'https://github.com/jaketracey/opax'
  s.platforms = { :ios => '18.4' }
  s.swift_version = '5.9'
  s.source = { git: 'https://github.com/jaketracey/opax.git' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files = '**/*.swift'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule',
    'SWIFT_ACTIVE_COMPILATION_CONDITIONS' => vertical_bars ? '$(inherited) OPAX_VERTICAL_BARS' : '$(inherited)'
  }
end
