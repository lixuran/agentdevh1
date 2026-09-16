- Tasks are GitHub issues
- Commit regularly

Labels

- `mvp` - needed for the MVP defined in `_docs/outdated/plan.md`
- `post-mvp` - real work, deliberately not now
- Every issue carries exactly one of the two, new ones included

## Background

- `_docs/decisions.md` - the calls already made, with reasons. Read it before
  grooming or implementing, and do not reopen a decision without changing it
  there first
- `_docs/outdated/` holds the plan, architecture, and original task list. They
  are reference, not the backlog - where they disagree with `decisions.md` or
  an issue, they lose

##Roles

- PM - grooms a task before anyone implements it, follows _docs/team/pm.md
- Engineer - implements one groomed task, follows _docs/team/software-engineer.md
- QA - checks the result against the acceptance criteria, follows _docs/team/qa-engineer.md


##Orchestrator

The main session is the orchestrator. It launches the PM, the engineer
and QA as subagents. It does not groom, implement or test itself.

The orchestrator owns three things the subagents cannot see: the
dependency order of the backlog, the worktrees, and the merge queue.


##Working in parallel

Work runs in waves. A wave is a set of issues that can be built at the
same time without waiting on each other.

- Reserve one agent slot for the orchestrator. In this Codex workspace, run at
  most three worker agents at once; when an engineer finishes, reuse that slot
  for QA rather than starting a fourth worker
- Every issue in a wave gets its own git worktree and its own branch
- Nothing is implemented in the primary checkout. `master` is for grooming,
  integration, and documentation only

An issue may enter a wave only when all of these hold:

- Every issue it depends on is closed and merged into `master`
- No other issue in the same wave changes the same database area or shared
  protocol surface unless the orchestrator has explicitly sequenced it
- The orchestrator has read its Constraints section and knows which
  shared files it will touch

Everything else waits for the next wave. A wave is often smaller than 5
because the backlog runs out of independent work, not because the limit was reached - that is normal, do not pad a wave to fill it.


##Worktrees

One issue, one worktree, one branch:

The worktree root is `../wt`, a sibling of the repository. It is outside the
repository on purpose: worktree metadata, local configuration, dependencies,
and database files cannot accidentally be committed. It is persistent; do not
reuse an issue worktree for another issue.

Before launching an engineer, the orchestrator creates a branch from the
current local `master` and records its absolute path in the agent's launch
brief:

```powershell
New-Item -ItemType Directory -Force "../wt" | Out-Null
git worktree add "../wt/issue-<number>-<short-slug>" -b "issue-<number>-<short-slug>" master
```

Each worktree is a full checkout. It is not ready for development until its
agent completes this setup from inside that worktree:

```powershell
pnpm install --frozen-lockfile
pnpm survev-setup
pnpm --dir tests test --run
pnpm --dir server typecheck
pnpm --dir client typecheck
```

`pnpm survev-setup` creates the ignored `survev-config.hjson` for that
worktree. It contains local secrets and must never be copied into Git or shared
through an issue. If an agent needs an API, game server, or database, it must
use a configuration unique to its issue worktree:

- Create a dedicated local database named `extraction_issue_<number>`; do not
  use, migrate, seed, reset, or drop another worktree's database.
- Choose unused API, game, match, and Vite ports and record them in the launch
  brief. Reserve all required ports before starting `pnpm dev`.
- Set the selected database URL and ports only in that worktree's ignored local
  configuration. Never edit a tracked default solely to make a local server
  start.

If the baseline setup or checks fail before the agent changes code, the agent
reports the failure to the orchestrator and does not treat it as an issue
failure. The orchestrator decides whether to repair the baseline or pause the
wave.

### Agent launch brief

For every engineer session, the orchestrator sends this completed brief. It is
the agent's authority and prevents it from guessing at shared state:

```text
Issue: #<number> — <title>
Role: engineer
Worktree: <absolute path>
Branch: issue-<number>-<short-slug>
Base commit: <master commit SHA>
Local database: extraction_issue_<number>
Reserved ports: Vite <port>, API <port>, game <port>, matches <range>

Read: AGENTS.md, _docs/process.md, the GitHub issue, and its acceptance criteria.
Do all work inside the assigned worktree. Do not edit `master` or another worktree.
Run the setup and baseline checks before editing. Implement only this issue,
commit regularly, push only this branch, and leave the issue open. Report the
commit SHA, tests run, acceptance-criteria status, changed files, and blockers.
```

QA receives the same brief with `Role: QA`, the engineer's final commit SHA,
and the instruction to make no changes. QA verifies the branch in that same
issue worktree only after the engineer has stopped writing to it.




##Destructive commands stall the run

The harness checks commands that destroy things and asks the person
running the session to approve them. That is the right behaviour, but it
means the work stops dead until someone is at the keyboard. A wave of
five agents can sit idle overnight on one `rm`.

So nothing in this process deletes. Not worktrees, not branches, not
databases, not temporary files.

### Stalled local dependency installers

