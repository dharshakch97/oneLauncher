# Create releases

## Versions

`package.json` defines both `version` and `androidVersionCode`; Gradle reads them.
Every published update needs a higher Android version code and the same key.
Versions use `0.3.1-beta.1` or `0.3.1`; tags add a leading `v`.

```sh
npm run version:release -- 0.3.1-beta.1
```

This updates the package and lockfile and increments the Android code. Add a
matching version heading to `CHANGELOG.md`, check and commit before tagging.

## Signing

Set these environment variables securely:

| Variable | Value |
| --- | --- |
| `ONELAUNCHER_KEYSTORE_FILE` | Absolute private keystore path |
| `ONELAUNCHER_STORE_PASSWORD` | Store password |
| `ONELAUNCHER_KEY_ALIAS` | Key alias |
| `ONELAUNCHER_KEY_PASSWORD` | Key password |

For a new project's key, use the JDK's interactive tool:

```sh
keytool -genkeypair -v -keystore /private/path/onelauncher-release.jks \
  -alias onelauncher -keyalg RSA -keysize 3072 -validity 10000
```

For this repository keep using the existing release key. Never generate a new key
for an update. Back up the key and passwords securely in a separate location;
losing them prevents compatible APK updates. Never commit them. The shared
`android/app/debug.keystore` is for development only. Without signing variables
Gradle builds unsigned; partial configuration fails explicitly.

```sh
npm ci
npm run lint
npm test -- --watchman=false
npm run test:android
npm run build:release
```

The release script validates configuration, builds, verifies with `apksigner`,
and writes a versioned APK and SHA-256 file to ignored `dist/`. Test signed APKs
on an emulator/test TV. They cannot update early private/debug builds; read the
[update guide](INSTALLATION.md#update).

## GitHub Actions

Configure these repository **Actions secrets** once:

- `ANDROID_KEYSTORE_BASE64`: base64 of the private keystore.
- `ANDROID_STORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`

The Release workflow restores the key in the runner's temporary directory,
checks version/tag/changelog agreement, runs tests, builds a signed APK and
publishes it with a checksum. Tags containing `-` are prereleases; stable tags
produce stable releases.

```sh
git add package.json package-lock.json CHANGELOG.md
git commit -m "Release 0.3.1-beta.1"
git push origin main
git tag -a v0.3.1-beta.1 -m "oneLauncher 0.3.1-beta.1"
git push origin v0.3.1-beta.1
```

Watch the **Release** workflow, then inspect the release and download checksum.
Do not move or reuse published tags. Fix failed versions in a new version/tag.
Forks require their own secrets/key and cannot produce compatible updates to
this repository's releases.

For manual publishing, build locally and use `gh release create` with the tag,
versioned APK, checksum and reviewed notes. Do not manually publish and trigger
the tag workflow for the same version.
