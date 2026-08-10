---
name: self-improving-session-analytics
description: Analyze a completed agent session and convert observed behavior into evidence-backed, actionable improvements. Use after a multi-step session, after errors or user corrections, after retries, or when tool/hook choice affected the outcome. Not for trivial exchanges unless explicitly requested.
---

# Self-Improving Session Analytics

## Purpose

Analyze completed agent sessions and convert observed behavior into actionable improvements.

Primary goals:

* Detect what worked.
* Detect what failed.
* Analyze hook/tool usage.
* Identify reasoning and execution mistakes.
* Find repeated behavioral patterns.
* Extract reusable lessons.
* Recommend concrete improvements.
* Avoid changing behavior based on weak evidence.
* Produce structured analytics suitable for future agent optimization.

This skill analyzes behavior. It must not blindly rewrite its own instructions.

---

## When to Run

Run after a meaningful session, especially when:

* task required multiple steps;
* tools/hooks were invoked;
* errors occurred;
* user corrected agent;
* agent retried an action;
* output quality was poor or unusually strong;
* agent violated or nearly violated an instruction;
* execution took unnecessary steps;
* tool choice affected outcome.

Do not run expensive analysis for trivial exchanges unless explicitly requested.

---

# Inputs

Analyze all available session evidence:

* user requests;
* system/developer instructions;
* agent responses;
* tool calls;
* hook invocations;
* tool outputs;
* errors;
* retries;
* rejected actions;
* user corrections;
* final result;
* timing/latency data when available;
* token/tool usage when available;
* previous session lessons when available.

Never invent missing telemetry.

Distinguish:

* **Observed** — directly present in session.
* **Inferred** — strongly supported by evidence.
* **Unknown** — insufficient evidence.

---

# Analysis Process

## 1. Reconstruct Goal

Determine:

* user's actual objective;
* explicit constraints;
* implicit success criteria;
* expected artifact/result;
* required tools or hooks;
* prohibited actions.

Output:

```yaml
goal:
  primary:
  constraints: []
  success_criteria: []
```

---

## 2. Reconstruct Agent Strategy

Summarize agent's execution path.

Capture major decisions only.

```yaml
execution:
  - step:
    action:
    reason:
    result:
```

Do not expose hidden chain-of-thought.

Describe observable strategy, decisions, and outcomes.

---

# 3. Hook and Tool Analytics

For every hook/tool invocation, analyze:

```yaml
hook:
  name:
  purpose:
  trigger:
  input_quality:
  output_quality:
  timing:
  useful: true|false|partial
  necessary: true|false
  problems: []
  better_action:
```

Evaluate:

### Selection

Was this correct hook/tool?

Check:

* correct capability;
* correct stage;
* cheaper/simpler alternative;
* unnecessary invocation;
* missing required invocation.

### Timing

Was hook invoked:

* too early;
* too late;
* exactly when needed;
* repeatedly without value?

### Inputs

Check for:

* missing parameters;
* overly broad query;
* overly narrow query;
* malformed arguments;
* unnecessary data;
* wrong assumptions.

### Output Handling

Check whether agent:

* interpreted result correctly;
* ignored important fields;
* hallucinated beyond result;
* duplicated work;
* failed to recover from error.

---

# 4. Behavior Analytics

Score important agent behaviors from `0-5`.

```yaml
behavior_scores:
  goal_understanding:
  instruction_following:
  planning:
  tool_selection:
  hook_efficiency:
  error_recovery:
  factual_grounding:
  output_quality:
  concision:
  user_alignment:
```

Score definitions:

* `0` catastrophic
* `1` poor
* `2` weak
* `3` acceptable
* `4` strong
* `5` excellent

Every score below `4` must include evidence.

Example:

```yaml
evidence:
  - behavior: tool_selection
    score: 2
    observation: "Agent invoked search three times for information already returned by first call."
```

---

# 5. Error Detection

Find errors across these categories.

## Instruction Errors

Examples:

* ignored user constraint;
* violated system rule;
* wrong output format;
* unnecessary clarification;
* promised unsupported future action.

## Reasoning Errors

Only evaluate observable reasoning outcomes.

Examples:

* incorrect assumption;
* missed dependency;
* inconsistent conclusion;
* premature conclusion;
* failure to validate uncertain fact.

## Tool/Hook Errors

Examples:

