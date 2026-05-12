# Changelog

## 0.3.5

- Move the project into a public GitHub repository.
- Add validation and packaging scripts.
- Add diagnostic logging for random playback:
  - generated random seed
  - first five selected MPD paths
  - queue item shape submitted to Volumio
  - `replaceAndPlay` and `addToQueue` results
- Keep random playback behavior otherwise unchanged from `0.3.4`.

## 0.3.4

- Attempt to route random playback through Volumio's queue/state layer using local REST queue endpoints.
- Preserve fresh random ordering from `0.3.3`.
- Keep raw MPD-relative paths for playback.

## 0.3.3

- Fixed stale random ordering by directly manipulating MPD.
- Known issue: Volumio visible queue, current song metadata, and album art did not update correctly.

## 0.3.2

- Added real icon files.
- Added nonce-based random action URIs.
- Known issue: random order could still repeat.

## 0.3.1

- Confirmed album-folder track playback worked with MPD song item shape.
- Random playback still had state/artwork issues.

## 0.3.0

- Rebuilt around MPD metadata and manual indexing.
- Removed direct filesystem crawling and `metaflac` scanning.

## 0.1.0

- Early direct filesystem scanner prototype.
- Abandoned because recursive crawling and per-file metadata probing were too heavy for the target Volumio system.
