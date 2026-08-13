import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IndiaChoroplethComponent } from './india-choropleth/india-choropleth.component';

@Component({
  selector: 'app-maps',
  standalone: true,
  imports: [CommonModule, IndiaChoroplethComponent],
  templateUrl: './maps.component.html',
  styleUrl: './maps.component.scss',
})
export class MapsComponent {
  regions = [
    { name: 'North America', locations: 1240 },
    { name: 'South America', locations: 860 },
    { name: 'Europe', locations: 2110 },
    { name: 'Africa', locations: 540 },
    { name: 'Asia', locations: 2980 },
    { name: 'Oceania', locations: 430 },
  ];

  get totalLocations(): number {
    return this.regions.reduce((sum, r) => sum + r.locations, 0);
  }
}
