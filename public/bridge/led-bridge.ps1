#Requires -Version 5.1
<#
    LED Pattern Generator - local compile bridge (Windows)
    =====================================================

    A browser cannot run a compiler, so the hosted app hands that one job to
    this script: it finds (or installs) arduino-cli, then serves the same small
    HTTP API the local dev server exposes, on 127.0.0.1. The page in your
    browser talks to it directly and reports the real Flash and SRAM figures
    instead of estimating them.

    Nothing is installed system-wide, no administrator rights are needed, and
    Node.js is not involved - Windows PowerShell 5.1 ships with Windows.

    Run it:
        powershell -NoProfile -ExecutionPolicy Bypass -File .\led-bridge.ps1

    Parameters:
        -Origin      Extra web origin allowed to talk to the bridge. Repeatable.
                     The copy downloaded from the app already has its own origin
                     baked in; you only need this if you host the app yourself.
        -Port        Force a port. By default the first free port in 8787-8790.
        -NoInstall   Never download anything; fail if arduino-cli is missing.
        -AddToPath   Add arduino-cli to your user PATH without asking.
        -NoPath      Never touch PATH, and do not ask.
        -Verbose     Log every request.

    Stop it with Ctrl+C, or just close the window.
#>
[CmdletBinding()]
param(
    [string[]]$Origin = @(),
    [int]$Port = 0,
    [switch]$NoInstall,
    [switch]$AddToPath,
    [switch]$NoPath
)

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

$BridgeVersion  = '1.0.0'
$Marker         = 'led-pattern-generator/arduino'
$PortRange      = 8787, 8788, 8789, 8790
$MaxBatch       = 32
$Concurrency    = [Math]::Max(2, [Math]::Min(4, [Environment]::ProcessorCount - 1))
$CompileTimeout = 180
$MaxBuildDirs   = 80

$InstallRoot = Join-Path $env:LOCALAPPDATA 'led-pattern-generator'
$CliDir      = Join-Path $InstallRoot 'arduino-cli'
$BuildRoot   = Join-Path $env:TEMP 'led-pattern-generator-build'

# The app rewrites this line when you download the script from it, so the copy
# you get already trusts the site it came from and nothing else.
$AppOrigins = @('__APP_ORIGIN__')

$script:Cli         = $null
$script:ResultCache = @{}
$script:BoardCache  = @{}
$script:Compiles    = 0
$script:Allowed     = @()

# ---------------------------------------------------------------------------
# Console output
# ---------------------------------------------------------------------------

function Write-Banner {
    Write-Host ''
    Write-Host '  LED Pattern Generator - compile bridge' -ForegroundColor Cyan
    Write-Host "  v$BridgeVersion" -ForegroundColor DarkGray
    Write-Host ''
}
function Write-Step($text) { Write-Host "  -> $text" -ForegroundColor White }
function Write-Ok($text)   { Write-Host "     $text" -ForegroundColor Green }
function Write-Note($text) { Write-Host "     $text" -ForegroundColor DarkGray }
function Write-Warn($text) { Write-Host "  !  $text" -ForegroundColor Yellow }
function Write-Fail($text) { Write-Host "  x  $text" -ForegroundColor Red }

# ---------------------------------------------------------------------------
# Running arduino-cli
#
# Start-Process joins an -ArgumentList array without quoting, and every path
# here can contain a space, so arguments are quoted by hand. Output goes to
# files rather than pipes: a compile can print more than a pipe buffer holds,
# and a full pipe would deadlock the wait.
# ---------------------------------------------------------------------------

function Format-CliArg([string]$value) {
    if ($value -match '[\s"]') { return '"' + ($value -replace '"', '\"') + '"' }
    return $value
}

function Join-CliArgs([string[]]$parts) {
    return (($parts | ForEach-Object { Format-CliArg $_ }) -join ' ')
}

