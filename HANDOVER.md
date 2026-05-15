# Time Machine Handover

## Current State

Time Machine is now packaged as a Volumio 4 Bookworm plugin.

Current version:

```text
0.4.0
```

The installable plugin is in `timemachine/`.

## Core Behavior

- Adds a Volumio Browse source named **Time Machine**.
- Builds a manual cache from MPD metadata when settings are saved.
- Groups music by MPD `Date` metadata into decade views.
- Supports browsing albums/tracks and random track/album playback.
- Uses MPD-relative file paths for playback.

## Important Files

- `timemachine/index.js`: plugin controller.
- `timemachine/package.json`: Volumio 4 package metadata.
- `timemachine/UIConfig.json`: settings UI.
- `timemachine/config.json`: default settings.
- `scripts/validate.sh`: local syntax and JSON validation.
- `scripts/package-plugin.sh`: versioned release zip builder.
- `docs/time-machine-memory.md`: durable project memory mirror.

## Release Checklist

1. Update `timemachine/package.json` version.
2. Update `CHANGELOG.md`.
3. Run `scripts/validate.sh`.
4. Run `scripts/package-plugin.sh`.
5. Install and test on a real Volumio 4 system.
6. Push to GitHub.
7. Create a GitHub Release and attach the generated zip.

## Volumio 4 Test Focus

- Plugin install on a clean Volumio 4 image.
- Settings save and MPD index rebuild.
- Browse root, decade folders, album folders, and tracks.
- Random tracks and random albums.
- Visible queue updates.
- Current song metadata.
- Album art.

## Shared Memory

The Google Doc memory is the cross-Codex source of truth:

https://docs.google.com/document/d/1MbE-zUsmwvpfZ9Zp5z2Y_y4Z982LJVMrC18i1Zm3ahc

Mirror durable updates into `docs/time-machine-memory.md` when practical.
