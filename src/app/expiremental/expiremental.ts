import { Component } from '@angular/core';
import { MilitaryUnitIcon } from '@ww2/shared/military-unit-icon';
import { Nationality } from '@ww2/shared/nationality';
import { UnitType } from '@ww2/shared/unit-type';

@Component({
  selector: 'ww2-expiremental',
  imports: [MilitaryUnitIcon],
  templateUrl: './expiremental.html',
  styleUrl: './expiremental.scss',
})
export class Expiremental {
  Nationality = Nationality;
  UnitType = UnitType;
}
