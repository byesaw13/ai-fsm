# Task 2 Report: Derive the Store Route and Summary with Pure Helpers

## RED

Command:

```text
pnpm --filter @ai-fsm/web test:unit -- lib/jobs/__tests__/buy-list.unit.test.ts
```

The focused command runs the workspace unit suite. Before implementation, the three new tests failed because the requested exports did not exist:

```text
 ❯ lib/jobs/__tests__/buy-list.unit.test.ts (14 tests | 3 failed) 20ms
   × Store Run helpers > includes only selected-supplier and unassigned needed lines 7ms
     → (0 , filterStoreRunLines) is not a function
   × Store Run helpers > orders numeric aisles first, then department-only, then unknown 1ms
     → (0 , buildStoreRunStops) is not a function
   × Store Run helpers > returns a total only when every session purchase has a catalog cost 1ms
     → (0 , summarizeStoreRun) is not a function

 Test Files  1 failed | 153 passed (154)
      Tests  3 failed | 1478 passed (1481)
```

## Implementation

- Added `StoreRunLine` and `StoreRunStop` interfaces.
- Added normalized supplier filtering for needed and unassigned lines.
- Added deterministic store-stop grouping and ordering: numeric aisles, department-only stops, then unknown locations.
- Added purchase summary counts and an estimated total only when every purchased line has a catalog unit cost, rounded to cents.
- Added the brief’s three unit tests covering these behaviors.

Files changed:

- `apps/web/lib/jobs/buy-list.ts`
- `apps/web/lib/jobs/__tests__/buy-list.unit.test.ts`

## GREEN

Command:

```text
pnpm --filter @ai-fsm/web test:unit -- lib/jobs/__tests__/buy-list.unit.test.ts
```

Output:

```text
 ✓ lib/jobs/__tests__/buy-list.unit.test.ts (14 tests) 25ms

 Test Files  154 passed (154)
      Tests  1481 passed (1481)
```

## Self-review

- Confirmed `git diff --check` passes.
- Confirmed existing estimate mapping, manual merge, status grouping, and all other unit regressions remain green.
- Preserved existing buy-list mappings and added no dependencies.
- No API or UI files were changed.

## Concerns

- The requested command’s Vitest configuration runs the full web unit suite instead of only the named file; all 154 files still passed.
- The helper intentionally uses the brief’s first numeric substring for aisle ordering and does not use `bay` in sort order; later UI work can decide how to present bay labels.
