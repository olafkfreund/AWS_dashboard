# NixOS & Development Shell

This project includes first-class support for NixOS and Nix-based systems using Nix Flakes and `devenv`.

## Prerequisites

Ensure you have Nix installed with flakes enabled. If you are on NixOS, this is enabled by default. On other systems:

```bash
# Enable flakes in ~/.config/nix/nix.conf
experimental-features = nix-command flakes
```

---

## Devenv Shell (`devenv.nix`)

The development environment is configured declaratively in `devenv.nix`. It provides:
1. **Node.js 20** with NPM pre-loaded.
2. **AWS CLI v2** for credential and profile validation.
3. A background process worker running the Node.js backend.

### Commands

To enter the shell manually:
```bash
devenv shell
```

To run the backend server in the background (using `process-compose` TUI):
```bash
devenv up
```

---

## Nix Flake Shell (`flake.nix`)

For users who do not want to install `devenv` globally, the shell is exposed via a standard Nix Flake shell.

To enter using vanilla Nix:
```bash
nix develop
```

This imports all of the dependencies defined in `devenv.nix` in an isolated development shell.

---

## Direnv Integration

The project includes an `.envrc` configuration that automatically loads the Nix environment whenever you navigate into the project directory:

```bash
# Authorize direnv once
direnv allow
```

This loads Node.js and AWS CLI automatically into your active terminal session.
