# Contributing

Thanks for taking a look.

- Keep it dependency-free static files. `index.html` and `settings.html`
  share `beam.css` and `common.js`; libraries come from CDNs. No build step,
  no framework, no bundler.
- Add a line to `CHANGELOG.md` under an "Unreleased" heading for anything a
  user would notice.
- Plain ASCII only. No zero-width or non-breaking characters in any file.
- Test on at least two real devices before opening a pull request, ideally
  one phone and one desktop on different networks.
- Describe what you changed and why in the pull request. Screenshots of
  before and after help for UI changes.
- Bug reports: include browser, OS, whether both devices were on the same
  network, and what the status line said. Paste the report from
  Settings > Check > Copy report; it pinpoints most connection failures.

By contributing you agree that your changes are released under the MIT
license in `LICENSE`.
