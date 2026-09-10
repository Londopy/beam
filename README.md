# Beam

Send files and text between your devices, browser to browser, by scanning a
QR code. No accounts, no uploads, no server of your own. It is a handful of
static files (no build step) that run on GitHub Pages.

Open the page on one device, scan the QR code with another, and drop files in
either direction. Data travels over a direct WebRTC connection between the two
browsers; a tiny signaling server is only used to introduce them.

## Try it

Live demo: `https://londopy.github.io/beam/`

(Replace with your own Pages URL after deploying, see below.)

## Features

Connecting

* Host a room (QR code plus a typed code like `abcde-fghij`) or join one by
typing the code, pasting the link, or scanning the QR with the camera right
on the page (any browser with camera access; uses the native detector where
available and jsQR elsewhere).
* Several devices can join the same room. The host can send to one device or
to everyone.
* Optional PIN to join (shown next to the QR, never included in the link),
lock the room against new joins, disconnect individual devices, and a
device name you can edit.
* Optional stable room code: keep the same code and QR across reloads so a
printed or bookmarked link keeps working. New code rotates it.
* Tap the QR to enlarge it, tap the code to copy it, Share link on phones.
* Each connected device shows whether the link is direct, on the same
network, or going through a TURN relay.

Sending

* Works in both directions, including phone to desktop.
* Files, whole folders (drag and drop or "Choose a folder", relative paths
kept), plain text, links, and anything pasted with Ctrl+V anywhere on the
page, including images from the clipboard.
* Pause, resume, and cancel from either side. Files queue up if nothing is
connected yet. Live speed and time remaining. CRC32 checked on arrival and a
Delivered confirmation sent back. Failed, declined, or cancelled items get a
Send again button.
* Send clipboard button sends whatever is on the clipboard (text or an image).
* The tab title shows transfer progress and the screen stays awake while a
transfer runs (where the browser allows it).

Receiving

* Auto-accept, or an Accept / Decline prompt for each file.
* Save, Share (native share sheet on phones), Save as, Copy image, Open link,
Save all as zip, and Remove.
* Inline previews for images, video, audio, and small text files.
* Chromium desktop: choose a folder once and files stream straight to disk
with no memory limit.
* Optional automatic download when a file finishes, browser notifications
when the tab is in the background, and an optional chime.

Settings (its own page, `settings.html`, saved in localStorage)

* Device name, light / dark / system theme, PIN, stable code, auto-accept,
auto-download, previews, notifications, sound.
* Chunk size, a custom PeerJS signaling server (with a Test button), ICE /
TURN servers as JSON.
* Export and import settings as JSON, reset to defaults. Changes apply to an
open Beam tab immediately.
* Connection check: scans for VPNs, blocked UDP, unreachable STUN or TURN,
symmetric NAT, extensions that disable WebRTC, and runs a real loopback
connection through the relay. Produces a report you can copy.

## Deploy to GitHub Pages

1. Create a new repository and push these files to the `main` branch.
2. In the repository, open Settings, then Pages.
3. Under "Build and deployment" set Source to "GitHub Actions". The workflow
in `.github/workflows/pages.yml` publishes the site on every push to
`main`.

   If you prefer not to use Actions, set Source to "Deploy from a branch",
pick `main` and `/ (root)` instead. The `.nojekyll` file is already there
so Pages serves the files as-is.

4. After the first deploy the site is at
`https://<your-username>.github.io/<repo-name>/`. Paste that URL into the
"Try it" section above.

The site must be served over HTTPS (Pages does this) because the camera,
clipboard, and File System Access APIs require a secure context.

## How it works

* `index.html` loads PeerJS (WebRTC wrapper), qrcode.js (QR rendering), and
JSZip (Save all as zip) from cdnjs, and jsQR (QR scanning fallback) from
jsDelivr. `topo.js` draws the drifting contour-line background on a canvas. `common.js` holds the
settings storage and theme code shared with `settings.html`; `beam.css` is
the shared stylesheet.
* The host creates a PeerJS peer with a random 10-character id and shows a
QR code of `<page-url>#<id>`. A guest opens that URL, connects with a
reliable ordered data channel, and sends a `hello` message with its device
name and, if required, a SHA-256 hash of the room id and PIN.
* Every file transfer is: `meta` -> `accept` (or `decline`) -> binary chunks
-> `end` with a CRC32 -> `ack`. Control messages are JSON strings; file
data is raw ArrayBuffers on the same channel.
* By default the free public PeerJS server (`0.peerjs.com`) handles
signaling. You can point the page at your own PeerServer instance in
Settings; see "Self-hosting the signaling server" below.

## Limitations and caveats

* Cross-network connections use STUN first and fall back to the free public
Open Relay TURN server (openrelay.metered.ca). That relay is a community
service with no uptime promise; for anything important, add your own TURN
server under Settings > Connection.
* Except on Chromium desktop with a save folder set, received files are held
in memory until you tap Save. Very large files on a phone can crash the
tab. Stream-to-disk is the fix where available.
* Both tabs must stay open for the duration of a transfer. Closing a tab
drops the connection.
* The room code is the only thing protecting the room unless you enable the
PIN. Anyone with the link can connect while the room is open and unlocked.
* iOS needs a manual tap on Save; there is no automatic download.
* The public PeerJS server is a free community service with no uptime
promise. For anything important, self-host.

## Self-hosting the signaling server

Only connection setup goes through the signaling server, never file data.
To run your own:

&#x20;   npm install -g peer
    peerjs --port 9000 --path /beam


Put it behind HTTPS (Caddy, nginx, or a reverse proxy) and enter the host,
port, path, and key in Beam's Settings. A Docker image is also published as
`peerjs/peerjs-server`.

If you also need TURN, `coturn` is the usual choice. Add it to the ICE
servers JSON in Settings, for example:

&#x20;   \[
      { "urls": \["stun:stun.l.google.com:19302"] },
      { "urls": "turn:turn.example.com:3478", "username": "u", "credential": "p" }
    ]


## Repository layout

&#x20;   index.html                    the app
    settings.html                 the settings page
    common.js                     settings storage and theme, shared
    beam.css                      stylesheet, shared
    topo.js                       contour-line background
    diag.js                       connection check
    og.png                        link preview image
    manifest.webmanifest, sw.js   installable app shell
    icon.svg, icon-maskable.svg   app icons
    basic/index.html              the original one-way, one-file version
    .github/workflows/pages.yml   GitHub Pages deployment
    .nojekyll                     tells Pages not to run Jekyll
    LICENSE                       MIT
    CONTRIBUTING.md               how to propose changes
    SECURITY.md                   how to report a security issue


## Local development

There is no build step. Any static server works:

&#x20;   python3 -m http.server 8000


Then open `http://localhost:8000/`. To test between two devices on your LAN
you need HTTPS for the camera and clipboard APIs; the easiest route is to push
to GitHub Pages, or use a tool like `mkcert` to serve locally with a trusted
certificate.

## License

MIT. See `LICENSE`.

