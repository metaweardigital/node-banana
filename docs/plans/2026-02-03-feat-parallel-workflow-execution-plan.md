---
title: "feat: Parallel Workflow Execution"
type: feat
date: 2026-02-03
---

# Parallel Workflow Execution

## Overview

Add parallel execution of independent nodes in workflow pipelines to reduce total execution time. Currently, all nodes execute sequentially even when they have no dependencies on each other. This wastes significant time when multiple image generation calls (5-30s each) could run simultaneously.

## Problem Statement

**Current behavior:** Workflow with 3 independent Generate nodes takes ~60-90 seconds (3 × 20s average)

**Desired behavior:** Same workflow completes in ~20-25 seconds (parallel execution + overhead)

Example workflow that would benefit:
```
prompt-1 → nanoBanana-1 ──┐
prompt-2 → nanoBanana-2 ──┼─→ output
prompt-3 → nanoBanana-3 ──┘
```

Currently executes: prompt-1 → prompt-2 → prompt-3 → nanoBanana-1 (wait) → nanoBanana-2 (wait) → nanoBanana-3 (wait) → output

With parallel: [prompt-1, prompt-2, prompt-3] → [nanoBanana-1, nanoBanana-2, nanoBanana-3] → output

## Proposed Solution

### Core Changes

1. **Level-based topological sort** - Group nodes by dependency depth
2. **Parallel level execution** - Execute each level with `Promise.all` (respecting concurrency limit)
3. **Configurable concurrency** - Default 3 concurrent API calls, adjustable 1-10
4. **Fail-fast with AbortController** - Cancel sibling requests on first failure

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    executeWorkflow()                        │
├─────────────────────────────────────────────────────────────┤
│  1. groupNodesByLevel(nodes, edges)                         │
│     └─→ Map<level: number, nodeIds: string[]>               │
│                                                             │
│  2. for each level (sequential):                            │
│     └─→ executeLevel(nodes, concurrencyLimit, abortSignal)  │
│         └─→ Promise.all with chunked batches                │
│                                                             │
│  3. On any failure:                                         │
│     └─→ abortController.abort()                             │
│     └─→ Set sibling nodes to 'idle'                         │
│     └─→ Show error toast for failed node                    │
└─────────────────────────────────────────────────────────────┘
```

## Technical Approach

### 1. Level Grouping Algorithm

Replace current linear topological sort with level-aware grouping:

```typescript
// src/store/workflowStore.ts

interface LevelGroup {
  level: number;
  nodeIds: string[];
}

function groupNodesByLevel(
  nodes: WorkflowNode[],
  edges: Edge[]
): LevelGroup[] {
  // Calculate in-degree for each node
  const inDegree = new Map<string, number>();
  const adjList = new Map<string, string[]>();

  nodes.forEach(n => {
    inDegree.set(n.id, 0);
    adjList.set(n.id, []);
  });

  edges.forEach(e => {
    inDegree.set(e.target, (inDegree.get(e.target) || 0) + 1);
    adjList.get(e.source)?.push(e.target);
  });

  // BFS with level tracking (Kahn's algorithm variant)
  const levels: LevelGroup[] = [];
  let currentLevel = nodes
    .filter(n => inDegree.get(n.id) === 0)
    .map(n => n.id);

  let levelNum = 0;
  while (currentLevel.length > 0) {
    levels.push({ level: levelNum, nodeIds: [...currentLevel] });

    const nextLevel: string[] = [];
    for (const nodeId of currentLevel) {
      for (const child of adjList.get(nodeId) || []) {
        const newDegree = (inDegree.get(child) || 1) - 1;
        inDegree.set(child, newDegree);
        if (newDegree === 0) {
          nextLevel.push(child);
        }
      }
    }

    currentLevel = nextLevel;
    levelNum++;
  }

  return levels;
}
```

### 2. State Changes

```typescript
// src/store/workflowStore.ts - WorkflowState interface

interface WorkflowState {
  // Change from single to array
  currentNodeIds: string[];  // was: currentNodeId: string | null

  // New: concurrency setting
  maxConcurrentCalls: number;  // default: 3

  // New: abort controller reference (not persisted)
  _abortController: AbortController | null;
}
```

### 3. Execution Loop Changes

```typescript
// src/store/workflowStore.ts - executeWorkflow()

