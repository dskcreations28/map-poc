import { Component, signal, output } from '@angular/core';

@Component({
  selector: 'app-switcher',
  standalone: true,
  imports: [],
  templateUrl: './switcher.component.html',
  styleUrls: ['./switcher.component.scss'],
})
export class SwitcherComponent {
  isDistrict = signal(true);
  viewChange = output<'district' | 'city'>();

  selectDistrict(): void {
    this.isDistrict.set(true);
    this.viewChange.emit('district');
  }

  selectCity(): void {
    this.isDistrict.set(false);
    this.viewChange.emit('city');
  }

  get selectedType(): 'district' | 'city' {
    return this.isDistrict() ? 'district' : 'city';
  }
}