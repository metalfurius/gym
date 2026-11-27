import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { after, before, beforeEach, test } from 'node:test';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, getDocFromServer, runTransaction, setDoc, writeBatch } from 'firebase/firestore';

const projectId = 'demo-gym-sync';
const epoch = 'gym-sync-v1-2026-11';
const policy = { version: 1, epoch };
let environment;
const path = (uid, tail) => `users/${uid}/${tail}`;
const userDb = uid => environment.authenticatedContext(uid).firestore();
const ref = (db, uid, tail) => doc(db, path(uid, tail));

before(async () => {
    assert.match(process.env.FIRESTORE_EMULATOR_HOST || '', /^127\.0\.0\.1:\d+$/);
    environment = await initializeTestEnvironment({
        projectId,
        firestore: { rules: await readFile(new URL('../../firestore.rules', import.meta.url), 'utf8') },
    });
});
beforeEach(async () => {
    await environment.clearFirestore();
    await admin(async db => setDoc(doc(db, 'runtime_config/sync_protocol'), policy));
});
after(async () => environment?.cleanup());

async function admin(action) {
    return environment.withSecurityRulesDisabled(context => action(context.firestore()));
}

async function enroll(db, uid, revision = 0) {
    const batch = writeBatch(db);
    batch.set(ref(db, uid, 'app_data/sync_protocol'), policy);
    batch.set(ref(db, uid, 'app_data/session_revision'), { revision, lastSessionId: null });
    return batch.commit();
}

async function mutate(db, uid, id, revision, data, remove = false) {
    const before = await getDoc(ref(db, uid, `sesiones_entrenamiento/${id}`));
    const batch = writeBatch(db);
    if (remove) batch.delete(ref(db, uid, `sesiones_entrenamiento/${id}`));
    else batch.set(ref(db, uid, `sesiones_entrenamiento/${id}`), data);
    batch.set(ref(db, uid, 'app_data/session_revision'), { revision, lastSessionId: id });
    if (remove || !before.exists()) {
        const kind = remove ? 'delete' : 'create';
        batch.set(ref(db, uid, `session_mutations/${id}/receipts/${kind}`), {
            sessionId: id,
            kind,
            changed: true,
            revision,
        });
    }
    return batch.commit();
}

test('unauthenticated and foreign owners cannot read or write protected or ordinary paths', async () => {
    const foreign = userDb('bob');
    const anonymous = environment.unauthenticatedContext().firestore();
    for (const db of [foreign, anonymous]) {
        for (const tail of [
            'routines/r1',
            'sesiones_entrenamiento/s1',
            'app_data/user_preferences',
            'app_data/session_revision',
            'app_data/sync_protocol',
            'app_data/other/nested/x',
            'app_data/user_preferences/weekly_operations/op1',
        ]) {
            await assertFails(getDoc(ref(db, 'alice', tail)));
            await assertFails(setDoc(ref(db, 'alice', tail), { value: 1 }));
        }
        await assertFails(setDoc(doc(db, 'users/alice'), { value: 1 }));
    }
    await assertFails(getDoc(doc(anonymous, 'runtime_config/sync_protocol')));
});

test('existing unenrolled v2.8.4 owners retain session, preferences, routine and unknown-data writes', async () => {
    const db = userDb('alice');
    for (const tail of [
        'sesiones_entrenamiento/s1',
        'routines/r1',
        'app_data/exercise_cache',
        'unknown/x/nested/y',
        'sesiones_entrenamiento/s1/notes/n1',
        'app_data/user_preferences/custom/n1',
    ]) {
        await assertSucceeds(setDoc(ref(db, 'alice', tail), { unknown: true }));
    }
    await assertSucceeds(
        setDoc(
            ref(db, 'alice', 'app_data/user_preferences'),
            { schemaVersion: 2, weeklyTargetDays: 6 },
            { merge: true }
        )
    );
    await assertSucceeds(deleteDoc(ref(db, 'alice', 'sesiones_entrenamiento/s1')));
});