function Start-Cli([string]$exe, [string[]]$cliArgs) {
    $stdout = [System.IO.Path]::GetTempFileName()
    $stderr = [System.IO.Path]::GetTempFileName()
    $proc = Start-Process -FilePath $exe -ArgumentList (Join-CliArgs $cliArgs) `
        -NoNewWindow -PassThru -RedirectStandardOutput $stdout -RedirectStandardError $stderr
    # Reading .Handle now is what makes .ExitCode and .HasExited readable later:
    # a process object from Start-Process does not cache the handle on its own,
    # and without it every compile looks like it failed.
    $null = $proc.Handle
    return [pscustomobject]@{ Proc = $proc; Out = $stdout; Err = $stderr; Started = Get-Date }
}

function Complete-Cli($handle) {
    $out = ''
    $err = ''
    try { $out = [System.IO.File]::ReadAllText($handle.Out) } catch { }
    try { $err = [System.IO.File]::ReadAllText($handle.Err) } catch { }
    Remove-Item $handle.Out, $handle.Err -Force -ErrorAction SilentlyContinue
    $code = -1
    try { $code = $handle.Proc.ExitCode } catch { }
    return [pscustomobject]@{ ExitCode = $code; StdOut = $out; StdErr = $err }
}

function Invoke-Cli([string]$exe, [string[]]$cliArgs, [int]$TimeoutSec = 60) {
    $handle = Start-Cli $exe $cliArgs
    $finished = $handle.Proc.WaitForExit($TimeoutSec * 1000)
    if (-not $finished) { try { $handle.Proc.Kill() } catch { } }
    else { $handle.Proc.WaitForExit() }
    $result = Complete-Cli $handle
    $result | Add-Member -NotePropertyName TimedOut -NotePropertyValue (-not $finished) -Force
    return $result
}

# arduino-cli prints its JSON report on stdout even when the build fails, after
# any progress chatter, so the report starts at the first brace.
function Read-Report([string]$stdout) {
    if (-not $stdout) { return $null }
    $at = $stdout.IndexOf('{')
    if ($at -lt 0) { return $null }
    try { return $stdout.Substring($at) | ConvertFrom-Json } catch { return $null }
}

function Get-Prop($obj, [string]$name) {
    if ($null -eq $obj) { return $null }
    $p = $obj.PSObject.Properties[$name]
    if ($null -eq $p) { return $null }
    return $p.Value
}

# ---------------------------------------------------------------------------
# Finding arduino-cli
# ---------------------------------------------------------------------------

function Get-BundledCliPaths {
    $rel = 'resources\app\lib\backend\resources'
    $local = $env:LOCALAPPDATA
    if (-not $local) { $local = Join-Path $env:USERPROFILE 'AppData\Local' }
    $programFiles = $env:PROGRAMFILES
    if (-not $programFiles) { $programFiles = 'C:\Program Files' }
    $roots = @(
        (Join-Path $local 'Programs\Arduino IDE'),
        (Join-Path $programFiles 'Arduino IDE')
    )
    return $roots | ForEach-Object { Join-Path (Join-Path $_ $rel) 'arduino-cli.exe' }
}

function Test-Cli([string]$candidate) {
    if (-not $candidate) { return $null }
    try {
        $r = Invoke-Cli $candidate @('version', '--format', 'json') 20
        if ($r.ExitCode -ne 0) { return $null }
        $v = Read-Report $r.StdOut
        $version = Get-Prop $v 'VersionString'
        if (-not $version) { $version = Get-Prop $v 'version' }
        if (-not $version) { $version = 'unknown' }
        $full = $candidate
        try { $full = (Get-Command $candidate -ErrorAction Stop).Source } catch { }
        return [pscustomobject]@{ Path = $full; Version = $version }
    } catch { return $null }
}

function Find-Cli {
    $candidates = @()
    if ($env:ARDUINO_CLI_PATH) { $candidates += $env:ARDUINO_CLI_PATH }
    if ($env:ARDUINO_CLI)      { $candidates += $env:ARDUINO_CLI }
    $candidates += (Join-Path $CliDir 'arduino-cli.exe')
    $onPath = Get-Command 'arduino-cli.exe' -ErrorAction SilentlyContinue
    if ($onPath) { $candidates += $onPath.Source }
    $candidates += (Get-BundledCliPaths | Where-Object { Test-Path $_ })

    foreach ($c in ($candidates | Select-Object -Unique)) {
        $found = Test-Cli $c
        if ($found) { return $found }
    }
    return $null
}

# ---------------------------------------------------------------------------
# Installing arduino-cli
#
# Into the user's own AppData, from Arduino's official download host. No
# installer, no administrator rights, nothing registered: deleting the folder
# undoes it completely.
# ---------------------------------------------------------------------------

function Get-CliDownloadUrl {
    $arch = $env:PROCESSOR_ARCHITECTURE
    if (-not $arch) { $arch = 'AMD64' }
    switch ($arch.ToUpperInvariant()) {
        'ARM64' { $file = 'arduino-cli_latest_Windows_ARM64.zip' }
        'X86'   { $file = 'arduino-cli_latest_Windows_32bit.zip' }
        default { $file = 'arduino-cli_latest_Windows_64bit.zip' }
    }
    return "https://downloads.arduino.cc/arduino-cli/$file"
}

function Install-Cli {
    $url = Get-CliDownloadUrl
    $zip = Join-Path $env:TEMP ('arduino-cli-' + [Guid]::NewGuid().ToString('N') + '.zip')

    Write-Step 'Downloading arduino-cli'
    Write-Note $url
    try {
        $progress = $ProgressPreference
        $ProgressPreference = 'SilentlyContinue'   # the progress bar makes this several times slower
        Invoke-WebRequest -Uri $url -OutFile $zip -UseBasicParsing
        $ProgressPreference = $progress
    } catch {
        throw "Could not download arduino-cli: $($_.Exception.Message)"
    }

    Write-Step "Unpacking into $CliDir"
    if (-not (Test-Path $CliDir)) { New-Item -ItemType Directory -Path $CliDir -Force | Out-Null }
    try {
        Expand-Archive -Path $zip -DestinationPath $CliDir -Force
    } finally {
        Remove-Item $zip -Force -ErrorAction SilentlyContinue
    }

    $exe = Join-Path $CliDir 'arduino-cli.exe'
    if (-not (Test-Path $exe)) { throw "The download unpacked, but $exe is not there." }

    $found = Test-Cli $exe
    if (-not $found) { throw 'arduino-cli was installed but will not run.' }
    Write-Ok "arduino-cli $($found.Version) installed"
    return $found
}

function Add-CliToPath {
    if ($NoPath) { return }
    $current = [Environment]::GetEnvironmentVariable('Path', 'User')
    if (-not $current) { $current = '' }
    $already = ($current -split ';') | Where-Object { $_.TrimEnd('\') -ieq $CliDir.TrimEnd('\') }
    if ($already) { return }

    if (-not $AddToPath) {
        Write-Host ''
        Write-Host '     Add arduino-cli to your PATH, so you can run it from any terminal?' -ForegroundColor White
        Write-Host '     This changes your own user PATH only, and applies to new windows.' -ForegroundColor DarkGray
        $answer = Read-Host '     [Y/n]'
        if ($answer -and $answer.Trim().ToLowerInvariant().StartsWith('n')) {
            Write-Note 'Left PATH alone. The bridge does not need it.'
            return
        }
    }

    $updated = $current.TrimEnd(';')
    if ($updated) { $updated = "$updated;$CliDir" } else { $updated = $CliDir }
    [Environment]::SetEnvironmentVariable('Path', $updated, 'User')
    $env:Path = "$env:Path;$CliDir"
    Write-Ok "Added to your user PATH: $CliDir"
    Write-Note 'Open a new terminal for arduino-cli to be found there.'
}

# ---------------------------------------------------------------------------
# The AVR core
#
# A fresh arduino-cli has no board support at all, and compiling for an Uno
# without arduino:avr fails with a message nobody should have to decode.
# ---------------------------------------------------------------------------

function Test-AvrCore {
    $r = Invoke-Cli $script:Cli.Path @('core', 'list', '--format', 'json') 60
    if ($r.ExitCode -ne 0) { return $false }
    if (-not $r.StdOut) { return $false }
    return $r.StdOut.Contains('arduino:avr')
}

function Install-AvrCore {
    Write-Step 'Installing Arduino AVR board support (one time, ~50 MB)'
    $u = Invoke-Cli $script:Cli.Path @('core', 'update-index') 300
    if ($u.ExitCode -ne 0) { Write-Warn "Could not refresh the package index: $($u.StdErr.Trim())" }
    $i = Invoke-Cli $script:Cli.Path @('core', 'install', 'arduino:avr') 900
    if ($i.ExitCode -ne 0) {
        Write-Warn "arduino:avr did not install: $($i.StdErr.Trim())"
        Write-Note 'The bridge still starts; compiling for an AVR board will fail until it does.'
        return
    }
    Write-Ok 'arduino:avr installed'
}

# ---------------------------------------------------------------------------
# Compiling
# ---------------------------------------------------------------------------

function Get-SketchHash([string]$sketch, [string]$fqbn) {
    $sha = [System.Security.Cryptography.SHA1]::Create()
    try {
        $bytes = [System.Text.Encoding]::UTF8.GetBytes($fqbn + "`0" + $sketch)
        $hash = $sha.ComputeHash($bytes)
    } finally { $sha.Dispose() }
    return (($hash | ForEach-Object { $_.ToString('x2') }) -join '').Substring(0, 12)
}

