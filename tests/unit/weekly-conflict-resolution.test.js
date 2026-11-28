import { beforeEach, describe, expect, it } from '@jest/globals';
import { OfflineManager } from '../../js/utils/offline-manager.js';
import { DurableOutbox } from '../../js/utils/durable-outbox.js';
import { LocalFirstCache } from '../../js/utils/local-first-cache.js';

const manager = () => new OfflineManager({ outbox: new DurableOutbox(new LocalFirstCache()) });
const legacy = { userId: 'A', weeklyTargetDays: 5, updatedAtIso: '2026-11-27T11:12:13.456Z' };
async function conflict(client, id, payload, result = {}, type = 'preferences.saveWeeklyTarget') {
    client.queueOperation(null, id, { id, descriptor: { type, payload } });
    await client.persistQueue();
    await client.markConflict(id, Object.assign(new Error('Conflict'), { result: { currentRevision: 3, ...result } }));
}

describe('explicit resolution of immutable legacy weekly intents', () => {
    beforeEach(() => localStorage.clear());

    it('persists the canonical receipt week and resolves across cold and stale clients without descriptor changes', async () => {
        const first = manager();
        await conflict(first, 'legacy-target', legacy, { weekKey: '2026-11-23' });
        expect(first.pendingOperations[0].conflict.weekKey).toBe('2026-11-23');
        expect(first.pendingOperations[0].descriptor.payload).toEqual(legacy);
        const stale = manager(), cold = manager();
        await stale.restorePersistedQueue(); await cold.restorePersistedQueue();
        await cold.resolveConflicts('A', '2026-11-23');
        await stale.persistQueue();
        const reopened = manager(); await reopened.restorePersistedQueue();
        expect(reopened.pendingOperations).toHaveLength(0);
        expect(reopened.acknowledged.get('legacy-target')).toBe('resolved');
        expect(legacy).not.toHaveProperty('weekKey');
    });

    it('resolves an older conflict without week metadata from its original timestamp, never the current week', async () => {
        const client = manager();
        await conflict(client, 'old-conflict', legacy);
        const cold = manager(); await cold.restorePersistedQueue();
        await cold.resolveConflicts('A', '2027-01-04');
        expect(cold.pendingOperations.map(entry => entry.id)).toEqual(['old-conflict']);
        await cold.resolveConflicts('A', '2026-11-23');
        expect(cold.pendingOperations).toHaveLength(0);
    });

    it('uses a recorded canonical week when a timezone change would interpret the timestamp differently', async () => {
        const client = manager();
        await conflict(client, 'timezone-conflict', { ...legacy, updatedAtIso: '2026-11-23T00:30:00.000Z' },
            { weekKey: '2026-11-16' });
        await client.resolveConflicts('A', '2026-11-23');
        expect(client.pendingOperations.map(entry => entry.id)).toEqual(['timezone-conflict']);
        await client.resolveConflicts('A', '2026-11-16');
        expect(client.pendingOperations).toHaveLength(0);
    });

    it('retains foreign owners, other weeks, malformed dates and non-preference work', async () => {
        const client = manager();
        await conflict(client, 'selected', legacy);
        await conflict(client, 'foreign', { ...legacy, userId: 'B' });
        await conflict(client, 'other-week', { ...legacy, weekKey: '2026-11-16' });
        await conflict(client, 'invalid-date', { ...legacy, updatedAtIso: 'not-a-date' });
        await conflict(client, 'other-type', { ...legacy, sessionId: 'unrelated-session' }, {}, 'session.save');
        await client.resolveConflicts('A', '2026-11-23');
        expect(client.pendingOperations.map(entry => entry.id).sort()).toEqual([
            'foreign', 'invalid-date', 'other-type', 'other-week',
        ]);
        expect(client.acknowledged.get('selected')).toBe('resolved');
    });
});
