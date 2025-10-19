import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { BattleBoard } from './combat/battle-board/battle-board';

@Component({
  selector: 'ww2-root',
  imports: [RouterOutlet, BattleBoard],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  protected readonly title = signal('WWIIStrategy');
}
