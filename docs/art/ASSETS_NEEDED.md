# Trade Winds — assets needed (updated 2026-10-14)

Written by Claude (the code AI) for the art AI. The copy in the shared Drive folder
(`AI files/Trade Winds/ASSETS_NEEDED.md`) and the copy in the game's repo (`docs/art/ASSETS_NEEDED.md`)
are kept identical. Write your notes, deliveries and blockers in `CLAUDE_HANDOFF_AND_BLOCKERS.md` in the
same folder, never in this file.

> **PRIORITY (2026-10-14):** 1. **Section 1, Mountains** (small, finishes the terrain). 2. **Section 2a,
> the building sample** (3 sprites, first and alone, so the owner can judge the look). Sections 2b, 2c
> and 3 wait until the owner has approved 2a. Section 4 is listed for planning only; do not start it.

## The game, in one paragraph
Trade Winds is a cozy hex-board economy game for Windows (Unity). The player is the King: they found
Towns on a map of pointy-top hexes, Towns build houses and workshops, and Traders carry Goods between
Towns. The camera looks straight down at a flat map, zoomed out enough to see 15 to 40 hexes across, so
every sprite must read at its real size (32 × 32 pixels).

## Style (applies to every section)
- **Match the owner's terrain sheet** `From Claude/terrain-sheet.png` (432 × 432). It is the style
  reference: chunky pixel art, a dark brown outline around objects (see the Castle at row 0 column 0 and
  the Hut at row 0 column 1), soft texture inside, warm colours.
- **Colours:** stay close to `From Claude/terrain-palette.png` (the sheet's 76 colours, most used
  first). New colours are fine where something new needs them (a red roof, a blue cloth), but keep the
  same saturation and brightness range.
- **Light** from the upper left, as on the Castle.
- No text, no letters, no numbers, no grid lines, no drop shadows outside the 32 × 32 tile.
- Never resample or resize the art after drawing (no nearest-neighbour scaling). If the generator
  returns another size, redraw it at the right size.

## Sheet format (applies to every section)
- Same layout as the terrain sheet: **each sprite is a 32 × 32 tile in the top-left corner of its own
  48 × 48 cell**; the other 16 pixels of the cell stay fully transparent. A sheet with N sprites in one
  row is (48 × N) × 48 pixels.
- Transparent background (alpha 0), no halo of light pixels around edges.
- **Hex tiles** fill exactly the hex shape in `From Claude/hex-mask-32.png`: every white pixel of the
  mask is painted, nothing outside it is.
- **Objects** (buildings, people, carts) stand on a hex the game draws underneath. Draw only the
  object inside the 32 × 32 tile, centred left to right (centre between x 13 and x 18) with its feet or
  base between row 24 and row 28 (row 0 is the top).
- Include `manifest.json`: for every cell its name, its rect (x, y, w, h) and what it is.

## Delivery
- One zip per section: `TradeWinds_Section<N><letter>_<Name>_v<k>_<yyyy-mm-dd>.zip`, containing the
  PNG sheet, `manifest.json`, `SHA256SUMS` and a short note.
- Upload it into `AI files/Trade Winds/` and add a dated entry to `CLAUDE_HANDOFF_AND_BLOCKERS.md`: what
  you delivered, sizes, anything that failed your own checks, and what you will do next.
- Check every acceptance point below before uploading. Do not upload attempts that fail them.

---

## 1. Mountains (one hex, two looks)
**What and why:** Mountains are the only terrain without art; the game draws them as a flat grey hex.
They block building and travel, so they must read at a glance as "you can't go here".

**Format:** sheet `TradeWinds_Mountains.png`, 96 × 48: two hex tiles (cells 0 and 1), two looks of the
same terrain so a mountain range doesn't repeat one picture.

**Look:** rocky grey-brown peaks with a lighter lit side (upper left) and a darker shaded side; a little
snow on the highest peak is fine. Neighbouring hexes on the map are Barren (row 1 col 0), Forest (row 1
cols 5–7) and Snow (row 1 cols 2 and 8) from the sheet: a mountain hex must look different from all of
them, especially Snow.

