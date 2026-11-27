// Keep the owned launcher's final stderr available after bounded process cleanup.
export function captureBrowserDiagnostics(owner, { kind, executable, args, onEvent = () => {} }) {
    let stderr = '';
    let spawnError;
    owner.process.stderr?.on('data', bytes => { stderr = (stderr + String(bytes)).slice(-50_000); });
    owner.process.once('error', error => { spawnError = error.message; });
    const snapshot = () => ({ kind, executable, args, pid: owner.process.pid,
        exitCode: owner.process.exitCode, signal: owner.process.signalCode, stderr, spawnError });
    onEvent({ method: 'BrowserProcess.started', params: snapshot() });
    owner.process.once('exit', () => onEvent({ method: 'BrowserProcess.exited', params: snapshot() }));
    return {
        snapshot,
        failure(error) {
            error.browserDiagnostics = snapshot();
            error.message += `\nOwned ${kind} stderr:\n${stderr || '(no stderr received)'}`;
            onEvent({ method: 'BrowserProcess.failure', params: { ...snapshot(), error: error.message } });
            return error;
        },
    };
}
