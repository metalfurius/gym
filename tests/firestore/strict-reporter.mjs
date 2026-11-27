import { inspect } from 'node:util';

// Node considers skipped/TODO cases successful. This required rules gate does not.
export default async function* strictReporter(events) {
    let summary;
    for await (const { type, data } of events) {
        if (type === 'test:pass') yield `PASS ${data.name}\n`;
        if (type === 'test:fail') yield `FAIL ${data.name}\n${inspect(data.details.error)}\n`;
        if (type === 'test:stdout' || type === 'test:stderr') yield data.message;
        if (type === 'test:summary') {
            summary = data;
            yield `RULES_SUMMARY ${JSON.stringify(data.counts)}\n`;
        }
    }
    const counts = summary?.counts;
    if (!summary?.success || !counts?.tests || counts.failed || counts.cancelled || counts.skipped || counts.todo) {
        throw new Error('Rules test gate rejects failure, cancellation, skipped/TODO tests or an empty run');
    }
}