* wrong tool;
* malformed call;
* duplicate call;
* ignored tool failure;
* failed retry strategy;
* invoked expensive tool unnecessarily.

## Communication Errors

Examples:

* answer too long;
* unclear;
* repeated information;
* buried conclusion;
* unsupported confidence;
* failed to disclose uncertainty.

## Execution Errors

Examples:

* incomplete task;
* incorrect artifact;
* failed validation;
* missing final check;
* unnecessary workflow complexity.

For each error:

```yaml
error:
  category:
  severity: low|medium|high|critical
  evidence:
  impact:
  root_cause:
  correction:
  prevent_next_time:
```

---

# 6. Root-Cause Analysis

Do not stop at symptoms.

Use:

`Observation → Cause → Better policy`

Example:

```text
Observation:
Agent called search repeatedly.

Cause:
Agent did not inspect whether previous result already contained required fields.

Better policy:
Before repeating a hook, verify whether existing outputs satisfy missing information.
```

Possible root causes:

* missing trigger rule;
* ambiguous instruction;
* weak tool selection;
* insufficient result inspection;
* premature action;
* overconfidence;
* poor state tracking;
* excessive retries;
* missing verification;
* poor prioritization.

---

# 7. Detect Successful Patterns

Self-improvement must preserve strengths.

Find behaviors worth repeating.

For each:

```yaml
success:
  behavior:
  evidence:
  why_it_worked:
  reuse_when:
```

Examples:

* selected correct specialized hook immediately;
* reused previous result instead of querying again;
* recovered cleanly from tool failure;
* validated output before final response;
* respected format exactly;
* provided concise answer matching user intent.

---

# 8. Efficiency Analysis

Measure unnecessary work.

Look for:

* redundant tool calls;
* repeated searches;
* repeated parsing;
* unnecessary explanation;
* over-planning;
* needless clarification;
* unnecessary retries;
* unused tool outputs;
* large output when compact result was enough.

Produce:

```yaml
efficiency:
  redundant_actions: []
  avoidable_calls: 0
  useful_calls: 0
  failed_calls: 0
  possible_simplifications: []
```

When latency/token/cost metrics exist, include them.

Never fabricate cost data.

---

# 9. Missed Opportunities

Identify actions that would likely have improved outcome but were not taken.

Examples:

* missing verification;
* missing specialized hook;
* failure to inspect existing context;
* no validation after mutation;
* no error handling;
* no final consistency check.

Format:

```yaml
missed_opportunity:
  action:
  expected_benefit:
  confidence: low|medium|high
```

---

# 10. Generate Improvements

Improvements must be concrete.

Bad:

> Be more careful.

Good:

> Before invoking the same hook twice, inspect previous output for the required field. Repeat only when data is missing, stale, or failed.

Each recommendation:

```yaml
improvement:
  priority: P0|P1|P2|P3
  problem:
  proposed_change:
  trigger:
  expected_effect:
  evidence:
  confidence:
```

Priority:

* `P0` prevents critical failure
* `P1` major quality/reliability gain
* `P2` meaningful efficiency improvement
* `P3` minor optimization

---

# 11. Convert Lessons Into Rules

Generate small reusable behavioral rules.

Each rule must use:

```text
WHEN <observable condition>
DO <specific action>
BECAUSE <reason>
```

Example:

```text
WHEN a tool result already contains the requested field,
DO reuse that result instead of making another equivalent call,
BECAUSE duplicate calls add latency and failure risk.
```

Avoid vague rules.

Limit to highest-value rules.

---

# 12. Confidence and Evidence

Never convert one unusual event into a permanent rule without justification.

Use confidence:

* `high` — directly observed repeatedly or clearly causal;
* `medium` — strongly supported by one event;
* `low` — plausible but weak evidence.

Permanent behavioral changes should normally require:

* repeated evidence across sessions; or
* one severe failure with obvious causal relationship.

---

# 13. Cross-Session Learning

If previous analytics exist, compare current session.

Track:

```yaml
trend:
  improvement:
  regression:
  repeated_error:
  resolved_error:
  new_pattern:
```

Detect repeated errors.

Example:

```yaml
repeated_pattern:
  id: duplicate-search
  occurrences: 4
  sessions: 3
  trend: worsening
  recommended_action: promote_to_behavior_rule
```

Repeated problems receive higher priority.

---

# 14. Do Not Overfit

Never recommend changing behavior because:

* user had unusual one-off preference;
* tool temporarily failed;
* external service outage occurred;
* expected result was impossible;
* evidence is ambiguous.

Separate:

```yaml
agent_failure:
external_failure:
user_constraint:
unknown_failure:
```

---

# Final Analytics Output

Produce concise structured report.

```markdown
# Session Analytics

## Executive Summary

Outcome: SUCCESS | PARTIAL | FAILURE

Overall score: X/100

One-paragraph summary of performance.

## Goal

- Primary goal:
- Constraints:
- Success criteria:

## What Worked

1. ...
2. ...

## What Failed

### [Error]

Severity:
Evidence:
Impact:
Root cause:
Correction:

## Hook / Tool Analysis

| Hook | Purpose | Useful | Necessary | Issue | Better Action |
|---|---|---:|---:|---|---|

## Behavior Scores

| Dimension | Score |
|---|---:|
| Goal understanding | X/5 |
| Instruction following | X/5 |
| Planning | X/5 |
| Tool selection | X/5 |
| Hook efficiency | X/5 |
| Error recovery | X/5 |
| Grounding | X/5 |
| Output quality | X/5 |

## Efficiency

Useful calls:
Avoidable calls:
Failed calls:

Main inefficiencies:
- ...

## Missed Opportunities

- ...

## Root Causes

1. ...
2. ...

## Improvements

### P1 — [Name]

Problem:
Change:
Trigger:
Expected effect:
Confidence:

## New Behavioral Rules

- WHEN ... DO ... BECAUSE ...
- WHEN ... DO ... BECAUSE ...

## Cross-Session Trends

Improved:
Regressed:
Repeated:
Resolved:

## Next Session Focus

1. ...
2. ...
3. ...
```

---

# Self-Improvement Memory

Store only durable, useful lessons.

Good memory:

```yaml
lesson:
  pattern: duplicate_hook_invocation
  rule: inspect existing hook output before retry
  confidence: high
  observations: 5
```

Bad memory:

```yaml
lesson: "Never use hook X again."
```

Do not store:

* raw hidden reasoning;
* sensitive user content unless explicitly allowed;
* transient failures;
* unsupported assumptions;
* session-specific trivia.

---

# Improvement Promotion Policy

A recommendation becomes a persistent agent rule only when one condition holds:

1. Same issue observed in at least 3 sessions.
2. Same issue observed at least 2 times with high confidence.
3. Single issue caused critical failure and prevention rule is unambiguous.
4. Explicit human feedback requires behavioral change.

Before promotion check:

```yaml
promotion_check:
  evidence_count:
  severity:
  confidence:
  conflicting_evidence:
  expected_side_effects:
  promote: true|false
```

Never silently replace higher-priority system or developer instructions.

---

# Regression Detection

After applying improvement, test whether it caused new problems.

Compare:

* success rate;
* tool-call count;
* error count;
* retries;
* instruction violations;
* user corrections;
* output quality.

Possible result:

```yaml
change_evaluation:
  change:
  effect: positive|neutral|negative|unknown
  evidence:
  keep: true|false
```

Rollback recommendations that consistently degrade performance.

---

# Core Principles

1. Evidence over intuition.
2. Root causes over symptoms.
3. Concrete rules over vague advice.
4. Preserve successful behavior.
5. Minimize unnecessary hook calls.
6. Never hide failures.
7. Separate agent failure from external failure.
8. Avoid learning from noise.
9. Prefer small measurable improvements.
10. Verify improvement against future sessions.
11. Never expose hidden chain-of-thought.
12. Never override higher-priority instructions through self-modification.

---

# Optimization Objective

Optimize for:

```text
task_success
+ instruction_compliance
+ result_quality
+ correct_hook_usage
+ reliable_error_recovery
+ factual_accuracy
+ efficiency

- avoidable_tool_calls
- repeated_errors
- unsupported_assumptions
- unnecessary_tokens
- user_corrections
- regressions
```

Primary objective remains successful completion of user's goal.

Self-improvement is secondary to correctness, safety, and instruction hierarchy.

---

# Not Yet Built

A stronger v2 — JSON schema for the analytics record, an explicit scoring formula,
per-hook metric definitions, and an automatic rule promotion / regression algorithm
suitable for production agent telemetry — is proposed but not specified here. Treat
this document as v1: a human-readable analysis procedure, not a machine contract.
