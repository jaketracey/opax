# React switches its prebuilt slices during Xcode builds, after pod install.
# Stage inside that existing phase, before CocoaPods copies/embeds/signs React.
def install_react_privacy_staging(installer)
  target = installer.pods_project.targets.find { |item| item.name == 'React-Core-prebuilt' }
  raise 'Expected prebuilt React target for privacy staging' unless target
  replacement = target.build_phases.find { |phase| phase.respond_to?(:shell_script) && phase.name&.include?('[RNCore] Replace React Native Core') }
  copy = target.build_phases.find { |phase| phase.respond_to?(:shell_script) && phase.name == '[CP] Copy XCFrameworks' }
  raise 'React replacement/copy phases missing; review privacy staging' unless replacement && copy
  # CocoaPods cannot honor :before_compile on PBXAggregateTarget (no Sources
  # phase), so it appends replacement after Copy XCFrameworks. Pin the order.
  if target.build_phases.index(replacement) > target.build_phases.index(copy)
    target.build_phases.move_from(target.build_phases.index(replacement), target.build_phases.index(copy))
  end
  marker = '# OPAX: restage privacy after React configuration replacement'
  return if replacement.shell_script.include?(marker)
  replacement.shell_script += <<~SH

    #{marker}
    opax_replacement_status=$?
    [ "$opax_replacement_status" -eq 0 ] || exit "$opax_replacement_status"
    python3 "$PODS_ROOT/../../scripts/stage-privacy-manifests.py"
  SH
end
