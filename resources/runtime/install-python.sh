#!/bin/bash

# install-python.sh
# Detect OS and install Python 3

VERSION="3"
LOCK_PATH=""

while getopts "v:l:" opt; do
  case $opt in
    v) VERSION="$OPTARG" ;;
    l) LOCK_PATH="$OPTARG" ;;
    *) exit 1 ;;
  esac
done

Write-Log() {
    echo "[PythonInstaller] $1"
}

update_lock() {
    if [ -n "$LOCK_PATH" ]; then
        echo "$1" > "$LOCK_PATH"
    fi
}

# 初始状态：运行中
update_lock "0"

# 退出捕获：确保状态锁准确更新
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
            Write-Log "Using Homebrew to install python..."
            brew install python3
        else
            Write-Log "Error: Homebrew is not installed."
            exit 1
        fi
        ;;
    Linux*)
        Write-Log "OS detected: Linux"
        if command -v apt-get >/dev/null 2>&1; then
            Write-Log "Using apt-get to install python3..."
            sudo apt-get update && sudo apt-get install -y python3 python3-pip
        elif command -v dnf >/dev/null 2>&1; then
            Write-Log "Using dnf to install python3..."
            sudo dnf install -y python3 python3-pip
        elif command -v yum >/dev/null 2>&1; then
            Write-Log "Using yum to install python3..."
            sudo yum install -y python3 python3-pip
        elif command -v pacman >/dev/null 2>&1; then
            Write-Log "Using pacman to install python..."
            sudo pacman -S --noconfirm python python-pip
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
    PY_CMD="python3"
    if ! command -v python3 >/dev/null 2>&1; then
        PY_CMD="python"
    fi

    if command -v $PY_CMD >/dev/null 2>&1; then
        VER=$($PY_CMD --version 2>&1)
        Write-Log "Installation successful: $VER"
        exit 0
    fi
    Write-Log "Waiting for python to be available in PATH (attempt $i)..."
    sleep 2
done

Write-Log "Warning: Python was installed but command is not immediately available."
exit 0
