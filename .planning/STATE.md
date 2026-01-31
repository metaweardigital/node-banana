# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-01-09)

**Core value:** Provider infrastructure that dynamically discovers models from external APIs, enabling users to access hundreds of image/video generation models without hardcoding schemas.
**Current focus:** Agentic workflow builder (v1.4), then Store Refactoring (v1.5)

## Current Position

Phase: 35 of 35 (Large Workflow Handling)
Plan: 1 of 3 in current phase
Status: In Progress
Last activity: 2026-01-31 - Completed plan 02 (Selection-Aware Subgraph Extraction)

Progress: ░░░░░░░░░░ 6%

## Performance Metrics

**Velocity:**
- Total plans completed: 34
- Average duration: 7 min
- Total execution time: 3.9 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1. Provider Infrastructure | 2/2 | 14 min | 7 min |
| 2. Model Discovery | 3/3 | 14 min | 4.7 min |
| 3. Generate Node Refactor | 3/3 | 13 min | 4.3 min |
| 4. Model Search Dialog | 2/2 | 17 min | 8.5 min |
| 5. Image URL Server | 2/2 | 5 min | 2.5 min |
| 6. Video & Polish | 4/4 | 43 min | 14.3 min |
| 7. Video Connections | 1/1 | 4 min | 4 min |
| 8. Error Display | 1/1 | 14 min | 14 min |
| 9. Video History | 1/1 | 12 min | 12 min |
| 10. Node Autosizing | 1/1 | 2 min | 2 min |
| 11. UI Polish | 1/1 | 8 min | 8 min |
| 12. Model Improvements | 1/1 | - | - |
| 13. Fix Duplicate Generations | 1/1 | 1 min | 1 min |
| 14. Fix Drag-Connect Bugs | 1/1 | 7 min | 7 min |
| 15. Test Infrastructure | 1/1 | 3 min | 3 min |
| 16. Store Modularization | 1/1 | 22 min | 22 min |
| 19. Type Refactoring | 2/2 | 16 min | 8 min |
| 22. Generate Node Dynamic Input Tests | 1/1 | 20 min | 20 min |
| 23. Model Browser Improvements | 1/1 | 5 min | 5 min |
| 20. Integration Tests | 2/2 | 11 min | 5.5 min |
| 24. Improved Cost Summary | 3/3 | 25 min | 8 min |
| 25. Template Explorer UI | 2/2 | 23 min | 11.5 min |
| 26. Template Preview Rendering | 1/1 | 25 min | 25 min |
| 27. Node Defaults Infrastructure | 1/1 | 15 min | 15 min |
| 28. Node Defaults UI | 1/1 | 32 min | 32 min |
| 31. Workflow Proposal System | 2/2 | 6 min | 3 min |
| 32. Chat UI Foundation | 2/2 | 9 min | 4.5 min |
| 33. Workflow Edit Safety | 2/2 | 5 min | 5 min |
| 34. Agentic Workflow Editing | 3/3 | 13 min | 4.3 min |
| 35. Large Workflow Handling | 1/3 | 10 min | 10 min |

