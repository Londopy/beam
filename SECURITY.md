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
- Libraries are loaded from cdnjs. If you want to remove that trust
  dependency, download the three scripts into the repository and change the
  `<script src>` tags to local paths.

To report a vulnerability, open a GitHub issue with the label `security`, or
if it is sensitive, use the repository's private vulnerability reporting
feature under the Security tab if it is enabled. Please give a reasonable
amount of time for a fix before public disclosure.
