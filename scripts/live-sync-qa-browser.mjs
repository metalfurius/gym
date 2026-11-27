import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { spawnOwnedBrowser } from './owned-browser-process.mjs';
import { connectOwnedChromium } from './browser-cdp-target.mjs';
import { PRIMARY_UID, OTHER_UID, PROJECT, CLOCK_INITIAL, digest, until, canonical } from './live-sync-qa-protocol.mjs';
import { CommitObservation } from './live-sync-qa-observations.mjs';

const mime = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.png': 'image/png',
    '.ico': 'image/x-icon',
    '.svg': 'image/svg+xml',
};

// Serialized into the owned page for a read-only observation of the rendered
// detail. Kept separate so the runner's selectors also exercise the real UI
// renderer in local DOM regressions without an account or service request.
export function readSessionDetailDom(session, expectedDateText) {
    return {
        id: session?.id,
        dateIso: session?.fecha?.toDate().toISOString(),
        label: document.getElementById('session-detail-title').textContent,
        expectedDateText,
        dateText: document.getElementById('session-detail-date').textContent,
        sets: [...document.querySelectorAll('#session-detail-exercises .sets-list li')].map(e => e.textContent),
        body: document.getElementById('session-detail-exercises').textContent,
    };
}

export function canonicalCandidate(
    root,
    expectedSha,
    git = args => execFileSync('git', args, { cwd: root, maxBuffer: 20_000_000 })
) {
    assert.equal(
        git(['status', '--porcelain', '--untracked-files=all']).toString().trim(),
        '',
        'QA_CLEAN_CHECKOUT_REQUIRED'
    );
    const sha = git(['rev-parse', 'HEAD']).toString().trim();
    assert.equal(sha, expectedSha, 'QA_CHECKOUT_SHA_MISMATCH');
    const release = JSON.parse(git(['show', 'HEAD:release.json']).toString());
    assert(
        /^v\d+\.\d+\.\d+$/.test(release.revision) && release.assets && Object.keys(release.assets).length,
        'QA_INVALID_RELEASE'
    );
    const files = new Map();
    for (const name of new Set([
        ...Object.keys(release.assets),
        'index.html',
        'manifest.json',
        'release.json',
        'sw.js',
    ])) {
        assert(
            name &&
                !name.includes('\\') &&
                !name.includes('?') &&
                !name.includes('#') &&
                !name.includes('\0') &&
                !path.posix.isAbsolute(name) &&
                !name.split('/').some(part => ['..', '.'].includes(part)),
            'QA_ASSET_ESCAPE'
        );
        const bytes = git(['show', `HEAD:${name}`]);
        if (release.assets[name]) {
            assert.equal(
                crypto.createHash('sha256').update(bytes).digest('hex'),
                release.assets[name],
                `QA_CANONICAL_ASSET_HASH:${name}`
            );
        }
        files.set(`/gym/${name}`, Buffer.from(bytes));
    }
    const config = files.get('/gym/js/firebase-config.js')?.toString();
    assert(config && /projectId:\s*['"]gymm-178fb['"]/.test(config), 'QA_FIXED_FIREBASE_PROJECT_REQUIRED');
    const apiKey = config.match(/apiKey:\s*['"]([^'"]+)['"]/)?.[1];
    assert(apiKey, 'QA_FIREBASE_CONFIG_REQUIRED');
    const manifest = JSON.parse(files.get('/gym/manifest.json').toString());
    assert.equal(manifest.release_revision, release.revision, 'QA_MANIFEST_REVISION_MISMATCH');
    assert(
        files.get('/gym/index.html').toString().includes(`content="${release.revision}"`),
        'QA_SHELL_REVISION_MISMATCH'
    );
    assert(
        files.get('/gym/sw.js').toString().includes(`RELEASE_REVISION = '${release.revision}'`),
        'QA_WORKER_REVISION_MISMATCH'
    );
    return { sha, release, files, apiKey };
}

export async function startCandidateServer(candidate) {
    // Serve only already-verified immutable blobs: no filesystem fallback,
    // transformation, proxy, SDK interception or application instrumentation.
    const server = http.createServer((request, response) => {
        let pathname;
        try {
            pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
        } catch {
            response.writeHead(400).end();
            return;
        }
        if (!['GET', 'HEAD'].includes(request.method)) {
            response.writeHead(405).end();
            return;
        }
        if (pathname === '/gym/') pathname = '/gym/index.html';
        const bytes = candidate.files.get(pathname);
        if (!bytes) {
            response.writeHead(404).end();
            return;
        }
        response.writeHead(200, {
            'Content-Type': mime[path.extname(pathname)] || 'application/octet-stream',
            'Cache-Control': 'no-store',
            'X-Content-Type-Options': 'nosniff',
            'X-Gym-QA-Source': candidate.sha,
        });
        response.end(request.method === 'HEAD' ? undefined : bytes);
    });
    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
    });
    return {
        url: `http://127.0.0.1:${server.address().port}/gym/`,
        async close() {
            server.closeAllConnections();
            await new Promise((resolve, reject) => server.close(error => (error ? reject(error) : resolve())));
        },
    };
}

