# 07 — Git workflow: one repo, four branches

## Can all four start at the same time?

Yes, after two short things that have to happen first. Until both are done, parallel work produces conflicts.

1. **Allen pushes the first commit (10 minutes).** Folders, `.gitignore`, `.env.example`, and the `plan/` folder. Everyone must branch from this same commit.
2. **All four freeze the contract (about 30 minutes).** Walk `01-contract.md`, fix field names, tick the sign-off. Allen commits the mock JSON files to `main`.

After that, every person works from their own file with no waiting: AJ builds against `mocks/`, Marvin codes formulas with fixture inputs, Noah opens the sponsor data, Allen serves mocks from real routes.

## Who owns what (this is what prevents conflicts)

| Branch | Person | Folders they may edit |
|--------|--------|-----------------------|
| `lane/frontend` | AJ | `web/` |
| `lane/model-agent` | Marvin | `model/`, `agent/` |
| `lane/backend` | Allen | `api/`, `mocks/`, `.github/`, `Dockerfile`, `Makefile`, `.gitignore`, `.env.example`, `requirements.txt` |
| `lane/data` | Noah | `datasources/`, `scripts/`, `data/`, `docs/`, `README.md` |

If two people never edit the same file, git never conflicts. So:

- Need a change in someone else's folder? Ask them in the channel. Don't edit it yourself.
- Shared files have one owner. `requirements.txt`: tell Allen the package and he adds it. `mocks/` and `01-contract.md`: Allen. `README.md` and `docs/`: Noah. `web/package.json`: AJ.

## One-time setup (each person)

Allen creates the repo and adds the other three under Settings → Collaborators. Each of you accepts the email invite, then:

```bash
git clone <repo-url>
```

```bash
cd <repo-name>
```

```bash
git config user.name "Your Name"
```

```bash
git config user.email "the email on your GitHub account"
```

```bash
git checkout -b lane/frontend
```

```bash
git push -u origin lane/frontend
```

Use your own branch name from the table. Commit under your own GitHub account: the rules require each person to be able to explain their own code, and the history is the evidence.

## The loop (repeat all weekend)

**1. Work and commit small.** A commit every 20–40 minutes, one thing per commit.

```bash
git add web/
```

```bash
git commit -m "search bar: size presets and year picker"
```

Add your own folder by name. Avoid `git add .`, which is how `.env` files and sponsor data get committed.

**2. Push your branch often.** It is your backup.

```bash
git push
```

**3. Pull in everyone else's work at least once an hour, and always before opening a pull request.**

```bash
git fetch origin
```

```bash
git merge origin/main
```

If it reports a conflict, see the section below. Use `merge`, not `rebase`: it is harder to get wrong at 4 AM.

**4. Open a pull request into `main` when something works.** On GitHub: Pull requests → New → base `main`, compare your branch. Title says what now works. Post the link in the channel.

**5. Merge it.** Allen merges (or anyone, if Allen is asleep). Use a normal "Create a merge commit". Check two things first: it only touches the author's folders, and it doesn't break `make api` or `npm run build`.

**6. Keep working on the same branch.** Don't delete it. After your PR merges, run step 3 again.

## How often to merge into main

- At minimum, at every gate in the build order. A gate isn't passed until the code is on `main` and runs there.
- Preferably every 2–3 hours. Small pull requests merge cleanly; a 10-hour branch does not.
- Stubs and mocks go to `main` immediately. A function that returns a `sample` is useful to the others the minute it's merged.

## Rules for main

1. `main` always runs. If your change breaks it, fix or revert within 15 minutes.
2. Nothing goes to `main` except through a pull request (Allen turns on "require a pull request" in branch settings).
3. Never `git push --force` to `main`. Avoid force-pushing your own branch too once others have merged it.
4. Tag each gate on `main` so there is always a known-good version to demo from:

```bash
git tag gate-b
```

```bash
git push origin gate-b
```

## When you get a conflict

It will say `CONFLICT` and name the file.

1. Open the file. Find the `<<<<<<<`, `=======`, `>>>>>>>` markers.
2. If the file is yours, choose the right lines and delete the markers. If it belongs to someone else, ask them which version is right.
3. Then:

```bash
git add <file>
```

```bash
git commit
```

4. If you're lost, back out and ask for help:

```bash
git merge --abort
```

A conflict in a file outside your folders means someone broke the ownership rule. Sort that out in the channel before continuing.

## Things that must never be committed

- `.env` or any file with a key or token.
- Anything under `data/private/` or `agent/samples/private/` (CoStar extract, Vexcel and Matterport responses and images).
- `node_modules/`, `.venv/`, `.next/`.

Check before every commit:

```bash
git status
```

If a secret does get pushed: tell the team at once, rotate the key, then remove the file. Deleting it in a later commit does not remove it from history, and the repo is public.

## Handoff messages

When you merge something another person depends on, post one line:

> merged: `vexcel.get_attributes` is real. Returns `homes_distance_m` (may be null), `flood_flag`. Allen can switch `/parcels/{id}/verdict` off the mock.

Say what changed, whether it's tested, and who can now move.

## Final hours

1. Feature freeze at 11 PM Saturday: bug-fix pull requests only.
2. 3 AM Sunday: Allen tags `v1.0-rc` on `main`.
3. Before 7:30 AM: last merges, tag `v1.0-submission`, confirm the repo is public in a private browser window, and confirm the latest commit time is before 8:00 AM.
