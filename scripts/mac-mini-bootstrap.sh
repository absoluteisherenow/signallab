#!/usr/bin/env bash
# Mac Mini bootstrap — Signal Lab iOS build host.
#
# Run this ON the Mac Mini (SSH or screen share via Tailscale).
# Safe to re-run — every step is idempotent.
#
# Prereqs (do these manually first, script will check):
#   1. macOS signed in with an Apple ID (any — the dev-enrolled one is better)
#   2. System Settings → General → Software Update → latest macOS installed
#   3. SSH into this machine works (you're here, so ✓)

set -euo pipefail

say()  { printf "\n\033[1;35m== %s\033[0m\n" "$1"; }
ok()   { printf "\033[1;32m  ✓ %s\033[0m\n" "$1"; }
warn() { printf "\033[1;33m  ⚠ %s\033[0m\n" "$1"; }
todo() { printf "\033[1;36m  → %s\033[0m\n" "$1"; }

# 1. Xcode Command Line Tools (small, CLI-only — unblocks git, clang)
say "Xcode Command Line Tools"
if xcode-select -p >/dev/null 2>&1; then
  ok "already installed at $(xcode-select -p)"
else
  warn "installing — this pops a GUI dialog, click Install"
  xcode-select --install || true
  todo "re-run this script once install completes"
  exit 0
fi

# 2. Full Xcode (needed for iOS builds). Not scriptable — must go through App Store.
say "Full Xcode.app"
if [ -d "/Applications/Xcode.app" ]; then
  ok "Xcode.app present"
  sudo xcode-select -s /Applications/Xcode.app/Contents/Developer 2>/dev/null || true
  sudo xcodebuild -license accept 2>/dev/null || warn "accept Xcode license manually: sudo xcodebuild -license"
else
  todo "OPEN MAC APP STORE → search 'Xcode' → install (≈15GB, takes a while)"
  todo "after install: re-run this script"
fi

# 3. Homebrew
say "Homebrew"
if command -v brew >/dev/null 2>&1; then
  ok "brew $(brew --version | head -1)"
else
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  # add to PATH for apple silicon
  if [ -d "/opt/homebrew/bin" ]; then
    eval "$(/opt/homebrew/bin/brew shellenv)"
    if ! grep -q 'brew shellenv' "$HOME/.zprofile" 2>/dev/null; then
      echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> "$HOME/.zprofile"
    fi
  fi
fi

# 4. Core CLI tools
say "Core CLI (git, gh, jq, wget, nvm)"
brew install git gh jq wget nvm 2>/dev/null || brew upgrade git gh jq wget nvm 2>/dev/null || true
mkdir -p "$HOME/.nvm"
if ! grep -q 'NVM_DIR' "$HOME/.zshrc" 2>/dev/null; then
  cat >> "$HOME/.zshrc" <<'EOF'

# nvm
export NVM_DIR="$HOME/.nvm"
[ -s "/opt/homebrew/opt/nvm/nvm.sh" ] && . "/opt/homebrew/opt/nvm/nvm.sh"
[ -s "/opt/homebrew/opt/nvm/etc/bash_completion.d/nvm" ] && . "/opt/homebrew/opt/nvm/etc/bash_completion.d/nvm"
EOF
fi
export NVM_DIR="$HOME/.nvm"
# shellcheck disable=SC1091
[ -s "/opt/homebrew/opt/nvm/nvm.sh" ] && . "/opt/homebrew/opt/nvm/nvm.sh"

# 5. Node 20 LTS (matches signallab)
say "Node 20"
if command -v nvm >/dev/null 2>&1; then
  nvm install 20 >/dev/null
  nvm alias default 20 >/dev/null
  ok "node $(node -v)  npm $(npm -v)"
else
  warn "nvm not on PATH yet — open a fresh terminal and re-run"
fi

# 6. Wrangler (Cloudflare — for cron-worker deploys)
say "Wrangler"
npm i -g wrangler@latest 2>/dev/null && ok "wrangler $(wrangler --version 2>&1 | head -1)" || warn "install later"

# 7. Ruby + fastlane (iOS CI)
say "Ruby + fastlane"
brew install rbenv ruby-build 2>/dev/null || true
if ! grep -q 'rbenv init' "$HOME/.zshrc" 2>/dev/null; then
  echo 'eval "$(rbenv init - zsh)"' >> "$HOME/.zshrc"
fi
eval "$(rbenv init - zsh)" 2>/dev/null || true
RUBY_VER="3.2.2"
rbenv install -s "$RUBY_VER"
rbenv global "$RUBY_VER"
gem install fastlane --no-document 2>/dev/null || true
ok "fastlane $(fastlane --version 2>/dev/null | grep fastlane | head -1 || echo 'install pending — new shell')"

# 8. SSH key for GitHub
say "SSH key for GitHub"
if [ ! -f "$HOME/.ssh/id_ed25519" ]; then
  ssh-keygen -t ed25519 -f "$HOME/.ssh/id_ed25519" -N "" -C "mac-mini-$(whoami)@signallab"
  eval "$(ssh-agent -s)"
  ssh-add --apple-use-keychain "$HOME/.ssh/id_ed25519" 2>/dev/null || ssh-add "$HOME/.ssh/id_ed25519"
  todo "add this public key to GitHub → Settings → SSH Keys:"
  echo
  cat "$HOME/.ssh/id_ed25519.pub"
  echo
  todo "then: gh auth login  (use SSH, choose 'paste an auth token' or web flow)"
else
  ok "ssh key present"
fi

# 9. Project clone (skip if running from repo)
say "signallab clone"
if [ -d "$HOME/signallab/.git" ]; then
  ok "$HOME/signallab already cloned"
else
  todo "once GitHub SSH is verified: cd ~ && git clone git@github.com:<owner>/signallab.git"
fi

# 10. Final: what's left for you (manual, can't script)
say "MANUAL STEPS LEFT"
todo "Claude Code: run 'claude login' in a fresh shell — opens browser for OAuth"
todo "Xcode first launch: open /Applications/Xcode.app — accepts additional components"
todo "Apple ID in Xcode: Settings → Accounts → add the dev-enrolled Apple ID"
todo "Tailscale: verify reachability from your laptop → 'tailscale status'"
todo "Give this Mac a memorable hostname: sudo scutil --set ComputerName 'signallab-ci'"

say "DONE — re-run anytime to top up"
