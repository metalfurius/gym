import { describe, expect, it } from '@jest/globals';
import { selectDeferredLabelerPullRequests } from '../../scripts/labeler-prs.mjs';

const context = {
    repository: 'owner/gym',
    headRepository: 'contributor/gym',
    headBranch: 'workout-feature',
    headSha: 'abc123',
};

function makePullRequest(number, overrides = {}) {
    return {
        number,
        state: 'open',
        user: { login: 'contributor' },
        base: { repo: { full_name: 'owner/gym' } },
        head: { repo: { full_name: 'contributor/gym' }, ref: 'workout-feature', sha: 'abc123' },
        ...overrides,
    };
}

describe('trusted follow-up labeler selection', () => {
    it('selects matching fork PRs and avoids duplicates', () => {
        expect(
            selectDeferredLabelerPullRequests([makePullRequest(4), makePullRequest(4), makePullRequest(5)], context)
        ).toEqual([4, 5]);
    });

    it('does not label stale, closed, unrelated, or malformed PRs', () => {
        const candidates = [
            makePullRequest(1, { state: 'closed' }),
            makePullRequest(2, {
                head: { repo: { full_name: 'contributor/gym' }, ref: 'workout-feature', sha: 'old' },
            }),
            makePullRequest(3, {
                head: { repo: { full_name: 'attacker/gym' }, ref: 'workout-feature', sha: 'abc123' },
            }),
            makePullRequest(4, { base: { repo: { full_name: 'owner/another' } } }),
            makePullRequest(5, { head: { repo: { full_name: 'contributor/gym' }, ref: 'different', sha: 'abc123' } }),
            makePullRequest(-1),
            null,
        ];
        expect(selectDeferredLabelerPullRequests(candidates, context)).toEqual([]);
    });

    it('defers Dependabot PRs but leaves ordinary same-repository PRs to the original job', () => {
        const ownContext = { ...context, headRepository: 'owner/gym' };
        const head = { repo: { full_name: 'owner/gym' }, ref: 'workout-feature', sha: 'abc123' };
        const ordinary = makePullRequest(7, { head, user: { login: 'owner' } });
        const dependabot = makePullRequest(8, { head, user: { login: 'dependabot[bot]' } });
        expect(selectDeferredLabelerPullRequests([ordinary, dependabot], ownContext)).toEqual([8]);
    });

    it('requires all trusted workflow-run identifiers', () => {
        expect(selectDeferredLabelerPullRequests([makePullRequest(1)], { ...context, headSha: '' })).toEqual([]);
        expect(selectDeferredLabelerPullRequests([makePullRequest(1)], null)).toEqual([]);
        expect(selectDeferredLabelerPullRequests(null, context)).toEqual([]);
    });
});
