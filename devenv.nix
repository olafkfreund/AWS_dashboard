{ pkgs, lib, config, ... }:

{
  # Packages to install in the development environment
  packages = with pkgs; [
    git
    awscli2
  ];

  # Language configuration for Node.js
  languages.javascript = {
    enable = true;
    package = pkgs.nodejs_20;
    npm.enable = true;
  };

  # Environment variables for the dev shell
  env = {
    AWS_PROFILE = "Synechron";
    PORT = "3000";
  };

  # Custom scripts helper commands
  scripts = {
    start-backend.exec = "node server.js";
  };

  # Background process running via process-compose (triggered by `devenv up`)
  processes = {
    backend.exec = "node server.js";
  };

  # Welcome greeting when entering the shell
  enterShell = ''
    echo "============================================="
    echo "⚡ AWS Status Dashboard Dev Environment ⚡"
    echo "============================================="
    echo "Available commands:"
    echo "  - start-backend: Run the Node.js backend proxy"
    echo ""
    echo "To start the backend in the background with process-compose:"
    echo "  devenv up"
    echo "============================================="
  '';
}
