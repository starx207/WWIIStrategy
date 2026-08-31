# Playtest Follow-ups

Notes from a test playthrough, captured after the WS4 work completed. Status added as each was
addressed (2026-08-30).

## Header

- [x] Contextual labels/buttons/widgets now sit **between the treasury widgets and the Save/Main
      Menu buttons**. Save/Main Menu (and the save dialog) moved into a header widget pinned far right;
      treasuries are leftmost; the phase/movement widgets sit between them.

## New Game Setup

- [x] Default player names to "Player 1", "Player 2", etc.
- [x] Default all **Allied** nations to the 1st player and all **Axis** nations to the 2nd player.
- [x] Remove the allowed-technologies checkboxes — all implemented technologies are always allowed.
- [x] Nation-control dropdowns are a consistent fixed width.

## Purchase Units Panel

- [x] Second column no longer clipped (grid columns use `minmax(0, 1fr)`).
- [x] Per-unit-type subtotal shown as the quantity is adjusted.
- [x] "Confirm Purchase" auto-advances to the next phase.
- [x] "Skip" button advances without purchasing.

## Develop Weapons Panel

- [x] Research-roll results rendered with the Dice pip component.
- [x] "Done" button advances after the roll.
- [x] "Skip" button advances without researching.

## Movement Phases

- [x] Only the **active nation's** squads are selectable during combat / non-combat movement.
- [ ] **Split a squad** — move only some units instead of the whole squad. **DEFERRED to its own
      workstream** (2026-08-30): it changes the core "squad = all like units" model (movement plans must
      track specific unit subsets), touches plan execution + combat orchestration, and adds an on-map
      count control. Needs its own design + manual playtest pass.

## Conduct Combat Panel

- [x] Auto-advances to the next phase once all battles are resolved.

## Combat Board

- [x] When one army scores enough hits to wipe out the other, that side's firing ends early (no need
      to fire every unit).
- [x] A wiped-out army's units are auto-assigned as casualties (no manual selection).
- [x] Aircraft whose movement plan includes an attack node are already included in that combat
      (handled by the earlier aircraft-combat work via `attackedTerritoryForPlan` / `buildBattleSetup`).

## Unit Placement Panel

- [x] Placements are staged locally and can be undone per unit (remove control on each placed unit).
- [x] "Confirm & End Turn" button ends the turn once satisfied (header advance is hidden during
      placement so it can't bypass the staged commits).
- [~] Proposed factory-first selection UX: partially adopted — the panel groups placed units by
  destination and supports place/remove per destination, but does not yet drive selection from the
  map. Full map-driven selection can ride along with the split-squad workstream if desired.
