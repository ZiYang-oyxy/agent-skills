---
name: session-html-recap
description: Create an offline, self-contained HTML replay page for the current or specified Codex CLI session. Use only when explicitly invoked as $session-html-recap to turn ~/.codex/sessions rollout data into a Codex-like local chat playback page with user and assistant turns, inline tool events, artifact links, and expandable transcript details.
---

# Session HTML Recap

This skill is an explicit-entry workflow for packaging a Codex CLI session into a standalone local
HTML replay page.

## Use This Skill

Only when the user explicitly mentions `$session-html-recap`.

Typical requests:

- "Use $session-html-recap for the current session."
- "Use $session-html-recap for the last session and do not open it."
- "Use $session-html-recap for thread 019d... and write it to ~/tmp/demo.html."

## Defaults

- Session target: `current`
- Output file: `~/tmp/codex-session-recaps/<timestamp>-<thread-id>.html`
- Open after generation: yes, unless the user says not to

## Workflow

1. Resolve intent from the user's message.
   - Session target:
     - `current`
     - `last`
     - explicit thread id
     - explicit rollout jsonl path
   - Optional output path
   - Whether to auto-open the result
2. Run the collector:

```bash
node /Users/bytedance/.agents/skills/session-html-recap/scripts/collect_session_data.mjs --session "<target>" --cwd "$PWD" --out "<json>"
```

3. Run the renderer:

```bash
node /Users/bytedance/.agents/skills/session-html-recap/scripts/render_session_recap.mjs --input "<json>" [--out "<html>"]
```

4. If auto-open is enabled, open the generated HTML:

```bash
open "<html>"
```

5. Respond with:
   - generated HTML path
   - resolved session source
   - any warnings or fallback behavior

## Output Rules

- Keep the page offline-first and single-file.
- Do not invent steps, artifacts, or files that are not present in the session data.
- Prefer a chat-replay presentation:
  - user turn
  - assistant turn
  - inline tool step
  - side summary rail
  - expandable raw details
- Treat warnings from the collector as real and include them in the final response.

## Implementation Notes

- The collector already prefers `CODEX_THREAD_ID` for `current`.
- The collector applies light secret masking and trims oversized tool output snippets.
- The renderer already embeds the recap structure and styling. Do not regenerate the HTML layout in
  the model unless the scripts fail.
