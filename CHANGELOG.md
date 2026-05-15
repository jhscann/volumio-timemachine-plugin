# Changelog

## 0.4.0

- Package Time Machine for Volumio 4 Bookworm.
- Set plugin metadata to Bookworm, Node 20+, and Volumio 4+.
- Clean README and handover material for current users.
- Keep existing MPD indexing, browse, and random playback behavior unchanged.

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

- Route random playback through Volumio queue endpoints.
- Keep raw MPD-relative paths for playback.

## 0.3.3

- Improve random ordering.

## 0.3.2

- Added real icon files.
- Added nonce-based random action URIs.

## 0.3.1

- Improve album-folder track playback.

## 0.3.0

- Build around MPD metadata and manual indexing.

## 0.1.0

- Early prototype.
