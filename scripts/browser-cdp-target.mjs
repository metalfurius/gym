import fs from 'node:fs/promises';
import path from 'node:path';
import { ProtocolClient } from './browser-protocol-client.mjs';

const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

async function browserEndpoint(owner, profileDirectory, signal) {
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
        signal.throwIfAborted();
        if (owner.process.exitCode !== null || owner.process.signalCode) {
            throw new Error(`Chrome exited during startup (${owner.process.exitCode}/${owner.process.signalCode})`);
        }
        let activePort;
        try { activePort = await fs.readFile(path.join(profileDirectory, 'DevToolsActivePort'), 'utf8'); }
        catch (error) {
            // Windows can report the private startup file busy while Chrome is
            // writing it. This polls endpoint publication, not page navigation.
            if (!['ENOENT', 'EBUSY'].includes(error.code)) throw error;
        }
        if (activePort) {
            const [portText, browserPath] = activePort.trim().split(/\r?\n/);
            // Chrome writes this file in our private profile. Never enumerate or
            // select the command-line page, which may still be navigating.
            if (browserPath) {
                const port = Number(portText);
                if (!Number.isInteger(port) || port < 1 || port > 65535
                    || !/^\/devtools\/browser\/[a-z\d-]+$/i.test(browserPath)) {
                    throw new Error('Invalid owned Chrome browser endpoint');
                }
                return { port, url: `ws://127.0.0.1:${port}${browserPath}` };
            }
        }
        await sleep(50);
    }
    throw new Error('Owned Chrome browser endpoint did not start');
}

export async function connectOwnedChromiumBrowser(owner, profileDirectory, onEvent, signal) {
    const endpoint = await browserEndpoint(owner, profileDirectory, signal);
    const raw = new ProtocolClient(endpoint.url, onEvent);
    owner.setClient({ send: () => raw.send('Browser.close'), close: () => raw.close() });
    return { raw, port: endpoint.port };
}

export async function connectOwnedChromium(owner, profileDirectory, url, onEvent, signal) {
    const { raw, port } = await connectOwnedChromiumBrowser(owner, profileDirectory, onEvent, signal);
    const version = await raw.send('Browser.getVersion');
    const { targetId } = await raw.send('Target.createTarget', { url });
    if (!targetId) throw new Error('Chrome did not create the owned fixture target');
    const { sessionId } = await raw.send('Target.attachToTarget', { targetId, flatten: true });
    if (!sessionId) throw new Error('Chrome did not attach the owned fixture session');
    const pageSend = (method, params = {}) => raw.send(method, params, sessionId);
    const evaluate = async expression => {
        const result = await pageSend('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true });
        if (result.exceptionDetails) {
            throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text || 'Browser script failed');
        }
        return result.result?.value;
    };
    const waitForDocument = async (expectedUrl, { previousLoaderId, requiredLoaderId } = {}) => {
        const deadline = Date.now() + 20_000;
        while (Date.now() < deadline) {
            signal.throwIfAborted();
            const { frameTree } = await pageSend('Page.getFrameTree');
            const frame = frameTree?.frame;
            if (frame?.unreachableUrl || frame?.url?.startsWith('chrome-error:')) {
                throw new Error(`Owned fixture navigation failed: ${frame.unreachableUrl || expectedUrl} (${frame.url})`);
            }
            if (frame?.url === expectedUrl && (!previousLoaderId || frame.loaderId !== previousLoaderId)
                && (!requiredLoaderId || frame.loaderId === requiredLoaderId)) {
                // A document/context can be replaced between these protocol reads.
                // Poll readiness; never navigate again to make a barrier pass.
                try {
                    if (await evaluate(`location.href === ${JSON.stringify(expectedUrl)} && document.readyState === 'complete'`)) return frame;
                } catch (error) {
                    if (!/context.*destroyed|Cannot find context|context.*not found/i.test(error.message)) throw error;
                }
            }
            await sleep(50);
        }
        throw new Error(`Owned fixture document did not finish navigating: ${expectedUrl}`);
    };
    const client = {
        evaluate,
        async send(method, params = {}) {
            if (method.startsWith('Browser.') || method.startsWith('Target.')) return raw.send(method, params);
            const previous = method === 'Page.reload' ? (await pageSend('Page.getFrameTree')).frameTree.frame : null;
            const result = await pageSend(method, params);
            if (method === 'Page.navigate') {
                if (result.errorText || result.isDownload) {
                    throw new Error(`Page.navigate failed: ${result.errorText || 'unexpected download'} (${params.url})`);
                }
                await waitForDocument(params.url, { requiredLoaderId: result.loaderId });
            }
            if (previous) await waitForDocument(previous.url, { previousLoaderId: previous.loaderId });
            return result;
        },
        close: () => raw.close(),
    };
    for (const domain of ['Runtime', 'Page', 'Network', 'Log', 'ServiceWorker']) await pageSend(`${domain}.enable`);
    await pageSend('Page.setLifecycleEventsEnabled', { enabled: true });
    const frame = await waitForDocument(url);
    const { targetInfo } = await raw.send('Target.getTargetInfo', { targetId });
    if (targetInfo?.targetId !== targetId || targetInfo.type !== 'page' || targetInfo.url !== url) {
        throw new Error('Chrome fixture target ownership or URL changed during startup');
    }
    onEvent({ method: 'BrowserTarget.ready', params: { targetId, sessionId, requestedUrl: url, actualUrl: frame.url, loaderId: frame.loaderId } });
    return { client, port, version, targetId, sessionId };
}