executeWorkflow: async (startFromNodeId?: string) => {
  const { nodes, edges, maxConcurrentCalls } = get();

  // Create abort controller for this run
  const abortController = new AbortController();
  set({ _abortController: abortController, isRunning: true, currentNodeIds: [] });

  try {
    const levels = groupNodesByLevel(nodes, edges);

    // Find starting level if startFromNodeId specified
    let startLevel = 0;
    if (startFromNodeId) {
      startLevel = levels.findIndex(l => l.nodeIds.includes(startFromNodeId));
      if (startLevel === -1) startLevel = 0;
    }

    // Execute levels sequentially
    for (let i = startLevel; i < levels.length; i++) {
      if (abortController.signal.aborted) break;

      const level = levels[i];
      const executableNodes = level.nodeIds
        .map(id => nodes.find(n => n.id === id)!)
        .filter(n => !isNodeLocked(n));  // Skip locked nodes

      if (executableNodes.length === 0) continue;

      // Check for pause edges targeting this level
      const pauseNode = executableNodes.find(n => hasPauseEdge(n, edges));
      if (pauseNode) {
        set({ pausedAtNodeId: pauseNode.id, isRunning: false });
        return;
      }

      // Execute level with concurrency limit
      await executeLevelParallel(
        executableNodes,
        maxConcurrentCalls,
        abortController.signal
      );
    }
  } catch (error) {
    // Fail-fast triggered
    abortController.abort();
    const failedNodeId = get().currentNodeIds[0];  // First to fail
    set({
      currentNodeIds: [],
      isRunning: false
    });
    toast.error(`Workflow failed at node: ${failedNodeId}`);
  } finally {
    set({ _abortController: null, currentNodeIds: [], isRunning: false });
  }
}
```

### 4. Parallel Level Execution

```typescript
// src/store/workflowStore.ts

async function executeLevelParallel(
  nodes: WorkflowNode[],
  concurrencyLimit: number,
  signal: AbortSignal
): Promise<void> {
  const { set, get } = useWorkflowStore.getState();

  // Chunk nodes into batches respecting concurrency limit
  const batches = chunk(nodes, concurrencyLimit);

  for (const batch of batches) {
    if (signal.aborted) throw new Error('Aborted');

    // Mark batch nodes as executing
    const batchIds = batch.map(n => n.id);
    set({ currentNodeIds: batchIds });
    batch.forEach(n => updateNodeData(n.id, { status: 'loading' }));

    // Execute batch in parallel
    const results = await Promise.all(
      batch.map(node => executeNode(node, signal))
    );

    // Check for failures (fail-fast)
    const failed = results.find(r => r.error);
    if (failed) {
      throw failed.error;
    }

    // Mark batch as complete
    batch.forEach(n => updateNodeData(n.id, { status: 'complete' }));
  }
}
```

### 5. AbortController Integration

Update API fetch calls to respect abort signal:

```typescript
// src/store/workflowStore.ts - inside node execution

const response = await fetch('/api/generate', {
  method: 'POST',
  body: JSON.stringify(payload),
  signal: abortController.signal,  // NEW
});
```

### 6. UI Updates

#### BaseNode.tsx - Multiple execution indicators

```typescript
// src/components/nodes/BaseNode.tsx

const currentNodeIds = useWorkflowStore((state) => state.currentNodeIds);
const isCurrentlyExecuting = currentNodeIds.includes(id);
```

#### FloatingActionBar.tsx - Parallel progress

```typescript
// src/components/FloatingActionBar.tsx

const currentNodeIds = useWorkflowStore((state) => state.currentNodeIds);
const runningCount = currentNodeIds.length;

// Display: "Running 3 nodes..." or "Running Generate1..."
const statusText = runningCount > 1
  ? `Running ${runningCount} nodes...`
  : `Running ${getNodeLabel(currentNodeIds[0])}...`;
```

#### Settings - Concurrency control

Add to existing settings UI:

```typescript
// In settings modal/panel

<label>
  Max Concurrent API Calls
  <input
    type="range"
    min={1}
    max={10}
    value={maxConcurrentCalls}
    onChange={(e) => setMaxConcurrentCalls(Number(e.target.value))}
  />
  <span>{maxConcurrentCalls}</span>