test('global deployment attestation is readable but never client writable', async () => {
    const db = userDb('alice');
    assert.deepEqual((await assertSucceeds(getDoc(doc(db, 'runtime_config/sync_protocol')))).data(), policy);
    await assertFails(setDoc(doc(db, 'runtime_config/sync_protocol'), policy));
    await assertFails(deleteDoc(doc(db, 'runtime_config/sync_protocol')));
});

test('activation requires a matching server epoch and atomic counter initialization', async () => {
    const db = userDb('alice');
    await assertFails(setDoc(ref(db, 'alice', 'app_data/sync_protocol'), policy));
    for (const bad of [
        { version: 2, epoch },
        { version: 1, epoch: 'wrong' },
        { ...policy, extra: true },
    ]) {
        const batch = writeBatch(db);
        batch.set(ref(db, 'alice', 'app_data/sync_protocol'), bad);
        batch.set(ref(db, 'alice', 'app_data/session_revision'), { revision: 0, lastSessionId: null });
        await assertFails(batch.commit());
    }
    await admin(async db => deleteDoc(doc(db, 'runtime_config/sync_protocol')));
    await assertFails(enroll(db, 'alice'));
    await admin(async db => setDoc(doc(db, 'runtime_config/sync_protocol'), policy));
    await assertSucceeds(enroll(db, 'alice'));
    await assertFails(setDoc(ref(db, 'alice', 'app_data/sync_protocol'), { version: 1, epoch: 'changed' }));
    await assertFails(deleteDoc(ref(db, 'alice', 'app_data/sync_protocol')));
    await assertFails(deleteDoc(ref(db, 'alice', 'app_data/session_revision')));
});

test('activation preserves a preexisting counter and cannot reset its revision', async () => {
    await admin(async db => setDoc(ref(db, 'alice', 'app_data/session_revision'), { revision: 4 }));
    const db = userDb('alice');
    await assertFails(enroll(db, 'alice', 0));
    await assertSucceeds(enroll(db, 'alice', 4));
    await assertFails(setDoc(ref(db, 'alice', 'app_data/session_revision'), { revision: 4, lastSessionId: null }));
});

test('activation cannot be batched with an unmarked legacy session or preference write', async () => {
    const db = userDb('alice');
    for (const tail of ['sesiones_entrenamiento/old', 'app_data/user_preferences']) {
        const batch = writeBatch(db);
        batch.set(ref(db, 'alice', 'app_data/sync_protocol'), policy);
        batch.set(ref(db, 'alice', 'app_data/session_revision'), { revision: 0, lastSessionId: null });
        batch.set(ref(db, 'alice', tail), { schemaVersion: 2, weeklyTargetDays: 6 });
        await assertFails(batch.commit());
    }
});

test('fenced sessions require exactly the matching atomic counter for create, edit and delete', async () => {
    const db = userDb('alice');
    await enroll(db, 'alice');
    const session = ref(db, 'alice', 'sesiones_entrenamiento/s1');
    await assertFails(setDoc(session, { reps: 8 }));
    await assertFails(mutate(db, 'alice', 's1', 2, { reps: 8 }));
    await assertSucceeds(mutate(db, 'alice', 's1', 1, { reps: 8, unknown: 'preserved' }));
    await assertFails(setDoc(session, { reps: 9 }, { merge: true }));
    await assertSucceeds(mutate(db, 'alice', 's1', 2, { reps: 9, unknown: 'preserved' }));
    await assertFails(deleteDoc(session));
    await assertSucceeds(mutate(db, 'alice', 's1', 3, null, true));
    assert.equal((await getDoc(session)).exists(), false);
    assert.equal((await getDoc(ref(db, 'alice', 'app_data/session_revision'))).data().revision, 3);
});

