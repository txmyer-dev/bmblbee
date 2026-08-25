# Open issue: cannot create a project or add a repository

**Status:** open, root cause not yet identified.
**Branch:** `bench/right-dock`
**Opened:** 2026-08-25

Working notes for picking this up in a fresh session. Everything below is
either verified against the code or explicitly labelled as a hypothesis —
please keep that distinction when adding to it.

---

## Symptom

On the Windows desktop build, connected to a Builderlab-hosted relay, a
project cannot be set up. Two reports, which may or may not be the same
failure:

1. Typing a repository URL and submitting produces:
   **"Could not find this project on the relay. Refresh and try again."**
2. The **Create a project** flow, with a GitHub URL in *Initial repository
   clone URL*, is also described as failing.

**These two cannot both be the same code path** — see the contradiction
below. Resolving which one is actually happening is the first job.

---

## The contradiction to resolve first

That error string exists in exactly two places in the repo:

- `desktop/src/features/projects/useAddProjectRepository.ts:82`
- `desktop/src/features/projects/useAttachProjectRepository.ts:38`

Both are **add / attach an existing repository to an existing project**.
Neither is reachable from **Create a project**, which goes through
`useCreateProject.ts` → `projectCreation.ts` and throws an entirely
different set of errors (listed below).

So either the failing screen is *Add repository* rather than *Create a
project*, or the create flow is failing in some other way and the two
reports are separate problems.

**Needed from the reporter, verbatim rather than paraphrased:**

1. The dialog's header text — **"Create a new project"** or **"Add
   repository"**? Two different screens, two different failure modes.
2. Does the **Repository access channel** dropdown contain any entries, or
   only the placeholder "Select a channel"?
3. Is the submit button **greyed out**, or does it activate and then
   produce an error? If an error, its exact wording.

---

## What is ruled out

**The relay is not failing, timing out, or rejecting auth.** The lookup at
`useAddProjectRepository.ts:74` only reports "not found" when the relay
answered successfully with zero events. Every failure mode rejects with a
*different* message:

| Failure | Behaviour | Location |
|---|---|---|
| Timeout | rejects, "Timed out while loading channel history." | `shared/api/relayGateBoundary.ts:39` |
| Send failure | rejects | `shared/api/relayGateBoundary.ts:53` |
| `CLOSED` — auth-required, rate-limited, p-gate 403 | rejects with the relay's own message | `shared/api/relayClosedRecovery.ts:50` |

None of these resolve to an empty array. So despite the "Refresh and try
again" wording, this is **not** a connectivity, auth, or transient problem.

**The clone URL is not being rejected.** `projectCreation.ts:89` stores
whatever string is supplied verbatim as a `clone` tag. The create flow does
no clone-URL validation of any kind, so a GitHub URL cannot cause a create
failure.

**The relay code in this tree supports the project kind.**
`KIND_PROJECT = 30621` is registered at `crates/buzz-core/src/kind.rs:632`
(accepted at ingest since #3171). Whether the *deployed* Builderlab relay
runs a build new enough is untested — see open questions.

---

## Hypothesis A — the project is "legacy" (fits report 1)

A **legacy project** is a client-side fiction. `projectModels.ts:368`
(`repositoryToLegacyProject`) wraps any bare `kind:30617` repository event
that has no owning project event into a synthetic `Project`, borrowing the
repository's own dtag and address and flagging `legacy: true`.

For such a project there is no `kind:30621` event and there never was, so
the lookup at `useAddProjectRepository.ts:74` — which queries
`kind:30621` + owner + dtag — returns empty **every single time**.
Add-repository can never succeed on one.

**The latent bug:** `legacy` is read **nowhere in any UI component**. A
repo-wide grep finds it only inside `useCreateProject.ts`. So the app
offers an action that is structurally guaranteed to fail, then reports it
as transient ("Refresh and try again") when refreshing cannot ever help.

How a legacy project gets created: `useCreateProject.ts:88` catches an
unsupported-kind rejection from the relay, publishes only the repository
event, and returns a legacy projection with the warning toast **"Created as
a standalone project"**. Whether the reporter saw that toast is still
unknown and would confirm or kill this hypothesis.

## Hypothesis B — the create button is silently disabled (fits report 2)

`CreateProjectFormContent.tsx:136` disables submit when:

```js
isCreating || name.trim().length === 0 || !accessChannelId
```

`accessChannelId` is seeded from a filtered channel list
(`CreateProjectFormContent.tsx:49`): member, not archived, not a DM. On a
workspace with **no channels yet**, that list is empty, `accessChannelId`
stays `""` (line 62), and the button is permanently greyed out — with **no
error, no toast, and no explanation**.

This matches the reporter's very first description ("I can click a button
and it says 'Create a project'" — seeing the form, not an error) and would
explain why it felt like the URL was at fault when the URL is never even
read.

---

## Open questions

- Which dialog is actually failing? (blocks everything else)
- Was the **"Created as a standalone project"** toast ever seen?
- Does the workspace have at least one non-DM channel the user is a member of?
- Does the deployed Builderlab relay accept `kind:30621`? Untested — the
  relay is a per-community host (`wss://<normalized_host>`, see
  `hostedCommunityApi.ts:88`); `builderlab.xyz` itself is only the hosting
  control plane (`src-tauri/src/builderlab.rs:15`) and is Cloudflare-fronted,
  which 403s queries from a datacenter IP.

## Candidate fixes (none started)

- **A.** Gate add-repository on `project.legacy` — hide or disable it with
  an honest explanation instead of a lookup that always fails.
- **B.** Explain the disabled create button: state that a channel is
  required, rather than silently disabling submit.
- **C.** Replace "Refresh and try again" on the not-found path with wording
  that distinguishes "this is a standalone repository" from "the relay lost
  the project."

---

## Landed already (context, not part of this issue)

These are separate fixes made in the same session; the Windows build below
is green and includes both.

- `d0a0008f0` — `fix(desktop): find Git for Windows when it is off PATH`.
  Cloning failed with "git was not found on PATH" on machines that had git,
  because Git for Windows only joins PATH under one installer option.
  Resolves `git.exe` through the existing Git-for-Windows registry chain.
- `da4c038a3` — `feat(desktop): point a project at a local folder you
  already have`. Native folder picker plus a link store so a repository can
  be bound to an existing checkout at any path.

Windows Fork Build run
[32812306641](https://github.com/txmyer-dev/bmblbee/actions/runs/32812306641)
— green, 30m26s, artifact `buzz-windows-bench-right-dock-da4c038a3552`.

**Caveat:** that workflow builds and bundles but runs no tests. The Rust
unit tests added in `desktop/src-tauri/src/commands/project_local_links.rs`
have never executed anywhere — the dev box has no C compiler, so `cargo
test` cannot run there.