function Get-SafeName([string]$name) {
    if (-not $name) { $name = 'LedPattern' }
    $safe = ($name -replace '[^A-Za-z0-9_]', '_').Trim('_')
    if (-not $safe) { $safe = 'LedPattern' }
    if ($safe.Length -gt 48) { $safe = $safe.Substring(0, 48) }
    return $safe
}

# Flash is the `text` section, SRAM globals the `data` section.
function Get-Sizes($report) {
    $builder = Get-Prop $report 'builder_result'
    $sections = Get-Prop $builder 'executable_sections_size'
    if ($null -eq $sections) { $sections = Get-Prop $report 'executable_sections_size' }
    $flash = $null; $flashMax = $null; $sram = $null; $sramMax = $null
    foreach ($s in @($sections)) {
        if ($null -eq $s) { continue }
        $n = Get-Prop $s 'name'
        if ($n -eq 'text') { $flash = Get-Prop $s 'size'; $flashMax = Get-Prop $s 'max_size' }
        if ($n -eq 'data') { $sram  = Get-Prop $s 'size'; $sramMax  = Get-Prop $s 'max_size' }
    }
    return [pscustomobject]@{ Flash = $flash; FlashMax = $flashMax; Sram = $sram; SramMax = $sramMax }
}

# Keyed by sketch content and board, so variants of one project never share a
# build directory and a repeated variant reuses the build already done for it.
function New-CompileJob([string]$sketch, [string]$fqbn, [string]$name) {
    $hash = Get-SketchHash $sketch $fqbn
    $key  = "$fqbn::$hash"
    $safe = Get-SafeName $name
    $root = Join-Path $BuildRoot $hash

    $job = [pscustomobject]@{
        Key       = $key
        Fqbn      = $fqbn
        Dir       = (Join-Path $root $safe)
        BuildPath = (Join-Path $root 'build')
        Sketch    = $sketch
        SafeName  = $safe
        Handle    = $null
        Result    = $null
        Cached    = $false
        Id        = ''
    }
    if ($script:ResultCache.ContainsKey($key)) {
        $job.Result = $script:ResultCache[$key]
        $job.Cached = $true
    }
    return $job
}

