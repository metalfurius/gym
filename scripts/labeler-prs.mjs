/** Select only current, open external or Dependabot PRs for the trusted labeler. */
export function selectDeferredLabelerPullRequests(pullRequests, context) {
    const { repository, headRepository, headBranch, headSha } = context || {};
    if (!Array.isArray(pullRequests) || !repository || !headRepository || !headBranch || !headSha) {
        return [];
    }

    const sameRepository = (left, right) =>
        typeof left === 'string' && typeof right === 'string' && left.toLowerCase() === right.toLowerCase();
    const numbers = new Set();

    for (const pullRequest of pullRequests) {
        const head = pullRequest?.head;
        if (
            pullRequest?.state !== 'open' ||
            !Number.isSafeInteger(pullRequest.number) ||
            pullRequest.number <= 0 ||
            !sameRepository(pullRequest.base?.repo?.full_name, repository) ||
            !sameRepository(head?.repo?.full_name, headRepository) ||
            head.ref !== headBranch ||
            head.sha !== headSha
        ) {
            continue;
        }

        const isExternal = !sameRepository(headRepository, repository);
        const isDependabot = pullRequest.user?.login === 'dependabot[bot]';
        if (isExternal || isDependabot) numbers.add(pullRequest.number);
    }

    return Array.from(numbers);
}
