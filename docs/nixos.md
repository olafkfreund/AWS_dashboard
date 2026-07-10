# Nix Development Environment

This project utilizes Nix Flakes and devenv to provide a declarative, reproducible development environment. 

## Why Nix is Chosen

Traditional development setups often suffer from environment drift, where differences in local operating systems, Node.js runtimes, and global CLI versions lead to subtle bugs or deployment failures. Nix solves this by managing dependencies at a low level, constructing isolated environments that behave identically across all platforms and CI/CD runners.

Nix provides the following key benefits:

1. **Declarative Reproducibility**: The exact version of Node.js 22, the AWS CLI, and utility packages like just are locked down in devenv.nix. Any developer entering the repository will run identical binary toolchains.
2. **Hermetic Isolation**: Dependencies are installed in the local project shell environment only. They do not pollute the global system path, preventing version conflicts with other projects.
3. **Flake-pinned Versioning**: The flake.lock file locks the entire package ecosystem to a specific commit of nixpkgs. This ensures that every tool in the shell is exactly identical to the one tested in the CI pipeline.
4. **Seamless Integration**: Automated loading of the Nix development shell on directory entry via direnv, meaning developers do not need to manually configure paths or run installation scripts.

---

## Entering the Development Shell

You can enter the development environment using either devenv or standard Nix commands.

### Option A: Using devenv

The devenv command tool provides process orchestration capabilities on top of Nix.

```bash
# Enter the developer shell
devenv shell
```

To run the Node.js backend proxy and track the dashboard service in the background:

```bash
devenv up
```

### Option B: Using Nix develop

If you prefer not to install the devenv tool globally, you can enter the development shell using standard Nix Flakes:

```bash
nix develop
```

---

## Direnv Automation

The project includes an .envrc configuration. If you have direnv installed on your machine, you can automate shell entry:

```bash
# Allow the project directory once
direnv allow
```

Once authorized, your active shell will automatically load Node.js 22, the AWS CLI, just, and set the default environment variables (like PORT=8889 and AWS_PROFILE=Synechron) whenever you navigate into this project directory.
