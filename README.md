# Volumio Time Machine Plugin

Time Machine is a Volumio 4 `music_service` plugin that adds a Browse source for
exploring an MPD-indexed local or NAS music library by release decade.

## Features

- Browse music by decade from the 1950s through the 2020s.
- Browse tracks and albums inside each decade.
- Play shuffled tracks from a decade.
- Play shuffled complete albums from a decade in disc/track order.
- Show a Missing Year section for music without usable MPD `Date` metadata.
- Show a Library Report with index counts.

## Requirements

- Volumio 4 on Bookworm.
- MPD available on the Volumio host.
- Music already indexed by MPD.

The installable plugin is the `timemachine/` folder.

## Install From This Repository

On the Volumio box:

```bash
cd /home/volumio
git clone https://github.com/jhscann/volumio-timemachine-plugin.git
cd volumio-timemachine-plugin/timemachine
npm install
volumio plugin install
volumio vrestart
```

Confirm the installed version:

```bash
cat /data/plugins/music_service/timemachine/package.json | grep -E '"name"|"version"|"prettyName"|"plugin_type"'
```

Expected version:

```text
0.4.0
```

## Configure MPD Paths

Open the Time Machine plugin settings in Volumio and set `MPD library paths` to
the MPD-relative roots that contain music.

To discover likely roots:

```bash
mpc listall | awk -F/ 'NF>=4 {print $1"/"$2"/"$3; next} NF>=2 {print $1"/"$2}' | sort | uniq -c | sort -nr | head -30
```

To create a comma-separated value for the setting:

```bash
mpc listall | awk -F/ 'NF>=4 {print $1"/"$2"/"$3; next} NF>=2 {print $1"/"$2}' | grep -Ev '(^|/)(#recycle|@eaDir|\.Trash|\.Trashes|\.TemporaryItems)(/|$)' | sort | uniq -c | awk '$1 >= 10 {$1=""; sub(/^ +/,""); print}' | paste -sd, -
```

Example:

```text
NAS/NAS/Flac,NAS/NAS/Lossy,NAS/NAS/Vinyl,NAS/NAS/DVD Audio
```

Exclude non-library roots such as recycle bins, trash folders, backups, video
folders, and temporary folders.

After saving settings, use **Save and rebuild MPD index**. Time Machine writes
its cache to:

```text
/data/configuration/music_service/timemachine/library.json
```

## Build A Release Zip

From the repository root:

```bash
scripts/validate.sh
scripts/package-plugin.sh
```

The archive is written under `dist/`, for example:

```text
dist/timemachine-0.4.0.zip
```

## Troubleshooting

Watch plugin, indexing, and queue logs:

```bash
journalctl -f -u volumio | grep -i "timemachine\|random\|queue\|replaceAndPlay\|addToQueue\|error\|exception"
```

Run the MPD count diagnostic from the plugin folder:

```bash
node tools/mpd-count.js
```
