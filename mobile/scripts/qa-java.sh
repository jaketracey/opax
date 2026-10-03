#!/usr/bin/env bash
# An inherited JAVA_HOME is only one candidate. Never mutate PATH until a Java
# 17+ candidate has passed its version check; an invalid candidate can fall back.
qa_java_17() {
  local java_version version_pattern='version[[:space:]]+"([0-9]+)'
  java_version=$("$1" -version 2>&1) || return 1
  [[ "$java_version" =~ $version_pattern ]] || return 1
  [ "${BASH_REMATCH[1]}" -ge 17 ]
}
configure_java() {
  local candidate java_home path_dir
  # Optional lookup locations keep shell tests independent of the host's JDKs.
  local sdk_root=${1:-"$HOME/.sdkman/candidates/java"}
  local java_home_command=${2:-/usr/libexec/java_home}
  local original_path=$PATH
  local path_dirs=()
  for candidate in "${JAVA_HOME:-}" "$sdk_root/current" "$sdk_root"/21* "$sdk_root"/17* "$sdk_root"/*; do
    if [ -n "$candidate" ] && [ -x "$candidate/bin/java" ] && qa_java_17 "$candidate/bin/java"; then
      export JAVA_HOME="$candidate"
      export PATH="$JAVA_HOME/bin:$original_path"
      return 0
    fi
  done
  if [ -x "$java_home_command" ]; then
    java_home=$("$java_home_command" -v '17+' 2>/dev/null) || java_home=
    if [ -n "$java_home" ] && [ -x "$java_home/bin/java" ] && qa_java_17 "$java_home/bin/java"; then
      export JAVA_HOME="$java_home"
      export PATH="$JAVA_HOME/bin:$original_path"
      return 0
    fi
  fi
  # An old Java may also be the first PATH entry. Try every candidate, retaining
  # the original PATH and putting the first valid binary ahead of older ones.
  IFS=: read -r -a path_dirs <<< "$original_path"
  for path_dir in "${path_dirs[@]}"; do
    path_dir=${path_dir:-.}
    if [ -x "$path_dir/java" ] && qa_java_17 "$path_dir/java"; then
      unset JAVA_HOME
      export PATH="$path_dir:$original_path"
      return 0
    fi
  done
  echo 'Java 17+ required: no valid JAVA_HOME, sdkman, macOS JDK or PATH candidate' >&2
  return 1
}
