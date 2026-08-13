import { AfterViewInit, Component, ElementRef, OnDestroy, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import * as L from 'leaflet';

// Sequential blue ramp (design-system "blue" light steps) for magnitude encoding,
// light (near zero) -> dark (high). 7 buckets.
const RAMP = [
  '#cde2fb', // 100
  '#9ec5f4', // 200
  '#6da7ec', // 300
  '#5598e7', // 350
  '#2a78d6', // 450
  '#184f95', // 600
  '#0d366b', // 700
];

interface StateProperties {
  name: string;
  type: string;
}

@Component({
  selector: 'app-india-choropleth',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './india-choropleth.component.html',
  styleUrl: './india-choropleth.component.scss',
})
export class IndiaChoroplethComponent implements AfterViewInit, OnDestroy {
  @ViewChild('mapContainer', { static: true }) mapContainer!: ElementRef<HTMLDivElement>;

  // Deterministic synthetic "value" per state so the choropleth is meaningful
  // without a backend. Bucketed into the ramp by a stable pseudo-metric.
  private metric: Record<string, number> = {};
  private map?: L.Map;
  private geoJsonLayer?: L.GeoJSON;
  private legend?: L.Control;
  error: string | null = null;

  constructor(private http: HttpClient) {}

  ngAfterViewInit(): void {
    this.initMap();
    this.loadData();
  }

  ngOnDestroy(): void {
    this.map?.remove();
  }

  private initMap(): void {
    this.map = L.map(this.mapContainer.nativeElement, {
      center: [22.5, 80],
      zoom: 4,
      attributionControl: false,
      zoomControl: true,
      scrollWheelZoom: false,
      doubleClickZoom: false
    });
  }

  private loadData(): void {
    this.http
      .get<GeoJSON.FeatureCollection<GeoJSON.Geometry, StateProperties>>(
        'assets/data/india-states.geojson'
      )
      .subscribe({
        next: (fc) => {
          // Build a stable pseudo-metric per state from its name.
          fc.features.forEach((f, i) => {
            const name = f.properties?.name ?? `State ${i}`;
            // Hash the name into a 0..100 value (deterministic, no backend).
            let h = 0;
            for (let c = 0; c < name.length; c++) h = (h * 31 + name.charCodeAt(c)) % 1000;
            this.metric[name] = 20 + (h % 81); // 20..100
          });
          this.renderLayer(fc);
          this.addLegend();
        },
        error: () => {
          this.error = 'Unable to load India states map data.';
        },
      });
  }

  private colorFor(value: number): string {
    const idx = Math.min(RAMP.length - 1, Math.floor((value / 100) * RAMP.length));
    return RAMP[Math.max(0, idx)];
  }

  private highlight(e: L.LeafletMouseEvent): void {
    const layer = e.target;
    layer.setStyle({ weight: 2.5, color: '#0b0b0b', fillOpacity: 1 });
    layer.bringToFront();
  }

  private resetHighlight(e: L.LeafletMouseEvent): void {
    this.geoJsonLayer?.resetStyle(e.target);
  }

  private renderLayer(fc: GeoJSON.FeatureCollection<GeoJSON.Geometry, StateProperties>): void {
    if (!this.map) return;
    this.geoJsonLayer = L.geoJSON(fc, {
      style: (feature) => {
        const name = feature?.properties?.name ?? '';
        return {
          weight: 1,
          color: '#ffffff',
          fillColor: this.colorFor(this.metric[name] ?? 0),
          fillOpacity: 0.85,
        };
      },
      onEachFeature: (feature, layer) => {
        const name = feature?.properties?.name ?? '';
        const value = this.metric[name] ?? 0;
        // Native Leaflet tooltip, sticky so it follows the cursor on hover
        layer.bindTooltip(`${name}: ${value}`, { sticky: true });
        // Add highlight effect on hover
        layer.on({
          mouseover: (e) => this.highlight(e),
          mouseout: (e) => this.resetHighlight(e),
        });
      },
    }).addTo(this.map);

    this.map.fitBounds(this.geoJsonLayer.getBounds(), { padding: [12, 12] });
  }


  private addLegend(): void {
    if (!this.map) return;
    const legend = new L.Control({ position: 'bottomright' });
    legend.onAdd = () => {
      const div = L.DomUtil.create('div', 'india-legend');
      div.innerHTML = '<span class="india-legend-title">Index</span>';
      RAMP.forEach((color, i) => {
        const lo = Math.round((i / RAMP.length) * 100);
        const hi = Math.round(((i + 1) / RAMP.length) * 100);
        const row = L.DomUtil.create('div', 'india-legend-row', div);
        row.innerHTML = `<i style="background:${color}"></i>${lo}&ndash;${hi}`;
      });
      return div;
    };
    legend.addTo(this.map);
    this.legend = legend;
  }
}
