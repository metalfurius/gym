import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

// CreateDirectoryW applies the private DACL at creation, not through a later
// path-based chmod/Set-Acl that could itself follow a swapped junction.
// Only the new leaf is created. Existing directories are never modified.
const WINDOWS_PRIVATE_DIRECTORY = String.raw`
$ErrorActionPreference = 'Stop'
try {
    $sid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    if ($env:GYM_QA_ARTIFACT_ACTION -eq 'create') {
        Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Security.AccessControl;
public static class GymQaPrivateDirectory {
    [StructLayout(LayoutKind.Sequential)]
    private struct SecurityAttributes {
        public int Length;
        public IntPtr Descriptor;
        [MarshalAs(UnmanagedType.Bool)] public bool InheritHandle;
    }
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool CreateDirectoryW(string name, ref SecurityAttributes attributes);
    public static int Create(string name, string sid) {
        var descriptor = new RawSecurityDescriptor("O:" + sid + "D:P(A;OICI;FA;;;" + sid + ")(A;OICI;FA;;;SY)");
        var bytes = new byte[descriptor.BinaryLength];
        descriptor.GetBinaryForm(bytes, 0);
        var pinned = GCHandle.Alloc(bytes, GCHandleType.Pinned);
        try {
            var attributes = new SecurityAttributes { Length = Marshal.SizeOf(typeof(SecurityAttributes)),
                Descriptor = pinned.AddrOfPinnedObject(), InheritHandle = false };
            return CreateDirectoryW(name, ref attributes) ? 0 : Marshal.GetLastWin32Error();
        } finally { pinned.Free(); }
    }
}
'@
        $code = [GymQaPrivateDirectory]::Create($env:GYM_QA_ARTIFACT_DIRECTORY, $sid)
        if ($code -ne 0) { @{ ok = $false; code = $code } | ConvertTo-Json -Compress; exit 0 }
    }
    $acl = Get-Acl -LiteralPath $env:GYM_QA_ARTIFACT_DIRECTORY
    $rules = @($acl.GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier]))
    $allowed = @($sid, 'S-1-5-18')
    $private = $acl.AreAccessRulesProtected -and $acl.GetOwner([Security.Principal.SecurityIdentifier]).Value -eq $sid
    $ownerFull = $false
    foreach ($rule in $rules) {
        if ($rule.IdentityReference.Value -notin $allowed -or $rule.AccessControlType -ne 'Allow') { $private = $false }
        if ($rule.IdentityReference.Value -eq $sid -and ([int64]$rule.FileSystemRights -band 2032127) -eq 2032127) { $ownerFull = $true }
    }
    @{ ok = ($private -and $ownerFull -and $rules.Count -gt 0); code = 0 } | ConvertTo-Json -Compress
} catch { @{ ok = $false; code = -1 } | ConvertTo-Json -Compress }
`;

function windowsPrivateDirectory(directory, action) {
    const systemRoot = process.env.SystemRoot || 'C:\\Windows';
    let result;
    try {
        result = JSON.parse(
            execFileSync(
                path.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
                [
                    '-NoProfile',
                    '-NonInteractive',
                    '-EncodedCommand',
                    Buffer.from(WINDOWS_PRIVATE_DIRECTORY, 'utf16le').toString('base64'),
                ],
                {
                    // Never pass the runner's credential environment to this local
                    // metadata helper. Paths are data, never shell source.
                    env: {
                        SystemRoot: systemRoot,
                        WINDIR: systemRoot,
                        TEMP: os.tmpdir(),
                        TMP: os.tmpdir(),
                        GYM_QA_ARTIFACT_DIRECTORY: directory,
                        GYM_QA_ARTIFACT_ACTION: action,
                    },
                    windowsHide: true,
                    encoding: 'utf8',
                    timeout: 10_000,
                    maxBuffer: 32_768,
                    stdio: ['ignore', 'pipe', 'pipe'],
                }
            )
        );
    } catch {
        throw new Error('QA_ARTIFACT_WINDOWS_PRIVACY_UNVERIFIED');
    }
    if ([80, 183].includes(result.code)) throw new Error('QA_ARTIFACT_OUTPUT_NOT_NEW');
    assert(result.ok === true, 'QA_ARTIFACT_WINDOWS_PRIVACY_UNVERIFIED');
}