test('a counter cannot advance alone, point at another ID or bless two session writes', async () => {
    const db = userDb('alice');
    await enroll(db, 'alice');
    await assertFails(setDoc(ref(db, 'alice', 'app_data/session_revision'), { revision: 1, lastSessionId: 'missing' }));
    for (const id of ['other', 'nested/id', '', null]) {
        const batch = writeBatch(db);
        batch.set(ref(db, 'alice', 'sesiones_entrenamiento/s1'), { reps: 8 });
        batch.set(ref(db, 'alice', 'app_data/session_revision'), { revision: 1, lastSessionId: id });
        await assertFails(batch.commit());
    }
    const batch = writeBatch(db);
    batch.set(ref(db, 'alice', 'sesiones_entrenamiento/s1'), { reps: 8 });
    batch.set(ref(db, 'alice', 'sesiones_entrenamiento/s2'), { reps: 8 });
    batch.set(ref(db, 'alice', 'app_data/session_revision'), { revision: 1, lastSessionId: 's1' });
    await assertFails(batch.commit());
    await assertSucceeds(mutate(db, 'alice', 's1', 1, { reps: 8 }));
    await assertFails(mutate(db, 'alice', 's1', 2, { reps: 8 }));
});

test('counter type, revision and field-shape checks reject malformed atomic writes', async () => {
    const db = userDb('alice');
    await enroll(db, 'alice');
    for (const revision of [-1, 0, 1.5, '1', null]) {
        await assertFails(mutate(db, 'alice', 's1', revision, { reps: 8 }));
    }
    const batch = writeBatch(db);
    batch.set(ref(db, 'alice', 'sesiones_entrenamiento/s1'), { reps: 8 });
    batch.set(ref(db, 'alice', 'app_data/session_revision'), { revision: 1, lastSessionId: 's1', reset: true });
    await assertFails(batch.commit());
    assert.equal((await getDoc(ref(db, 'alice', 'sesiones_entrenamiento/s1'))).exists(), false);
});

test('old preference merges retaining revision and old full replacements are denied after enrollment', async () => {
    const db = userDb('alice');
    const preferences = ref(db, 'alice', 'app_data/user_preferences');
    await setDoc(preferences, { schemaVersion: 2, weeklyTargetDays: 7, unknown: { preserve: true } });
    await enroll(db, 'alice');
    await assertFails(setDoc(preferences, { weeklyTargetDays: 6 }, { merge: true }));
    await assertFails(setDoc(preferences, { schemaVersion: 3, preferencesRevision: 0, weeklyTargetDays: 6 }));
    await assertSucceeds(
        setDoc(preferences, { schemaVersion: 3, preferencesRevision: 1, weeklyTargetDays: 4 }, { merge: true })
    );
    await assertFails(setDoc(preferences, { schemaVersion: 2, weeklyTargetDays: 6 }, { merge: true }));
    await assertFails(setDoc(preferences, { weeklyTargetDays: 6 }, { merge: true }));
    await assertFails(
        setDoc(preferences, { schemaVersion: 3, preferencesRevision: 3, weeklyTargetDays: 6 }, { merge: true })
    );
    await assertSucceeds(
        setDoc(preferences, { schemaVersion: 3, preferencesRevision: 2, weeklyTargetDays: 2 }, { merge: true })
    );
    const stored = (await getDoc(preferences)).data();
    assert.equal(stored.weeklyTargetDays, 2);
    assert.deepEqual(stored.unknown, { preserve: true });
    await assertFails(deleteDoc(preferences));
});

test('new preferences and immutable weekly receipts remain owner scoped', async () => {
    const db = userDb('alice');
    await enroll(db, 'alice');
    await assertSucceeds(
        setDoc(ref(db, 'alice', 'app_data/user_preferences'), { schemaVersion: 3, preferencesRevision: 1 })
    );
    const receipt = ref(db, 'alice', 'app_data/user_preferences/weekly_operations/op1');
    await assertSucceeds(setDoc(receipt, { status: 'conflict' }));
    await assertFails(setDoc(receipt, { status: 'applied' }));
    await assertFails(deleteDoc(receipt));
    await assertFails(setDoc(ref(db, 'alice', 'app_data/sync_protocol/nested/bypass'), policy));
    await assertFails(setDoc(ref(db, 'alice', 'app_data/session_revision/nested/bypass'), { revision: 0 }));
    await assertFails(
        setDoc(ref(db, 'alice', 'app_data/user_preferences/weekly_operations/op1/nested/bypass'), { status: 'applied' })
    );
});

