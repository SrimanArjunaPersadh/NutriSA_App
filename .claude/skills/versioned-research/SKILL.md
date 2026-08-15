---
name: versioned-research
description: Investigate an API or library question against version-pinned primary sources and capture the findings as a Markdown file. Use before writing Expo, Clerk, Drizzle, Hono, NativeWind or Inngest code whose API shape you are not certain of, or when the user asks for something researched.
---

# Versioned Research

The single most expensive failure mode in this repo is API drift: code written from a
model's memory of a library, or from a blog post, or from `docs/versions/latest` — none of
which are the version this project runs. It typechecks, it passes review, and it fails on
the device. This skill exists to make "I checked the pinned docs" a thing that actually
happened rather than a thing that was implied.

## Pin the version before you read anything

Get the version from the **environment**, never from memory. `package.json` is the source
of truth, and for Expo the pinned URL is
`https://docs.expo.dev/versions/v54.0.0/` — `latest` in the Expo docs is **not** this
project's SDK, and Native Tabs in particular changed shape between 54 and 55.

State the version and the URL you are reading at the top of your findings. A finding
without a version attached is not a finding.

## Primary sources only

In descending order of trust:

1. **The installed source.** `node_modules/<pkg>` holds the exact code this project runs —
   its `.d.ts` files are the highest-trust answer available and they cannot be the wrong
   version. Read these first for API shape questions; they settle "does this prop exist"
   in one grep.
2. **Version-pinned official docs.** The `v54.0.0` URL, the library's docs at its released
   tag.
3. **The library's own source at the matching tag** — for behaviour the docs skip.
4. **The changelog between the version you remember and the version installed** — the
   fastest way to find what moved.

A blog post, a Stack Overflow answer, and an LLM's recollection are not sources. If a
secondary source is the only thing that mentions a behaviour, follow it back to the
primary source that owns it, and if there isn't one, say the claim is unverified.

## Dispatch it

Spin the investigation out to a **sub-agent** so the main session keeps working. Its brief:

1. Investigate the question against the pinned primary sources above.
2. Write findings to a single Markdown file, citing the source of every claim — file path
   and line for source reads, full URL for docs.
3. Mark every claim as **verified** (read it in a primary source), **inferred** (follows
   from something verified, and say from what), or **unverified**.

Save to `docs/research/<topic>.md`.

## Done when

- The version is stated at the top, taken from `package.json`, and every URL read is the
  pinned one.
- Every claim carries its source and its confidence marker.
- Anything that could not be verified against a primary source is listed as unverified
  rather than quietly stated as fact.
- Where the finding contradicts something in `AGENTS.md` or `plan.md`, that contradiction
  is called out explicitly at the top — it is worth more than the rest of the file.
