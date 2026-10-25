#!/usr/bin/env bash
# Source this file to use the optional project-local build tools.
if [ -n "${BASH_VERSION:-}" ]; then
  launcher_env_path="${BASH_SOURCE[0]}"
elif [ -n "${ZSH_VERSION:-}" ]; then
  eval 'launcher_env_path=${(%):-%x}'
else
  echo "Use bash or zsh to source scripts/android-env.sh" >&2
  return 1
fi
PROJECT_ROOT="$(cd "$(dirname "$launcher_env_path")/.." && pwd)"
if [ -z "${JAVA_HOME:-}" ]; then
  for java_candidate in "$PROJECT_ROOT"/work/toolchain/jdk-*/Contents/Home; do
    if [ -x "$java_candidate/bin/java" ]; then export JAVA_HOME="$java_candidate"; break; fi
  done
fi
if [ -z "${ANDROID_HOME:-}" ] && [ -d "$PROJECT_ROOT/work/toolchain/sdk" ]; then
  export ANDROID_HOME="$PROJECT_ROOT/work/toolchain/sdk"
fi
export GRADLE_USER_HOME="${GRADLE_USER_HOME:-$PROJECT_ROOT/work/gradle}"
export ANDROID_USER_HOME="${ANDROID_USER_HOME:-$PROJECT_ROOT/work/toolchain/android-user}"
export PATH="${JAVA_HOME:+$JAVA_HOME/bin:}${ANDROID_HOME:+$ANDROID_HOME/platform-tools:}$PATH"
