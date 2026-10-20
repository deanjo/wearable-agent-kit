# Garmin protocol provenance

This is an unofficial, narrow JavaScript reconstruction of request behavior from cyberjunky/python-garminconnect, MIT licensed.

- Fixed source: https://github.com/cyberjunky/python-garminconnect/tree/5ddb9eecbc938b83ddb27a8f57552c556f112310
- Snapshot package version: 0.3.19. The version label is not a claim that this commit equals the 0.3.19 release tag.
- Upstream copyright and license: UPSTREAM-LICENSE in this directory.
- Login/MFA: client/sso.py; DI exchange/refresh: client/session.py; client constants: client/constants.py; headers: client/transport.py; daily heart rate and activities: api/health.py and api/activities.py.

Local changes: fixed destination allowlist; redirects rejected; no TLS impersonation, certificate bypass, client rotation or browser-cookie fallback; bounded activity pages; minimal projections; fail-closed refresh; local encrypted persistence. Endpoint availability and service permission are not granted by the MIT license.

Only international Garmin Connect hosts are implemented. China-region support is not implemented. Travel location does not choose account region or the date boundary.

The imported core was previously exercised in a separate private deployment. This repository's local runtime has only synthetic/mock-transport acceptance until a user independently authenticates. No private deployment, account, session, logs or health records are included.
