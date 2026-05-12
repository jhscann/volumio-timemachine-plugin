# Volumio Time Machine Plugin

Time Machine is an in-progress Volumio 3 `music_service` plugin that adds a Browse source named **Time Machine**. It groups the MPD library by release decade using MPD `Date` metadata and lets the user browse or play random tracks and albums from each decade.

The plugin is intentionally MPD-index based. It does not recursively crawl `/mnt` paths and does not run `metaflac` across the music library.

## Repository Layout

```text
volumio-timemachine-plugin/
  README.md
  CHANGELOG.md
  HANDOVER.md
  TEST_NOTES.md
  scripts/
    package-plugin.sh
    validate.sh
  timemachine/
    index.js
    package.json
    UIConfig.json
    config.json
    install.sh
    uninstall.sh
    icon.png
    icon-v032.png
    i18n/strings_en.json
    tools/mpd-count.js
```

The installable Volumio plugin is the `timemachine/` folder. Keep that folder intact so this still works:

```bash
cd timemachine
npm install
volumio plugin install
```

## Target

- Volumio 3 on a Raspberry Pi style setup
- MPD reachable on `127.0.0.1:6600`
- Node version compatible with Volumio 3 plugin runtime

Example MPD library paths:

```text
NAS/NAS/Flac,NAS/NAS/Vinyl
```

These defaults match one development system only. Most users must replace them
with paths from their own MPD database.

These are MPD-relative playable paths, not Linux filesystem paths. Playback items must use raw MPD paths such as:

```text
NAS/NAS/Vinyl/Boards Of Canada - Tape 5/01 - Tape 5.flac
```

## User Experience

The Browse source should show:

```text
Time Machine
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

Opening a decade should show:

```text
Play Random Tracks
Play Random Albums
Browse Albums
Browse Tracks
```

Expected behavior:

- `Play Random Tracks` queues shuffled tracks from the selected decade and starts playback.
- `Play Random Albums` queues complete albums from the selected decade in disc/track order and starts playback.
- `Browse Albums` lists matching albums.
- Opening an album lists that album's tracks.
- Selecting a track plays it via MPD and should show album art when Volumio can resolve it.
- `Browse Tracks` lists matching tracks.
- `Missing Year` covers tracks/albums without usable MPD `Date` metadata.
- `Library Report` shows index counts.

## Settings

Settings live in the Volumio plugin configuration UI:

- `mpdPaths`: comma-separated MPD paths to query. Default: `NAS/NAS/Flac,NAS/NAS/Vinyl`.
- `maxRandomTracks`: maximum tracks queued by `Play Random Tracks`. Default: `50`.
- `randomAlbumsCount`: number of albums queued by `Play Random Albums`. Default: `3`.
- `includeMissingYear`: whether random playback may include `Missing Year` content. Default: `false`.

Saving settings triggers a manual MPD index rebuild. There is no automatic scan on plugin startup.

### Discover MPD Paths

Before saving settings, SSH into the Volumio box and list likely MPD path
roots:

```bash
mpc listall | awk -F/ 'NF>=4 {print $1"/"$2"/"$3; next} NF>=2 {print $1"/"$2}' | sort | uniq -c | sort -nr | head -30
```

Review the output and exclude obvious non-library paths such as `#recycle`,
`@eaDir`, `.Trash`, backups, video folders, or temporary folders.

To produce a copy-ready comma-separated value for the `mpdPaths` setting,
excluding common junk folders and tiny one-off roots:

```bash
mpc listall | awk -F/ 'NF>=4 {print $1"/"$2"/"$3; next} NF>=2 {print $1"/"$2}' | grep -Ev '(^|/)(#recycle|@eaDir|\.Trash|\.Trashes|\.TemporaryItems)(/|$)' | sort | uniq -c | awk '$1 >= 10 {$1=""; sub(/^ +/,""); print}' | paste -sd, -
```

Example output:

```text
NAS/NAS/Flac,NAS/NAS/Lossy,NAS/NAS/Vinyl,NAS/NAS/DVD Audio
```

## Index Rebuild

The plugin queries MPD with raw protocol `listallinfo` for each configured MPD path and writes:

```text
/data/configuration/music_service/timemachine/library.json
```

The cache contains parsed MPD metadata and raw MPD file paths used for playback.

## Clean Install On Volumio

```bash
sudo rm -rf /data/plugins/music_service/timemachine
sudo rm -rf /data/configuration/music_service/timemachine
sudo systemctl restart volumio
```

Copy this repository to the Volumio box, then:

```bash
cd /home/volumio/volumio-timemachine-plugin/timemachine
npm install
volumio plugin install
volumio vrestart
```

Confirm the installed version:

```bash
cat /data/plugins/music_service/timemachine/package.json | grep -E '"name"|"version"|"prettyName"|"plugin_type"'
```

Expected current version:

```text
"version": "0.3.5"
```

## Development Workflow

Use this GitHub repository as the source of truth:

```text
https://github.com/jhscann/volumio-timemachine-plugin
```

Make changes in a clean local clone, run validation, then package or deploy the `timemachine/` folder.

Validate local files:

```bash
scripts/validate.sh
```

Build an install archive:

```bash
scripts/package-plugin.sh
```

The package script writes a versioned archive under `dist/`, for example:

```text
dist/timemachine-0.3.5.zip
```

## Troubleshooting

Watch plugin, queue, and playback logs:

```bash
journalctl -f -u volumio | grep -i "timemachine\|random\|queue\|replaceAndPlay\|addToQueue\|explode\|error\|exception"
```

Check cache presence:

```bash
ls -lh /data/configuration/music_service/timemachine/
```

Check cache summary:

```bash
node - <<'NODE'
const fs = require('fs');
const p = '/data/configuration/music_service/timemachine/library.json';
const j = JSON.parse(fs.readFileSync(p, 'utf8'));
console.log(j.meta);
NODE
```

Run a manual MPD count from the plugin folder:

```bash
node tools/mpd-count.js
```
