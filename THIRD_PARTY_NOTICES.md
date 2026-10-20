# Third-party notices

## Garmin protocol reference

Portions of the Garmin request reconstruction derive from cyberjunky/python-garminconnect, MIT License, copyright 2020–2026 Ron Klinkien.

- Fixed source commit: [5ddb9eecbc938b83ddb27a8f57552c556f112310](https://github.com/cyberjunky/python-garminconnect/tree/5ddb9eecbc938b83ddb27a8f57552c556f112310)
- Snapshot package version: 0.3.19; this is not asserted to match the release tag.
- Full preserved license: [UPSTREAM-LICENSE](src/providers/garmin/UPSTREAM-LICENSE)
- Mapping and modifications: [PROVENANCE.md](src/providers/garmin/PROVENANCE.md)

Garmin and WHOOP are their respective owners' trademarks. This project is not affiliated with or endorsed by either provider. Code licensing does not authorize access to a provider service or override its terms.

## WHOOP

The WHOOP implementation uses official public API/OAuth behavior. No WHOOP SDK code, developer secret, private service configuration or proprietary application code is included. Review current [WHOOP API terms](https://developer.whoop.com/api-terms-of-use/) before use.


## Archify architecture documentation

The bilingual architecture HTML and static SVG/PNG diagrams in `docs/architecture/` were generated using [Archify](https://github.com/tt-a1i/archify), pinned to commit `25cf37080fc8b1dbe758a4efc3935b55f3327083` (3.2.0). Archify code/template portions are MIT-licensed, copyright (c) 2026 tt-a1i (Archify) and (c) 2025 Cocoon AI. The full notice is retained in [ARCHIFY-LICENSE.txt](docs/architecture/ARCHIFY-LICENSE.txt).

The HTML embeds JetBrains Mono font subsets under SIL Open Font License 1.1; its license is embedded in the HTML and retained in [JetBrainsMono-OFL.txt](docs/architecture/JetBrainsMono-OFL.txt). Static SVGs use system font fallbacks and embed no font files. No third-party brand-mark assets were added. These documentation artifacts add no runtime dependencies to Wearable Agent Kit.

双语架构图使用固定版本 Archify 生成，MIT 版权与字体 OFL 完整声明见以上文件；不会增加项目运行时依赖。
