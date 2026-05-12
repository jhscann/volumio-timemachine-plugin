# Time Machine Handover

## Current State

This repository was organised from `timemachine-0.3.4.zip`. The installable Volumio plugin is in `timemachine/`.

Current plugin version:

```text
0.3.5
```

The plugin is a Volumio 3 `music_service` source named **Time Machine**. It builds a manual cache from MPD metadata and exposes decade-based browse and random playback actions.

## Development History

`v0.1.0` used direct filesystem crawling of:

```text
/mnt/NAS/NAS/Flac
/mnt/NAS/NAS/Vinyl
```

It also used `metaflac` for FLAC metadata. That failed on the full library: the Volumio spinner ran indefinitely, no `library.json` cache was created, and the manual scanner kept running until cancelled. That approach should not be revived.

`v0.3.0` rebuilt the plugin around MPD metadata. It avoided filesystem crawling, avoided `metaflac`, used a manual settings rebuild, and wrote a local cache.

`v0.3.1` experimented with Volumio-style queue items. Album-folder playback worked, and selecting a track inside an album folder started playback with album art.

`v0.3.2` added real icon files and random nonces in action URIs, but random order was still stale.

`v0.3.3` fixed fresh randomness by directly manipulating the MPD queue. That produced different random orders, but Volumio's visible queue, current song metadata, and album art did not update correctly.

`v0.3.4` attempts to preserve fresh randomness while routing random playback through Volumio's queue/state layer with local REST calls to `replaceAndPlay` and `addToQueue`.

`v0.3.5` keeps the `v0.3.4` behavior and adds diagnostic logging around random seeds, selected MPD paths, queue item shape, and local Volumio queue API results. It also moves the project into a public GitHub repository with validation and packaging scripts.

## Known Good Behavior

- Raw MPD protocol over `127.0.0.1:6600` supports `listallinfo`, even though `mpc listallinfo` failed on the target system.
- MPD provides useful `file`, `Title`, `Album`, `Date`, `Artist`, `AlbumArtist`, `Track`, `Disc`, `Time`, and `duration` metadata.
- MPD `file` values are the correct playable paths.
- Album-folder track rows shaped as MPD song items work and show album art on the target system.

Working track item shape:

```js
{
  service: 'mpd',
  type: 'song',
  title: track.title,
  artist: track.artist,
  album: track.album,
  icon: 'fa fa-music',
  uri: track.mpdPath,
  tracknumber: track.trackNumber,
  discnumber: track.discNumber
}
```

## Current Known Issue

Random playback must satisfy both requirements:

- produce a fresh random order on every click
- update Volumio's visible queue, current song metadata, and album art

`v0.3.4` has the right intent but still needs testing on real Volumio. This handover adds logging around the random seed, first selected MPD paths, queue item shape, and REST queue results.

## Constraints

- Do not reintroduce direct recursive filesystem crawling.
- Do not call `metaflac` for every FLAC from inside Volumio.
- Do not URL-encode MPD playback paths.
- Do not rely only on Font Awesome for the Browse source icon.
- Keep real icon files: `timemachine/icon.png` and `timemachine/icon-v032.png`.
- Keep the plugin folder installable by Volumio.
- Final playback validation must happen on the actual Volumio box.

## MPD Paths

Linux filesystem paths:

```text
/mnt/NAS/NAS/Flac
/mnt/NAS/NAS/Vinyl
```

Playable MPD paths:

```text
NAS/NAS/Flac
NAS/NAS/Vinyl
```

Example valid raw MPD playback path:

```text
NAS/NAS/Vinyl/Boards Of Canada - Tape 5/01 - Tape 5.flac
```

## Code Review Notes

- Settings save persists `mpdPaths`, `maxRandomTracks`, `randomAlbumsCount`, and `includeMissingYear`, then starts `buildIndex()` asynchronously.
- Top-level `UIConfig.json.sections` is used, matching the working Volumio UI shape.
- Root, decade, missing-year, report, browse-album, browse-track, and album rows are marked browse-only.
- Random action rows are currently marked browse-only and handled through `handleBrowseUri()`, so clicking them triggers plugin code rather than Volumio treating them as normal queueable folders.
- Random action URIs include a nonce, and `URI_VERSION` is currently `v7`, which reduces stale browse/explode cache risk.
- Random generation uses a fresh seed made from a crypto nonce, current time, and high-resolution process time.
- Random queue items are generated with `trackToMpdItem()`, the same helper used for working album-folder track rows.
- Random playback uses Volumio's local REST API rather than direct MPD queue manipulation.
- `replaceMpdQueue()` still exists in code as a direct-MPD fallback/helper but is not called by random playback.
- There is no `metaflac` usage and no recursive library crawl in the plugin. `fs` is used for cache directory/file access only.
- MPD playback `uri` values remain raw MPD paths. Album art hint URLs URL-encode the query value for HTTP transport, not the playback URI.
- The Browse source references a real icon through `/albumart?sourceicon=music_service/timemachine/icon.png`.

## Suggested Next Code Change

The smallest robust next change depends on real Volumio logs.

First test the current `replaceAndPlay` plus sequential `addToQueue` path. If Volumio's visible queue and current-song state update correctly, keep this path and only polish error handling.

If the visible queue does not populate or metadata/artwork still fails, the next smallest experiment is to avoid local REST and use the Volumio command router queue APIs directly from the plugin, while submitting the exact same `trackToMpdItem()` object shape that works in album folders. The critical invariant is that random generation must happen immediately on click and the submitted items must keep raw MPD `uri` paths.
