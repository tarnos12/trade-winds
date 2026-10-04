# Trade Winds

A hex-board economy game: autonomous Towns produce, consume and trade with each other; the player shapes the conditions and earns the Crown's cut.

## Language

### Places

**Castle**:
The King's hub the player starts with, at the board's origin. Has no population and is never a Town; holds the treasury and the Castle Stock.
_Avoid_: Keep, Capital

**Town**:
A settlement the player founds on the board; it houses residents, produces, consumes and trades with other Towns on its own.
_Avoid_: City, Settlement

**Castle Compound**:
The buildings placed next to the Castle that serve it (e.g. Research Center, Provisioner).

**Kingdom**:
The whole realm: every Town plus the Castle.

**Deposit**:
A natural source of a raw Good on a map hex, worked by an extractor building.
_Avoid_: Resource, resource node

### Goods and stores

**Good**:
Anything that can be stocked, consumed and traded (raw, processed or luxury).
_Avoid_: Resource, Ware (Item is tolerated in player-facing copy)

**Stock**:
The Goods a Town holds.
_Avoid_: Storage, Inventory

**Castle Stock**:
The single store of Goods held by the Castle, including materials for research.
_Avoid_: Warehouse

### Movement and trade

**Trader**:
An agent that buys Goods in one place and sells them in another, travelling by road.
_Avoid_: Cart, Caravan

**Porter**:
An agent that moves Goods inside one Town — the only way Goods reach houses, processors and building sites; never trades.

**Tariff**:
The Crown's share of every trade between Towns; the player's main income.
_Avoid_: Toll, Tax

**Tax**:
Income paid by a Town's residents according to how well their needs are met.
_Avoid_: Tariff

### People

**Population Tier**:
One of four resident classes, in ascending order: Peasant, Worker, Burgher, Aristocrat.

**Burgher**:
The third Population Tier.
_Avoid_: Citizen

**Basic Need**:
A Good a Population Tier must have; meeting all of them holds happiness at 70%. The same Good can be a Basic Need for one tier and a Luxury for another.
_Avoid_: Necessity

**Luxury**:
A Good a Population Tier enjoys beyond its Basic Needs; meeting them lifts happiness toward 100%.
_Avoid_: Extra, Want

### Progression

**Mission**:
A goal the Crown sets the player; Missions are completed in sequence.
_Avoid_: Quest, King's Request

**Victory**:
Completing the final Mission. Defined by the Mission chain, not by any single condition, so the final Mission's content can change.
_Avoid_: Castle level
