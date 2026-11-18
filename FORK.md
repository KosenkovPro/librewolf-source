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

## Licence

LibreWolf is licensed under the **Mozilla Public License 2.0** (see [`LICENSE`](./LICENSE)).
This fork keeps that licence and the upstream copyright notices intact, as MPL-2.0 requires.

Changes made in this fork remain under MPL-2.0. The name and logo "LibreWolf" remain the
property of the LibreWolf project — see the trademark and licensing notes at
<https://librewolf.dev/librewolf/source>.
