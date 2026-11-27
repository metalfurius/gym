#!/usr/bin/env node
import process from 'node:process';
import { runUpgradeSmoke } from './browser-upgrade-smoke.mjs';
import { openSmokeBrowser } from './browser-smoke-driver.mjs';

runUpgradeSmoke({
    browserName: 'Firefox',
    networkMode: 'controlled HTTP server outage',
    setOffline: async (_browser, server, offline) => { server.setOnline(!offline); },
    openBrowser: (url, profile, onEvent, signal) => openSmokeBrowser('firefox', url, profile, onEvent, signal),
}).catch(error => {
    console.error(`[browser-upgrade-smoke-firefox] ${error.stack || error.message}`);
    process.exitCode = 1;
});
