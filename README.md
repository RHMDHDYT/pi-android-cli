# pi-android-cli

[![npm version](https://badge.fury.io/js/pi-android-cli.svg)](https://www.npmjs.com/package/pi-android-cli)

Android development tools for [pi](https://pi.dev), bridging the official Android CLI and low-level SDK binaries.

- 📦 [npm](https://www.npmjs.com/package/pi-android-cli)
- 🔗 [GitHub](https://github.com/RHMDHDYT/pi-android-cli)
- 🖼️ [pi.dev/packages](https://pi.dev/packages/pi-android-cli)

## Tools

| Tool | Description |
|------|-------------|
| `android_cli` | Generic wrapper for the official `android` command (`info`, `update`, `describe`, `create`, `emulator`, `docs`, `layout`, etc.) |
| `android_project` | `describe` project metadata / `list_templates` via Android CLI |
| `android_docs` | Search and fetch from the Android Knowledge Base (`android docs search` / `android docs fetch`) |
| `android_layout` | Capture active app UI hierarchy as JSON (`android layout`) |
| `android_gradle` | Run Gradle wrapper tasks (`./gradlew`) |
| `android_adb` | Low-level ADB commands (`devices`, `shell`, `install`, etc.) |
| `android_emulator` | Manage AVDs. Prefers Android CLI; falls back to raw SDK binaries |
| `android_logcat` | Capture, filter, and clear device logs with PID resolution |

## Commands

| Command | Description |
|---------|-------------|
| `/android-sdk` | Show discovered SDK path, CLI path, and binary locations |

## Install

### From npm (recommended)

```bash
pi install npm:pi-android-cli
```

Or pinned to a version:

```bash
pi install npm:pi-android-cli@1.0.0
```

### From git

```bash
pi install git:github.com/RHMDHDYT/pi-android-cli@v1.0.0
```

### Local (project-only)

```bash
pi install ./path/to/pi-android-cli -l
```

## Requirements

- **Android SDK**: Set `ANDROID_HOME` or `ANDROID_SDK_ROOT`. Auto-discovers common paths as fallback.
- **Android CLI** (optional but recommended): Download from [developer.android.com/tools/agents/android-cli](https://developer.android.com/tools/agents/android-cli). Auto-discovers from `PATH`.

## Auto-discovery

The extension searches for:
- **SDK**: `$ANDROID_HOME`, `$ANDROID_SDK_ROOT`, `~/Library/Android/sdk` (macOS), `%LOCALAPPDATA%\Android\Sdk` (Windows)
- **CLI**: `android` in `PATH`, `~/.local/bin/android`, `~/Library/Android/sdk/cmdline-tools/*/bin/android`

## License

MIT