const comparable = value => (process.platform === 'win32' ? path.resolve(value).toLowerCase() : path.resolve(value));
const identity = stat => `${stat.dev}:${stat.ino}`;
const statAt = name => fs.lstatSync(name, { bigint: true });
const fileStat = fd => fs.fstatSync(fd, { bigint: true });

function directoryState(name, { privateRoot = false } = {}) {
    const stat = statAt(name);
    assert(stat.isDirectory() && !stat.isSymbolicLink(), 'QA_ARTIFACT_DIRECTORY_LINK_OR_TYPE');
    assert(stat.ino !== 0n, 'QA_ARTIFACT_IDENTITY_UNAVAILABLE');
    const real = fs.realpathSync.native(name);
    assert.equal(comparable(real), comparable(name), 'QA_ARTIFACT_DIRECTORY_ALIAS');
    if (process.platform !== 'win32') {
        const owner = BigInt(process.getuid());
        assert(stat.uid === owner || (!privateRoot && stat.uid === 0n), 'QA_ARTIFACT_DIRECTORY_OWNER');
        const mode = Number(stat.mode & 0o7777n);
        if (privateRoot) assert.equal(mode, 0o700, 'QA_ARTIFACT_DIRECTORY_NOT_PRIVATE');
        else {
            assert((mode & 0o022) === 0 || (stat.uid === 0n && (mode & 0o1000) !== 0), 'QA_ARTIFACT_WRITABLE_ANCESTOR');
        }
    }
    return { name, real, identity: identity(stat), privateRoot };
}

function ancestors(directory) {
    const result = [];
    for (let current = directory; ; current = path.dirname(current)) {
        result.unshift(directoryState(current));
        if (path.dirname(current) === current) return result;
    }
}

function outsideCheckout(directory, checkoutRoot) {
    const relative = path.relative(checkoutRoot, directory);
    assert(
        relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative),
        'QA_OUTPUT_MUST_BE_OUTSIDE_CHECKOUT'
    );
}

function validateWindowsPath(directory) {
    assert(/^[a-z]:\\/i.test(directory) && !directory.slice(2).includes(':'), 'QA_ARTIFACT_LOCAL_PATH_REQUIRED');
    assert(
        !directory
            .slice(3)
            .split(path.sep)
            .some(part => /[. ]$/.test(part) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part)),
        'QA_ARTIFACT_WINDOWS_PATH_ALIAS'
    );
}

function validateFile(fd, expected) {
    const stat = fileStat(fd);
    assert(stat.isFile() && stat.ino !== 0n && stat.nlink === 1n, 'QA_ARTIFACT_FILE_NOT_EXCLUSIVELY_OWNED');
    if (expected) assert.equal(identity(stat), expected, 'QA_ARTIFACT_FILE_IDENTITY_CHANGED');
    if (process.platform !== 'win32') {
        assert.equal(stat.uid, BigInt(process.getuid()), 'QA_ARTIFACT_FILE_OWNER');
        assert.equal(Number(stat.mode & 0o7777n), 0o600, 'QA_ARTIFACT_FILE_NOT_PRIVATE');
    }
    return identity(stat);
}