test('fencing persists if the global attestation later disappears or changes', async () => {
    const db = userDb('alice');
    await enroll(db, 'alice');
    for (const global of [null, { version: 2, epoch: 'next' }]) {
        await admin(async db =>
            global
                ? setDoc(doc(db, 'runtime_config/sync_protocol'), global)
                : deleteDoc(doc(db, 'runtime_config/sync_protocol'))
        );
        await assertFails(setDoc(ref(db, 'alice', 'sesiones_entrenamiento/old'), { reps: 8 }));
        await assertFails(setDoc(ref(db, 'alice', 'app_data/user_preferences'), { schemaVersion: 2 }));
        await assertFails(deleteDoc(ref(db, 'alice', 'app_data/sync_protocol')));
    }
    await assertSucceeds(mutate(db, 'alice', 's1', 1, { reps: 8 }));
});

test('an acknowledged creation cannot be replayed after deletion and receipts are immutable', async () => {
    const db = userDb('alice');
    await enroll(db, 'alice');
    await assertSucceeds(mutate(db, 'alice', 's1', 1, { reps: 8 }));
    await assertSucceeds(mutate(db, 'alice', 's1', 2, null, true));
    await assertFails(mutate(db, 'alice', 's1', 3, { reps: 8 }));
    assert.equal((await getDoc(ref(db, 'alice', 'sesiones_entrenamiento/s1'))).exists(), false);
    assert.equal((await getDoc(ref(db, 'alice', 'app_data/session_revision'))).data().revision, 2);
    for (const kind of ['create', 'delete']) {
        const receipt = ref(db, 'alice', `session_mutations/s1/receipts/${kind}`);
        assert.equal((await getDoc(receipt)).data().changed, true);
        await assertFails(deleteDoc(receipt));
        await assertFails(setDoc(receipt, { sessionId: 's1', kind, changed: false, revision: 2 }));
    }
});

test('a deletion of an absent ID fences a creation still queued on another client', async () => {
    const db = userDb('alice');
    await enroll(db, 'alice');
    const receipt = ref(db, 'alice', 'session_mutations/not-created/receipts/delete');
    await assertSucceeds(setDoc(receipt, { sessionId: 'not-created', kind: 'delete', changed: false, revision: 0 }));
    await assertFails(mutate(db, 'alice', 'not-created', 1, { reps: 8 }));
    assert.equal((await getDoc(ref(db, 'alice', 'app_data/session_revision'))).data().revision, 0);
    await assertFails(setDoc(ref(db, 'alice', 'session_mutations/not-created'), { bypass: true }));
    await assertFails(
        setDoc(ref(db, 'alice', 'session_mutations/not-created/receipts/delete/nested/bypass'), { bypass: true })
    );
});

test('receipt witnesses require the actual atomic change or a proven unchanged legacy session', async () => {
    const db = userDb('alice');
    await setDoc(ref(db, 'alice', 'sesiones_entrenamiento/legacy'), { reps: 8, unknown: true });
    await enroll(db, 'alice');
    await assertSucceeds(
        setDoc(ref(db, 'alice', 'session_mutations/legacy/receipts/create'), {
            sessionId: 'legacy',
            kind: 'create',
            changed: false,
            revision: 0,
        })
    );
    for (const data of [
        { sessionId: 'missing', kind: 'create', changed: false, revision: 0 },
        { sessionId: 'missing', kind: 'create', changed: true, revision: 1 },
        { sessionId: 'other', kind: 'create', changed: false, revision: 0 },
    ]) {
        await assertFails(setDoc(ref(db, 'alice', 'session_mutations/missing/receipts/create'), data));
    }
    const batch = writeBatch(db);
    batch.set(ref(db, 'alice', 'sesiones_entrenamiento/missing'), { reps: 8 });
    batch.set(ref(db, 'alice', 'app_data/session_revision'), { revision: 1, lastSessionId: 'missing' });
    await assertFails(batch.commit());
    await assertFails(getDoc(ref(userDb('bob'), 'alice', 'session_mutations/legacy/receipts/create')));
});

