# Trade Winds — assets needed (updated 2026-10-14)

Written by Claude (the code AI) for the art AI. The copy in the shared Drive folder
(`AI files/Trade Winds/ASSETS_NEEDED.md`) and the copy in the game's repo (`docs/art/ASSETS_NEEDED.md`)
are kept identical. Write your notes, deliveries and blockers in `CLAUDE_HANDOFF_AND_BLOCKERS.md` in the
same folder, never in this file.

> **PRIORITY (2026-10-14):**
> 1. **Section 1, Mountains** (small; finishes the terrain).
> 2. **Section 2a, the building sample, FIRST AND ALONE** (3 buildings and a flag, so the owner can
>    judge the look before the other 31 are drawn).
> 3. Wait for the owner's verdict on 2a (it is written at the top of this file when it comes). Then, in
>    order: **3 (people and carts)**, **2b (Peasant workplaces and Castle buildings)**, **5 (roads)**,
>    **6 (building site)**, **2c (Worker workplaces)**, **2d (houses)**, **2e (Burgher workplaces)**,
>    **4 (Goods icons)**, **7 (HUD icons)**.

## The game, in one paragraph
Trade Winds is a cozy hex-board economy game for Windows (Unity). The player is the King: they found
Towns on a map of pointy-top hexes, Towns build houses and workshops, and Traders carry Goods between
Towns. The camera looks straight down at a flat map, zoomed out enough to see 15 to 40 hexes across, so
every sprite must read at its real size (32 × 32 pixels).

## What the owner already gave (in the game now; do not redraw)
From `From Claude/terrain-sheet.png` (432 × 432, 32 × 32 tiles on a 48 px grid; r = row, c = column):

| Sheet cell | Is | Used for |
|---|---|---|
| r0 c0 | Castle (25 × 24 px) | the Castle |
| r0 c1 | Hut (14 × 12 px) | the Peasants' house |
| r1 c0 | Barren hex | plain ground; also the ground under Stone, Coal, Iron and Gold Deposits |
| r1 c1 | Clay hex | Clay Deposit |
| r1 c2, r1 c8 | Snow hex, 2 looks | Snow |
| r1 c3 | Desert hex | Desert |
| r1 c4 | Fertile hex | farmland |
| r1 c5–c7 | Forest hex, 3 looks | Forest |
| r2, r4, r6 (c0–c2) | Water: shallow, open, deep, 3 frames each | water by distance from land |
| r3, r5, r7 (c0–c2) | the same water with a fish shoal | Fish |
| r8 c1 / c2 + c5 / c3 / c4 | Gold / Stone (2 looks) / Coal / Iron objects | Deposits, drawn on a Barren hex |
| r8 c0 | cave arch | not used |

The style rules below come from this sheet. Everything new must look like it belongs on it.

## What the game still draws as placeholders (this document asks for all of it)

| In the game today | Section |
|---|---|
| Mountains: a flat grey hex | 1 |
| Town centre: a coloured diamond with a number | 2a |
| 33 buildings: coloured circles and squares with letters (only the Hut has art) | 2a–2e |
| Traders, Porters, Scouts: small coloured squares and dots | 3 |
| Goods in panels: names only, no pictures | 4 |
| Roads: a small brown dot in the middle of the hex | 5 |
| Buildings under construction: the building at 40% opacity | 6 |
| HUD: text only (Treasury, Tariff, happiness, research) | 7 |

Code-drawn things that stay as they are: the fog (a dark overlay), the hover and selection outlines (made
from the hex shape), progress bars, the priority star, speech bubbles, coin and smoke particles.

## Style (applies to every section)
- **Match the owner's terrain sheet** `From Claude/terrain-sheet.png`: chunky pixel art, a dark brown
  outline around objects (see the Castle at r0 c0 and the Hut at r0 c1), soft texture inside, warm
  colours.