// All allocation is synchronous, exclusive and completed before the first
// network call/long await. Late writers receive only retained fds, never a path.
// Node lacks portable openat(): private creation plus ancestor checks bound
// allocation, while O_EXCL prevents even an allocation-time file substitution
// from overwriting an existing file. No recursive mkdir, chmod or deletion.
export function createQaArtifacts({ output, checkoutRoot }) {
    const parent = path.resolve(output ? path.dirname(path.resolve(output)) : os.tmpdir());
    const requested = output && path.resolve(output);
    if (requested) outsideCheckout(requested, path.resolve(checkoutRoot));
    if (process.platform === 'win32') validateWindowsPath(requested || parent);
    const chain = ancestors(parent);
    if (requested) outsideCheckout(requested, fs.realpathSync.native(checkoutRoot));
    else outsideCheckout(parent, fs.realpathSync.native(checkoutRoot));
    let directory;
    if (process.platform === 'win32') {
        directory = requested || path.join(parent, `gym-live-sync-qa-${crypto.randomUUID()}`);
        windowsPrivateDirectory(directory, 'create');
    } else if (requested) {
        try {
            fs.mkdirSync(requested, { mode: 0o700 });
        } catch (error) {
            if (error.code === 'EEXIST') throw new Error('QA_ARTIFACT_OUTPUT_NOT_NEW', { cause: error });
            throw error;
        }
        directory = requested;
    } else directory = fs.mkdtempSync(path.join(parent, 'gym-live-sync-qa-'));
    chain.push(directoryState(directory, { privateRoot: true }));
    const files = new Map();
    let closed = false;
    function verifyDirectories() {
        for (const previous of chain) {
            const current = directoryState(previous.name, previous);
            assert.equal(current.identity, previous.identity, 'QA_ARTIFACT_DIRECTORY_IDENTITY_CHANGED');
            assert.equal(comparable(current.real), comparable(previous.real), 'QA_ARTIFACT_DIRECTORY_IDENTITY_CHANGED');
        }
    }
    function verify() {
        assert(!closed, 'QA_ARTIFACT_HANDLES_CLOSED');
        verifyDirectories();
        if (process.platform === 'win32') windowsPrivateDirectory(directory, 'verify');
        verifyDirectories();
        for (const [name, file] of files) {
            validateFile(file.fd, file.identity);
            const stat = statAt(path.join(directory, name));
            assert(
                !stat.isSymbolicLink() && stat.isFile() && identity(stat) === file.identity,
                'QA_ARTIFACT_FILE_PATH_CHANGED'
            );
        }
    }
    function close() {
        if (closed) return;
        closed = true;
        const errors = [];
        for (const file of files.values()) {
            try {
                fs.closeSync(file.fd);
            } catch (error) {
                errors.push(error);
            }
        }
        if (errors.length) throw new Error('QA_ARTIFACT_CLOSE_FAILED');
    }
    try {
        verifyDirectories();
        for (const name of ['trace.json', 'result.json']) {
            const fd = fs.openSync(
                path.join(directory, name),
                fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | (fs.constants.O_NOFOLLOW || 0),
                0o600
            );
            // Retain before validation, so any failure still closes this fd.
            const file = { fd, identity: null };
            files.set(name, file);
            file.identity = validateFile(fd);
            verifyDirectories();
        }
        verify();
        return {
            output: directory,
            verify,
            write(name, contents) {
                assert(!closed && files.has(name), 'QA_ARTIFACT_UNKNOWN_OR_CLOSED_HANDLE');
                const file = files.get(name);
                validateFile(file.fd, file.identity);
                const bytes = Buffer.from(contents, 'utf8');
                fs.ftruncateSync(file.fd, 0);
                let written = 0;
                while (written < bytes.length) {
                    const count = fs.writeSync(file.fd, bytes, written, bytes.length - written, written);
                    assert(count > 0, 'QA_ARTIFACT_WRITE_STALLED');
                    written += count;
                }
                fs.fsyncSync(file.fd);
                validateFile(file.fd, file.identity);
            },
            close,
        };
    } catch (error) {
        try {
            close();
        } catch {
            /* Preserve allocation/integrity failure. */
        }
        throw error;
    }
}
