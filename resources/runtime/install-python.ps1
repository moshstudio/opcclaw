# install-python.ps1
param(
    [string]$version = "3.10.11",
    [string]$LockPath
)

$ErrorActionPreference = 'Stop'
$progressPreference = 'SilentlyContinue'

# --- 辅助函数 ---

function Write-Log {
    param([string]$msg)
    Write-Host "[PythonInstaller] $msg"
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

    # 1. 检查 Python 是否已安装且有效 (排除 Microsoft Store shim)
    $pythonCmd = Get-Command python -ErrorAction SilentlyContinue
    if ($pythonCmd -and $pythonCmd.Source -notlike "*WindowsApps*") {
        $actualVer = python --version 2>&1
        Write-Log "Python already exists: $actualVer at $($pythonCmd.Source)"
        # 这里可以选择直接退出或继续安装（choco 会处理重装/更新）
    }

    # 2. 确保 Chocolatey 已准备就绪
    if (-not (Get-Command choco -ErrorAction SilentlyContinue)) {
        $potentialChoco = "$env:ProgramData\chocolatey\bin\choco.exe"
        if (Test-Path $potentialChoco) {
            $env:Path += ";$env:ProgramData\chocolatey\bin"
        } else {
            Write-Log "Chocolatey not found. Installing..."
            Set-ExecutionPolicy Bypass -Scope Process -Force
            [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072
            Invoke-Expression ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))
            Update-Environment
        }
    }

    # 3. 清理 Chocolatey 旧元数据以确保干净安装
    Write-Log "Cleaning up previous Python metadata..."
    @("python", "python310", "python3") | ForEach-Object {
        $lPath = "C:\ProgramData\chocolatey\lib\$_"
        if (Test-Path $lPath) { Remove-Item -Path $lPath -Recurse -Force -ErrorAction SilentlyContinue }
    }

    # 4. 执行安装
    $chocoArgs = @("install", "python", "-y", "--no-progress", "--ignore-checksums", "--allow-downgrade", "--force")
    if ($version -and $version -ne "latest") { $chocoArgs += "--version", $version }
    $chocoArgs += "--params", "/InstallDir:C:\Python310 /PrependPath"

    Write-Log "Executing: choco $($chocoArgs -join ' ')"
    & choco.exe $chocoArgs

    $exitCode = $LASTEXITCODE
    Write-Log "Chocolatey finished with ExitCode: $exitCode"

    # 5. 验证安装 (最多等待 180 秒)
    Write-Log "Verifying installation..."
    $timeout = (Get-Date).AddSeconds(180)
    while ((Get-Date) -lt $timeout) {
        Update-Environment
        $py = Get-Command python -ErrorAction SilentlyContinue
        if ($py -and $py.Source -notlike "*WindowsApps*") {
            $ver = & python --version 2>&1
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
        Write-Log "Setting lock to failed due to premature termination."
        Set-Content -Path $LockPath -Value "2"
    }
    Write-Log "Script completed."
}
