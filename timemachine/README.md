# Time Machine

Time Machine is a Volumio 4 music service plugin for browsing an MPD-indexed
local or NAS music library by release decade.

## What It Adds

The Volumio Browse view gains a **Time Machine** source with decade folders,
random track playback, random album playback, album browsing, track browsing,
Missing Year, and Library Report views.

## Configure

Set `MPD library paths` in the plugin settings to comma-separated MPD-relative
paths.

Example:

```text
NAS/NAS/Flac,NAS/NAS/Vinyl
```

To discover likely paths on the Volumio box:

```bash
mpc listall | awk -F/ 'NF>=4 {print $1"/"$2"/"$3; next} NF>=2 {print $1"/"$2}' | sort | uniq -c | sort -nr | head -30
```

Then save settings and run **Save and rebuild MPD index**.

## Install From GitHub

SSH into your Volumio 4 box, then run:

```bash
cd /home/volumio
git clone https://github.com/jhscann/volumio-timemachine-plugin.git
cd volumio-timemachine-plugin/timemachine
npm install
volumio plugin install
volumio vrestart
```

Confirm version:

```bash
cat /data/plugins/music_service/timemachine/package.json | grep -E '"name"|"version"|"prettyName"|"plugin_type"'
```

## Diagnostics

Count MPD records from the configured default paths:

```bash
node tools/mpd-count.js
```

Watch plugin logs:

```bash
journalctl -f -u volumio | grep -i "timemachine\|random\|queue\|error\|exception"
```
