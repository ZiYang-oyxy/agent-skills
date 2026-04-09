# Workflow Reference

Use this reference when creating an offline HTML recap from a conversation.

## 1. Inputs To Gather

Before writing the page, collect:

- the user goal
- the major turns in the conversation
- the key technical or analytical decisions
- the final artifacts produced
- the exact output paths that should be shown

Do not ask the user to restate facts that are already in the conversation or workspace.

## 2. Narrative Structure

Unless the user asks for a different format, structure the page in this order:

1. Hero / opening summary
2. Process timeline
3. Key evidence
4. Key insights or turning points
5. Final artifacts
6. Optional embedded document summaries or full text

The page should explain both:

- what happened
- why the conversation ended with the final result

## 3. Visual Direction

Prefer a presentation style, not a chat-app clone.

Default design cues:

- editorial typography
- layered cards and sections
- clear navigation anchors
- warm light palette or another deliberate palette that fits the session
- evidence cards instead of raw terminal dumps

Avoid:

- default browser styling
- chat bubble UIs that look like screenshots
- network-hosted fonts or libraries
- giant unstructured transcript walls

## 4. Fidelity Rules

Keep the recap faithful to the actual session.

- Do not fabricate missing steps.
- Do not imply tests were run if they were not.
- Distinguish between findings, decisions, and outputs.
- If a file was generated, show its real path.

## 5. Artifact Embedding Rules

If the session produced Markdown or similar text artifacts:

- summarize each artifact in one short paragraph or bullet list
- expose the full content with `<details>` when the user wants a demonstrable page
- keep long raw text inside `<pre>` or structured HTML blocks

If there are many artifacts, prioritize:

1. decision-driving artifact
2. reusable template or guideline
3. final report or review result

## 6. Output Rules

The HTML should be:

- single-file
- offline self-contained
- readable on desktop and mobile
- easy to present in a browser without setup

Default filename suggestion:

- `conversation_demo.html`
- `session_recap.html`
- `process_recap.html`

Pick the filename that best matches the surrounding artifacts.
