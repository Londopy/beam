# Security

Beam moves files directly between browsers over WebRTC. Data channels are
encrypted with DTLS by default, and the signaling server sees only connection
metadata, never file contents.

Things to know:

- The room code in the link is the main secret. Anyone who has the link can
  join an open, unlocked room. Use the PIN option and lock the room after your
  devices connect if that matters to you.
- Your IP address is visible to the other peer, as with any WebRTC
  connection.
- When a direct connection is not possible and a TURN relay is configured,
  traffic goes through that relay. It forwards encrypted packets and cannot
  read them, but it does see both devices' addresses. A TURN credentials URL
  containing an API key is visible to anyone who reads the page's settings in
  their own browser only; it is never sent to other peers. Restrict the key
  to your domain at the provider anyway.
- The connection check contacts `cloudflare.com/cdn-cgi/trace` once to learn
  your public web address. Nothing else leaves the browser during the check.
- Libraries are loaded from cdnjs (PeerJS, qrcode.js, JSZip) and jsDelivr
  (jsQR). If you want to remove that trust dependency, download the scripts
  into the repository and change the `<script src>` tags to local paths.
- The service worker caches only Beam's own files, never transferred data.
  Files shared into the app from the Android share sheet are parked in a
  local cache until the page picks them up, then deleted.
- Offline pairing codes contain the ICE credentials and DTLS fingerprint for
  one connection. They are single-use and expire as soon as the pairing
  completes or the page is closed, but treat them like a room link while the
  QR is on screen.

To report a vulnerability, open a GitHub issue with the label `security`, or
if it is sensitive, use the repository's private vulnerability reporting
feature under the Security tab if it is enabled. Please give a reasonable
amount of time for a fix before public disclosure.
