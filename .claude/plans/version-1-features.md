# Plan: Complete a playable Axis & Allies Revised v1

## Context

The user has a partially-built Axis & Allies Revised game (Angular 20, NGXS 20, OpenLayers map, zoneless). The **combat engine and movement-planning systems are mature**; the **entire economic layer, meta-game loop, save/load, and app shell are missing**. This plan takes it to a playable local hot-seat game.

What already works (do not rebuild):

- **Combat** — `src/app/combat/combat-state.ts` + `combat/rules/*`: opening fire (incl. sub sneak-attack opening-fire casualty rules), hit pools, casualty assign/undo/confirm, delayed casualties, retreat/press-attack, outcome + `canCaptureTerritory`, tech effects (jet/heavy-bomber/super-sub) and national-advantage effects. **But it runs off `TEST_ATTACKERS/TEST_DEFENDERS` fixtures in `src/dev-data.ts`, default territory `'TestTerritory'`** (`combat-state.ts:115-118`).
- **Movement planning** — `src/app/map/map-state.ts` + `map/rules/*`: combat/non-combat plans, adjacency (incl. Suez/Panama canals), validity, aircraft combat-node designation, "N invalid moves" badge. **Plans are never executed** — no action relocates units in `unitsByTerritoryName`.
- **Data** — 128 territories (`territories/*`), full adjacency, starting order of battle + control (`map/initial-map-layout.ts`), 12 unit types with combat stats (`shared/unit-profile.ts`, **no cost field**).

Debug scaffolding to remove as we wire real gameplay:

- `TEST_ATTACKERS/TEST_DEFENDERS/TEST_NEUTRAL_UNITS` in `src/dev-data.ts` (replaced in WS4).
- The **yellow territory highlighting on click** (a debugging aid) in `map/layers/map-territories.ts` — remove/replace with intentional selection styling.

Confirmed scope decisions (all full-fidelity):

- Save/load: **browser download + file-input upload** of full store JSON, with a **filename dialog** on save. TODO: autosave in a future version (v2).
- Purchasing: **full factory rules** (mobilize only at industrial complexes controlled since turn start; per-territory cap = territory IPC value; buyable ICs).
- Tech: **only the 3 implemented techs** (jet-fighters, heavy-bombers, super-submarines); **target-number roll** mechanic (see WS3.2); TODO for rockets/long-range-aircraft/combined-bombardment.
- Victory: **standard victory-city rules** (author dataset; minor/major/total thresholds from rulebook).
- IPC data: **standard A&A Revised values** (author from the rulebook).
- Capital capture: **full rule** (seize treasury + zero income until liberated).
- Strategic bombing raids: **in v1** (uses the stubbed `income-loss` `DamageEffect`).
- New game: **player names + optional house-rule toggles** (allowed techs). **National advantages are excluded from v1** — all off/disabled by default; TODO to add later.
- Sea: **full amphibious** (transport load/unload, amphibious assault, shore bombardment; attacker cannot retreat from an amphibious assault).
- AA: **flyover interception**, resolved as a gate at the end of **both** the combat-move phase (before combat resolution) and the non-combat-move phase (before mobilize/place units); plus battle-board AA.
- Turn flow: **strict phase order + pass-the-device handoff interstitial**.
- Combat wiring: **auto-enumerate contested territories from movement plans; player chooses resolution order**.

