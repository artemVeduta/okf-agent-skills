# Delegated review work

When another skill delegates review work on an agent's behalf, the request routes through
`okf-delegate`, the delegation entry point, instead of allowlisting the `okf-review` wrapper
directly.

`okf-delegate` validates the brief before dispatching anything.

Going around it skips that validation and leaves the caller holding a bare wrapper response
where a receipt was expected.
