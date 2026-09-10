# Changelog

All notable changes to Beam. Dates are when the change landed on `main`.

## 1.3.0 - 2026-09-10

Added
- Offline pairing: connect with no signaling server and no internet. Host
  shows an offer QR, guest scans it and shows a reply QR, host scans that.
  Codes are about 250 characters and can be pasted as text. Works even when
  the PeerJS library fails to load.
- Ping button on each connected device showing round-trip time; guests see it
  in the footer.
- Save QR: downloads the room QR, code, PIN, and link as a PNG.
- Android share target: share files or links from any app into the installed
  Beam and they land in the Send queue.
- A hidden summit mode. Climbers know the code.

## 1.2.1 - 2026-09-10

Added
- TURN credentials URL setting: Beam fetches short-lived relay credentials
  from a provider endpoint (Metered, Twilio, Xirsys, or your own) each time a
  room is created or joined, and the connection check verifies it.

Changed
- Removed the Open Relay server from the default ICE list; it no longer
  allocates. Saved settings that still contain it are cleaned up.
- NAT type test now compares mappings from one socket, so cone NATs are not
  misreported as symmetric.
- Public address lookup falls back to a second service when the first is
  blocked by an ad blocker.

## 1.2.0 - 2026-09-10

Added
- Connection check under Settings > Check: scans for VPNs, blocked UDP,
  unreachable STUN or TURN, symmetric NAT, and extensions that disable
  WebRTC, then runs real loopback connections (direct and relay-only) and
  produces a copyable report.
- Link preview banner (`og.png` with Open Graph and Twitter card tags) so the
  URL shows a card when texted or posted.
- Installable as an app: web manifest, icons, and a small service worker that
  caches the shell. Transfers never touch the cache.
- "Made by Londo!" credit in the footer.

## 1.1.0 - 2026-09-10

Added
- QR scanning right on the page, in every browser: native BarcodeDetector when
  available, jsQR otherwise. Viewfinder with corner brackets, sweeping laser,
  lock-on flash, switch camera, and torch where the phone exposes it.
- Topographic contour background drawn on a canvas from layered noise. Drifts
  slowly, pauses in background tabs, static under reduced-motion.
- New type: Bricolage Grotesque, IBM Plex Sans, IBM Plex Mono. Glass panels.

Changed
- Free Open Relay TURN server added to the default ICE list so devices on
  different networks fall back to a relay instead of hanging. Saved
  STUN-only defaults are migrated.
- Clear status messages when the signaling server is unreachable or the
  peer-to-peer path fails, instead of "Connecting" forever.

## 1.0.0 - 2026-09-10

Added
- Settings moved to its own page with auto-save, light/dark/system theme,
  signaling server test, export/import/reset. Changes apply to an open Beam
  tab immediately.
- Stable room code option, tap-to-enlarge QR, tap-to-copy code, Share link,
  Send clipboard, Send again on failed items, auto-download, chime, wake lock
  during transfers, progress in the tab title, direct/relay indicator per
  device, whole-page drop overlay.

Fixed
- Files pasted before a guest finished connecting were queued forever.
- Cancelling a file before the receiver pressed Accept left a dead prompt.
- A rejected join (locked room) was overwritten by a generic "Disconnected".
- Write errors when streaming to a folder were silently ignored.
- TLS setting for a custom signaling host broke non-443 ports.
- Clipboard failures threw unhandled errors.
- The QR library failing to load took the whole page down.

## 0.1.0

- Initial release: single `index.html`, host or join by QR or code, files,
  folders, text, PIN, lock, previews, zip, save-to-folder. Kept as
  `basic/index.html`.
