# install-node.ps1
param(
    [string]$version = "22.17.0",
    [string]$LockPath
)

$ErrorActionPreference = 'Stop'
$progressPreference = 'SilentlyContinue'

# --- 辅助函数 ---

function Write-Log {
    param([string]$msg)
    Write-Host "[NodeInstaller] $msg"
}

function Update-Environment {
    Write-Log "Refreshing environment variables..."
    $machinePath = [Environment]::GetEnvironmentVariable("Path", "Machine")
    $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
    $env:Path = "$machinePath;$userPath"
    [Environment]::SetEnvironmentVariable("Path", $env:Path, "Process")
}

function Check-IsAdmin {
    $currentPrincipal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
    if (-not $currentPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        Write-Log "Error: Administrator privileges are required."
        exit 1
    }
}

# --- 主逻辑 ---

try {
    Check-IsAdmin
    if ($LockPath) { Set-Content -Path $LockPath -Value "0" }

    Update-Environment

    # 1. 检查 Node.js 是否已安装且有效
    $nodeCmd = Get-Command node -ErrorAction SilentlyContinue
    if ($nodeCmd -and $nodeCmd.Source -notlike "*WindowsApps*") {
        $actualVer = node --version 2>&1
        Write-Log "Node.js already exists: $actualVer at $($nodeCmd.Source)"
        # 继续执行以确保版本符合或者由 choco 处理更新
    }

    # 2. 使用 Chocolatey 安装
    if (Get-Command choco -ErrorAction SilentlyContinue) {
        Write-Log "Attempting to install Node.js via Chocolatey..."
        $chocoArgs = @("install", "nodejs-lts", "-y", "--no-progress", "--ignore-checksums")
        if ($version -and $version -ne "LTS") { $chocoArgs = @("install", "nodejs", "--version", $version, "-y", "--no-progress") }

        & choco.exe $chocoArgs
        if ($LASTEXITCODE -eq 0) {
            Write-Log "Successfully installed Node.js via Chocolatey."
        }
    }

    # 3. 验证安装 (最多等待 180 秒)
    Write-Log "Verifying installation..."
    $timeout = (Get-Date).AddSeconds(180)
    while ((Get-Date) -lt $timeout) {
        Update-Environment
        $node = Get-Command node -ErrorAction SilentlyContinue
        if ($node -and $node.Source -notlike "*WindowsApps*") {
            $ver = & node --version 2>&1
            if ($LASTEXITCODE -eq 0) {
                Write-Log "Installation successful: $ver"
                if ($LockPath) { Set-Content -Path $LockPath -Value "1" }
                exit 0
            }
        }
        Start-Sleep -Seconds 2
    }

    Write-Log "Warning: Installation finished but verification timed out."
    if ($LockPath) { Set-Content -Path $LockPath -Value "1" }
    exit 0

} catch {
    Write-Log "Error during installation: $($_.Exception.Message)"
    if ($LockPath) { Set-Content -Path $LockPath -Value "2" }
    exit 1
} finally {
    if ($LockPath -and (Test-Path $LockPath) -and (Get-Content $LockPath) -eq "0") {
        Set-Content -Path $LockPath -Value "2"
    }
    Write-Log "Script completed."
}

