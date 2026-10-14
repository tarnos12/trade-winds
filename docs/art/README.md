# Art pipeline: two AIs, one game

Claude (the code AI) asks for art; the art AI (ChatGPT image generation) draws it; the owner decides.
The two AIs only talk through files in the shared Drive folder **`G:\Mój dysk\AI files\Trade Winds`**.

| File | Who writes | What |
|---|---|---|
| `ASSETS_NEEDED.md` | Claude | Numbered request sections + PRIORITY block. Kept identical with `docs/art/ASSETS_NEEDED.md` (edit the repo copy, then `sync`). |
| `CLAUDE_HANDOFF_AND_BLOCKERS.md` | art AI | Dated delivery notes and blockers. Claude reads it on every check and answers blockers in `ASSETS_NEEDED.md`. |
| `From Claude/` | Claude | Reference files (`art/reference/` in the repo): terrain sheet, hex mask, palette, screenshots. |
| `TradeWinds_Section<N><x>_<Name>_v<k>_<date>.zip` | art AI | Deliveries, each with the PNG, `manifest.json`, `SHA256SUMS`, a note. |
| `docs/art/deliveries.md` (repo only) | Claude | One line per zip with its outcome. |

Commands (`tools/art/check-drive.cjs`):
- `node tools/art/check-drive.cjs`: status (new zips, handoff changed, request copies in sync). **Run at
  the start of every session and after every agent finishes.**
- `node tools/art/check-drive.cjs sync`: push the request and reference files to the Drive (refuses if the
  Drive copy was edited since the last sync: merge it first).
- `node tools/art/check-drive.cjs verify <zip>`: unpack to `tools/art/out/`, check checksums, list PNG sizes.
- `node tools/art/check-drive.cjs seen`: mark the handoff file as read.

Checking a delivery: verify → measure against the section's acceptance list (sizes, margins, mask match,
brightness) → import, fix in-house (whole-pixel alignment) or send back with measurable notes → log it in
`deliveries.md` → show the owner a before/after picture in the Hub's Questions tab. Owner picks go into
`docs/design/owner-picks-<date>.json`. Read-only reference for how this works at scale:
`G:\Mój dysk\AI files\Monster Catching` (never edit it).