- **Colours:** stay close to `From Claude/terrain-palette.png` (the sheet's 76 colours, most used first).
  New colours are fine where something new needs them (a red roof, a blue cloth), with the same
  saturation and brightness range.
- **Light** from the upper left, as on the Castle.
- No text, letters or numbers, no grid lines, no shadows outside the tile.
- Never resample or resize the art after drawing (no nearest-neighbour scaling). If the generator returns
  another size, redraw it at the right size.
- **One family, rising in size and richness:** Hut (14 × 12) < Cottage < workshops < Manor < Town centre
  ≈ Castle (25 × 24).

## Sheet format (applies to every section)
- Same layout as the terrain sheet: **each sprite is a tile in the top-left corner of its own cell**; the
  rest of the cell is fully transparent. Map sprites: **32 × 32 tile in a 48 × 48 cell**. Icons (sections
  4 and 7): **16 × 16 tile in a 24 × 24 cell**. A sheet with N cells in one row is (cell × N) × cell.
- Transparent background (alpha 0), no halo of light pixels around edges.
- **Hex tiles** fill exactly the hex shape in `From Claude/hex-mask-32.png`: every white pixel of the
  mask is painted, nothing outside it is.
- **Objects** (buildings, people, carts) stand on a hex the game draws underneath. Draw only the object,
  centred left to right (centre between x 13 and x 18) with its base between row 24 and row 28 of the
  tile (row 0 is the top), unless a section says otherwise.
- Include `manifest.json`: for every cell its name, its rect (x, y, w, h) and what it is, in the order
  the section lists them.

## Delivery
- One zip per section: `TradeWinds_Section<N><letter>_<Name>_v<k>_<yyyy-mm-dd>.zip`, containing the PNG
  sheet, `manifest.json`, `SHA256SUMS` and a short note.
- Upload it into `AI files/Trade Winds/` and add a dated entry to `CLAUDE_HANDOFF_AND_BLOCKERS.md`: what
  you delivered, sizes, anything that failed your own checks, and what you will do next.
- Check every acceptance point before uploading. Do not upload attempts that fail them.

---

## 1. Mountains (one hex, two looks)
**What and why:** Mountains are the only terrain without art. They block building and travel, so they
must read at a glance as "you can't go here".

**Format:** `TradeWinds_Mountains.png`, 96 × 48: two hex tiles, two looks of the same terrain so a
mountain range doesn't repeat one picture.

**Look:** rocky grey-brown peaks with a lit side (upper left) and a shaded side; a little snow on the
highest peak is fine. Mountain hexes sit next to Barren (r1 c0), Forest (r1 c5–c7) and Snow (r1 c2, c8),
and must look different from all of them, especially Snow.

**Acceptance:**
1. Each tile's opaque pixels match `hex-mask-32.png` exactly.
2. Average brightness (luminance, 0 = black, 1 = white) of each tile between 0.30 and 0.50. Measured on
   the sheet: Snow 0.71–0.79, Fertile 0.78, Forest 0.75, Barren 0.65, Clay 0.56, Castle 0.51.
3. At least 15% of each tile's pixels are a clearly darker shade (the shaded side of the peaks).
4. The two looks differ in at least 30% of their pixels.

## 2. Buildings
Every building is an object on a 32 × 32 tile (map format above). Each line says what it makes and what
hex it stands on, so it stays readable on that ground. Size = width of its opaque pixels.

### 2a. Building sample: Town centre, Town flag, Lumberjack, Potato Farm (FIRST AND ALONE)
`TradeWinds_Buildings_Sample.png`, 192 × 48, four cells:
- cell 0 — **Town centre:** the heart of a Town: a small market square with a well or market cross and a
  tall flagpole. 22–26 px wide, about the Castle's size. Stands on Barren, Fertile, Desert or Snow.
- cell 1 — **Town flag:** the flag cloth from cell 0, alone, at exactly the same pixel position, in white
  and light greys only. The game colours it per Town (each Town has its own colour).
- cell 2 — **Lumberjack** (makes Wood; stands on Forest, r1 c5–c7): a woodcutter's hut with a stack of
  logs and an axe in a stump. 18–24 px. Main colours brown, grey or roof red, not green.
- cell 3 — **Potato Farm** (makes Potatoes; stands on Fertile, r1 c4): a little shed with a few rows of
  potato plants in brown soil. 18–24 px.

**Reference:** `From Claude/ingame-closeup-2026-10-14.png` shows the game today: the Castle (top right),
a Town (red diamond "1") and five Huts. The new buildings join the Castle and the Hut as one family.

**Acceptance:**
1. Sizes as above, base between rows 24 and 28, centred (x 13–18).
2. Cell 1's opaque pixels lie inside cell 0's flag area and use greys only (red, green and blue within 8
   of each other on every pixel).
3. Same outline and light as the Castle and the Hut.

### 2b. Peasant workplaces and the Castle's buildings (after 2a is approved)
`TradeWinds_Buildings_Peasant.png`, 432 × 48, nine cells, 18–24 px each unless noted:
0. **Fishery** (Fish; stands on water with a fish shoal, r3/r5/r7): a small wooden jetty with a rowing
   boat and a net. No ground under it: the water shows around it.
1. **Sheep Farm** (Wool; Fertile): a pen with two or three sheep and a small barn.
2. **Grain Farm** (Grain; Fertile): golden wheat rows and a small barn; must differ clearly from the
   Potato Farm (yellow, not green-and-brown).
3. **Quarry** (Stone; stands on a Stone Deposit, which it replaces on the map): a cut rock face with
   blocks and a crane or ladder.
4. **Sawmill** (Planks from Wood; Barren/Fertile/Desert): a shed with a big saw blade and stacked
   planks.
5. **Charcoal Burner** (Coal from Wood): a smoking earth mound (dark dome) and a log pile.
6. **Research Center** (the Castle's library; stands next to the Castle): a small stone tower with a
   domed roof or telescope, in the Castle's colours. 20–24 px.
7. **Provisioner** (the Castle's kitchen: provisions for Scouts, from Potatoes): a stone kitchen with a
   chimney and baskets.
8. **Advanced Provisioner** (provisions from Fish and Potatoes): the Provisioner made bigger, with a fish
   rack.

**Acceptance:** sizes and placement as in the format; the Quarry shows grey stone like r8 c2/c5; the
three Castle buildings share the Castle's wall colour.

### 2c. Worker workplaces (after 2b)
`TradeWinds_Buildings_Worker.png`, 672 × 48, fourteen cells, 18–24 px:
0. **Coal Mine** (Coal; on a Coal Deposit, which it replaces): a mine entrance with a cart of black coal.
1. **Clay Pit** (Clay; on a Clay hex, r1 c1): a dug pit with clay blocks and a shovel.
2. **Iron Mine** (Iron; on an Iron Deposit, which it replaces): a mine entrance with rust-red ore.
3. **Gold Mine** (Gold; on a Gold Deposit, which it replaces): a mine entrance with gold glints.
4. **Mill** (Flour from Grain): a windmill with four sails.
5. **Bakery** (Bread from Flour): a house with a round bread oven and a loaf sign shape.
6. **Brewery** (Mead from Grain): a house with barrels.
7. **Brickworks** (Bricks from Clay): a kiln with stacked red bricks.
8. **Tailoring** (Clothes from Wool): a house with cloth hanging out to dry.
9. **Stone Tools Maker** (Stone Tools from Stone): a workshop with a grindstone.
10. **Oil Maker** (Oil from Fish): a house with jars and a press.
11. **Pottery** (Pottery from Clay): a house with a potter's wheel and pots.
12. **Lamp Maker** (Lamps from Oil): a house with glowing lamps at the door.
13. **Carpentry** (Chairs from Planks): a workshop with a chair outside.

The four mines must differ by the colour of their ore (black, terracotta, rust red, gold).

### 2d. Houses (after 2c)
`TradeWinds_Houses.png`, 144 × 48, three cells. Houses stand on Barren, Fertile, Desert or Snow.
0. **Cottage** (Workers): stone-and-timber cottage, 16–19 px wide, bigger than the Hut.
1. **Manor** (Burghers): a two-storey brick house, 19–23 px.
2. **Aristocrats Home** (Aristocrats): a villa with a small tower and a garden, 22–26 px.

### 2e. Burgher workplaces (after 2d)
`TradeWinds_Buildings_Burgher.png`, 240 × 48, five cells, 19–24 px (richer than the Worker buildings):
0. **Forge** (Iron Tools from Iron and Coal): a stone forge with a glowing hearth and an anvil.
1. **Armory** (Iron Armor): a building with a breastplate and shields on display.
2. **Distillery** (Brandy): copper stills and barrels.
3. **Goldsmith** (Gold Rings from Gold): a fine shop with a gold sign shape.
4. **Luxury Tailor** (Luxury Clothes): a shop with rich purple and red cloth.

## 3. People and carts that move (after 2a)
`TradeWinds_Movers.png`, 576 × 48, twelve cells. All face **right**; the game mirrors them for left.
Two-frame loops (frame A, frame B) for movement. Base between rows 22 and 26.
- 0–1: **Trader, empty:** a small cart pulled by a donkey, with a driver; wheels turn between frames.
  16–22 px wide.
- 2–3: **Trader, loaded:** the same cart with crates and sacks on it.
- 4–5: **Royal Trader, empty:** the same cart in the Castle's colours (gold and royal blue cloth).
- 6–7: **Royal Trader, loaded.**
- 8–9: **Porter:** a person carrying a sack on the shoulder, walking. 6–10 px wide, 10–14 px tall.
- 10–11: **Scout:** a walker with a staff and a backpack, walking. 6–10 px wide, 10–14 px tall.

**Acceptance:** frames A and B of each pair differ in at least 5% of their opaque pixels and keep the
same base row and width (±1 px); the Trader reads against Barren, Fertile and Desert.

## 4. Goods icons (later)
`TradeWinds_Goods.png`, 624 × 24: twenty-six 16 × 16 icons, one per Good, in this order:
Potato, Wood, Fish, Wool, Stone, Grain, Clay, Coal, Iron, Gold, Planks, Flour, Mead, Bricks, Clothes,
Stone Tools, Oil, Iron Tools, Bread, Pottery, Lamp, Chairs, Iron Armor, Brandy, Gold Ring, Luxury Clothes.
They appear in panels on a cream background (#f2e6cf) and on a dark brown one (#3b2f22): each icon needs
an outline that reads on both. Every icon must be recognisable alone at 16 × 16.

## 5. Roads (later)
`TradeWinds_Roads.png`, 336 × 48, seven cells, drawn over the ground hex:
- cell 0: the road's **centre**: a round patch of packed dirt or cobbles, 8–10 px across, centred on the
  hex centre (15.5, 15.5).
- cells 1–6: **arms** from the centre to the middle of each hex edge, in this order: right, upper right,
  upper left, left, lower left, lower right. Same width (5–7 px) and look as the centre.

The game combines them: a road hex shows the centre plus one arm toward each neighbouring road hex.
**Acceptance:** each arm ends exactly at the middle of its hex edge, so two neighbouring hexes' arms meet
without a gap or a step (check it by placing two road hexes side by side in each of the three
directions); arms and centre join without a visible seam.

## 6. Building site (later)
`TradeWinds_BuildingSite.png`, 48 × 48, one cell: a construction site (stakes, a timber frame, a pile of
planks and stones), 18–24 px wide. The game shows it instead of the building until the building is
finished.

## 7. HUD icons (later)
`TradeWinds_HUD_Icons.png`, 216 × 24, nine 16 × 16 icons: 0 gold coin (Treasury), 1 coin with a small
crown (Tariff), 2 person (population), 3 happy face, 4 neutral face, 5 unhappy face, 6 open book
(research), 7 scroll (Missions), 8 warning sign. Same style and outline rule as section 4.
