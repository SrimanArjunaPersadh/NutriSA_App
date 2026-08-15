# ADR format

ADRs live in `docs/adr/`, numbered sequentially: `0001-slug.md`, `0002-slug.md`. Scan the
directory for the highest number and increment. Create the directory lazily.

## Template

```md
# {Short title of the decision}

{One to three sentences: the context, what was decided, and why.}
```

That is the whole template. An ADR can be a single paragraph. The value is in recording
*that* a decision was made and *why* — not in filling out sections.

## Optional sections

Include only where they earn their place, which is rarely.

- **Status** frontmatter (`proposed | accepted | superseded by ADR-NNNN`) — useful once a
  decision has actually been revisited.
- **Considered options** — only where the rejected alternative is worth remembering.
- **Consequences** — only for non-obvious downstream effects.

## Worked example

```md
# Expo SDK pinned to 54

Expo Go from the App Store supports exactly one SDK at a time, and that is 54. Newer SDKs
land in the docs and on npm long before the Expo Go binary clears Apple review, and the
project runs on Expo Go because it is the only free path onto the iPhone. An upgrade to
SDK 57 typechecked clean and passed expo-doctor 20/20, then failed on the device with
"Project is incompatible with this version of Expo Go" and was fully reverted. The SDK
moves only when the Expo Go app on the device reports a new number — verified against the
device, never against docs.expo.dev/versions/latest.
```

Note what that buys: the reason moves out of always-loaded context into a file, and
`AGENTS.md` shrinks to one pointer line — *"SDK is pinned to 54; the reasoning and the
revert are in `docs/adr/0001`."*

## When to offer one

All three must hold:

1. **Hard to reverse** — changing your mind later costs real work.
2. **Surprising without context** — a future reader will wonder why.
3. **A real trade-off** — genuine alternatives existed and one was picked for reasons.

Easy to reverse? Skip it, you will just reverse it. Not surprising? Nobody will wonder.
No alternative? There is nothing to record beyond "we did the obvious thing".

### What qualifies here

- **Architectural shape** — all arithmetic in `packages/engine/`; the engine stays
  dependency-free.
- **Technology with lock-in** — Neon over Supabase, Clerk for auth, Inngest for jobs,
  Hono on Vercel. Not every library; the ones that would take a month to swap.
- **Deliberate deviations from the obvious path** — Native Tabs behind an `unstable-`
  import; pinning an SDK the docs say is old. These are the ones that stop the next agent
  "helpfully" fixing something that was chosen on purpose.
- **Boundary decisions, including the no's** — OCR photos never reach ImageKit;
  `user_id` never comes from the client. An explicit no is as valuable as a yes.
- **Constraints invisible in the code** — the paid Apple Developer account gates the dev
  client, so Expo Go decides the SDK.
