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
    if (this.visible) {
      return;
    }

    this.visible = true;
    if (!this.innerDialog.nativeElement.open) {
      this.innerDialog.nativeElement.showModal();
    }
  }

  close(): void {
    if (!this.visible) {
      return;
    }

    if (this.innerDialog.nativeElement.open) {
      this.innerDialog.nativeElement.close();
    }
    this.visible = false;
  }

  // Keep the host backdrop state aligned when the native dialog closes itself,
  // such as on Escape or any other direct close event.
  handleNativeClose(): void {
    this.visible = false;
  }
}
