import { readFileSync } from 'node:fs';
export const waitForUi = (ms = 0) => new Promise(resolve => setTimeout(resolve, ms));
export async function until(predicate, timeout = 2000) {
    const start = Date.now();
    while (!predicate()) {
        if (Date.now() - start > timeout) throw new Error('App UI condition did not become true');
        await waitForUi(10);
    }
}
export function field(selector, value) {
    const element = document.querySelector(selector);
    if (!element) throw new Error(`Missing field ${selector}`);
    element.value = value;
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    return element;
}
export function mountAppDom() {
    document.open(); document.write(readFileSync(new URL('../../index.html', import.meta.url), 'utf8')); document.close();
    Object.defineProperty(window, 'confirm', { configurable: true, value: () => true });
    Object.defineProperty(window, 'alert', { configurable: true, value: () => {} });
    window.scrollTo = () => {};
    HTMLCanvasElement.prototype.getContext = () => ({});
    class FixtureChart { constructor(_context, config) { this.config = config; globalThis.__lastFixtureChart = config; } destroy() {} }
    global.Chart = FixtureChart; window.Chart = FixtureChart;
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { register: async () => ({ scope: '/' }) } });
}
