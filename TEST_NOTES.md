# Time Machine Test Notes

Run these tests on the real Volumio box after a clean install and plugin enablement.

## Install And Index

1. Clean old install and cache.

```bash
sudo rm -rf /data/plugins/music_service/timemachine
sudo rm -rf /data/configuration/music_service/timemachine
sudo systemctl restart volumio
```

2. Install from this repository.

```bash
cd /home/volumio/volumio-timemachine-plugin/timemachine
npm install
volumio plugin install
volumio vrestart
```

3. Confirm plugin version.

```bash
cat /data/plugins/music_service/timemachine/package.json | grep -E '"name"|"version"|"prettyName"|"plugin_type"'
```

Expected: `version` is `0.3.4`.

4. Enable the plugin, open settings, and click **Save and rebuild MPD index**.

Expected:

- Toast says index build started.
- Log shows configured MPD paths.
- Log shows MPD response bytes, raw file-line counts, parsed track counts, album count, decade counts, and completion.
- `/data/configuration/music_service/timemachine/library.json` exists.

## Browse Source

Open Volumio Browse.

Expected:

- Source named `Time Machine` appears.
- It has a real icon.
- Opening it shows decade rows, `Missing Year`, and `Library Report`.
- Opening a decade opens action rows rather than adding the decade row to the queue.

Failure logs to capture:

```bash
journalctl -f -u volumio | grep -i "timemachine\|handleBrowseUri\|Exploding uri\|error\|exception"
```

## Browse Albums And Tracks

1. Open `Time Machine`.
2. Open a decade with known content, such as `1970s`.
3. Open `Browse Albums`.
4. Open an album.
5. Click a track.

Expected:

- Albums list opens.
- Album track list opens.
- Track starts playing.
- Current song metadata updates.
- Album art appears when Volumio can resolve it.

This is the known-good reference behavior for random playback.

## Browse Tracks

1. Open a decade.
2. Open `Browse Tracks`.
3. Click a track.

Expected:

- Track list opens.
- Track starts playing through MPD.
- Current song metadata and album art behave like normal MPD library playback.

## Random Tracks

1. Open a decade.
2. Click `Play Random Tracks`.
3. Note the first five paths from logs.
4. Return to the decade and click `Play Random Tracks` again.

Expected:

- Playback starts.
- Volumio visible queue updates.
- Current song metadata updates.
- Album art appears when Volumio can resolve it.
- The second click logs a different seed and normally a different first-five order.
- Playback `uri` values in logs are raw MPD paths, not URL-encoded paths.

Logs to capture:

```bash
journalctl -f -u volumio | grep -i "timemachine\|random-tracks seed\|selected first five\|replaceAndPlay\|addToQueue\|queue item\|error\|exception"
```

## Random Albums

1. Open a decade.
2. Click `Play Random Albums`.
3. Inspect the visible queue.

Expected:

- Playback starts.
- Queue contains complete albums.
- Tracks inside each selected album are in disc/track order.
- Volumio visible queue, current song metadata, and album art update.
- Repeating the action logs a different seed and usually different selected albums.

Logs to capture:

```bash
journalctl -f -u volumio | grep -i "timemachine\|random-albums seed\|selected first five\|replaceAndPlay\|addToQueue\|queue item\|error\|exception"
```

## Missing Year

1. Open `Missing Year`.
2. Confirm `Browse Albums` and `Browse Tracks` show no-year content.
3. With `includeMissingYear=false`, click random actions.
4. Change `includeMissingYear=true`, rebuild, and repeat.

Expected:

- Browse views show missing-year content.
- Random playback is blocked or empty when `includeMissingYear=false`.
- Random playback works when `includeMissingYear=true`.

## Library Report

Open `Library Report`.

Expected:

- Shows source, last indexed timestamp, MPD paths, track count, album count, decade counts, and missing-year count.

## Failure Bundle

If random playback fails, capture:

- Volumio log lines from the click through the failure.
- The random seed line.
- The first-five selected MPD paths line.
- The first `replaceAndPlay queue item` line.
- Any `replaceAndPlay result` or `addToQueue result` lines.
- Whether the actual MPD audio started.
- Whether the visible Volumio queue changed.
- Whether current-song metadata and album art changed.