export class QaBrowser {
    constructor({ url, candidate, clean, signal, trace, role, baseCalendarIso = CLOCK_INITIAL }) {
        Object.assign(this, { url, candidate, clean, signal, trace, role });
        this.clock = baseCalendarIso;
        this.owners = [];
        this.closedOwners = new Set();
        this.connections = [];
        this.commitObservation = new CommitObservation();
    }
    async initialize() {
        this.profile = await fs.mkdtemp(path.join(os.tmpdir(), 'gym-smoke-real-sync-'));
        this.profileRealPath = await fs.realpath(this.profile);
        const runtime = JSON.parse(await fs.readFile(new URL('./browser-runtime-lock.json', import.meta.url), 'utf8'));
        const receipt = JSON.parse(await fs.readFile(process.env.BROWSER_SMOKE_INSTALL_RECEIPT, 'utf8'));
        assert(
            receipt.status === 'passed' &&
                receipt.browser === 'chromium' &&
                receipt.version === runtime.chromium.version &&
                receipt.executable === process.env.CHROME_PATH &&
                receipt.archiveSha256 === runtime.chromium[process.platform]?.sha256,
            'QA_PINNED_BROWSER_RECEIPT_REQUIRED'
        );
        this.expectedBrowserVersion = runtime.chromium.version;
        if (process.platform === 'linux') {
            const helper = process.env.CHROME_DEVEL_SANDBOX;
            assert(helper, 'QA_VERIFIED_LINUX_SANDBOX_REQUIRED');
            const stat = await fs.lstat(helper);
            assert(
                stat.isFile() &&
                    !stat.isSymbolicLink() &&
                    stat.uid === 0 &&
                    stat.gid === 0 &&
                    stat.nlink === 1 &&
                    (stat.mode & 0o7777) === 0o4755 &&
                    (await fs.realpath(helper)) === path.resolve(helper),
                'QA_SANDBOX_OWNERSHIP_REQUIRED'
            );
            assert.equal(
                crypto
                    .createHash('sha256')
                    .update(await fs.readFile(helper))
                    .digest('hex'),
                runtime.chromium.linux.sandboxSha256,
                'QA_SANDBOX_HASH_MISMATCH'
            );
            this.sandboxPath = helper;
        }
    }
    event(event) {
        try {
            this.commitObservation.observe(event, () => this.client.evaluate('navigator.onLine'));
        } catch {
            this.observationError ||= new Error('QA_COMMIT_OBSERVATION_FAILED');
        }
        // Never retain raw CDP events: Auth requests, console args, headers and
        // Runtime exception payloads can contain credentials or private data.
        this.trace.push({
            at: new Date().toISOString(),
            method: event.method,
            ...(event.method === 'BrowserProtocol.command' ? { command: event.params?.method } : {}),
        });
        if (event.method === 'Page.javascriptDialogOpening') {
            const accept = event.params?.type === 'confirm' && !!(this.pendingDelete || this.pendingCancel);
            this.client?.send('Page.handleJavaScriptDialog', { accept }).catch(() => {});
            if (!accept) this.unexpectedDialog = true;
        }
    }
    async start(offline = false) {
        assert(!this.owner, 'QA_BROWSER_ALREADY_RUNNING');
        await fs.rm(path.join(this.profile, 'DevToolsActivePort'), { force: true });
        const args = [
            '--headless=new',
            '--disable-gpu',
            '--disable-dev-shm-usage',
            '--disable-extensions',
            '--no-first-run',
            '--no-default-browser-check',
            '--remote-allow-origins=*',
            '--remote-debugging-address=127.0.0.1',
            '--remote-debugging-port=0',
            `--user-data-dir=${this.profile}`,
            'about:blank',
        ];
        this.owner = spawnOwnedBrowser(process.env.CHROME_PATH, args);
        this.owners.push(this.owner);
        const connection = await connectOwnedChromium(
            this.owner,
            this.profile,
            'about:blank',
            event => this.event(event),
            this.signal
        );
        this.connections.push(connection.client);
        this.client = connection.client;
        assert.equal(
            connection.version.product.split('/').pop(),
            this.expectedBrowserVersion,
            'QA_BROWSER_VERSION_MISMATCH'
        );
        this.version = connection.version.product;
        await this.client.send('Emulation.setTimezoneOverride', { timezoneId: 'Europe/Paris' });
        await this.network(offline); // BEFORE navigation, including cold offline restart.
        await this.clockAt(this.clock);
        await this.client.send('Page.navigate', { url: this.url });
        await this.waitPage(
            'document.readyState === "complete" && !!document.getElementById("login-email-btn")',
            'app-document'
        );
    }
    async stop() {
        const owner = this.owner;
        if (!owner) return;
        await owner.close();
        this.closedOwners.add(owner);
        this.owner = null;
        this.client?.close();
        this.client = null;
    }
    async removeProfile() {
        assert(
            this.owners.every(owner => this.closedOwners.has(owner)),
            'QA_PROFILE_RETAINED_BROWSER_CLOSE_UNPROVEN'
        );
        const resolved = path.resolve(this.profile);
        assert(
            path.dirname(resolved) === path.resolve(os.tmpdir()) &&
                path.basename(resolved).startsWith('gym-smoke-real-sync-') &&
                (await fs.realpath(resolved)) === this.profileRealPath,
            'QA_UNOWNED_PROFILE_CLEANUP_DENIED'
        );
        await fs.rm(resolved, { recursive: true, force: true, maxRetries: 4, retryDelay: 100 });
        this.profileRemoved = true;
    }
    async waitPage(expression, label, timeoutMs = 60_000) {
        return until(
            async () => {
                assert(!this.unexpectedDialog, 'QA_UNEXPECTED_DIALOG');
                if (this.observationError) throw this.observationError;
                try {
                    return await this.client.evaluate(expression);
                } catch (error) {
                    if (/context.*destroyed|context.*not found|Cannot find context/i.test(error.message)) return false;
                    throw error;
                }
            },
            { signal: this.signal, timeoutMs, label }
        );
    }
    async field(selector, value) {
        await this.waitPage(
            `!!document.querySelector(${JSON.stringify(selector)}) && !document.querySelector(${JSON.stringify(selector)}).disabled && document.querySelector(${JSON.stringify(selector)}).getClientRects().length>0`,
            'field-ready'
        );
        await this.client.evaluate(
            `(() => { const element=document.querySelector(${JSON.stringify(selector)}); element.value=${JSON.stringify(String(value))}; element.dispatchEvent(new Event('input',{bubbles:true})); element.dispatchEvent(new Event('change',{bubbles:true})); })()`
        );
    }
    async click(selector) {
        await this.waitPage(
            `(() => {const e=document.querySelector(${JSON.stringify(selector)}); return !!e && !e.disabled && e.getClientRects().length>0})()`,
            'public-control-ready'
        );
        await this.client.evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
    }
    async network(offline, latency = 0) {
        assert(Number.isInteger(latency) && latency >= 0 && latency <= 15_000, 'QA_INVALID_NETWORK_LATENCY');
        await this.client.send('Network.emulateNetworkConditions', {
            offline,
            latency,
            downloadThroughput: -1,
            uploadThroughput: -1,
        });
        await this.waitPage(`navigator.onLine === ${!offline}`, 'browser-network-state');
        this.offline = offline;
    }
    beginCommitWindow() {
        assert.equal(this.offline, false);
        this.commitObservation.begin();
    }
    async waitOpenCommit() {
        await until(
            () => {
                if (this.observationError) throw this.observationError;
                return this.commitObservation.openFirst();
            },
            { signal: this.signal, label: 'first-real-Commit-open-online' }
        );
        return this.commitObservation.requireOpen();
    }
    requireOpenCommit(ordinal) {
        if (this.observationError) throw this.observationError;
        return this.commitObservation.requireOpen(ordinal);
    }
    async endCommitWindow() {
        await until(
            () => {
                if (this.observationError) throw this.observationError;
                return this.commitObservation.complete();
            },
            { signal: this.signal, label: 'Commit-metadata-complete' }
        );
        return this.commitObservation.finish();
    }
    async knownTargetIntents() {
        return this.client.evaluate(`(async()=>{const {offlineManager:q}=await import('./js/utils/offline-manager.js');
            const entries=new Map([...q.knownIntents,...q.pendingOperations.map(e=>[e.id,e])]);
            return [...entries.values()].filter(e=>e.descriptor?.type==='preferences.saveWeeklyTarget'&&e.descriptor.payload?.userId===${JSON.stringify(PRIMARY_UID)})
                .map(e=>({id:e.id,operationId:e.descriptor.payload.operationId,baseRevision:e.descriptor.payload.baseRevision,baseOperationId:e.descriptor.payload.baseOperationId,baseFingerprint:e.descriptor.payload.baseFingerprint,
                    target:e.descriptor.payload.weekRecord.targetSessions,updatedAtIso:e.descriptor.payload.updatedAtIso}));})()`);
    }
    async clockAt(value) {
        assert(Number.isFinite(Date.parse(value)), 'QA_INVALID_CALENDAR_CLOCK');
        this.clock = value;
        if (this.clockScript) {
            await this.client.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: this.clockScript });
        }
        const source = `globalThis.__GYM_WEEKLY_TARGET_NOW_ISO=${JSON.stringify(value)};`;
        this.clockScript = (await this.client.send('Page.addScriptToEvaluateOnNewDocument', { source })).identifier;
        await this.client.evaluate(source);
    }
    async login(account) {
        await this.waitPage('!document.getElementById("auth-view").classList.contains("hidden")', 'login-view');
        await this.field('#auth-email', account.email);
        await this.field('#auth-password', account.password);
        await this.click('#login-email-btn');
        await this.authenticated(account.uid);
        await this.field('#language-select', this.role === 'A' ? 'es' : 'en');
    }
    async authenticated(uid = PRIMARY_UID) {
        await this.waitPage(
            `(async()=>{const {getCurrentUser}=await import('./js/auth.js'); const {auth}=await import('./js/firebase-config.js');
            if(auth.app.options.projectId!==${JSON.stringify(PROJECT)})throw Error('QA_BROWSER_PROJECT_MISMATCH');
            const user=getCurrentUser();if(user&&user.uid!==${JSON.stringify(uid)})throw Error('QA_BROWSER_UID_MISMATCH');
            return user?.uid===${JSON.stringify(uid)} && !document.getElementById('dashboard-view').classList.contains('hidden')})()`,
            'verified-authenticated-owner'
        );
        const state = await this.snapshot();
        assert.equal(state.revision, this.candidate.release.revision, 'QA_BROWSER_RELEASE_MISMATCH');
        return state;
    }
    async reload(uid = PRIMARY_UID) {
        await this.client.send('Page.reload');
        await this.authenticated(uid);
    }
    async logout() {
        await this.closeSettings();
        await this.click('#logout-btn');
        await this.waitPage(
            `(async()=>{const {getCurrentUser}=await import('./js/auth.js');return !getCurrentUser()&&!document.getElementById('auth-view').classList.contains('hidden')})()`,
            'logged-out'
        );
    }
    async settings() {
        if (!(await this.client.evaluate('document.getElementById("settings-modal").getClientRects().length>0'))) {
            await this.click('#settings-btn');
        }
    }
    async closeSettings() {
        if (await this.client.evaluate('document.getElementById("settings-modal").getClientRects().length>0')) {
            await this.click('.settings-modal-close');
        }
    }
    async saveTarget(value, clock) {
        await this.assertOwner();
        if (clock) await this.clockAt(clock);
        await this.settings();
        await this.field('#weekly-target-days-select', value);
        await this.click('#weekly-target-save-btn');
        await this.waitPage('!document.getElementById("weekly-target-save-btn").disabled', 'target-ui-settled');
        await this.closeSettings();
        return this.snapshot();
    }
    async assertOwner() {
        await this.waitPage(
            `(async()=>{const {getCurrentUser}=await import('./js/auth.js');if(getCurrentUser()?.uid!==${JSON.stringify(PRIMARY_UID)})throw Error('QA_PRODUCT_WRITE_OWNER_MISMATCH');return true})()`,
            'product-write-owner'
        );
    }
    async submitStaleTarget(value, clock, expectedBaseRevision) {
        assert.equal(this.offline, true, 'QA_STALE_FIXTURE_MUST_START_OFFLINE');
        await this.saveTarget(value, clock);
        const saved = await this.waitQueue(
            state =>
                !state.online &&
                state.verified &&
                state.queue.length === 1 &&
                !state.staged &&
                !state.unknown &&
                !state.pendingAcks,
            'stale-intent-durable-before-reconnect'
        );
        const intent = saved.queue[0];
        assert.equal(intent.baseRevision, expectedBaseRevision, 'QA_STALE_BASE_CHANGED_BEFORE_SUBMISSION');
        assert.equal(intent.target, value);
        await this.network(false);
        const ui = await this.waitQueue(
            state =>
                state.online &&
                state.conflicts === 1 &&
                state.queue.some(entry => entry.id === intent.id && entry.status === 'conflict'),
            'explicit-stale-base-conflict'
        );
        return { queued: saved.queue, ui };
    }
    async snapshot() {
        const state = await this.client.evaluate(`(async()=>{
            const {offlineManager:q}=await import('./js/utils/offline-manager.js'); const {getCurrentUser}=await import('./js/auth.js');
            const {auth}=await import('./js/firebase-config.js'); const uid=getCurrentUser()?.uid;
            const {localFirstCache}=await import('./js/utils/local-first-cache.js');
            const {weeklyTargetFingerprint}=await import('./js/utils/weekly-preferences.js');
            const cached=uid?(await localFirstCache.getEntry('user-preferences:'+uid))?.value:null;
            const idbRows=await localFirstCache.getAllFromIndexedDb('offline:journal:v3:batch:');
            const idbJournalHash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(idbRows))))].map(b=>b.toString(16).padStart(2,'0')).join('');
            const owner=uid===${JSON.stringify(PRIMARY_UID)}?'primary':uid===${JSON.stringify(OTHER_UID)}?'other':uid?'unexpected':null;
            const queue=q.pendingOperations.map(e=>({id:e.id,type:e.descriptor?.type,owner:e.descriptor?.payload?.userId===${JSON.stringify(PRIMARY_UID)}?'primary':'other',
                status:e.status||'pending',timestamp:e.timestamp,operationId:e.descriptor?.payload?.operationId||null,weekKey:e.descriptor?.payload?.weekKey||null,
                updatedAtIso:e.descriptor?.payload?.updatedAtIso||null,target:e.descriptor?.payload?.weekRecord?.targetSessions??null,
                baseRevision:e.descriptor?.payload?.baseRevision??null,baseOperationId:e.descriptor?.payload?.baseOperationId||null,
                sessionId:e.descriptor?.payload?.sessionId||null,
                predecessorIds:e.predecessorIds||[],semanticDependencyIds:e.semanticDependencyIds||[]}));
            return {owner,project:auth.app.options.projectId,online:navigator.onLine,clock:globalThis.__GYM_WEEKLY_TARGET_NOW_ISO,
                revision:document.querySelector('meta[name="gym-release-revision"]').content,controller:!!navigator.serviceWorker.controller,
                target:Number(document.getElementById('weekly-target-days-select').value),visiblePending:q.getPendingCount(),conflicts:q.getConflictCount(),
                preferenceRevision:cached?.preferencesRevision||0,weekRecords:Object.fromEntries(Object.entries(cached?.weeklyTargetsByWeek||{}).map(([week,r])=>[week,{target:r.targetSessions??r.targetDays,revision:r.revision||0,operationId:r.operationId||null,updatedAtIso:r.updatedAtIso||null,fingerprint:weeklyTargetFingerprint(r)}])),
                queue,verified:q.queueViewVerified,staged:q.stagedIds.size,unknown:q.unknownIds.size,pendingAcks:q.pendingAcknowledgements.size,idbJournalRows:idbRows.length,idbJournalHash,
                monthCount:Number(document.getElementById('daily-hub-month-count').textContent),weekly:document.getElementById('daily-hub-weekly-progress').textContent,
                databases:(await indexedDB.databases()).map(d=>d.name).sort()};})()`);
        assert.equal(state.project, PROJECT);
        assert.notEqual(state.owner, 'unexpected');
        return state;
    }
    async waitQueue(predicate, label) {
        return until(
            async () => {
                const value = await this.snapshot();
                return predicate(value) && value;
            },
            { signal: this.signal, label }
        );
    }
    async stableEmpty() {
        return this.waitQueue(
            state =>
                state.visiblePending === 0 &&
                state.staged === 0 &&
                state.unknown === 0 &&
                state.pendingAcks === 0 &&
                state.verified,
            'queue-empty'
        );
    }
    async coldOffline() {
        const before = await this.waitQueue(
            state => !state.online && state.queue.length >= 2 && state.staged === 0 && state.unknown === 0,
            'durable-offline-queue'
        );
        await this.waitPage('!!navigator.serviceWorker.controller', 'real-worker-controller');
        await this.stop();
        assert(
            (await fs.stat(path.join(this.profile, 'Default', 'IndexedDB'))).isDirectory(),
            'QA_PROFILE_IDB_NOT_PRESERVED'
        );
        this.clockScript = null;
        await this.start(true);
        await this.authenticated();
        const after = await this.waitQueue(
            state =>
                !state.online &&
                state.verified &&
                !state.staged &&
                !state.unknown &&
                canonical(state.queue) === canonical(before.queue) &&
                state.target === before.target &&
                canonical(state.weekRecords) === canonical(before.weekRecords),
            'offline-auth-and-queue-restored'
        );
        assert.equal(after.online, false);
        assert.equal(after.clock, before.clock);
        assert(after.controller);
        assert(before.verified && after.verified, 'QA_QUEUE_VIEW_NOT_DURABLY_VERIFIED');
        assert.equal(after.target, before.target, 'QA_OFFLINE_TARGET_NOT_PRESERVED');
        assert.equal(canonical(after.weekRecords), canonical(before.weekRecords), 'QA_OFFLINE_WEEK_RECORDS_CHANGED');
        assert.equal(canonical(after.queue), canonical(before.queue), 'QA_COLD_RESTART_QUEUE_OR_TIMESTAMPS_CHANGED');
        assert(
            before.databases.includes('gym-tracker-local-cache') && after.databases.includes('gym-tracker-local-cache'),
            'QA_NATIVE_QUEUE_DATABASE_MISSING'
        );
        assert(
            before.idbJournalRows > 0 && after.idbJournalRows === before.idbJournalRows,
            'QA_NATIVE_JOURNAL_NOT_PRESERVED'
        );
        assert.equal(after.idbJournalHash, before.idbJournalHash, 'QA_NATIVE_JOURNAL_BYTES_CHANGED_OFFLINE');
        assert.equal(after.revision, before.revision);
        return { before, after, sameOwnedProfile: true, profileIdentity: digest(this.profileRealPath) };
    }
    async historyIds() {
        await this.closeSettings();
        await this.click('#nav-history');
        await this.waitPage(
            'document.getElementById("history-loading").classList.contains("hidden")&&document.querySelectorAll("#history-list li[data-session-id]").length>0',
            'history-loaded'
        );
        return this.client.evaluate(
            '[...document.querySelectorAll("#history-list li[data-session-id]")].map(e=>e.dataset.sessionId)'
        );
    }
    async allHistoryIds() {
        await this.reload();
        await this.historyIds();
        const ids = [];
        for (let page = 0; page < 30; page++) {
            await this.waitPage(
                'document.getElementById("history-loading").classList.contains("hidden")',
                'history-page-loaded'
            );
            const current = await this.client.evaluate(
                '[...document.querySelectorAll("#history-list li[data-session-id]")].map(e=>e.dataset.sessionId)'
            );
            ids.push(...current);
            if (await this.client.evaluate('document.getElementById("history-next-page-btn").disabled')) return ids;
            const previous = JSON.stringify(current);
            await this.click('#history-next-page-btn');
            await this.waitPage(
                `JSON.stringify([...document.querySelectorAll('#history-list li[data-session-id]')].map(e=>e.dataset.sessionId))!==${JSON.stringify(previous)} && document.getElementById('history-loading').classList.contains('hidden')`,
                'history-next-page'
            );
        }
        throw new Error('QA_HISTORY_PAGE_LIMIT');
    }
    async deleteVisible(id) {
        await this.assertOwner();
        this.pendingDelete = id;
        try {
            await this.click(`#history-list button[data-action="delete-session"][data-session-id="${id}"]`);
        } finally {
            this.pendingDelete = null;
        }
    }
    async locateHistory(id) {
        assert(/^[\w-]+$/.test(id), 'QA_INVALID_OWNED_SESSION_ID');
        await this.reload();
        await this.historyIds();
        for (let page = 0; page < 30; page++) {
            const ids = await this.client.evaluate(
                '[...document.querySelectorAll("#history-list li[data-session-id]")].map(e=>e.dataset.sessionId)'
            );
            if (ids.includes(id)) return;
            assert(
                !(await this.client.evaluate('document.getElementById("history-next-page-btn").disabled')),
                'QA_DETAIL_ID_NOT_FOUND'
            );
            await this.click('#history-next-page-btn');
            await this.waitPage(
                `document.getElementById('history-loading').classList.contains('hidden')&&!document.querySelector(${JSON.stringify(`#history-list li[data-session-id="${ids[0]}"]`)})`,
                'detail-next-page'
            );
        }
        throw new Error('QA_DETAIL_PAGE_LIMIT');
    }
    async detail(expected) {
        await this.locateHistory(expected.id);
        await this.click(`#history-list li[data-session-id="${expected.id}"] button[data-action="view-session"]`);
        await this.waitPage(
            'document.getElementById("session-detail-modal").getClientRects().length>0',
            'owned-detail-open'
        );
        try {
            const result = await this.client
                .evaluate(`(async()=>{const {getSessionsCache}=await import('./js/modules/history-manager.js');
                const {formatDate}=await import('./js/ui.js');const session=getSessionsCache().find(e=>e.id===${JSON.stringify(expected.id)});
                return (${readSessionDetailDom.toString()})(session,formatDate(new Date(${JSON.stringify(expected.calendarIso)})));})()`);
            assert.equal(result.id, expected.id);
            assert.equal(result.label, expected.label, 'QA_DETAIL_LABEL');
            assert.equal(Date.parse(result.dateIso), Date.parse(expected.calendarIso), 'QA_DETAIL_ORIGINAL_DATE');
            assert(result.dateText.includes(result.expectedDateText), 'QA_DETAIL_VISIBLE_DATE');
            if (expected.weight !== undefined) {
                assert.equal(result.sets.length, 1, 'QA_DETAIL_SET_COUNT');
                const set = result.sets[0].match(/(-?\d+(?:[.,]\d+)?)\s*kg\s*[x×]\s*(\d+)(?=\s|$)/i);
                assert(
                    set && Number(set[1].replace(',', '.')) === expected.weight && Number(set[2]) === expected.reps,
                    'QA_DETAIL_ORIGINAL_WEIGHT_REPS'
                );
            } else assert(result.body.includes(expected.noteMarker), 'QA_DETAIL_QUICKLOG_MARKER');
            return result;
        } finally {
            await this.click('#session-detail-modal .modal-close');
        }
    }
    async suggestions(fixtureId, expected) {
        await this.click('#nav-dashboard');
        await this.field('#day-select', fixtureId);
        await this.click('#start-session-btn');
        await this.waitPage(
            '!document.getElementById("session-view").classList.contains("hidden")&&!!document.querySelector(\'input[name="weight-0-0"]\')',
            'suggestion-fresh-capture-view'
        );
        await this.waitPage(
            `Number(document.querySelector('input[name="weight-0-0"]')?.dataset.suggestion)===${expected.weight}&&Number(document.querySelector('input[name="reps-0-0"]')?.dataset.suggestion)===${expected.reps}`,
            'visible-latest-strength-suggestion'
        );
        const observed = await this.client
            .evaluate(`({weight:Number(document.querySelector('input[name="weight-0-0"]').dataset.suggestion),
            reps:Number(document.querySelector('input[name="reps-0-0"]').dataset.suggestion),
            lastSet:document.querySelector('.last-workout-info .last-set')?.textContent})`);
        assert(
            observed.lastSet.includes(`${expected.weight}kg`) && observed.lastSet.includes(`x ${expected.reps}`),
            'QA_SUGGESTION_VISIBLE_LAST_SET'
        );
        await this.click('.last-workout-info button');
        assert.equal(
            Number(await this.client.evaluate('document.querySelector(\'input[name="weight-0-0"]\').value')),
            expected.weight
        );
        assert.equal(
            Number(await this.client.evaluate('document.querySelector(\'input[name="reps-0-0"]\').value')),
            expected.reps
        );
        this.pendingCancel = true;
        try {
            await this.click('#cancel-session-btn');
        } finally {
            this.pendingCancel = false;
        }
        await this.waitPage(
            '!document.getElementById("dashboard-view").classList.contains("hidden")',
            'suggestion-inspection-cancelled-without-save'
        );
        return {
            ...observed,
            expectedSessionId: expected.id,
            originalDate: expected.calendarIso,
            filledFromPublicButton: true,
        };
    }
    async deleteOwned(id) {
        assert(/^[\w-]+$/.test(id), 'QA_INVALID_OWNED_SESSION_ID');
        await this.reload();
        await this.historyIds();
        for (let page = 0; page < 30; page++) {
            const ids = await this.client.evaluate(
                '[...document.querySelectorAll("#history-list li[data-session-id]")].map(e=>e.dataset.sessionId)'
            );
            if (ids.includes(id)) {
                await this.deleteVisible(id);
                return;
            }
            assert(
                !(await this.client.evaluate('document.getElementById("history-next-page-btn").disabled')),
                'QA_OWNED_RECORD_NOT_IN_HISTORY'
            );
            await this.click('#history-next-page-btn');
            await this.waitPage(
                `document.getElementById('history-loading').classList.contains('hidden')&&!document.querySelector(${JSON.stringify(`#history-list li[data-session-id="${ids[0]}"]`)})`,
                'owned-history-next'
            );
        }
        throw new Error('QA_OWNED_HISTORY_PAGE_LIMIT');
    }
}
