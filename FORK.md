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

## The tools of the fork

The fork puts five tools into the browser itself and one more extension that prepares the
profile. They are built-in WebExtensions, they live in [`extensions/`](./extensions) and the
scripts of the build put them into the tree of Firefox, the same way as the extensions of
Mozilla do. They are always there, they cannot be uninstalled and they do not ask for any
permission of the site.

| The extension | What it does | The shortcut |
| --- | --- | --- |
| `librewolf-vot@librewolf.net` | Translates the videos of YouTube with the service of Yandex, the sound of the translation is played together with the video. The panel is on the page of the video. | `Alt+T` |
| `librewolf-colorpicker@librewolf.net` | Picks the color of a pixel of the page, it shows the color and copies it as `HEX`, `RGB` or `HSL`. The lens of the browser is shown while the color is picked. | `Alt+C` |
| `librewolf-screenshot@librewolf.net` | Cuts a part of the page out, it draws on it with the arrows, the frames, the markers, the blur and the text, and it saves it as a picture, as a pdf or as a single html file. The whole page is taken with a scroll. | `Alt+S` |
| `librewolf-mcp@librewolf.net` | The console of the agents. It is in the side panel of the browser, it shows the state of the connection with the local server of MCP, the log of the calls, and it takes the task of the agent by voice. | `Alt+M` |
| `librewolf-darkmode@librewolf.net` | The dark mode of every site, with the settings of the brightness and of the contrast and with the list of the exceptions. | `Alt+D` |
| `librewolf-profile@librewolf.net` | The setup of the profile: the bookmark of Hoppscotch and the state of the extension of Hoppscotch, it is turned off until the user turns it on. | — |

### The server of the agents

The console of the agents talks to a local server, the source of it is in
[`mcp-server/`](./mcp-server). The server speaks the Model Context Protocol on the standard
input and the standard output, so any agent of the command line can start it, and it listens
on `127.0.0.1:8977` for the browser.

```json
{
  "mcpServers": {
    "librewolf": {
      "command": "node",
      "args": ["/path/to/librewolf-source/mcp-server/server.js"]
    }
  }
}
```

The voice of the console is sent to a service of the speech to text, the address of it is
set in the console. The server of [whisper.cpp](https://github.com/ggerganov/whisper.cpp)
fits.

### The extensions of AMO

The policy of the browser in [`settings/distribution/policies.json`](./settings/distribution/policies.json)
installs the extensions of AMO: KeePassXC-Browser, Wappalyzer, Requestly, JSON Formatter,
Cookie-Editor and Sourcegraph are turned on, the extension of Hoppscotch is installed and
is turned off, the user turns it on with two clicks in the menu of the extensions.

### The settings of the user

The file [`librewolf.overrides.cfg`](./librewolf.overrides.cfg) is the file of the settings
that the user can change. It is read by the browser at every start. Put it in the profile of
the browser:

* Windows: `%USERPROFILE%\.librewolf\librewolf.overrides.cfg`
* Linux: `$XDG_CONFIG_HOME/librewolf/librewolf/librewolf.overrides.cfg`

It holds the video of the pages (WebGL, AV1 and VP9), the cookies, the sessions and the
local collections that are kept when the browser is closed, and the requests to the local
machine.

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

* A full Firefox build needs a lot of CPU time. The standard GitHub runners have
  four cores and 16 GB of RAM, the build fits on their disk (145 GB) but takes many
  hours and can run into the timeout of the job. Set `BUILD_RUNNER_JSON` to a
  self-hosted or a larger runner to make it faster.
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
