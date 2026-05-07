import { Component, input, output } from '@angular/core';
import { CdkMenuModule } from '@angular/cdk/menu';

export interface ContextMenuAction<TContext = unknown> {
  id: string;
  label: string;
  isEnabled(context: TContext): boolean;
  execute(context: TContext): void;
}

export interface ContextMenuActionSelected<TContext = unknown> {
  action: ContextMenuAction<TContext>;
  context: TContext;
}

@Component({
  selector: 'ww2-context-menu',
  imports: [CdkMenuModule],
  templateUrl: './context-menu.html',
  styleUrl: './context-menu.scss',
})
export class ContextMenuComponent {
  actions = input<ContextMenuAction<any>[]>([]);
  context = input<any>();

  actionSelected = output<ContextMenuActionSelected<any>>();

  protected selectAction(action: ContextMenuAction<any>) {
    const context = this.context();
    if (!action.isEnabled(context)) {
      return;
    }

    action.execute(context);
    this.actionSelected.emit({ action, context });
  }
}
