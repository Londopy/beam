# Beam

Send files and text between your devices, browser to browser, by scanning a
QR code. No accounts, no uploads, no server of your own. It is a single
`index.html` that runs on GitHub Pages.

Open the page on one device, scan the QR code with another, and drop files in
either direction. Data travels over a direct WebRTC connection between the two
browsers; a tiny signaling server is only used to introduce them.

## Try it

Live demo: `https://londopy.github.io/beam/`

(Replace with your own Pages URL after deploying, see below.)

## Features

Connecting

* Host a room (QR code plus a typed code like `abcde-fghij`) or join one by
typing the code, pasting the link, or scanning a QR with the camera
(Chromium on Android and desktop).
* Several devices can join the same room. The host can send to one device or
to everyone.
* Optional PIN to join (shown next to the QR, never included in the link),
lock the room against new joins, disconnect individual devices, and a
device name you can edit.

Sending

* Works in both directions, including phone to desktop.
* Files, whole folders (drag and drop or "Choose a folder", relative paths
kept), plain text, links, and anything pasted with Ctrl+V anywhere on the
page, including images from the clipboard.
* Pause, resume, and cancel from either side. Files queue up if nothing is
connected yet. Live speed and time remaining. CRC32 checked on arrival and a
Delivered confirmation sent back.

Receiving

* Auto-accept, or an Accept / Decline prompt for each file.
* Save, Share (native share sheet on phones), Save as, Copy image, Open link,
Save all as zip, and Remove.
* Inline previews for images, video, audio, and small text files.
* Chromium desktop: choose a folder once and files stream straight to disk
with no memory limit.
* Browser notifications when the tab is in the background.

Settings (saved in localStorage)

* Chunk size, a custom PeerJS signaling server, ICE / TURN servers as JSON.
* Follows the system light / dark theme.

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

* `index.html` loads three libraries from cdnjs: PeerJS (WebRTC wrapper),
qrcode.js (QR rendering), and JSZip (Save all as zip).
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

* Cross-network connections rely on STUN. Devices behind a symmetric NAT or a
strict corporate firewall may fail to connect. Add a TURN server under
Settings > ICE servers to fix that.
* Except on Chromium desktop with a save folder set, received files are held
in memory until you tap Save. Very large files on a phone can crash the
tab. Stream-to-disk is the fix where available.
* Both tabs must stay open for the duration of a transfer. Closing a tab
drops the connection.
* The room code is the only thing protecting the room unless you enable the
PIN. Anyone with the link can connect while the room is open and unlocked.
* Safari on iOS does not support camera QR scanning inside the page; use the
system camera app, which opens the link directly. iOS also needs a manual
tap on Save; there is no automatic download.
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

&#x20;   index.html                    the full app
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

