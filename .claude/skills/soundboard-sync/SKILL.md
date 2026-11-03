---
name: soundboard-sync
description: Sync the church X32 soundboard with soundboard/master.scn and presets/ - pull the board, fold wanted changes into master, push it as a new dated scene, and bring the board's channel presets in line. Use when the user is at church and asks to sync, update or check the soundboard.
---

# Soundboard sync

Read `soundboard/CLAUDE.md` first: it has the commands, how to read `.scn` lines, and the decisions already made about how the board is run. Work in `soundboard/`, keep scratch files in the scratchpad, and stage only `soundboard/` and this skill.

1. **Reach the board.** Check `node osc.mjs /node ,s -show/prepos/current` gets a reply. If it doesn't, find the board with `/xinfo` (see CLAUDE.md).
2. **Pull everything (read-only).** `node getscene.mjs master.scn <scratch>/current.scn`, then diff that file against master. Run `node getpresets.mjs`; `git diff presets/` then shows what changed on the board since the last sync. Also list scene slots (`-show/showfile/scene/NNN`).
3. **Sort the scene diff.** Use CLAUDE.md to separate weekly changes (faders, monitor sends, mute groups, who's on which vocal channel, bass) from master candidates (hand-tuned EQ, gain, routing, P16 outputs, new instruments). A vocal channel that exactly matches someone's preset was just loaded from it, so it isn't new tuning.
4. **Ask the user**, in one message: which candidates go into master, whether the preset changes on the board are wanted, and the scene name (`YYYY_MM_DD`, usually the Sunday it's for). Also ask whether anyone is relying on the sound right now. Don't push or save anything to the board until they've answered that.
5. **Update master.scn** with the chosen lines and set its header name. Set any drifted Aux Mix (bus 5) send back to 0.0.
6. **Push and save the scene.** Pull and diff again right before pushing, so nothing changed on the board in the meantime gets lost. Then `node pushscene.mjs`, and read the board back and diff against master. If the main LR fader didn't move, set it with `/main/st/mix/fader ,f <0..1>`. Save into the next empty slot with `/save ,siss scene <slot> <name> ""`, load it with `/load ,si scene <slot>`, and check `-show/prepos/current`.
7. **Bring presets in line with master.** For each master channel that has a matching preset, copy over gain, low cut, gate, compressor, EQ and the 0.0 Aux Mix send, keeping the preset's name, fader and monitor sends. Also make any preset edits the user asked for: new presets from a board channel, renames (the library name is in the header line), deletes (`/delete ,si libchan <slot-1>`, then remove the file). Write the changed presets with `node putpresets.mjs <files>`, which checks each one.
8. **Verify the sync.** Run `getscene.mjs` and diff against master; it should match apart from the header. Run `getpresets.mjs`, then `git status presets/`; it should show only the edits you made on purpose.
9. **Record and commit.** Add any new decision the user made to CLAUDE.md. Commit as `soundboard: <scene name> scene, ...` with the usual attribution. Tell the user the scene slot, what changed in master, and which presets changed.