function Start-CompileJob($job) {
    New-Item -ItemType Directory -Path $job.Dir -Force | Out-Null
    $ino = Join-Path $job.Dir ($job.SafeName + '.ino')
    [System.IO.File]::WriteAllText($ino, $job.Sketch, (New-Object System.Text.UTF8Encoding($false)))
    $job.Handle = Start-Cli $script:Cli.Path @(
        'compile', '--fqbn', $job.Fqbn, '--format', 'json', '--no-color',
        '--build-path', $job.BuildPath, $job.Dir
    )
    $script:Compiles++
}

function Complete-CompileJob($job) {
    $ms = [int]((Get-Date) - $job.Handle.Started).TotalMilliseconds
    $raw = Complete-Cli $job.Handle
    $report = Read-Report $raw.StdOut
    $ok = ((Get-Prop $report 'success') -eq $true)
    $sizes = Get-Sizes $report

    $errorText = ''
    if (-not $ok) {
        $parts = @()
        foreach ($k in @('error', 'compiler_err')) {
            $v = Get-Prop $report $k
            if ($v -is [string] -and $v) { $parts += $v }
        }
        if ($parts.Count -eq 0 -and $raw.StdErr) { $parts += $raw.StdErr }
        if ($parts.Count -eq 0) { $parts += 'Compilation failed.' }
        $errorText = ($parts -join "`n`n")
    }
    $out = Get-Prop $report 'compiler_out'
    if ($out -isnot [string]) { $out = '' }

    $result = @{
        ok       = $ok
        fqbn     = $job.Fqbn
        flash    = $sizes.Flash
        flashMax = $sizes.FlashMax
        sram     = $sizes.Sram
        sramMax  = $sizes.SramMax
        output   = $out
        error    = $errorText
        cached   = $false
        ms       = $ms
    }
    if ($ok) { $script:ResultCache[$job.Key] = $result }
    $job.Result = $result
    $job.Handle = $null
}

