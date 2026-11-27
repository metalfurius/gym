// Declarative barriers, not an arbitrary command/workflow interpreter. Every
// action below maps to a fixed public-UI or assertion routine in the runner.
export function liveSyncPhases() {
    const phases = [
        { name: 'initial-calendar-both', actor: 'both', action: 'initial' },
        { name: 'different-week-A-offline-plus7d', actor: 'A', action: 'different-offline' },
        { name: 'different-week-B-online-base', actor: 'B', action: 'target', value: 6, initialWeek: true },
        { name: 'different-week-A-reconnect', actor: 'A', action: 'different-reconnect' },
        { name: 'different-weeks-both-confirm-plus7d', actor: 'both', action: 'different-converge' },
        { name: 'same-week-read-identical-base', actor: 'both', action: 'base', key: 'same' },
        { name: 'same-week-A-applies', actor: 'A', action: 'target', value: 5 },
        { name: 'same-week-B-stale-conflict', actor: 'B', action: 'stale', value: 7, preserved: 5 },
        { name: 'same-week-B-explicit-resolution', actor: 'B', action: 'target', value: 7 },
        { name: 'same-week-both-reload-converge', actor: 'both', action: 'converge', value: 7 },
        { name: 'cold-A-two-offline-intents', actor: 'A', action: 'queue-two', key: 'cold', first: 4, second: 5 },
        { name: 'cold-B-new-server-value', actor: 'B', action: 'target', value: 6 },
        { name: 'cold-A-full-process-offline-restart', actor: 'A', action: 'cold-restart' },
        {
            name: 'cold-A-reconnect-conflict-blocked',
            actor: 'A',
            action: 'reconnect-conflict',
            key: 'cold',
            preserved: 6,
        },
        { name: 'cold-A-explicit-resolution', actor: 'A', action: 'target', value: 3 },
        { name: 'cold-both-reload-converge', actor: 'both', action: 'converge', value: 3 },
    ];
    for (const [key, first, second, preserved, resolved] of [
        ['A-then-B', 'A', 'B', 5, 2],
        ['B-then-A', 'B', 'A', 7, 3],
    ]) {
        phases.push(
            { name: `${key}-both-read-base`, actor: 'both', action: 'base', key },
            { name: `${key}-both-offline-multiple`, actor: 'both', action: 'queue-two', key },
            {
                name: `${key}-first-reconnect-${first}`,
                actor: first,
                action: 'reconnect-accepted',
                key,
                value: preserved,
            },
            { name: `${key}-second-reconnect-${second}`, actor: second, action: 'reconnect-conflict', key, preserved },
            { name: `${key}-second-explicit-resolution`, actor: second, action: 'target', value: resolved },
            { name: `${key}-both-reload-converge`, actor: 'both', action: 'converge', value: resolved }
        );
    }
    phases.push(
        { name: 'owner-A-queue-primary-offline', actor: 'A', action: 'owner-queue' },
        { name: 'owner-A-other-login-no-primary-replay', actor: 'A', action: 'owner-other' },
        { name: 'owner-A-primary-login-replays-only-primary', actor: 'A', action: 'owner-primary' },
        { name: 'both-logout-login-reload', actor: 'both', action: 'reauthenticate' },
        { name: 'session-baseline-and-verify-create-only-routine', actor: 'A', action: 'routine' },
        { name: 'sessions-three-captures-and-quicklogs', actor: 'A', action: 'sessions' },
        { name: 'both-all-surfaces-before-delete', actor: 'both', action: 'surfaces' },
        { name: 'B-deletes-single-owned-last-page-record', actor: 'B', action: 'delete-sentinel' },
        { name: 'both-all-surfaces-after-delete', actor: 'both', action: 'surfaces' },
        { name: 'A-ui-cleans-only-run-sessions', actor: 'A', action: 'cleanup-sessions' },
        { name: 'both-baseline-records-preserved', actor: 'both', action: 'baseline-preserved' }
    );
    return phases;
}
