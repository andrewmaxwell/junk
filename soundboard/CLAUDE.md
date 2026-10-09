# soundboard

Scene files and channel presets for the church's Behringer X32. This is not a web project: there's no index.html, and the homepage ignores it.

- `master.scn` is the scene to start each week from. When it changes, push it to the board and save it as that week's scene (see below).
- `presets/*.chn` are channel presets exported from the board's library.
- `81626.scn` is an old copy of a weekly scene.
- `current.scn` is what `getscene.mjs` writes. It's a temporary copy of the board, so don't commit it.

## Talking to the board

The X32 is at **10.0.0.100** on the LAN (X32-03-4A-B5, firmware 4.00). It speaks OSC over UDP port 10023. If the address has changed, broadcast `/xinfo` to `10.0.0.255:10023` and the board replies with its IP.

- `node getscene.mjs [ref.scn] [out.scn]` saves the board's live state to a file. It asks for every line that `ref.scn` contains, using `/node ,s <path>`, and the board answers in the same text format as a `.scn` file. The defaults are `master.scn` → `current.scn`. Only reads.
- `node pushscene.mjs [file.scn]` sets the board to match a scene. It sends each line as `/ ,s "<scene line>"`, and the board echoes back every line it accepts, which the script checks. **This changes the live mix immediately**, so get the user's explicit go-ahead first; auto mode blocks it otherwise. Only push when nobody is relying on the sound. Before pushing, pull the board and diff it against master, so you don't overwrite changes the user made on the board.
- After a push, read the board back with `getscene.mjs` into a scratch file and diff it against master. The main LR fader always reads −9.9 for −10.0: faders move in fixed steps, so expect small rounding like that.

Other commands that have been tested (replies end with an int, where 1 = success):
- Save the live state as a scene: `/save ,siss "scene" <slot> "<name>" ""`
- Load a scene, which also makes it the current scene: `/load ,si "scene" <slot>`
- Current scene number: `/node ,s -show/prepos/current`
- Scene slot names: `/node ,s -show/showfile/scene/NNN`
- Channel preset library names: `/node ,s -libs/ch/NNN`. You can read only names and flags, not a preset's settings.

Weekly scenes are named by date (e.g. `2026_10_09` in slot 11). Empty slots show `""`.

## Reading .scn lines (easy to get wrong)

- `/config/chlink`: 16 entries, **one per pair of channels**. Entry 9 is ch 17/18, not ch 9. `/config/auxlink`, `buslink` and the others work the same way.
- `/ch/NN/config "name" icon color source`: the last field is the input jack number.
- `/ch/NN/preamp trim invert lowcut-on slope lowcut-freq`. **This line holds the low-cut filter, not gain or phantom power.**
- `/headamp/NNN gain phantom`: input jack N is `/headamp/(N-1)`. So gain lives with the jack, not the channel; look up the channel's source.
- `/ch/NN/eq/B type freq gain Q`. Types: LCut, LShv, PEQ, VEQ, HShv, HCut. `/ch/NN/eq ON|OFF` turns the whole EQ on or off. A band only matters while the EQ is ON.
- `/ch/NN/mix on fader main-LR-on pan mono mono-level`. The first field `ON` means **unmuted** and `OFF` means muted. The pan here is the main LR pan.
- `/ch/NN/mix/MM on level [pan tap]`: the send to bus MM. Even-numbered buses show no pan field. Buses aren't linked, so the pan on a send does nothing.
- `/ch/NN/grp %dca8 %mute6`: DCA and mute-group bits. The rightmost bit is group 1, so `%000010` = mute group 2.
- `/outputs/*/NN source tap`: source 0 is off, 1/2 Main L/R, 4–19 buses 1–16, 20–25 matrices, 26–57 direct outs of ch 1–32, 58–65 aux in 1–8. For example, 8 = bus 5 (Aux Mix) and 43 = ch 18.
- `/config/mute` shows which mute groups are switched on.

## How this board is run (decisions made with the user)

- **Most channels are muted when the scene loads**, and the operator unmutes whoever is on.
- **Mute groups change every week** depending on who's playing, so don't preserve them or flag them as problems. **Mute group 6 is the FX:** the FX send buses (13–15) and returns are muted on purpose, and the operator switches them on only during singing.
- **Every in-use channel sends 0.0 POST to the Aux Mix (bus 5).** The Aux Mix feeds the hallway, the stream and the 2-track USB recording. Crowd Mic (ch 25) is deliberately −5.5 PRE. When copying settings from the board into master, set any Aux Mix send that has drifted back to 0.0.
- **FX send levels set how much effect each source gets:** vocals −15, acoustic instruments −18, drums −18/−24, choir −20. Speech, bass, electric guitar and keys stay dry.
- **Changes from week to week, so don't copy them into master unless asked:** who's on which vocal channel, faders, monitor sends, mute groups, the bass player's settings.
- **Things that belong in master:** a mic's EQ when the user has tuned it on the board (they EQ by hand; pull it from the board afterwards), channel layout changes, new instruments, cleanups.
- Bus names: 1 MON L, 2 MON R (separate wedge mixes, not a stereo pair), 3 PIANO AVIOM, 4 DRUMS AVIOM, 5 Aux Mix, 8 Sub Woofers, 9 Vocal Aviom, 13–15 Vocal/Music/Drum FX.
- **Some jacks are dead, so some inputs have been moved:** Cello comes in on input 31 and Bass on 32 (so ch 31/32 are labelled "DO NOT USE"), and Piano High is on input 14. Inputs 11 and 13 are unused.
- LP-Guitar is now one mono channel on ch 17, and ch 18 is blank. Djembe is on ch 23.
- The Aviom personal monitors (P16 outputs, AN-16i on several XLR outs) are going to be replaced with Behringer P16s soon, so don't spend effort on Aviom routing.
- USB card routing block 3 is set to `UIN17-24`, which looks odd, but nobody knows whether it matters. Leave it alone.
- Unused channels and buses should be fully blank: copy them from an untouched one such as ch 26 or bus 10.

## Presets

- A file named `NN-Name.chn` corresponds to the board's library entry whose first field matches the number on the file's first line (`#4.0# <n> "Name" ...`). That number is usually NN+1; for example, `38-Djembe` is board slot 39.
- The board and the files don't fully match: board slot 29 is a second "Peter", and slot 47 "Piano high" has no file.
- A preset's `%...` flags set which sections it loads.
- Saving a preset to the board over OSC hasn't been tried. The plan was: set up unused ch 26 with the preset's settings, save it into the slot, load it back onto ch 26 to check, then blank ch 26 again. Test on an empty slot first.
