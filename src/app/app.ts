import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { TestOlMap } from './test-ol-map/test-ol-map';
import { BattleBoard } from './combat/battle-board/battle-board';
import { Expiremental } from './expiremental/expiremental';
import { ModalDialog } from "./shared/modal-dialog/modal-dialog";

@Component({
  selector: 'ww2-root',
  imports: [RouterOutlet, TestOlMap, Expiremental, BattleBoard, ModalDialog],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  protected readonly title = signal('WWIIStrategy');
}
