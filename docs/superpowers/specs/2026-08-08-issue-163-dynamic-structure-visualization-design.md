# Issue 163 dynamic structure visualization

## Purpose

Create a self-contained HTML decision explorer for the maintainers of
`okf-agent-skills`. Its single job is to make the dynamic concept-placement
rule concrete before issue 163 is resolved.

## Direction

Use a route board based on the work of moving source documents into an OKF
bundle. The user selects a source and tests three possible placement signals:
concept type, source path, and reader purpose. The first two routes stop. The
reader-purpose route reaches an approved concept group in the target tree.

This approach is clearer than a file-browser workbench and more useful for path
decisions than a spatial decision graph.

## Visual System

- Blueprint: `#DCE7FF`
- Ink: `#17213A`
- Signal orange: `#F0643B`
- Route blue: `#3157C8`
- Valid green: `#18705A`
- Display type: a Charter-style native serif stack
- Body type: a humanist native sans-serif stack
- Path and rule type: the platform monospace stack

The animated route is the only decorative risk. Borders, labels, and spacing
must explain structure rather than decorate it.

## Page Structure

The opening thesis is `Structure follows use`. Below it, a two-column explorer
places source evidence on the left and the proposed `okf/` tree on the right.
Controls between them select the placement signal. A compact rule strip closes
the page with the settled index, grouping, mirroring, and depth rules.

On narrow screens, the source panel, controls, and target tree stack in that
order. The route becomes a vertical path.

## Interaction

Include three real scenarios from the repository decision:

- A `Release` concept whose type does not force `releases/`
- A source under `docs/architecture/` whose source path is not preserved
- An open custom concept type that follows the same placement rule

Selecting `Type` or `Source path` draws a short rejected route and explains why
that signal is evidence only. Selecting `Reader purpose` draws the full route
to a highlighted concept group and shows its required navigation-only
`index.md`.

Use buttons with native keyboard behavior. Announce the current explanation in
an `aria-live` region. Disable route motion when `prefers-reduced-motion` is
set. Keep all content useful when JavaScript is unavailable by showing the
reader-purpose state as the initial document state.

## Scope

Deliver one HTML file with embedded CSS and JavaScript. Use no framework,
external font, network asset, package, or build step. Do not implement editing,
drag-and-drop, persistence, or GitHub API access.

## Verification

- Parse the document with a Node.js standard-library check.
- Confirm required scenarios, controls, landmarks, and accessibility attributes
  are present.
- Check the page at desktop and narrow viewport widths in a browser when a
  browser runner is available.
- Confirm only the intended visualization file is staged for its commit.
