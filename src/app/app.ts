import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { BattleBoard } from './combat/battle-board/battle-board';
import { ModalDialog } from './shared/modal-dialog/modal-dialog';

@Component({
  selector: 'ww2-root',
  imports: [RouterOutlet, BattleBoard, ModalDialog],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  protected readonly title = signal('WWIIStrategy');
}
