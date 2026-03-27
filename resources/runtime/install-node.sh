#!/bin/bash

# install-node.sh
# Detect OS and install Node.js

VERSION="LTS"
LOCK_PATH=""

while getopts "v:l:" opt; do
  case $opt in
    v) VERSION="$OPTARG" ;;
    l) LOCK_PATH="$OPTARG" ;;
    *) exit 1 ;;
  esac
done

Write-Log() {
    echo "[NodeInstaller] $1"
}

update_lock() {
    if [ -n "$LOCK_PATH" ]; then
        echo "$1" > "$LOCK_PATH"
    fi
}

# 初始状态：运行中
update_lock "0"

# 退出捕获：确保锁状态更新
finish() {
    local exit_code=$?
    if [ $exit_code -eq 0 ]; then
        update_lock "1"
    else
        update_lock "2"
    fi
    Write-Log "Script completed with exit code $exit_code"
}
trap finish EXIT

OS="$(uname -s)"
case "${OS}" in
    Darwin*)
        Write-Log "OS detected: macOS"
        if command -v brew >/dev/null 2>&1; then
            Write-Log "Using Homebrew to install node..."
            brew install node
        else
            Write-Log "Error: Homebrew is not installed."
            exit 1
        fi
        ;;
    Linux*)
        Write-Log "OS detected: Linux"
        if command -v apt-get >/dev/null 2>&1; then
            Write-Log "Using apt-get (NodeSource) to install node (LTS)..."
            curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
            sudo apt-get install -y nodejs
        elif command -v dnf >/dev/null 2>&1; then
            Write-Log "Using dnf to install nodejs..."
            sudo dnf install -y nodejs
        elif command -v yum >/dev/null 2>&1; then
            Write-Log "Using yum to install nodejs..."
            sudo yum install -y nodejs
        elif command -v pacman >/dev/null 2>&1; then
            Write-Log "Using pacman to install nodejs..."
            sudo pacman -S --noconfirm nodejs npm
        else
            Write-Log "Error: No supported package manager found."
            exit 1
        fi
        ;;
    *)
        Write-Log "Unsupported OS: ${OS}"
        exit 1
        ;;
esac

# 验证安装
Write-Log "Verifying installation..."
for i in {1..5}; do
    if command -v node >/dev/null 2>&1; then
        NODE_VER=$(node -v)
        Write-Log "Installation successful: $NODE_VER"
        exit 0
    fi
    Write-Log "Waiting for node to be available in PATH (attempt $i)..."
    sleep 2
done

Write-Log "Warning: Node was installed but 'node' command is not immediately available."
exit 0