# Four compiles at once finish in about the time of one and a half; past that
# they only contend for the same cores.
function Invoke-CompileBatch($jobs) {
    $queued = @($jobs | Where-Object { -not $_.Cached })
    $next = 0
    $running = @()

    while ($next -lt $queued.Count -or $running.Count -gt 0) {
        while ($running.Count -lt $Concurrency -and $next -lt $queued.Count) {
            $job = $queued[$next]
            $next++
            Start-CompileJob $job
            $running += $job
        }
        Start-Sleep -Milliseconds 100
        $still = @()
        foreach ($job in $running) {
            $elapsed = ((Get-Date) - $job.Handle.Started).TotalSeconds
            if ($job.Handle.Proc.HasExited) {
                Complete-CompileJob $job
            } elseif ($elapsed -gt $CompileTimeout) {
                try { $job.Handle.Proc.Kill() } catch { }
                Complete-CompileJob $job
                $job.Result.ok = $false
                $job.Result.error = "Timed out after $CompileTimeout seconds."
            } else {
                $still += $job
            }
        }
        $running = $still
    }
    Remove-OldBuilds
}

# A long optimiser search would otherwise fill the temp drive.
function Remove-OldBuilds {
    try {
        if (-not (Test-Path $BuildRoot)) { return }
        $dirs = @(Get-ChildItem -Path $BuildRoot -Directory -ErrorAction SilentlyContinue)
        if ($dirs.Count -le $MaxBuildDirs) { return }
        $dirs | Sort-Object LastWriteTime -Descending |
            Select-Object -Skip $MaxBuildDirs |
            ForEach-Object { Remove-Item $_.FullName -Recurse -Force -ErrorAction SilentlyContinue }
    } catch { }   # housekeeping must never fail a compile
}

# ---------------------------------------------------------------------------
# Board information
# ---------------------------------------------------------------------------

function Get-Boards {
    if ($script:BoardCache.ContainsKey('boards')) { return $script:BoardCache['boards'] }
    $r = Invoke-Cli $script:Cli.Path @('board', 'listall', '--format', 'json') 60
    $report = Read-Report $r.StdOut
    $list = @()
    foreach ($b in @(Get-Prop $report 'boards')) {
        $fqbn = Get-Prop $b 'fqbn'
        $name = Get-Prop $b 'name'
        if ($fqbn -and $name) { $list += @{ fqbn = $fqbn; name = $name } }
    }
    $list = @($list | Sort-Object { $_.name })
    $script:BoardCache['boards'] = $list
    return $list
}

# Flash and SRAM ceilings come straight from the board's own build properties.
function Get-BoardLimits([string]$fqbn) {
    $key = "limits:$fqbn"
    if ($script:BoardCache.ContainsKey($key)) { return $script:BoardCache[$key] }
    $r = Invoke-Cli $script:Cli.Path @('board', 'details', '--fqbn', $fqbn, '--format', 'json') 60
    $report = Read-Report $r.StdOut
    $props = @{}
    foreach ($entry in @(Get-Prop $report 'build_properties')) {
        if ($entry -isnot [string]) { continue }
        $at = $entry.IndexOf('=')
        if ($at -gt 0) { $props[$entry.Substring(0, $at)] = $entry.Substring($at + 1) }
    }
    $positive = {
        param($k)
        if (-not $props.ContainsKey($k)) { return $null }
        $v = 0
        if ([int]::TryParse($props[$k], [ref]$v) -and $v -gt 0) { return $v }
        return $null
    }
    $limits = @{
        fqbn     = $fqbn
        flashMax = (& $positive 'upload.maximum_size')
        sramMax  = (& $positive 'upload.maximum_data_size')
        mcu      = $props['build.mcu']
    }
    $script:BoardCache[$key] = $limits
    return $limits
}

# ---------------------------------------------------------------------------
# HTTP
#
# Only the browser enforces CORS, so the Origin header is checked here too: a
# page on some other site can still send a request to 127.0.0.1, and it gets a
# 403 before anything is compiled on its behalf.
# ---------------------------------------------------------------------------

