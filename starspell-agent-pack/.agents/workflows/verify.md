# /verify

Run the full gate and report real results. Do not summarize from memory and do not fix tests by weakening them.

1. Confirm the prototype is untouched: compute its SHA-256 and compare with the baseline commit
   (`git show <baseline>:reference/starspell.html | sha256sum`).
2. Run, in this order, stopping at the first failure only to report it (then continue with the remaining steps):
   - `pnpm -r typecheck`
   - `pnpm -r lint`
   - `pnpm -r test`
   - `pnpm -r build`
   - `pnpm e2e` (only if the current milestone has E2E tests; otherwise write "not applicable")
3. Run `git status --short` and `git diff --stat`. List any file changed that is outside the current milestone's scope.
4. Search the diff for accidental secrets (`.env` files, tokens, passwords) and for leftover `console.log`, `TODO`, `any`, or skipped tests (`.skip`, `.only`).
5. Print one table:

| Check | Result (pass / fail / not run) | Evidence (command and key output line) |
|---|---|---|

6. If anything failed or did not run, say exactly what and why. Write unresolved external blockers to `docs/BLOCKERS.md`.