**Authoritative data source:** exact unit costs, per-territory IPC values, starting treasuries, victory cities, and win thresholds will be taken from the Axis & Allies Revised rulebook (https://www.axisandallies.org/files/rules/Axis-Allies-Revised.pdf) during implementation and surfaced to the user to sanity-check before locking in.

---

## Architecture additions (new NGXS slices)

Register alongside the existing four in `src/app/app.config.ts:28`:

- **`SessionState`** (`name: 'session'`) — `players: {id,name}[]`, `nationAssignments: Record<Nationality,playerId>`, `houseRules: {allowedTechIds}` (national-advantages toggle intentionally omitted in v1), `roundNumber`, `activeNationality` (derived from `GamePhase`), `capturedCapitalsByNation`, `loadedFileName?` (for the save-dialog default). Drives the setup screen, header, handoff, and victory.
- **`EconomyState`** (`name: 'economy'`) — `treasuryByNationality: Record<Nationality, number>`, `incomeByNationality` (derived/cached), `pendingTechTokensByNationality`. Actions: `CollectIncome`, `SpendIpc`, `SeizeTreasury`, `BuyTechTokens`, `ResolveTechRolls`.
- **`ProductionState`** (`name: 'production'`) — `purchaseCartByNationality: Record<Nationality, UnitType[]>` and `pendingPlacementsByNationality` (units bought, awaiting `PLACE_NEW_UNITS`). Actions: `AddToCart`, `RemoveFromCart`, `ConfirmPurchase` (moves cart → pending, debits treasury), `PlaceUnit`, `UndoPlacement`.

Extend **`MapState`** (`map-state.ts`):

- `pendingCapturesByTerritory` — capture is recorded during combat but **transferred at end of turn** (honors the existing TODO at `map-state.ts:42-45` re: aircraft airfields). New actions: `RecordTerritoryCapture`, `ApplyPendingCaptures`.
- Cargo tracking: `cargoByCarrierUnitId: Record<string, string[]>` (loaded unit ids) covering **both** transports (land-unit cargo, for amphibious) and aircraft carriers (fighter cargo, cap 2). Carrier cargo is capacity-only in v1 (no landing-range integration — see WS4.4).
- **Movement execution**: `ApplyMovementPlans(phase)` — relocates units in `unitsByTerritoryName` per each plan's final step, then clears plans. Non-combat plans execute at phase end; combat plans move units to the border and feed combat.

Adjust **`SettingsState`** (`settings-state.ts`): change `DEFAULT_RULE_STATE` so **all national advantages default to `disabled`** (currently some seed as `active`/`enabled`). National advantages are out of scope for v1 — leave the effect code in place, just off. Add a TODO to expose/enable them later.

---

## Workstream 1 — App shell, routing & save/load

**Files:** `src/app/app.routes.ts` (currently `[]`), `src/app/app.html`, `src/app/app.config.ts`, new `src/app/landing/`, new `src/app/game/game-serialization.ts`, new `src/app/shared/unit-factory.ts`.

1. **Routes:** `/` → `LandingPage`, `/setup` → `NewGameSetup`, `/game` → `GameShell` (move current `<ww2-app-header>` + `<ww2-game-map>` out of `app.html` into a `GameShell` component behind `/game`; `app.html` becomes just `<router-outlet>`). Add a route guard redirecting `/game`→`/` when no game is loaded.
2. **Landing page:** "New Game" → `/setup`; "Continue Saved Game" → hidden `<input type="file" accept=".json">`, read via `FileReader`, deserialize, `store.reset(state)`, record the loaded filename into `session.loadedFileName`, navigate `/game`.
3. **Serialization** (`game-serialization.ts`):
   - **Save:** `store.snapshot()` → inject `{schemaVersion, savedAt}` → `JSON.stringify` → `Blob` → anchor-download. **Show a filename dialog** first: prefill with `session.loadedFileName` if the game was loaded from a file, otherwise `wwii-save-<timestamp>.json`; the user can edit before the download. (Treat the confirmed dialog action as authorization for the download.)
   - **Load:** `JSON.parse` → **rehydrate class instances**. Units are the only class instances (`shared/military-unit.ts`: `MilitaryUnit` subclasses hold just `type`, `nationality`, readonly `id`). Add `unit-factory.ts`: `createUnit(type, nationality, id?)` returning the right subclass and preserving the original `id` (needs a factory since `id` is set via `uuid()` in the ctor — add an internal id override). Walk `map.unitsByTerritoryName`, `activeCombat.attackingArmy/defendingArmy`, and cargo to revive units. Validate `schemaVersion`.
   - **TODO (v2):** autosave (e.g. on each handoff) — note it here.
4. **Persistence:** optionally enable the commented-out `withNgxsStoragePlugin` (`app.config.ts:31-34`) with `localStorage` so an in-progress game survives refresh — separate from the explicit JSON save file.

---

## Workstream 2 — Economy foundation (IPC, income, header)

**New data files** (`src/app/economy/data/`): `unit-cost.ts` (`Record<UnitType, number>`), `territory-ipc.ts` (`Record<LandTerritoryName, number>`), `starting-treasury.ts` (`Record<Nationality, number>`), `capitals.ts` (`Record<Nationality, LandTerritoryName>`). Values from the rulebook.

1. **`EconomyState`** slice with `treasuryByNationality` seeded from `starting-treasury.ts`.
2. **Income collection** (end of a nation's turn, at `PLACE_NEW_UNITS`→next): sum `territory-ipc` over territories the nation controls in `map.landTerritoryControllerByName`, add to treasury. **Zero income for a nation whose capital is currently enemy-held** (capital-capture rule). Selector `EconomySelectors.income(nation)`.
3. **Header widgets** (reuse `HEADER_WIDGETS` token, `app-header/header-widget.ts:5`; register in `app.config.ts:36`): active nation's treasury + projected income; a compact all-nations IPC readout.

---

## Workstream 3 — Purchase, tech research & placement

**Files:** `ProductionState` (new), new `src/app/production/purchase-panel/`, `src/app/production/tech-panel/`, `src/app/production/placement/`, plus reuse `shared/military-unit-icon.ts` and `shared/squad-component`.

1. **Purchase panel** (`PURCHASE_UNITS` phase): grid of buyable units with costs from `unit-cost.ts`; running total vs treasury; can't exceed treasury. `ConfirmPurchase` debits IPCs, moves units to `pendingPlacementsByNationality`. Industrial complexes are buyable units here.
2. **Tech research** (`WEAPONS_DEVELOPMENT` phase) — **target-number roll variant**: each tech maps to a **fixed target die face** via a new `TECH_TARGET_NUMBER: Record<TechnologyId, number>` table (1–3 for the three implemented techs now; expandable to 1–6). Flow: the player **chooses one tech to pursue**, buys N dice (default **5 IPC/die** — _confirm cost + any per-turn cap with the user at implementation_), rolls all N (reuse `shared/dice/dice.ts`); if **≥1 die shows that tech's target number**, the tech is acquired **permanently**, written to `settings.technologiesByNationality` (effects already applied in `combat/effective-combat-unit.reducer.ts`). Respect `houseRules.allowedTechIds`; only offer not-yet-owned techs. **TODO comment** for wiring the missing 3 techs (assign them target faces 4–6).
3. **Placement** (`PLACE_NEW_UNITS` phase): **full factory rules** — a territory can receive new units only if it has a `FactoryUnit` of the active nation that was controlled since the start of this turn, and count placed ≤ that territory's `territory-ipc` value. New ICs place on any controlled original territory (rulebook constraint). Naval units place in adjacent sea zones of a coastal IC. Placement UI overlays valid territories on the existing OpenLayers map; `PlaceUnit` writes into `map.unitsByTerritoryName`.

---

## Workstream 4 — Movement execution, combat integration & amphibious

**Files:** `map-state.ts` (new execution actions), `combat-state.ts` (`prepareBattlefield` rewrite), new `src/app/combat/combat-orchestrator.*`, `map/rules/*` for amphibious/AA.

1. **Movement execution:** add `ApplyMovementPlans(phase)` to relocate units per plan (currently plans never move units). Non-combat plans execute at end of `NON_COMBAT_MOVEMENT`. Track transport cargo on load/unload.
2. **Combat orchestration** (replaces fixtures): at `COMBAT_RESOLUTION`, derive the set of contested territories from combat-movement plans (a territory the active nation moved into that holds an enemy unit). Present the list; **player picks order**. For each, build real `attackingArmy` (units whose plan ends there) + `defendingArmy` (occupants) and dispatch into the existing battle board (`prepareBattlefield(context, {territory, attackers, defenders})` — remove `TEST_*` imports). On resolution: remove casualties from `map.unitsByTerritoryName`; if `canCaptureTerritory`, `RecordTerritoryCapture` (pending). Surviving attackers advance/retreat per existing combat outcome.
3. **Amphibious (largest chunk):** transports load land units from adjacent coasts, move, unload into an amphibious assault; assaulted land units join the combat as attackers; **battleship/cruiser shore bombardment** fires one supporting salvo. **The attacker cannot retreat from an amphibious assault** — disable the battle board's `Retreat` action when the battle includes amphibiously-assaulting units. Add cargo-aware validity to `map/rules/*`. Highest-risk item — build as a **thin vertical slice**, layered:
   1. **Cargo + load:** one land unit loads onto one transport at a friendly adjacent coast (non-combat); render on the transport overlay.
   2. **Sea move + friendly unload:** move loaded transport, unload onto a _friendly_ adjacent coast — proves the ferrying loop with no combat.
   3. **Amphibious assault:** unload onto a _hostile_ coast → unit enters the battle as attacker with **retreat disabled**. Single transport, single unit, no bombardment.
   4. **Layer on:** 2-unit capacity, multiple transports into one assault, then **shore bombardment** last.
4. **Aircraft carriers (v1):** track loaded fighters on carriers (`cargoByCarrierUnitId`, cap 2) and allow launch. **Fighters may land on a friendly carrier** — treat a friendly carrier with remaining capacity as a valid airfield in `movement-calculator.ts:distanceToClosestAirfield` (fills the sea-zone branch stubbed at `movement-calculator.ts:39-41`). **v1 simplification:** evaluate the carrier at its position as-is; do **not** solve the carrier _moving during non-combat to pick up_ a returning fighter — defer carrier-repositioning-for-pickup to v2 (TODO).
5. **AA flyover interception — resolved as an end-of-movement-phase gate, not live during planning:**
   - At the **combat-move → combat-resolution** transition: every enemy AA gun rolls once against each aircraft that entered/passed over its territory (steps marked `under-fire`); hits removed **before** any battle is resolved.
   - At the **non-combat-move → mobilize/place-units** transition: same resolution for aircraft that flew over AA during non-combat.
     AA-gun combat profile already exists (`unit-profile.ts`); the `under-fire` step type is already tracked in movement plans.
6. **Tank blitz capture (v1):** when a tank's combat-move path passes through an _undefended_ enemy-controlled territory en route to its destination, `RecordTerritoryCapture` for that passed-through territory too (not just the final step). Small addition to the capture logic in the combat orchestrator / `ApplyMovementPlans`.
7. **End-of-turn capture transfer:** `ApplyPendingCaptures` moves `pendingCapturesByTerritory` into `landTerritoryControllerByName`; if a captured territory is an enemy **capital**, `SeizeTreasury` (captor takes victim's IPCs) and mark income-zeroed until liberated.

### Movement-rules audit (decisions)

The existing movement engine (`map/rules/movement-calculator.ts`, `movement-validity.ts`, `destination-rules.ts`) already implements: land/sea/air terrain restrictions, aircraft must-end-in-range-of-friendly-airfield, aircraft fly-over + single-destination combat + AA under-fire, combat-move "stop at enemy", and non-combat "no enemy entry". Gaps found and their v1 disposition:

- **Aircraft carriers** → **v1: fighters may land on friendly carriers** (carrier counts as an airfield in the range check), but **carrier-repositioning-for-pickup is deferred to v2** (see WS4.4).
- **Transports / amphibious assault / shore bombardment** → **v1: full**, attacker can't retreat (WS4.3).
- **Tank blitz capture** → **v1: include** (WS4.6).
- **Canal control (Suez/Panama)** → **v1: DEFER.** `SPECIAL_ADJACENCIES` (`territory-adjacency.ts:471`) is authored but never referenced by the movement calculator; canals remain free passage. Add a TODO in `calculateAdjacentDestinations`.
- **Submarine submerge movement** → **v1: DEFER** (do not implement). Subs follow normal "stop at enemy" movement; add a TODO. Note: **sub opening-fire / sneak-attack casualty rules are already implemented** on the combat side — no work needed there.
- **Long-range aircraft movement bonus** → **DEFER** (consistent with the 3-tech decision; movement-based tech/advantage hooks are already stubbed as TODOs at `map/effective-map-unit.reducer.ts:58,67`).
- **Strict/true neutral territories** → **N/A.** The dataset has no neutral territories — all 64 land territories are assigned to a nation in `INITIAL_LAND_TERRITORY_CONTROL`; no neutral nations exist. Nothing to build.

---

## Workstream 5 — Turn flow, handoff & victory

**Files:** `game-state.ts` (gating), new `src/app/game/phase-controls/`, new `src/app/game/handoff/`, new `src/app/victory/`, new `src/app/victory/data/victory-cities.ts`.

1. **Phase controls** (header): "Advance phase" / "End turn" buttons driving existing `AdvanceTurnPhase`/`AdvanceGamePhase` (`game-state.ts:49-70`). **Enforce gating** (honor TODOs at `game-state.ts:47,56`): block advance when `MapSelectors.invalidMovementPlanCount() > 0` or unresolved battles remain, and require each phase's action to be legal (can't leave purchase over-budget, etc.).
2. **Handoff interstitial:** between nations (when `AdvanceTurnPhase` wraps to `PURCHASE_UNITS`), show a full-screen "End of [Nation] — pass device to **[next player] ([next nationality])**" screen; also runs income collection + pending-capture transfer at this boundary. **Show current victory-city progress** on this screen (per-alliance counts vs. thresholds) so players can see how close the game is.
3. **Victory:** author `victory-cities.ts` (city → owning-at-start nation) + minor/major/total thresholds from the rulebook. At `CHECK_FOR_VICTORY` (`GamePhase.CHECK_FOR_VICTORY`, after all 5 nations), count victory cities per alliance and show a victory screen if a threshold is met; else increment `roundNumber` and continue. (The same victory-city count selector feeds the handoff progress display in step 2.)

---

## Critical files to modify (representative)

- `src/app/app.routes.ts`, `src/app/app.html`, `src/app/app.config.ts` — routing, shell, slice/widget registration.
- `src/app/game/game-state.ts` — phase-advance gating + income/capture hooks at turn boundary.
- `src/app/map/map-state.ts` — movement execution, capture (pending→applied), transport cargo.
- `src/app/combat/combat-state.ts:115-118` — replace `TEST_*` fixtures with real-army `prepareBattlefield`; delete reliance on `src/dev-data.ts`.
- New slices: `src/app/session/`, `src/app/economy/`, `src/app/production/`, `src/app/victory/`.
- New data: `economy/data/{unit-cost,territory-ipc,starting-treasury,capitals}.ts`, `victory/data/victory-cities.ts`.
- Reuse: `shared/dice/dice.ts`, `shared/military-unit-icon.ts`, `shared/squad-component`, `shared/modal-dialog`, `app-header/header-widget.ts` (`HEADER_WIDGETS`).

## Suggested sequencing

1. WS1 (shell/routing/save-load) — unblocks everything, makes the app navigable.
2. WS2 (economy) → WS3 (purchase/tech/placement) — the economic loop.
3. WS4 (movement exec + combat wiring; amphibious last) — the riskiest; connects the finished engine to the board.
4. WS5 (turn flow, handoff, victory) — closes the round loop.
   Land each workstream behind the strict phase flow so the game is testable end-to-end incrementally.

## Testing / verification

**Automated tests are deferred** — the user will do a separate testing pass once a framework is chosen. Do not write specs as part of this work. (Karma+Jasmine is currently configured with 0 specs, but the framework is not settled.) Verify manually instead:

- **End-to-end manual** via the dev server (`.claude/launch.json` → `ww2-dev`, `npm run start`, port 4200): using the Browser pane, run a full round — new game with names, purchase, tech roll, combat move, resolve a real battle on the battle board, non-combat move, place units, collect income, hand off — and confirm treasuries/control/victory update. Verify save → filename dialog → reload file restores identical state (spot-check unit ids and treasuries).
- **Serialization check:** snapshot → serialize → deserialize → confirm revived unit instances are the correct subclass with preserved `id`.
- Watch `read_console_messages` / `preview_logs` for errors after each workstream.
- Note the seams where logic is written as pure functions (income summation, placement legality, tech-roll target check, victory-city counting, capture-transfer timing) so the later testing pass has clean units to target.
