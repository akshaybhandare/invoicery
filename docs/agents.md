# Agent Guidelines & Context Handover

This file is a mandatory read for any AI agent/LLM beginning work on this codebase.

---

## 🚨 CRITICAL RULE: Read Documentation Before & After Work

Every time you (the LLM/Agent) start a new session or begin work on a task in this repository:

1. **Before Starting Work**: 
   - **MUST** read [docs/tracker.md](file:///Users/akshaybhandare/3D/GST/myZoho/docs/tracker.md) to inspect the current state of the implementation plan, user stories, and task completion.
   - **MUST** read the latest handover document (e.g., `docs/handover_phase_X.md`) to understand the functional state, running instructions, and how to verify the application.
   - Do **NOT** skip this step. This ensures complete context parity across sessions.

2. **After Completing a Task**:
   - **MUST** read the tracker and latest handover document again to verify alignments.
   - **MUST** update [docs/tracker.md](file:///Users/akshaybhandare/3D/GST/myZoho/docs/tracker.md) to mark tasks as completed (`[x]`) and reference the corresponding handover file.
   - **MUST** write a new `docs/handover_phase_X.md` detailing the implemented changes, how to launch/run the app, and how to verify the changes.

---

## 🛠️ Tech Stack & Key Configurations
- **Runtime**: Bun (`bun:sqlite`, `Bun.serve`)
- **Frontend**: Vanilla JS, Vanilla CSS, HTML5 (Single Page App)
- **Base State (GST)**: Karnataka (State Code: `29`)
- **Default Invoice Format**: `INV-0000XX` (e.g. `INV-000001`)
- **Authentication**: None required (Personal local offline use)

---

## 💎 Code Quality & Development Principles

Every agent working on this codebase must adhere to the following principles:

1. **Sonar Code Quality Standards**:
   - Keep functions cohesive, highly focused, and brief. Minimize cognitive complexity by avoiding deep conditional nesting.
   - Strictly parameterize all SQL database transactions to block SQL injections.
   - Clean up dead code, unused imports, or duplicate variable declarations introduced during refactoring.

2. **DRY (Don't Repeat Yourself) / Reduce Duplication**:
   - Consolidate repetitive styling properties, layout components, and JavaScript helpers.
   - Refactor repetitive logic into utility functions instead of copy-pasting blocks of code.

3. **YAGNI (You Aren't Gonna Need It) Principle**:
   - Write only the minimal amount of code necessary to solve the active task.
   - Never implement speculative configurations, extra framework abstractions, or features outside of the explicitly requested stories.
   - Keep the local directory footprint clean and direct.