function Initialize-Origins {
    $list = @()
    foreach ($o in ($AppOrigins + $Origin)) {
        if (-not $o) { continue }
        if ($o.StartsWith('__')) { continue }        # placeholder left as shipped
        $list += $o.TrimEnd('/').ToLowerInvariant()
    }
    $script:Allowed = @($list | Select-Object -Unique)
}

function Test-AllowedOrigin([string]$origin) {
    if (-not $origin) { return $true }               # curl, or a same-origin GET
    $o = $origin.TrimEnd('/').ToLowerInvariant()
    if ($script:Allowed -contains $o) { return $true }
    # The local dev server, and this bridge's own status page.
    if ($o -match '^https?://(localhost|127\.0\.0\.1)(:\d+)?$') { return $true }
    return $false
}

function Set-CorsHeaders($req, $res, [string]$origin) {
    if ($origin) { $res.Headers['Access-Control-Allow-Origin'] = $origin }
    $res.Headers['Vary'] = 'Origin'
    $res.Headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
    $res.Headers['Access-Control-Allow-Headers'] = 'content-type, x-led-bridge'
    $res.Headers['Access-Control-Max-Age'] = '600'
    # Chrome's Private Network Access check: a page on the public internet may
    # only reach 127.0.0.1 if the preflight is answered with this.
    if ($req.Headers['Access-Control-Request-Private-Network'] -eq 'true') {
        $res.Headers['Access-Control-Allow-Private-Network'] = 'true'
    }
}

function Send-Bytes($ctx, [int]$status, [byte[]]$bytes, [string]$contentType, [string]$origin) {
    $res = $ctx.Response
    Set-CorsHeaders $ctx.Request $res $origin
    $res.StatusCode = $status
    $res.ContentType = $contentType
    $res.Headers['Cache-Control'] = 'no-store'
    $res.ContentLength64 = $bytes.Length
    # A HEAD asks for the headers alone, and HttpListener refuses a body after
    # one. Uptime checks use HEAD, so answering it wrongly looks like a crash.
    if ($ctx.Request.HttpMethod -ne 'HEAD') {
        $res.OutputStream.Write($bytes, 0, $bytes.Length)
    }
    $res.OutputStream.Close()
}

function Send-Json($ctx, [int]$status, $body, [string]$origin) {
    $payload = @{ marker = $Marker }
    foreach ($k in $body.Keys) { $payload[$k] = $body[$k] }
    $text = $payload | ConvertTo-Json -Depth 8 -Compress
    Send-Bytes $ctx $status ([System.Text.Encoding]::UTF8.GetBytes($text)) 'application/json; charset=utf-8' $origin
}

function Send-Html($ctx, [string]$html, [string]$origin) {
    Send-Bytes $ctx 200 ([System.Text.Encoding]::UTF8.GetBytes($html)) 'text/html; charset=utf-8' $origin
}

function Read-Body($req) {
    $reader = New-Object System.IO.StreamReader($req.InputStream, $req.ContentEncoding)
    try { return $reader.ReadToEnd() } finally { $reader.Dispose() }
}

