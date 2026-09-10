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
- When a direct connection is not possible, traffic goes through a TURN
  relay (the free Open Relay server by default). The relay forwards encrypted
  packets and cannot read them, but it does see both devices' addresses. Run
  your own TURN server (Settings > Connection) if that matters to you.
- The connection check contacts `cloudflare.com/cdn-cgi/trace` once to learn
  your public web address. Nothing else leaves the browser during the check.
- Libraries are loaded from cdnjs (PeerJS, qrcode.js, JSZip) and jsDelivr
  (jsQR). If you want to remove that trust dependency, download the scripts
  into the repository and change the `<script src>` tags to local paths.
- The service worker caches only Beam's own files, never transferred data.

To report a vulnerability, open a GitHub issue with the label `security`, or
if it is sensitive, use the repository's private vulnerability reporting
feature under the Security tab if it is enabled. Please give a reasonable
amount of time for a fix before public disclosure.
