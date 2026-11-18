# This is a fork of LibreWolf

This repository is a **fork of [LibreWolf](https://codeberg.org/librewolf/source)**, mirrored
from Codeberg and continued here on GitHub.

## Upstream

| | Repository |
| --- | --- |
| Upstream (canonical) | <https://codeberg.org/librewolf/source> |
| This fork | <https://github.com/KosenkovPro/librewolf-source> |
| Build system (upstream) | <https://codeberg.org/librewolf/bsys6> |
| Build system (this fork) | <https://github.com/KosenkovPro/librewolf-bsys6> |

Upstream LibreWolf moved from GitLab to Codeberg. The old GitHub repositories under the
`librewolf-community` organisation are archived and no longer receive development.

## Remotes

| Remote | URL | Purpose |
| --- | --- | --- |
| `origin` | `https://github.com/KosenkovPro/librewolf-source.git` | This fork — push here |
| `upstream` | `https://codeberg.org/librewolf/source.git` | Upstream LibreWolf — pull from here |

## Syncing with upstream

```bash
# Fetch upstream commits
git fetch upstream

# See what changed upstream
git log --oneline HEAD..upstream/main

# Merge upstream into your working branch
git merge upstream/main

# ...or rebase your work on top of upstream
git rebase upstream/main

# Push the result to this fork
git push origin main
```

To track upstream automatically, GitHub Actions can open a pull request on a schedule —
see [`.github/workflows/sync-upstream.yml`](.github/workflows/sync-upstream.yml).

## Building

The build instructions in [`README.md`](./README.md) still apply. Upstream builds with
Docker images hosted on `librewolf.dev`; this fork's GitHub Actions workflows build the
same images from the Dockerfiles in [`docker/`](./docker) and publish them to GHCR.

```bash
git clone --recursive https://github.com/KosenkovPro/librewolf-source.git
cd librewolf-source
make dir && make bootstrap
make build && make package
```

## CI on GitHub Actions

The upstream CI runs on Forgejo with self-hosted runners, a package registry and an S3
bucket. This fork ports it to GitHub Actions.

| Workflow | What it does |
| --- | --- |
| [`source-release.yml`](.github/workflows/source-release.yml) | Builds the LibreWolf source archive and publishes it as a GitHub release. |
| [`build-images.yml`](.github/workflows/build-images.yml) | Builds the Docker build environments (`docker/Dockerfile.*`) and pushes them to `ghcr.io/kosenkovpro/buildenv:<target>`. |
| [`source-target-test.yml`](.github/workflows/source-target-test.yml) | Builds the browser for Linux, Windows and macOS to test the patches. |
| [`ci.yml`](.github/workflows/ci.yml) | Checks the shell scripts, the Makefile and the workflow files. |
| [`sync-upstream.yml`](.github/workflows/sync-upstream.yml) | Opens a pull request with the changes of the upstream. |

### Where the artefacts live

The upstream Forgejo instance has a package registry, an S3 bucket and a CDN. GitHub has
none of them for a personal account, so this fork uses GitHub releases instead:

* the source archive is an asset of the release `librewolf-<version>-<release>` in
  `KosenkovPro/librewolf-source`;
* the build environments are container images in the GitHub container registry;
* the packages are the assets of the release in `KosenkovPro/librewolf-bsys6`.

The Dockerfiles take a `SOURCE_URL` build argument, so the images fetch the source archive
from a GitHub release instead of the package registry. The signature verification is
skipped when no public key is given.

### Repository settings

| Name | Kind | Purpose |
| --- | --- | --- |
| `BUILD_RUNNER_JSON` | variable | The runner for the build jobs, for example `["self-hosted","linux","x64"]`. Defaults to `["ubuntu-latest"]`. |
| `GHCR_OWNER` | variable | The owner of the images in the container registry. Defaults to `kosenkovpro`. |
| `SIGNING_KEY` | secret | The GPG key used to sign the source archive. |
| `PUBKEY` | variable | The public key the images use to verify the source archive. |
| `DOCKER_GPG_KEY` | variable | The key of the Docker package repository, it is optional. |
| `OSSIGN_ASC_KEY` | variable | The key of the OSSign package repository, it is optional. |

### The order of the workflows

1. Run **Create Source Code Release** — it publishes the source archive as a GitHub
   release.
2. Run **Docker Image** — it builds the build environments from that source archive.
3. Run **Create Test Builds** — it builds the browser with the images from step 2.

### What is not ported

* A full Firefox build needs about 100 GB of disk and a lot of CPU time. The standard
  GitHub runners have about 14 GB, so the build jobs need a bigger runner — set
  `BUILD_RUNNER_JSON` to a self-hosted or a larger runner. The source release fits on a
  standard runner.
* The auto-update distribution needs the upstream S3 bucket and CDN, the update manifests
  are published as release assets instead.

### The upstream workflows that are not ported

| Upstream workflow | Why |
| --- | --- |
| `ubo-assets.yaml` | It uploads `assets/uBOAssets.json` to the upstream S3 bucket, the browser downloads it from the upstream CDN. Without a CDN there is nowhere to publish it. |

## Licence

LibreWolf is licensed under the **Mozilla Public License 2.0** (see [`LICENSE`](./LICENSE)).
This fork keeps that licence and the upstream copyright notices intact, as MPL-2.0 requires.

Changes made in this fork remain under MPL-2.0. The name and logo "LibreWolf" remain the
property of the LibreWolf project — see the trademark and licensing notes at
<https://librewolf.dev/librewolf/source>.