An installer that is still running after a bounded command wait is not by
itself a failure. First verify that it is a local `pnpm install` process for
the assigned issue worktree and that installation has not completed. If
multiple such installer attempts are contending or stalled, the orchestrator
may terminate only those verified local installer processes and retry one
installer. This standing approval is limited to local dependency-install
processes; it does not authorize stopping game servers, databases, or any
other process.

### Local package networking

On this workstation, SpeedCat exposes a local HTTP CONNECT proxy at
`http://127.0.0.1:7892`. Its Git configuration may use the same port as a
SOCKS proxy, but pnpm must use the HTTP URL, not `socks5h://`.

When package downloads to npm or GitHub/Codeload time out or reset, configure
pnpm in the user profile (never in a tracked project file):

```powershell
pnpm config set --location=global http-proxy "http://127.0.0.1:7892"
pnpm config set --location=global https-proxy "http://127.0.0.1:7892"
```

Verify the exact `pnpm install --frozen-lockfile` command in a clean worktree
after changing VPN routing or proxy configuration. Do not rewrite a locked
GitHub dependency, vendor a package, or add a repository proxy setting merely
to work around a local network route.

- Restore a file you changed on purpose with `git checkout -- <path>` or
  `git restore <path>`, never by copying it aside and deleting the copy
- Beware the version of that command with a commit in it.
  `git checkout <commit> -- <path>` *stages* what it writes, so the later
  `git checkout -- <path>` meant to undo it finds nothing to do and
  silently leaves the old file in place. Someone proved a fix worked by
  checking out the pre-fix file, and nearly shipped the branch with it.
  After restoring anything, `git status` and `git diff HEAD` both have to
  be empty before the work is called done
- Write temporary files to the session scratchpad, which is outside the
  repository and needs no cleanup, never to `/tmp` and never next to the
  code
- Leave worktrees, branches and `feedback_wt<issue>` databases in place
  when an issue closes. They are a few megabytes and a row in
  `pg_database`
- Recreate a database with `CREATE DATABASE` on a fresh name rather than
  dropping and remaking the old one

If something genuinely has to be removed, that is the user's call. Say
what should go and why, and let them run it. Do not put a deletion in
front of an agent and hope it goes through.


##Integration

### Standing integration authority

For an issue running under this process, the orchestrator decides whether the
PM, engineer, QA, review, and validation evidence permit the next Git action.
Once those gates pass, it may commit coherent work, push the assigned issue
branch, rebase it, merge it into `master`, push `master`, and close the issue
without waiting for a separate confirmation at each step. It reports every
action and result. This authority does not permit force-pushes, history
rewrites, destructive resets, or changes outside the assigned workflow.

Branches merge one at a time, never in parallel, in dependency order:

1. Rebase the branch on current `master`
2. Run the whole suite, the linter,
   in the worktree, after the rebase
3. Merge to `master` only if all three are clean
4. Push `master`
5. Close the issue
6. Rebase every still-open branch in the wave onto the new `master`

Step 6 is what keeps the wave honest. The second branch to merge is
being tested against code its author never saw, so it re-runs against
the merged result before it is trusted.

Step 4 is not bookkeeping. A local commit is invisible: the person whose
project this is opens GitHub, sees nothing, and has no way to tell a
working session from a stalled one. Push `master` as soon as it moves.

Engineers push their own branch too, as soon as it has a commit on it,
and again after each round of QA fixes. A branch nobody can see is a
branch nobody can review, and the whole wave's work is otherwise
invisible until it merges.

Once the orchestrator rebases a branch, that branch's history no longer
matches the one on origin, and every later push from it is a force push
- which stops and waits for a human. So after a rebase the engineer
stops pushing and says so; the orchestrator merges and pushes `master`, and
`master` carries the work. Nobody force-pushes to repair the branch. The
stale copy on origin is superseded the moment `master` moves, and a stale
branch costs nothing while a blocked push costs the whole run.

Conflicts concentrate in a few shared files - `AGENTS.md`, package manifests,
`server/src/`, `shared/`, `client/`, and database schema or migration files.
The orchestrator resolves them at integration. An engineer who finds a
conflict is looking at a stale branch and should rebase, not merge `master`
into their branch.

A rebase that breaks the branch goes back to that branch's engineer with
the failure, as a FAIL. The orchestrator does not fix it.


##Lifecycle

1. Pick the next wave: open issues whose dependencies are all merged
2. PM grooms each ungroomed issue in the wave
3. Set up a worktree per issue, then launch one engineer per issue, in
   parallel
4. QA verifies each one in its own worktree, in parallel, as its
   engineer finishes - QA does not wait for the whole wave
5. On FAIL, back to step 3 for that issue alone, with the QA comment as
   input. The rest of the wave carries on
6. On PASS, integrate that branch through the merge queue and close the
   issue
7. Leave the worktree and its database in place
8. Repeat until the backlog is empty

##Rules

- One issue per worktree, one engineer per issue
- Do not skip step 2, even when the task looks obvious
- The engineer does not close the issue, QA does not fix the code
- Commit small, coherent progress regularly. Before the final handoff, the
  relevant checks must pass; an existing baseline failure must be reported
- An agent stays inside its own worktree. Reading `master` is fine, writing
  to it or to another worktree is not
- Only the orchestrator merges, closes issues, and deletes worktrees