test('concurrent writers expose denial and recover only with newer revision and current owner/epoch', async () => {
    const db = userDb('alice');
    await enroll(db, 'alice');
    let release;
    const bothRead = new Promise(resolve => {
        release = resolve;
    });
    let arrivals = 0;
    const intents = ['first', 'second'].map(id => Object.freeze({ uid: 'alice', id, value: 8 }));
    const originals = JSON.stringify(intents);
    const observed = new Map();
    async function execute(intent, synchronize = false, invalidIncrement = false) {
        let joined = false;
        return runTransaction(db, async transaction => {
            const session = ref(db, intent.uid, `sesiones_entrenamiento/${intent.id}`);
            const counter = ref(db, intent.uid, 'app_data/session_revision');
            const create = ref(db, intent.uid, `session_mutations/${intent.id}/receipts/create`);
            const deletion = ref(db, intent.uid, `session_mutations/${intent.id}/receipts/delete`);
            const [record, revision, receipt, tombstone] = await Promise.all([
                transaction.get(session),
                transaction.get(counter),
                transaction.get(create),
                transaction.get(deletion),
            ]);
            observed.set(intent.id, revision.data().revision);
            if (synchronize && !joined) {
                joined = true;
                if (++arrivals === 2) release();
                await bothRead;
            }
            if (receipt.exists() || tombstone.exists() || record.exists()) return;
            const next = revision.data().revision + (invalidIncrement ? 2 : 1);
            transaction.set(session, { reps: intent.value });
            transaction.set(counter, { revision: next, lastSessionId: intent.id });
            transaction.set(create, { sessionId: intent.id, kind: 'create', changed: true, revision: next });
        });
    }
    // One explicit recovery attempt demonstrates the bounded contract. The
    // frontend owns its separate bounded loop and durable exhaustion handling.
    async function recover(intent, error, activeUid, operation) {
        if (error.code !== 'permission-denied' || activeUid !== intent.uid) throw error;
        const [revision, global, owned] = await Promise.all([
            getDocFromServer(ref(db, intent.uid, 'app_data/session_revision')),
            getDocFromServer(doc(db, 'runtime_config/sync_protocol')),
            getDocFromServer(ref(db, intent.uid, 'app_data/sync_protocol')),
        ]);
        if (
            revision.data()?.revision <= observed.get(intent.id) ||
            global.data()?.version !== 1 ||
            global.data()?.epoch !== epoch ||
            owned.data()?.version !== 1 ||
            owned.data()?.epoch !== epoch
        ) {
            throw error;
        }
        return operation(intent);
    }
    const results = await Promise.allSettled(intents.map(intent => execute(intent, true)));
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
    const failedIndex = results.findIndex(result => result.status === 'rejected');
    const rejection = results[failedIndex].reason;
    assert.equal(rejection.code, 'permission-denied');
    assert.equal(observed.get(intents[failedIndex].id), 0);
    await recover(intents[failedIndex], rejection, 'alice', intent => execute(intent));
    assert.equal(JSON.stringify(intents), originals);
    assert.equal((await getDoc(ref(db, 'alice', 'app_data/session_revision'))).data().revision, 2);
    for (const intent of intents) {
        assert.equal((await getDoc(ref(db, 'alice', `sesiones_entrenamiento/${intent.id}`))).data().reps, 8);
    }
    const invalid = Object.freeze({ uid: 'alice', id: 'permanent-denial', value: 8 });
    let permanent;
    try {
        await execute(invalid, false, true);
    } catch (error) {
        permanent = error;
    }
    assert.equal(permanent?.code, 'permission-denied');
    let attempted = false;
    const forbidden = () => {
        attempted = true;
        throw new Error('A permanent denial must not be retried');
    };
    await assert.rejects(recover(invalid, permanent, 'alice', forbidden), error => error === permanent);
    await assert.rejects(recover(intents[0], rejection, 'bob', forbidden), error => error === rejection);
    await admin(async adminDb => setDoc(doc(adminDb, 'runtime_config/sync_protocol'), { version: 1, epoch: 'wrong' }));
    observed.set(invalid.id, 0);
    await assert.rejects(recover(invalid, permanent, 'alice', forbidden), error => error === permanent);
    assert.equal(attempted, false);
    assert.equal((await getDoc(ref(db, 'alice', 'sesiones_entrenamiento/permanent-denial'))).exists(), false);
});