function Get-StatusPage([int]$port) {
    $allowed = ($script:Allowed -join ', ')
    if (-not $allowed) { $allowed = '(none configured - localhost only)' }
    return @"
<!doctype html><meta charset="utf-8"><title>LED compile bridge</title>
<style>
  body{font:15px/1.6 system-ui,sans-serif;margin:0;padding:2.5rem;background:#0f1115;color:#e6e8ee}
  h1{font-size:1.15rem;margin:0 0 .25rem}
  .ok{color:#4ade80;font-weight:600}
  dl{display:grid;grid-template-columns:auto 1fr;gap:.35rem 1rem;margin:1.5rem 0 0}
  dt{color:#8b93a7} code{background:#1b1f2a;padding:.1rem .35rem;border-radius:4px}
</style>
<h1>LED Pattern Generator - compile bridge</h1>
<p class="ok">Running.</p>
<p>Leave this running and go back to the app; the Memory tab will pick it up.</p>
<dl>
  <dt>Bridge</dt><dd>v$BridgeVersion on <code>http://127.0.0.1:$port</code></dd>
  <dt>arduino-cli</dt><dd>$($script:Cli.Version) &mdash; <code>$($script:Cli.Path)</code></dd>
  <dt>Allowed origins</dt><dd>$allowed</dd>
  <dt>Compiles served</dt><dd>$($script:Compiles)</dd>
</dl>
"@
}

# ---------------------------------------------------------------------------
# Routing
# ---------------------------------------------------------------------------

function Invoke-Route($ctx, [int]$port) {
    $req = $ctx.Request
    $origin = $req.Headers['Origin']
    $allowed = Test-AllowedOrigin $origin
    $echo = ''
    if ($allowed -and $origin) { $echo = $origin }

    $path = $req.Url.AbsolutePath.TrimEnd('/')
    if (-not $path) { $path = '/' }

    if ($req.HttpMethod -eq 'OPTIONS') {
        $res = $ctx.Response
        Set-CorsHeaders $req $res $echo
        if ($allowed) { $res.StatusCode = 204 } else { $res.StatusCode = 403 }
        $res.Close()
        return
    }

    if (-not $allowed) {
        Write-Warn "Refused a request from $origin"
        Send-Json $ctx 403 @{ error = 'This origin is not allowed to use the bridge.' } ''
        return
    }

    if ($path -eq '/' -or $path -eq '/index.html') {
        Send-Html $ctx (Get-StatusPage $port) $echo
        return
    }

    if (-not $path.StartsWith('/api/arduino')) {
        Send-Json $ctx 404 @{ error = 'No such route.' } $echo
        return
    }
    $route = $path.Substring('/api/arduino'.Length)
    if (-not $route) { $route = '/' }

    if ($route -eq '/status') {
        Send-Json $ctx 200 @{
            available = $true
            version   = $script:Cli.Version
            path      = $script:Cli.Path
            bridge    = @{ version = $BridgeVersion; port = $port; platform = 'windows' }
        } $echo
        return
    }

    if ($route -eq '/boards') {
        Send-Json $ctx 200 @{ boards = @(Get-Boards) } $echo
        return
    }

    if ($route -eq '/board') {
        $fqbn = $req.QueryString['fqbn']
        if (-not $fqbn) { Send-Json $ctx 400 @{ error = 'fqbn is required' } $echo; return }
        Send-Json $ctx 200 (Get-BoardLimits $fqbn) $echo
        return
    }

    if ($route -eq '/compile') {
        if ($req.HttpMethod -ne 'POST') { Send-Json $ctx 405 @{ error = 'POST required' } $echo; return }
        $body = Read-Body $req | ConvertFrom-Json
        $sketch = Get-Prop $body 'sketch'
        $fqbn = Get-Prop $body 'fqbn'
        if (-not $sketch -or -not $fqbn) { Send-Json $ctx 400 @{ error = 'sketch and fqbn required' } $echo; return }
        $name = Get-Prop $body 'name'
        if (-not $name) { $name = 'LedPattern' }

        $job = New-CompileJob $sketch $fqbn $name
        if (-not $job.Cached) { Invoke-CompileBatch @($job) }
        $result = @{} + $job.Result
        $result['cached'] = $job.Cached
        Write-Note "compile $fqbn - flash $($result.flash), sram $($result.sram), $($result.ms) ms"
        Send-Json $ctx 200 $result $echo
        return
    }

    if ($route -eq '/compile-batch') {
        if ($req.HttpMethod -ne 'POST') { Send-Json $ctx 405 @{ error = 'POST required' } $echo; return }
        $body = Read-Body $req | ConvertFrom-Json
        $fqbn = Get-Prop $body 'fqbn'
        $items = @(Get-Prop $body 'jobs')
        if (-not $fqbn -or $items.Count -eq 0) { Send-Json $ctx 400 @{ error = 'jobs and fqbn required' } $echo; return }
        if ($items.Count -gt $MaxBatch) { Send-Json $ctx 400 @{ error = "at most $MaxBatch jobs" } $echo; return }
        $name = Get-Prop $body 'name'
        if (-not $name) { $name = 'LedPattern' }

        $jobs = @()
        foreach ($item in $items) {
            $id = Get-Prop $item 'id'
            $sketch = Get-Prop $item 'sketch'
            if (-not $id -or -not $sketch) { Send-Json $ctx 400 @{ error = 'every job needs an id and a sketch' } $echo; return }
            $job = New-CompileJob $sketch $fqbn $name
            $job.Id = $id
            $jobs += $job
        }

        $started = Get-Date
        Invoke-CompileBatch $jobs
        $results = @()
        foreach ($job in $jobs) {
            $r = $job.Result
            $results += @{
                id       = $job.Id
                ok       = $r.ok
                flash    = $r.flash
                sram     = $r.sram
                flashMax = $r.flashMax
                sramMax  = $r.sramMax
                error    = $r.error
                cached   = $job.Cached
                ms       = $r.ms
            }
        }
        $secs = [Math]::Round(((Get-Date) - $started).TotalSeconds, 1)
        $fresh = @($jobs | Where-Object { -not $_.Cached }).Count
        Write-Note "batch of $($jobs.Count) ($fresh compiled) in $secs s"
        Send-Json $ctx 200 @{ results = $results } $echo
        return
    }

    Send-Json $ctx 404 @{ error = 'No such route.' } $echo
}

# ---------------------------------------------------------------------------
# Server
# ---------------------------------------------------------------------------

function Start-Bridge([int]$requested) {
    $ports = $PortRange
    if ($requested -gt 0) { $ports = @($requested) }

    foreach ($p in $ports) {
        $listener = New-Object System.Net.HttpListener
        $listener.Prefixes.Add("http://127.0.0.1:$p/")
        # Some browsers send `localhost` as the Host header, which the 127.0.0.1
        # prefix will not match. Non-fatal if the reservation is refused.
        try { $listener.Prefixes.Add("http://localhost:$p/") } catch { }
        try {
            $listener.Start()
            return [pscustomobject]@{ Listener = $listener; Port = $p }
        } catch {
            $listener.Close()
        }
    }
    throw "No free port. Tried $($ports -join ', '). Pass -Port to choose another."
}

function Invoke-ServerLoop($listener, [int]$port) {
    while ($listener.IsListening) {
        # Waiting in short slices instead of one blocking call, so Ctrl+C is
        # noticed straight away rather than after the next request.
        $task = $listener.GetContextAsync()
        while (-not $task.AsyncWaitHandle.WaitOne(250)) { }
        $ctx = $task.GetAwaiter().GetResult()
        try {
            Invoke-Route $ctx $port
        } catch {
            Write-Fail "Request failed: $($_.Exception.Message)"
            try { Send-Json $ctx 500 @{ error = $_.Exception.Message } '' } catch { }
        }
    }
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

Write-Banner
Initialize-Origins

Write-Step 'Looking for arduino-cli'
$script:Cli = Find-Cli

if ($script:Cli) {
    Write-Ok "arduino-cli $($script:Cli.Version)"
    Write-Note $script:Cli.Path
} elseif ($NoInstall) {
    Write-Fail 'arduino-cli was not found, and -NoInstall was given.'
    Write-Note 'Install it from https://arduino.github.io/arduino-cli/latest/installation/'
    exit 1
} else {
    Write-Note 'Not found - installing a private copy. No admin rights needed.'
    try {
        $script:Cli = Install-Cli
    } catch {
        Write-Fail $_.Exception.Message
        Write-Note 'Install arduino-cli yourself, then run this script again:'
        Write-Note 'https://arduino.github.io/arduino-cli/latest/installation/'
        exit 1
    }
    Add-CliToPath
}

Write-Step 'Checking board support'
if (Test-AvrCore) {
    Write-Ok 'arduino:avr is installed'
} else {
    Install-AvrCore
}

$server = $null
try {
    $server = Start-Bridge $Port
} catch {
    Write-Fail $_.Exception.Message
    exit 1
}

New-Item -ItemType Directory -Path $BuildRoot -Force | Out-Null

Write-Host ''
Write-Host '  Bridge is running.' -ForegroundColor Green
Write-Host "  http://127.0.0.1:$($server.Port)" -ForegroundColor Cyan
Write-Host ''
if ($script:Allowed.Count -gt 0) {
    Write-Note "Reachable from: $($script:Allowed -join ', ')"
} else {
    Write-Warn 'No app origin configured, so only pages on localhost may use it.'
    Write-Note 'Download the script from the app itself, or pass -Origin https://your-app-url'
}
Write-Note "Compiling up to $Concurrency sketches at a time."
Write-Host ''
Write-Host '  Go back to the app and open the Memory tab. Keep this window open.' -ForegroundColor White
Write-Host '  Press Ctrl+C to stop.' -ForegroundColor DarkGray
Write-Host ''

try {
    Invoke-ServerLoop $server.Listener $server.Port
} finally {
    try { $server.Listener.Stop(); $server.Listener.Close() } catch { }
    Write-Host ''
    Write-Host '  Bridge stopped.' -ForegroundColor DarkGray
}