**Recent Trend:**
- Last 5 plans: 5 min, 5 min, 8 min, <1 min, 10 min
- Trend: Phase 35 started - selection-aware context scoping for large workflows

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Gemini always enabled via env var (GEMINI_API_KEY), Replicate/fal.ai optional
- API keys stored in localStorage under node-banana-provider-settings key
- Local state in modal to avoid saving on every keystroke
- Provider config pattern: {id, name, enabled, apiKey, apiKeyEnvVar?}
- Provider registry uses self-registration pattern via registerProvider()
- Gemini remains special-cased in /api/generate for now, not yet migrated
- Capability inference from model name/description keywords
- fal.ai API key optional (works without but rate limited)
- fal.ai auth header: "Key {apiKey}" format (not Bearer)
- fal.ai category maps directly to ModelCapability (no inference)
- 1-hour cache TTL for model lists (extended from 10 min)
- Unified API at /api/models with header-based auth
- Provider dropdown shows Gemini always, others only if API key configured
- Aspect ratio/resolution controls shown only for Gemini provider
- Backward compatibility via aliases: NanoBananaNode, saveNanoBananaDefaults
- Server-side provider execution in API route (not client-side)
- Header-based API key passing: X-Replicate-API-Key, X-Fal-API-Key
- fal.ai sync API (fal.run) instead of queue-based async
- Dual migration approach: loadWorkflow migrates + UI effect for runtime
- fal.ai icon always visible in action bar (works without key but rate limited)
- Replicate icon only visible when API key is configured
- Client-side search filtering for Replicate (their search API unreliable)
- Show all capability badges to differentiate similar models
- Extract variant suffix from fal.ai model IDs for display name
- No TTL for image store - explicit cleanup pattern (callers delete after use)
- 256KB threshold for shouldUseImageUrl (Replicate recommendation)
- Gemini excluded from video node (doesn't support video generation)
- Large videos (>20MB) return URL instead of base64 to avoid memory issues
- Fetch schema from provider API at model selection time with 10-min cache
- Filter internal params, prioritize user-relevant ones (seed, steps, guidance)
- Collapsible parameters section to keep node UI compact
- Node autosizing constraints: 200-500px width, 200-600px height, ~100px chrome
- Provider badges prepend node title (left side) with w-4 h-4 icons
- Node titles show only model name (no "Generate Image/Video" prefix)
- BaseNode supports titlePrefix prop for icon prepending
- Header aligned for saved/unsaved states with same icon layout
- isImageInput() uses word-boundary checks (not substring) to avoid matching num_images
- Workflow execution gets fresh node data from store (not stale captured array)
- regenerateNode includes parameters in request body
- MD5 content hashing for generation deduplication (fast, collision resistance not critical)
- Hash prefix in filename for O(1) duplicate lookup
- Normalized handle IDs (image, text, image-0) for connection stability across model changes
- Handle-to-schema mapping built at execution time from inputSchema
- Placeholder handles (dimmed 30%) for input types not used by model, preserving connections
- ReactFlowProvider wrapper for component tests using @xyflow/react hooks
- Zustand store mocking with vi.mock pattern returning mocked functions
- Vitest jsdom environment for React component tests
- Store utilities extracted to src/store/utils/ with re-exports for backward compatibility
- Consolidated defaultNodeDimensions (was duplicated in addNode and createGroup)
- localStorage mocking pattern for testing utility modules
- Type domain files live in src/types/*.ts with re-exports from index.ts
- BaseNodeData in annotation.ts to avoid circular imports (nodes.ts imports annotation.ts)
- 7 type domain files: annotation, nodes, providers, models, workflow, api, quickstart
- index.ts is pure re-export hub with no type definitions
- Max 8 recent models stored in localStorage, 4 displayed in UI
- Gemini models hardcoded in /api/models (not fetched from external API)
- Green color theme for Gemini provider (bg-green-500/20 text-green-300)
- Cost dialog: Gemini Cost section (with prices) + External Providers section (with model links)
- External provider pricing removed (fal.ai 429 errors, Replicate no API) - show model links instead
- Incurred cost only tracks Gemini generations
- Template category colors: blue=product, purple=style, green=composition, amber=community
- Template grid layout: 2 cols mobile, 3 cols lg+
- Template node count calculated at runtime from workflow.nodes.length
- onWheelCapture pattern for isolating modal scroll from React Flow canvas
- min-h-0 on flexbox containers enables overflow scrolling
- overflow-clip instead of overflow-hidden when child needs scroll
- Node defaults UI uses local state pattern (load on open, save on button click)
- ModelSearchDialog reused with onModelSelected callback for defaults UI
- LLM_PROVIDERS/LLM_MODELS duplicated from LLMGenerateNode (not exported)
- Shift+V keyboard shortcut for video node creation
- Proposal types focus on purpose/description, not internal state or positions
- Reuse parseJSONFromResponse from validation.ts for consistent JSON parsing
- Validate proposal shape before returning to catch LLM errors early
- Use createGoogleGenerativeAI factory for custom API key injection (AI SDK)
- toTextStreamResponse for AI SDK v6 streaming (not toDataStreamResponse)
- DefaultChatTransport with api option for useChat hook in AI SDK v6
- Manage input state locally (AI SDK v6 removed built-in input state from useChat)
- Use toUIMessageStreamResponse() for useChat hook compatibility
- Build Workflow button extracts user messages only (not assistant responses)
- Workflow generation uses contentLevel "full" for complete workflows
- Chat panel closes automatically after successful workflow generation
- AI workflow snapshot state: previousWorkflowSnapshot + manualChangeCount
- Deep copy workflow state using JSON.parse(JSON.stringify()) for snapshots
- Snapshot auto-clears after 3 manual structural changes
- Manual changes: add/remove nodes, add/remove edges (not position/selection)
- clearSnapshot called in clearWorkflow and loadWorkflow
- dynamicInputs type is Record<string, string | string[]> to support multi-image aggregation
- Single image stays as string; only multiple images to same schema key become array
- Array.isArray guard on dynamicInputs.prompt access (takes first element)
- AI SDK v6 tool pattern uses inputSchema (not parameters) for zod schemas
- Chat agent tools use "generate" pattern (no execute function) - LLM provides structured output
- Edit operations use batched immutable updates with skip tracking for invalid operations
- Node IDs for AI-generated nodes: ${nodeType}-ai-${Date.now()}-${index} pattern
- Workflow context builder strips base64 data, history arrays, and internal state for LLM consumption
- /api/chat accepts optional workflowState (nodes/edges) from client for context-aware routing
- AI SDK v6 uses stopWhen: stepCountIs(N) for multi-step tool execution (not maxSteps)
- Chat API uses toolChoice: 'auto' to let LLM decide which tool to call based on intent
- System prompt dynamically built per request with workflow context via buildEditSystemPrompt
- Custom fetch wrapper pattern for injecting extra body data with useChat (AI SDK v6)
- Tool invocation parts use part.type === "tool-{name}" with input property (AI SDK v6)
- state === "output-available" for tool completion detection (not "result")
- AI edits do NOT increment manualChangeCount (only manual edits clear snapshot)
- Snapshot captured before AI edits via captureSnapshot() in handleApplyEdits
- chatWorkflowState strips base64 from nodes to reduce API request size

### Deferred Issues

- UAT-001: Resolved - Provider icons now use real Replicate/fal.ai logos
- ISS-001: Resolved - Generate nodes now adapt to model requirements via dynamic parameters

### Blockers/Concerns

- Pre-existing lint configuration issue (ESLint not configured). Not blocking development.

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 001 | Fix multiple image inputs lost in dynamicInputs | 2026-01-30 | 1564a1b | [001-fix-multiple-image-inputs-lost-in-dynamicinputs](./quick/001-fix-multiple-image-inputs-lost-in-dynamicinputs/) |

### Roadmap Evolution

- v1.0 Multi-Provider Support shipped: 6 phases (Phase 1-6), 15 plans
- Milestone v1.1 Improvements created: 6 phases (Phase 7-12), improvements and polish
- Phase 13 added: Fix duplicate generations (hashing failure investigation)
- Phase 14 added: Fix drag-connect node creation bugs (consolidated from two phases)
- Milestone v1.2 Improvements created: 6 phases (Phase 15-20), testing and modularization
- Phase 21 added: Fix Gemini Pro image input handling and image deduplication issues
- Phase 22 added: Generate node dynamic input validation and API call tests
- Phase 23 added: Model browser improvements (recently used, icon dropdown, Gemini models in list)
- Phase 24 added: Improved cost summary (fal.ai pricing API, video node tracking, multi-provider support)
- Milestone v1.3 Improvements created: 5 phases (Phase 25-29), template explorer, node defaults, canvas performance
- Phase 30 added: Small fixes
- Milestone v1.4 Features created: 5 phases (Phase 31-35), agentic workflow builder with proposal dialogs and chat-based editing
- Milestone v1.5 Store Refactoring created: 4 phases (Phase 36-39), major refactor of workflowStore.ts into modular execution engine and Zustand slices

## Session Continuity

Last session: 2026-01-31
Stopped at: Completed Phase 35 Plan 02 (Selection-Aware Subgraph Extraction)
Resume file: None
Next action: Proceed to plan 35-03 (Chat Context Builder Integration) or continue with parallel plan 35-01
