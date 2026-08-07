# Delegated write work

When another skill needs a write performed on its behalf, it hands `okf-delegate` a brief rather
than allowlisting `okf-write` directly.

The brief carries `role: "okf-writer"`, plus `task_kind`, `operation_class`, `cwd`, `bundle`,
`paths`, `allowed_effects`, `forbidden_effects`, `evidence`, `required_checks`, `settings`,
`expected_result`, and `changes`. For `operation_class: "create"`, an optional `body` field
carries the new concept's Markdown body, forwarded as `payload.body` (#149: `okf-setup`'s own
`publish` operation is the first caller to use it, promoting a staged migration concept into the
bundle); every brief that omits it behaves exactly as it did before this field existed.

`okf-delegate` validates that brief — completeness, no conflict between `allowed_effects` and
`forbidden_effects`, no scope wider than the writer role — before it ever dispatches the
equivalent `okf-write` request.

It then returns one `okf-delegation/1` receipt: `protocol`, `receipt`, `role`, `status`,
`operation_identity`, `target`, `requested_effects`, `actual_effects`, `evidence`, `validation`,
`residue`, `disclosures`, `findings`, `next_action`.

`okf-delegate` accepts exactly two roles, `okf-reader` and `okf-writer`. A brief naming any other
role is blocked on `field: "role"`, so no delegated lifecycle or review path exists in `v0.1.0`.

Allowlisting `okf-write` directly skips that brief validation and hands back a raw wrapper
response where a receipt was expected.