**Acceptance:**
1. Each tile's opaque pixels match `hex-mask-32.png` exactly (no missing or extra pixels).
2. Average brightness (luminance, 0 = black, 1 = white) of each tile between 0.30 and 0.50. Measured
   on the sheet: Snow 0.71–0.79, Fertile 0.78, Forest 0.75, Barren 0.65, Clay 0.56, Castle 0.51.
3. At least 15% of each tile's pixels are a clearly darker shade (the shaded side of the peaks).
4. The two looks differ in at least 30% of their pixels.

## 2a. Building sample: Town centre, Lumberjack, Potato Farm (FIRST AND ALONE)
**What and why:** every building is a coloured circle or square with letters today. Before drawing all
34 buildings, the owner wants to see three, to approve the look.

**Format:** sheet `TradeWinds_Buildings_Sample.png`, 192 × 48, four cells:
- cell 0 — **Town centre:** the heart of a Town: a small market square with a well or market cross and
  a tall flagpole. Biggest of the three (opaque area 22–26 px wide), about the Castle's size.
- cell 1 — **Town flag:** the flag cloth from cell 0, alone, at exactly the same pixel position, painted
  in white and light greys only. The game colours it per Town (each Town has its own colour), so the
  flag in cell 0 should be drawn in the same place.
- cell 2 — **Lumberjack:** a woodcutter's hut with a stack of logs and an axe in a stump. It stands on
  a Forest hex (row 1 cols 5–7 of the terrain sheet), so it must stand out against dark green trees.
  Opaque area 18–24 px wide.
- cell 3 — **Potato Farm:** a little shed with a few rows of potato plants in brown soil. It stands on
  a Fertile hex (row 1 col 4, plain green). Opaque area 18–24 px wide.

**Reference:** `From Claude/ingame-closeup-2026-10-14.png` shows the game today: the Castle (top right),
a Town (red diamond "1") and five Huts. The new buildings should sit with the Castle and the Hut as one
family. The Hut (row 0 col 1, 14 × 12 px) is the smallest building; the Castle (25 × 24 px) the largest.

**Acceptance:**
1. Sizes as above, measured on opaque pixels; base between rows 24 and 28; centred (x 13–18).
2. Cell 1's opaque pixels lie inside cell 0's flag area, and only use greys (red, green and blue within
   8 of each other on every pixel).
3. The Lumberjack keeps a contrast with the Forest hex: its main colours are brown, grey or roof red,
   not green.
4. Same outline and light as the Castle and the Hut.

## 2b. (after 2a is approved) The other Peasant workplaces and the Castle's buildings
Fishery (stands on water: a jetty with a boat), Sheep Farm, Grain Farm, Quarry (stands on a Stone
Deposit), Sawmill, Charcoal Burner; for the Castle: Research Center, Provisioner, Advanced Provisioner.
Same format and rules as 2a. Exact notes follow after the owner's review of 2a.

## 2c. (after 2b) Worker, Burgher and Aristocrat buildings and houses
Cottage, Manor, Aristocrats Home; Coal Mine, Clay Pit, Iron Mine, Gold Mine, Mill, Bakery, Brewery,
Brickworks, Tailoring, Stone Tools Maker, Oil Maker, Pottery, Lamp Maker, Carpentry, Forge, Armory,
Distillery, Goldsmith, Luxury Tailor. Details later.

## 3. (after 2a) People and carts that move
Trader (a cart with a driver, facing left and right, 2-frame wheel loop), Porter (a person carrying a
sack, 2-frame walk), Scout (a walker with a staff and pack, 2-frame walk). Details later.

## 4. (planning only) Goods icons
About 30 small icons (Wood, Potato, Planks, Fish, Wool, Grain, Stone, Coal, …) for the panels. Details
later.
