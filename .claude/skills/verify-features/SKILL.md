---
name: verify-features
description: >
  Verify that newly built features work as expected by running servers, executing CLI tools,
  taking screenshots, and documenting results. Use this skill whenever the user asks to confirm,
  verify, validate, check, test, or QA a feature that was just built or changed. Also trigger
  when the user says things like "make sure it works", "does it look right", "check the new
  homepage", "test the API", "confirm the build", or "verify my changes". This skill applies
  any time the workflow involves starting a dev server, running a CLI tool to inspect output,
  taking screenshots to visually confirm UI, or creating documentation that captures how a
  feature behaves. Even if the user just says "look at it and make sure it's good", use this skill.
---

# Verify Features

This skill guides you through confirming that newly built features work as expected. The core loop is: **learn the tool → run the feature → observe the output → document what you find**.

## Why this matters

Skipping verification is how bugs ship. The user is counting on you to actually exercise the feature — not just check that files exist. Run the thing, look at what it produces, and flag anything that seems off.

## Workflow

### 1. Understand the tool before using it

Before running any CLI tool or dev server, check its help output first. This tells you what commands and flags are available and prevents you from guessing wrong.

```bash
# For tools installed via uvx, npx, or similar runners:
uvx <tool-name> --help

# For local dev servers, check package.json scripts or similar config
```

Read the help output carefully. Identify the specific command or subcommand you need for the task at hand. If the tool has subcommands, drill into the relevant one (e.g., `uvx <tool-name> serve --help`).

### 2. Start any required servers

If the feature involves a web UI or running application:

- Start the dev server in the background so you can interact with it.
- Wait briefly for startup (check logs for "ready" or "listening" messages).
- Note the URL and port.

```bash
# Example: start in background, capture logs
uvx <tool-name> serve &> /tmp/server.log &
sleep 3
cat /tmp/server.log  # confirm it started
```

If the server fails to start, read the error output before retrying. Common issues: port conflicts, missing dependencies, build errors.

### 3. Exercise the feature

This is the most important step. Actually use the feature the way a real user would.

**For UI features:**
- Navigate to the relevant pages/routes.
- Take screenshots to visually confirm layout, placement, and content.
- Check that interactive elements (menus, buttons, forms) appear where expected.
- Compare against what the user described — is the menu in the right place? Does the homepage look correct?

**For CLI/API features:**
- Run the commands that exercise the new functionality.
- Capture the output.
- Test both the happy path and at least one edge case (e.g., missing arguments, empty input).

**For documentation-driven verification:**
- If the user asks you to create a document that tests/demonstrates a feature (like an API demo doc), the document creation itself is part of the verification.
- Use the tool to generate or populate the document, then inspect the result.
- The document should exercise real functionality, not just contain placeholder text.

### 4. Capture evidence

Always produce concrete evidence of what you observed:

- **Screenshots** for anything visual — don't just say "it looks fine," show it.
- **Command output** for CLI tools — paste the actual output, not a summary.
- **Generated files** for document-based verification — create the file, then review its contents.

### 5. Report findings

Tell the user what you found, clearly and specifically:

- **What worked** — be specific ("the navigation menu renders in the top-right corner as expected").
- **What didn't work** — describe the actual vs. expected behavior.
- **Anything ambiguous** — if you're unsure whether something is correct, say so and show the evidence so the user can decide.

Don't just say "everything looks good." Point to the specific things you checked.

## Common patterns

### Dev server + screenshot verification

This is the typical flow for UI features:

1. Run `<tool> --help` to learn available commands
2. Start the dev server
3. Take a screenshot of the relevant page
4. Examine the screenshot for the specific elements the user mentioned
5. Report what you see with the screenshot as evidence

### CLI tool + documentation verification

This is the typical flow for API or CLI features:

1. Run `<tool> --help` to learn available commands
2. Run the specific commands that exercise the new feature
3. Create any requested documentation (e.g., a markdown file demonstrating the API)
4. Use the tool to populate or validate the document with real data
5. Review the generated document and report findings

## Things to watch out for

- **Don't skip the help step.** Tools change. Flags get renamed. Checking `--help` takes seconds and prevents wasted time.
- **Don't assume the server started.** Always check logs or probe the endpoint.
- **Don't describe what you expect to see — describe what you actually see.** The whole point is catching surprises.
- **Don't forget cleanup.** Kill background servers when you're done (`kill %1` or similar).
- **If something looks wrong, say so immediately.** Don't bury problems at the end of a long report.
