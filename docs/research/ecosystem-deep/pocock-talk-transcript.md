# Transcript Research: "Building Great Agent Skills: The Missing Manual"

## Provenance

| Field | Value |
|---|---|
| Video ID | `UNzCG3lw6O0` |
| Title | Building Great Agent Skills: The Missing Manual |
| Speaker | Matt Pocock |
| Event | AI Engineer World's Fair, San Francisco (delivered as recording) |
| Duration | 20:42 |
| Caption language | English (auto-generated) |
| Retrieval method | `GET https://youtube-transcript.ai/transcript/UNzCG3lw6O0.txt?lang=en` |
| Retrieval date | 2026-07-26 |
| Service | youtube-transcript.ai (free, no-key endpoint) |
| Response | HTTP 200, `text/markdown; charset=utf-8` |
| Stated word count | 12,602 |
| Redistribution license | Unspecified by service; source captions are YouTube auto-generated |
| Evidence pointer | https://www.youtube.com/watch?v=UNzCG3lw6O0 |
| Canonical transcript source | https://youtube-transcript.ai/transcript/UNzCG3lw6O0.txt?lang=en |

## Completeness Verification

- **Coverage:** Transcript timestamps span 0:01–20:20 of the 20:42 runtime. The final ~22 seconds (outro screen) are not covered by caption track.
- **Chapter boundaries:** No explicit YouTube chapter markers. Logical structure derived from the talk:
  1. **Introduction: Skill Hell** (0:01–3:01)
  2. **Trigger — invocation design** (3:01–7:06)
  3. **Structure — steps, reference, branching** (7:06–11:41)
  4. **Steering — leading words and legwork** (11:41–16:46)
  5. **Pruning — no-ops, sediment, DRY** (16:46–19:48)
  6. **Wrap-up and call to action** (19:48–20:42)
- **Artifact quality:** Auto-generated caption triple-repetition pattern (each phrase appears 3× due to overlapping source caption segments). Readable as Markdown paragraphs despite repetition.

## Spot-Checked Terms

Names and skill-authoring vocabulary confirmed present in transcript against the talk delivery:

| Term | Confirmed |
|---|---|
| tutorial hell / framework hell / skill hell | ✓ |
| user invoked / model invoked (model invocable) | ✓ |
| context pointer | ✓ |
| context load / cognitive load | ✓ |
| disable model invocation | ✓ |
| steps / reference | ✓ |
| external reference | ✓ |
| branches / branching | ✓ |
| leading words (leitwort) | ✓ |
| vertical slice | ✓ |
| legwork | ✓ |
| hide the future goal / future steps | ✓ |
| no-ops (deletion test) | ✓ |
| sediment | ✓ |
| single source of truth / DRY | ✓ |
| Superpowers (competing skill set) | ✓ |
| codebase design skill | ✓ |
| grill me skill | ✓ |
| domain modeling skill | ✓ |
| 2 PRD skill | ✓ |
| grill with docs skill | ✓ |
| implement skill | ✓ |
| writing great skills skill | ✓ |
| aihero.dev newsletter | ✓ |

## Key Excerpts

### On model-invoked vs user-invoked (3:31–7:06)

> The description of the skill always ends up in the agent's context, and the agent can look in that and go, "Okay, based on that description, I'm going to invoke the skill." … Every time you add a model invoked skill into your agent's environment, it increases what I'm going to call the context load on that agent. … User invoked skills have a different load, which is the more user invoked skills you have, the higher cognitive load on the user.

### On steps and reference (7:37–8:38)

> I think of there as being two main units that you need to put into most skills. These two units are the steps and the reference. The steps are the step-by-step procedure that the skill is going to walk through and the reference is any supporting information that helps it walk through those steps.

### On keeping skill.md small (9:09–11:41)

> Smaller skills are just easier to maintain, easier to audit, fewer words to think about. And every time you shave off a word, that is a token shaved. … Hide branching reference material behind context pointers. In other words, if you feel like your skill is going to be used in lots of different ways, then take the reference material that's relevant for those branches and hide them behind context pointers.

### On leading words (12:12–14:44)

> There are certain words that pack in a bunch of meaning into a very small space. These leading words are really powerful with agents because you put the leading word in the skill itself in the text, and then the agent will repeat the leading word back to itself as part of its operations. … So often if the agent isn't doing what you want, you need to make your leading words more consistent, more powerful.

### On legwork and hiding future steps (15:14–16:46)

> We have two steps. We have ask clarifying questions and then create a plan. … Ask clarifying questions just, you know, it doesn't ever do enough legwork. … We have step one and step two, but the agent only sees one step at a time. So, this is a really cool technique for increasing legwork on the step that you're on by hiding the future goal, hiding the future steps.

### On no-ops and pruning (18:18–19:48)

> Things inside the skill that appear to do something but don't actually influence the agent's behavior. … People ask me a lot how I get my skills so small, and it's just using these techniques, using deletion tests, using making sure that I compact things into leading words, I don't have anything irrelevant in there, and I don't have any sediment.

## Uncertainty Markers

- **Caption provenance:** Service reports "English (auto-generated)" but does not distinguish between YouTube's ASR pipeline version, third-party refinement, or manual-versus-auto provenance at the source level. Field recorded as service-selected/unspecified.
- **Repetition artifact:** The triple-repetition pattern (each phrase appears 3× in adjacent lines) is an artifact of the transcript service formatting overlapping auto-generated caption segments. It does not affect content accuracy but makes direct word-count comparison misleading.
- **Name verification:** "Air Engineer World's Fair" appears in auto-generated caption as a likely misrecognition of "AI Engineer World's Fair." Resolved by cross-referencing the speaker's narration context.

## Notes

- This transcript is a **research input**, not adopted product policy. Interpretation and adoption belong to issue `Adopt a combined skill-authoring contract for the OKF skill suite`.
- The full raw transcript (92 lines, ~50 KB) was retrieved to `/tmp/transcript_raw.md` during the 2026-07-26 session and can be re-fetched from the canonical source URL above.
- The transcript confirms Matt Pocock's `writing-great-skills` skill encodes the same checklist structure (Trigger → Structure → Steering → Pruning) described in the talk, and was published alongside the talk recording as a reference implementation.
