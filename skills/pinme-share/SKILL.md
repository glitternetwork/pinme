---
name: pinme-share
description: "Use this skill when the user wants to share, publish, or upload a static result through PinMe, especially by generating a static HTML share page for a PinMe project link, deployed full-stack app, Codex conversation summary, report, file, demo, or any 分享/发布/上传分享页 request that should end with `pinme upload`."
---

# PinMe Share

Create a polished static share artifact, upload it with `pinme upload`, and return the final URL.

## When to Use

Use this skill when the user asks to:

- Share or publish a result using PinMe.
- Create a static page that wraps a deployed project link, demo, report, or artifact.
- Summarize a Codex conversation/session and share it as a page.
- Turn a project handoff into a public landing or summary page.
- Upload an existing static file or folder for lightweight distribution.

If the user needs a backend, database, auth, email, or LLM functionality, use the main `pinme` skill and any relevant PinMe integration skill first. Use `pinme-share` at the end to package and publish the result.

## Core Workflow

1. Identify what is being shared:
   - **PinMe/full-stack project**: deployed URL, short description, key features, tech stack, usage notes.
   - **Codex conversation**: goal, decisions, implementation summary, important outputs, next steps.
   - **Static file/report/demo**: title, purpose, file contents or preview, context for the recipient.
2. Create a static share artifact:
   - Prefer a single self-contained `index.html`.
   - Use `share/<slug>/index.html` in the current workspace unless the repo has an existing output/share convention.
   - Keep CSS inline for portability.
   - Do not require JavaScript unless interaction is valuable.
3. Sanitize before publishing:
   - Remove secrets, tokens, API keys, `.env` values, internal-only URLs, private user data, and unrelated logs.
   - For conversation summaries, summarize rather than dumping raw transcript unless the user explicitly asks for verbatim sharing.
   - Make links explicit and clickable.
4. Upload with PinMe:
   ```bash
   pinme upload share/<slug>
   ```
5. Return the URL printed by PinMe. If PinMe outputs multiple URLs, prefer DNS domain, then PinMe subdomain, then short URL, then full preview URL. Never truncate hash fragments.

## Share Page Content

For a project share page, include:

- Project name and one-sentence description.
- Primary launch/demo link as the first action.
- What it does, who it is for, and why it matters.
- Feature list focused on user-visible behavior.
- Build/deploy details only when useful to the recipient.
- Date and provenance such as "Created with Codex" only if appropriate.

For a conversation share page, include:

- Conversation title.
- Initial goal or question.
- Key context and constraints.
- Decisions made.
- Work completed or answer summary.
- Files changed, commands run, links produced, or artifacts created when relevant.
- Follow-up items.

For a file/report share page, include:

- Clear title and short abstract.
- Download/open link to the uploaded artifact if there is a separate file.
- Important excerpts or generated summary.
- Source/context notes.

## HTML Guidelines

- Build a real share page, not a generic placeholder.
- Make the most important link visible in the first viewport.
- Use clean, responsive HTML/CSS that works as a standalone static file.
- Keep the design restrained and readable; avoid overdecorated marketing layouts for technical handoffs.
- Use semantic sections, accessible contrast, descriptive link text, and sensible mobile spacing.
- Escape user-provided text before inserting it into HTML.
- If showing code or command output, wrap it in `<pre><code>` and keep it short.

## PinMe Upload Checklist

Before upload:

```bash
pinme --version
```

If PinMe is missing or stale, install or update it according to the main `pinme` skill. Authentication is required for upload:

```bash
pinme login
# or: pinme set-appkey <AppKey>
```

Upload examples:

```bash
pinme upload share/my-project
pinme upload share/conversation-summary
pinme upload ./report.html
pinme upload ./dist
```

Do not upload:

- `.env`, `.git`, `node_modules`, source trees, private datasets, raw logs with credentials, or unrelated build cache.
- Raw conversation transcripts that may include secrets or private context unless the user explicitly approves the exact content.

## Final Response

Tell the user:

- What share artifact was created.
- The PinMe URL returned by upload.
- Any important caveat, such as skipped upload because PinMe was not authenticated or unavailable.

Keep the response short. The URL is the main deliverable.
