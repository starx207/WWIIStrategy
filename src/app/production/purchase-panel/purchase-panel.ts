import { Component, computed, inject } from '@angular/core';
import { Store } from '@ngxs/store';
import { UnitType } from '@ww2/shared/unit-type';
import { MilitaryUnitIcon } from '@ww2/shared/military-unit-icon';
import { PURCHASABLE_UNIT_TYPES, UNIT_TYPE_LABEL } from '@ww2/shared/unit-type-label';
import { UNIT_COST_BY_TYPE } from '@ww2/economy/data/unit-cost';
import { EconomySelectors } from '@ww2/economy/economy-selectors';
import { GameSelectors } from '@ww2/game/game-selectors';
import { nationalityForGamePhase } from '@ww2/game/game-phase';
import { TurnFlowService } from '@ww2/game/turn-flow.service';
import { ProductionSelectors } from '../production-selectors';
import { ProductionActions } from '../production-actions';
import { cartCost } from '../production-state';

@Component({
  selector: 'ww2-purchase-panel',
  imports: [MilitaryUnitIcon],
  templateUrl: './purchase-panel.html',
  styleUrl: './purchase-panel.scss',
})
export class PurchasePanel {
  private readonly store = inject(Store);
  private readonly turnFlow = inject(TurnFlowService);

  private readonly gamePhase = this.store.selectSignal(GameSelectors.gamePhase);
  private readonly treasuries = this.store.selectSignal(EconomySelectors.treasuryByNationality);
  private readonly carts = this.store.selectSignal(ProductionSelectors.purchaseCartByNationality);

  protected readonly unitTypes = PURCHASABLE_UNIT_TYPES;
  protected readonly activeNation = computed(() => nationalityForGamePhase(this.gamePhase()));

  protected readonly cart = computed(() => {
    const nation = this.activeNation();
    return nation ? (this.carts()[nation] ?? []) : [];
  });

  protected readonly treasury = computed(() => {
    const nation = this.activeNation();
    return nation ? this.treasuries()[nation] : 0;
  });

  protected readonly totalCost = computed(() => cartCost(this.cart()));
  protected readonly remaining = computed(() => this.treasury() - this.totalCost());

  protected cost(unitType: UnitType): number {
    return UNIT_COST_BY_TYPE[unitType];
  }

  protected label(unitType: UnitType): string {
    return UNIT_TYPE_LABEL[unitType];
  }

  protected quantityOf(unitType: UnitType): number {
    return this.cart().filter((type) => type === unitType).length;
  }

  protected subtotal(unitType: UnitType): number {
    return this.quantityOf(unitType) * this.cost(unitType);
  }

  protected canAfford(unitType: UnitType): boolean {
    return this.remaining() >= this.cost(unitType);
  }

  protected add(unitType: UnitType): void {
    const nation = this.activeNation();
    if (nation && this.canAfford(unitType)) {
      this.store.dispatch(new ProductionActions.AddToCart(nation, unitType));
    }
  }

  protected remove(unitType: UnitType): void {
    const nation = this.activeNation();
    if (nation) {
      this.store.dispatch(new ProductionActions.RemoveFromCart(nation, unitType));
    }
  }

  protected clear(): void {
    const nation = this.activeNation();
    if (nation) {
      this.store.dispatch(new ProductionActions.ClearCart(nation));
    }
  }

  protected confirm(): void {
    const nation = this.activeNation();
    if (nation && this.cart().length > 0) {
      this.store.dispatch(new ProductionActions.ConfirmPurchase(nation));
    }
    // A valid purchase advances straight to the next phase.
    this.turnFlow.advancePhase();
  }

  /** Advance without buying anything, discarding any units queued in the cart. */
  protected skip(): void {
    const nation = this.activeNation();
    if (nation && this.cart().length > 0) {
      this.store.dispatch(new ProductionActions.ClearCart(nation));
    }
    this.turnFlow.advancePhase();
  }
}
