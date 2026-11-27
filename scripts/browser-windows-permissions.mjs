import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import crypto from 'node:crypto';
import { promisify } from 'node:util';

const execute = promisify(execFile);

export async function inspectBrowserPermissionBoundary({ cacheDirectory, installDirectory, executable, archiveEntries }) {
    const cache = await fs.realpath(cacheDirectory);
    const installation = path.resolve(installDirectory);
    if (path.dirname(installation) !== path.resolve(cacheDirectory)
        || !/^chromium-\d+(?:\.\d+){3}-win32-[a-f\d]{12}$/.test(path.basename(installation))) {
        throw new Error('Refusing permissions outside a versioned Chromium installation');
    }
    if ((await fs.lstat(installation)).isSymbolicLink()
        || await fs.realpath(installation) !== path.join(cache, path.basename(installation))) {
        throw new Error('Refusing a redirected Chromium installation');
    }
    const application = path.join(installation, 'chrome-win64');
    if (path.resolve(executable) !== path.join(application, 'chrome.exe')) throw new Error('Unexpected Chromium executable boundary');
    const publicEntries = new Set(archiveEntries.map(entry => entry.replace(/\\/g, '/').replace(/\/$/, '')));
    const targets = [application];
    const untouched = [path.resolve(cacheDirectory), installation];
    let checkedFiles = 0;
    const visit = async directory => {
        if ((await fs.lstat(directory)).isSymbolicLink()) throw new Error('Refusing links inside public browser binaries');
        for (const item of await fs.readdir(directory, { withFileTypes: true })) {
            const file = path.join(directory, item.name);
            if (item.isSymbolicLink()) throw new Error('Refusing links inside public browser binaries');
            const relative = path.relative(installation, file).split(path.sep).join('/');
            if (item.isDirectory()) {
                if ([...publicEntries].some(entry => entry === relative || entry.startsWith(`${relative}/`))) targets.push(file);
                else untouched.push(file);
                await visit(file);
            }
            else if (item.isFile()) {
                // Chrome can add its own downloaded dictionaries after launch.
                // Unlisted files remain untouched rather than becoming public.
                if (publicEntries.has(relative)) {
                    if ((await fs.lstat(file)).nlink !== 1) throw new Error('Refusing hard links inside public browser binaries');
                    targets.push(file); checkedFiles += 1;
                } else untouched.push(file);
            } else throw new Error('Unexpected filesystem entry inside public browser binaries');
        }
    };
    await visit(application);
    if (!checkedFiles || !publicEntries.has('chrome-win64/chrome.exe')) throw new Error('Incomplete public browser archive manifest');
    return { directory: application, executable: path.resolve(executable), checkedFiles, targets, untouched };
}

