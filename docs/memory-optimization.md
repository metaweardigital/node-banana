# Memory Optimization for Large Workflows

## Problem

Workflows with embedded base64 images can grow to 200MB+. Chrome tabs have a ~2GB V8 heap limit. Operations that clone the full workflow (auto-save, undo snapshots, clipboard) create multiple copies in memory, pushing past the limit and causing "Aw, Snap!" crashes (error code 5).

## Changes Made

### 1. Snapshot stripping (`captureSnapshot`)
- **File:** `src/store/workflowStore.ts`
- Snapshots (used for AI change undo) no longer deep-clone base64 image data
- Only node structure, positions, parameters, and edges are preserved
- Trade-off: reverting a snapshot won't restore images, but prevents 200MB+ memory duplication

### 2. Clipboard stripping (`copySelectedNodes`)
- **File:** `src/store/workflowStore.ts`
- Copy/paste strips base64 data from copied nodes
- Pasted nodes won't have images but will have correct structure and connections

### 3. Save memory fix (`saveToFile`)
- **File:** `src/store/workflowStore.ts`
- Externalized node references are stored separately before serialization
- Previously, nullifying the workflow object after `JSON.stringify` caused "Cannot read properties of null (reading 'nodes')" crash

### 4. Auto-save toggle
- **File:** `src/components/ProjectSetupModal.tsx`
- Added "Auto-save" checkbox in Project Settings > Project tab
- Disabling auto-save prevents the 90-second serialize cycle that can spike memory
- State: `autoSaveEnabled` / `setAutoSaveEnabled` in workflow store

## Recommendations

- For large workflows (50+ nodes with images), disable "Embed images as base64" in Project Settings. This stores images as separate files and keeps the workflow JSON small.
- If using embedded base64, consider disabling auto-save for very large workflows.
- External image storage (default) uses `imageRef` fields that point to files in the project directory's `inputs/` and `generations/` subfolders.
