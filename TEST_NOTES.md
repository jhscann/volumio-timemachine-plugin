# Time Machine Test Notes

Use these checks on a real Volumio 4 system after installing the plugin.

## Install

```bash
cd /home/volumio/volumio-timemachine-plugin/timemachine
npm install
volumio plugin install
volumio vrestart
```

Confirm version:

```bash
cat /data/plugins/music_service/timemachine/package.json | grep -E '"name"|"version"|"prettyName"|"plugin_type"'
```

Expected: `0.4.0`.

## Configure And Index

1. Enable the plugin.
2. Open Time Machine settings.
3. Set `MPD library paths` to the correct MPD-relative roots.
4. Click **Save and rebuild MPD index**.

Expected:

- A toast confirms the index build started.
- Logs show the configured MPD paths and parsed counts.
- `/data/configuration/music_service/timemachine/library.json` exists.

## Browse

Open Browse -> Time Machine.

Expected:

- Decade rows appear.
- `Missing Year` appears.
- `Library Report` appears.
- Opening a decade shows random actions plus album/track browse actions.

## Playback

Test these flows from a decade with known content:

- Browse Albums -> open album -> play track.
- Browse Tracks -> play track.
- Play Random Tracks twice.
- Play Random Albums twice.

Expected:

- Playback starts.
- The visible queue updates.
- Current song metadata updates.
- Album art appears when Volumio can resolve it.
- Repeating random actions logs a new seed and usually a different order.

## Logs

General plugin logs:

```bash
journalctl -f -u volumio | grep -i "timemachine\|error\|exception"
```

Random playback logs:

```bash
journalctl -f -u volumio | grep -i "timemachine\|random\|selected first five\|replaceAndPlay\|addToQueue\|queue item\|error\|exception"
```

## Failure Bundle

If playback fails, capture:

- Volumio logs from the click through the failure.
- The random seed line.
- The selected first-five paths line.
- The first queue item submitted to Volumio.
- Whether audio started.
- Whether the visible queue changed.
- Whether current metadata and album art changed.