const permissionsScript = `
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
trap { [Console]::Error.WriteLine($_.Exception.Message); exit 1 }
function Read-BrowserAcl($target) {
  if ([System.IO.Directory]::Exists($target)) { return [System.IO.Directory]::GetAccessControl($target) }
  return [System.IO.File]::GetAccessControl($target)
}
$required = @('S-1-15-2-1', 'S-1-15-2-2')
$readExecute = [System.Security.AccessControl.FileSystemRights]::ReadAndExecute
$write = [System.Security.AccessControl.FileSystemRights]::Write -bor [System.Security.AccessControl.FileSystemRights]::Delete -bor [System.Security.AccessControl.FileSystemRights]::ChangePermissions -bor [System.Security.AccessControl.FileSystemRights]::TakeOwnership
$manifest = Get-Content -LiteralPath $env:GYM_BROWSER_ACL_MANIFEST -Raw | ConvertFrom-Json
$targets = $manifest.targets
$before = @{}
foreach ($target in $manifest.untouched) {
  $before[$target] = (Read-BrowserAcl $target).GetSecurityDescriptorSddlForm([System.Security.AccessControl.AccessControlSections]::Access)
}
foreach ($target in $targets) {
  if ($target -isnot [string] -or -not [System.IO.Path]::IsPathRooted($target)) { throw 'Invalid public browser ACL target' }
  $acl = Read-BrowserAcl $target
  foreach ($sid in $required) {
    $identity = [System.Security.Principal.SecurityIdentifier]::new($sid)
    $rule = [System.Security.AccessControl.FileSystemAccessRule]::new($identity, $readExecute, [System.Security.AccessControl.AccessControlType]::Allow)
    $acl.SetAccessRule($rule)
  }
  if ([System.IO.Directory]::Exists($target)) { [System.IO.Directory]::SetAccessControl($target, $acl) }
  else { [System.IO.File]::SetAccessControl($target, $acl) }
}
$results = @(foreach ($target in $targets) {
  $rules = (Read-BrowserAcl $target).GetAccessRules($true, $true, [System.Security.Principal.SecurityIdentifier])
  $grants = @(foreach ($sid in $required) {
    $matching = @($rules | Where-Object { $_.IdentityReference.Value -eq $sid })
    $allowed = @($matching | Where-Object { $_.AccessControlType -eq 'Allow' -and ($_.FileSystemRights -band $readExecute) -eq $readExecute })
    $excessive = @($matching | Where-Object { $_.AccessControlType -eq 'Allow' -and ($_.FileSystemRights -band $write) -ne 0 })
    $denied = @($matching | Where-Object { $_.AccessControlType -eq 'Deny' -and ($_.FileSystemRights -band $readExecute) -ne 0 })
    if ($allowed.Count -eq 0 -or $excessive.Count -ne 0 -or $denied.Count -ne 0) { throw 'Browser package ACL is missing, denied or broader than read/execute' }
    [pscustomobject]@{ sid = $sid; rights = @($allowed | ForEach-Object { $_.FileSystemRights.ToString() }) }
  })
  if ($target -eq $env:GYM_BROWSER_ACL_DIRECTORY -or $target -eq $env:GYM_BROWSER_ACL_EXECUTABLE) {
    [pscustomobject]@{ path = $target; grants = $grants }
  }
})
foreach ($target in $manifest.untouched) {
  $after = (Read-BrowserAcl $target).GetSecurityDescriptorSddlForm([System.Security.AccessControl.AccessControlSections]::Access)
  if ($after -cne $before[$target]) { throw 'An ancestor or unlisted file ACL changed unexpectedly' }
}
ConvertTo-Json -InputObject $results -Depth 5 -Compress
`;

export async function configureWindowsBrowserPermissions(options, runCommand = execute) {
    const boundary = await inspectBrowserPermissionBoundary(options);
    const nativeOptions = { timeout: 30_000, windowsHide: true, maxBuffer: 2_000_000 };
    // Non-inheriting RX rules cover only archive-listed public files/directories.
    // No profile/cache ancestor, unknown file, owner or unrelated SID is changed.
    const manifest = path.join(options.installDirectory, `browser-acl-${crypto.randomUUID()}.json`);
    await fs.writeFile(manifest, JSON.stringify({ targets: boundary.targets, untouched: boundary.untouched }), { flag: 'wx' });
    let readback;
    try {
        readback = await runCommand('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand',
            Buffer.from(permissionsScript, 'utf16le').toString('base64')], {
            ...nativeOptions, env: { ...process.env, GYM_BROWSER_ACL_DIRECTORY: boundary.directory,
                GYM_BROWSER_ACL_EXECUTABLE: boundary.executable, GYM_BROWSER_ACL_MANIFEST: manifest },
        });
    } catch (error) {
        throw new Error(`Scoped Windows browser permission setup failed: ${error.stderr?.trim() || error.message}`, { cause: error });
    } finally { await fs.rm(manifest, { force: true }); }
    const grants = JSON.parse(readback.stdout.trim());
    if (!Array.isArray(grants) || grants.length !== 2) throw new Error('Invalid Windows browser ACL readback');
    const { targets, untouched, ...result } = boundary;
    return { ...result, verifiedTargets: targets.length, unchangedAclPaths: untouched.length, grants };
}
