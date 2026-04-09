---
name: conversation-html-recap
description: Create an offline, self-contained HTML recap page from the current conversation and its produced artifacts. Use when Codex needs to summarize a working session, demo how a result was reached, present a chat/process walkthrough, or turn conversation outputs into a polished local HTML document for review, demo, handoff, or archive.
---

# Conversation HTML Recap

Create a single self-contained HTML file that explains how the conversation moved from the initial request to the final output.

## Workflow

1. Read the relevant conversation outputs and produced artifacts before drafting.
2. Build the recap around a clear narrative:
   - starting request
   - key turns and decisions
   - evidence gathered
   - final outputs and why they matter
3. Keep the output offline-first:
   - one HTML file
   - no CDN
   - no remote fonts
   - no runtime fetches
4. Prefer a presentation page, not a raw transcript dump.
5. Use the bundled references and template:
   - Read `references/workflow.md` for the required structure and content rules.
   - Reuse `assets/offline_recap_template.html` as the starting shape when it fits.

## Required Output Rules

- Default output path: place the recap near the produced artifacts unless the user specifies another location.
- Include a top summary, a conversation/process timeline, key insights, and final artifact cards.
- When documents or reports were produced during the session, embed summaries and optionally expandable full text.
- Make the page visually intentional and presentation-ready for desktop and mobile.
- Preserve accuracy: do not invent decisions, files, or outputs that did not happen.

## Content Selection

- Compress noisy tool logs into evidence cards or short proof snippets.
- Keep the sequencing faithful to the session.
- Emphasize pivots:
  - when the problem changed
  - when a conclusion was reached
  - when reusable assets were produced
- Prefer direct filenames and concrete outcomes over vague summary language.

## Implementation Defaults

- Use semantic HTML, inline CSS, and minimal inline JS only when needed.
- Favor light backgrounds and editorial/project-workbench aesthetics unless the repo already establishes another style.
- Keep the HTML easy to hand-edit after generation.
- If the session produced Markdown artifacts, either:
  - embed concise summaries plus expandable full text, or
  - embed the most relevant excerpts when full text would be too large.

## Validation

- Open or inspect the generated HTML structure after writing it.
- Verify the page is standalone and does not reference network resources.
- Check that all named artifacts and paths match the real outputs.
