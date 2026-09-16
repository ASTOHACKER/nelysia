# Nelysia Runtime Parity Implementation Plan

1. Add failing differential tests for route classification, conservative context inference, plan invalidation, lifecycle order, thenables, errors, response helpers, and adapter parity.
2. Add the internal immutable execution-plan module with conservative source analysis, context needs, lane selection, and thenable utilities.
3. Restore literal full-context construction and add a literal sparse-context constructor for proven specialized routes.
4. Add a private invalidated plan cache and internal sync/async executor to `Nelysia`; retain the current reference path as the correctness fallback. The Bun native lane may bypass preflight only for statically empty request stages while preserving the existing JSON response header contract.
5. Make Bun and Fetch use the executor boundary, then update Node to use the same contract without changing its throughput strategy.
6. Add a fair generic Bun benchmark target for Elysia and a verifier covering correctness, ±2% compiled parity, generic >=90% Elysia, three seeds, and memory evidence.
7. Run targeted tests, `npm run typecheck`, `npm test`, `bun test`, package checks, and the available benchmark smoke/matrix. The current fresh Bun matrix uses seeds `20261011`, `20261012`, and `20261013`; the verifier uses per-seed correctness/stability and aggregate-median performance gates.

The work is performed directly on `main` because the user requested main integration. Existing uncommitted files are not reset, stashed, or overwritten.