</label>
```

## Acceptance Criteria

### Functional Requirements

- [x] Independent nodes at the same dependency level execute in parallel
- [x] Concurrency limit (default 3) controls max simultaneous API calls
- [x] Fail-fast: first failure aborts sibling requests and stops workflow
- [x] Cancellation (Stop button) aborts all in-flight requests
- [x] Locked nodes are skipped without blocking parallel siblings
- [x] Pause edges halt execution before their target level
- [x] "Run from node" includes parallel siblings at same level
- [ ] Cost tracking works correctly for parallel calls

### Non-Functional Requirements

- [x] No race conditions in state updates
- [x] Memory usage stays reasonable (no leaked promises/controllers)
- [ ] Existing sequential workflows behave identically

### UI Requirements

- [x] Multiple nodes show blue execution border simultaneously
- [x] FloatingActionBar shows "Running N nodes..." for parallel execution
- [x] Concurrency setting accessible in settings panel
- [x] Error toast identifies which node failed

## Implementation Phases

### Phase 1: Core Execution Engine

**Files to modify:**
- `src/store/workflowStore.ts` - Level grouping, parallel execution loop
- `src/types/index.ts` - Update WorkflowState interface

**Tasks:**
1. Implement `groupNodesByLevel()` algorithm
2. Change `currentNodeId` to `currentNodeIds: string[]`
3. Add `maxConcurrentCalls` to state with default 3
4. Refactor `executeWorkflow()` for level-based execution
5. Add `executeLevelParallel()` helper
6. Integrate AbortController

### Phase 2: API Integration

**Files to modify:**
- `src/store/workflowStore.ts` - All fetch calls
- `src/app/api/generate/route.ts` - Verify abort handling
- `src/app/api/llm/route.ts` - Verify abort handling

**Tasks:**
1. Pass abort signal to all fetch calls
2. Handle AbortError gracefully (don't treat as failure)
3. Verify API routes handle client disconnection

### Phase 3: UI Updates

**Files to modify:**
- `src/components/nodes/BaseNode.tsx` - Execution indicator
- `src/components/FloatingActionBar.tsx` - Progress display
- `src/components/SettingsPanel.tsx` (or wherever settings live)

**Tasks:**
1. Update BaseNode to check `currentNodeIds.includes(id)`
2. Update FloatingActionBar for multi-node status
3. Add concurrency slider to settings
4. Store concurrency preference in localStorage

### Phase 4: Edge Cases & Testing

**Tasks:**
1. Test locked groups with parallel siblings
2. Test pause edges at level boundaries
3. Test "Run from node" with parallel siblings
4. Test cancellation mid-parallel-execution
5. Test fail-fast with multiple simultaneous failures
6. Test cost tracking accuracy
7. Performance test with 10+ parallel nodes

## Files to Modify

| File | Changes |
|------|---------|
| `src/store/workflowStore.ts` | Core execution refactor, new state fields |
| `src/types/index.ts` | WorkflowState interface updates |
| `src/components/nodes/BaseNode.tsx` | Multi-node execution indicator |
| `src/components/FloatingActionBar.tsx` | Parallel progress display |
| `src/components/SettingsPanel.tsx` | Concurrency setting UI |

## Migration Notes

- `currentNodeId` → `currentNodeIds` is a breaking change for any code reading this state
- Search codebase for `currentNodeId` references and update all
- localStorage key for concurrency: `node-banana-concurrency-limit`

## Testing Strategy

### Unit Tests

```typescript
describe('groupNodesByLevel', () => {
  it('groups independent nodes at level 0', () => {
    const nodes = [nodeA, nodeB, nodeC];  // no edges
    const levels = groupNodesByLevel(nodes, []);
    expect(levels).toEqual([{ level: 0, nodeIds: ['a', 'b', 'c'] }]);
  });

  it('respects dependencies across levels', () => {
    // A → C, B → C
    const levels = groupNodesByLevel(nodes, edges);
    expect(levels[0].nodeIds).toContain('a');
    expect(levels[0].nodeIds).toContain('b');
    expect(levels[1].nodeIds).toEqual(['c']);
  });
});

describe('parallel execution', () => {
  it('executes independent nodes simultaneously', async () => {
    const startTimes: number[] = [];
    // Mock API to record call times
    // Verify nodes started within 100ms of each other
  });

  it('respects concurrency limit', async () => {
    // 5 nodes, limit 2
    // Verify max 2 concurrent at any time
  });

  it('fails fast on first error', async () => {
    // Node A fails after 100ms, Node B would take 1000ms
    // Verify B is aborted, total time < 200ms
  });
});
```

### Integration Tests

- Run real workflow with mocked API delays
- Verify timing improvements
- Verify correct outputs

## Open Questions (Resolved)

| Question | Resolution |
|----------|------------|
| Fail-fast vs continue? | Fail-fast (user preference) |
| Concurrency limit? | Configurable, default 3 |
| Sibling status on abort? | Set to 'idle' (not 'error') |
| Pause edges within levels? | Pause entire level (simplest) |
| "Run from node" with siblings? | Include siblings at same level |

## References

- Current execution: `src/store/workflowStore.ts:924-1919`
- Topological sort: `src/store/workflowStore.ts:945-969`
- Node types: `src/types/index.ts`
- API routes: `src/app/api/generate/route.ts`, `src/app/api/llm/route.ts`
