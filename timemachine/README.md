# Time Machine for Volumio, prototype v0.3.5

A clean Volumio 3 `music_service` plugin prototype that creates a **Time Machine** browse source and groups the MPD music database by release decade using MPD `Date` metadata.

This version deliberately avoids direct filesystem crawling and does not call `metaflac` across the music library. It queries MPD over `127.0.0.1:6600` and uses MPD-relative file paths for playback.

## Example MPD paths

```text
NAS/NAS/Flac,NAS/NAS/Vinyl
```

These are MPD paths, not Linux `/mnt/...` paths. They are examples from one
development system; most users must replace them with paths from their own MPD
database.

To discover likely MPD path roots on Volumio:

```bash
mpc listall | awk -F/ 'NF>=4 {print $1"/"$2"/"$3; next} NF>=2 {print $1"/"$2}' | sort | uniq -c | sort -nr | head -30
```

Exclude obvious non-library paths such as `#recycle`, `@eaDir`, `.Trash`,
backups, video folders, or temporary folders.

To produce a copy-ready comma-separated value for the plugin setting:

```bash
mpc listall | awk -F/ 'NF>=4 {print $1"/"$2"/"$3; next} NF>=2 {print $1"/"$2}' | grep -Ev '(^|/)(#recycle|@eaDir|\.Trash|\.Trashes|\.TemporaryItems)(/|$)' | sort | uniq -c | awk '$1 >= 10 {$1=""; sub(/^ +/,""); print}' | paste -sd, -
```

## Behaviour

Browse source:

```text
Time Machine
```

Root rows:

```text
1950s
1960s
1970s
1980s
1990s
2000s
2010s
2020s
Missing Year
Library Report
```

Decade rows:

```text
Play Random Tracks
Play Random Albums
Browse Albums
Browse Tracks
```

## Indexing

The plugin does not index automatically on startup.

Open the plugin settings and use **Save and rebuild MPD index**. The cache is written to:

```text
/data/configuration/music_service/timemachine/library.json
```

The MPD client waits for the MPD greeting, sends one command, accumulates data until the terminating `OK` line, and only then resolves. Logs include response byte counts, raw `file:` line counts, first and last file paths, and parsed counts.

## Diagnostic count

After copying to Volumio, from the plugin folder:

```bash
node tools/mpd-count.js
```

or with custom paths:

```bash
node tools/mpd-count.js "NAS/NAS/Flac,NAS/NAS/Vinyl"
```

## Clean install on Volumio

```bash
sudo rm -rf /data/plugins/music_service/timemachine
sudo rm -rf /data/configuration/music_service/timemachine
sudo systemctl restart volumio
```

Copy this folder to the Volumio box, then:

```bash
cd /home/volumio/timemachine
npm install
volumio plugin install
volumio vrestart
```

Confirm installed version:

```bash
cat /data/plugins/music_service/timemachine/package.json | grep -E '"name"|"version"|"prettyName"|"plugin_type"'
```

Watch logs while indexing and browsing:

```bash
journalctl -f -u volumio | grep -i "timemachine\|time machine\|mpd\|index\|cache\|handleBrowseUri\|Exploding uri\|error\|exception"
```

## Notes

- Folder/navigation rows are explicitly marked browse-only.
- Random action rows are also handled by `explodeUri()` as a fallback if Volumio treats them as queueable.
- Track rows use `service: 'mpd'` and raw MPD-relative paths.
- The plugin currently builds a manual MPD snapshot using `listallinfo` per configured MPD path. This is controlled and explicit, not automatic on startup.


## v0.3.4 notes

- Random action rows include a nonce and are handled by the plugin browse path, which then submits generated MPD song items to Volumio's local queue API.
- `explodeUri()` can still generate random MPD song items as a fallback if Volumio treats an action URI as queueable.
- Settings save now accepts multiple Volumio payload shapes and logs the active saved values before rebuilding.
- URI_VERSION is v7 to avoid stale browse cache.


## v0.3.4 changes

- Random track playback no longer re-sorts after shuffling.
- Random action rows now include a nonce in their URI to avoid Volumio reusing a cached explode result.
- Shuffle uses crypto-backed randomness where available.
- Adds a bundled source icon file: `icon-v032.png`.
- The Browse source now advertises `albumart: /albumart?sourceicon=music_service/timemachine/icon.png`.


## v0.3.5 note
Random playback still uses Volumio's local REST queue endpoints (`replaceAndPlay` then `addToQueue`) rather than directly manipulating MPD. This version adds extra logging to make real-system validation of queue, metadata, and album-art behavior easier.
