import { Component, ElementRef, ViewChild } from '@angular/core';

@Component({
  selector: 'ww2-modal-dialog',
  exportAs: 'dialog',
  imports: [],
  templateUrl: './modal-dialog.html',
  styleUrl: './modal-dialog.scss',
  host: {
    '[class.visible]': 'visible',
  },
})
export class ModalDialog {
  visible = false;

  @ViewChild('innerDialog') innerDialog!: ElementRef<HTMLDialogElement>;

  open(): void {
    this.visible = true;
    this.innerDialog.nativeElement.showModal();
  }

  close(): void {
    this.innerDialog.nativeElement.close();
    this.visible = false;
  }
}
