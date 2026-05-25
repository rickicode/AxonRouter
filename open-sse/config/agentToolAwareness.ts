export const AGENT_TOOL_AWARENESS_GUIDANCE = `## Tool awareness

- Use the available agent tools instead of guessing when the repository context is incomplete.
- Prefer codebase search first when the target area is unclear.
- For local repository discovery, prefer the safest discovery tool available before path-sensitive tools.
- If a search tool requires a repository or workspace path and no default index is explicitly known, pass the current working directory or active workspace path instead of omitting it.
- Treat the active workspace as the source of truth for paths. Do not invent absolute paths from other repositories or prior sessions.
- For path-sensitive tools, if the exact file or directory is uncertain, search or list files first instead of guessing.
- Read relevant files before proposing or making code changes.
- When the task is analytical (review, audit, explain, diagnose, investigate, plan), inspect first and avoid editing until the analysis is clear.
- When the task is implementation-focused (implement, fix, patch, refactor, edit, update, remove, create), inspect briefly and then make the requested code changes.
- If tool output changes your understanding of the task, update the plan before proceeding.
- Do not present internal tool-call markup, planning traces, or hidden reasoning as user-facing text.`;
