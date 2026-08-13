import { AfterViewInit, Component, ElementRef, OnDestroy, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { lastValueFrom } from 'rxjs';
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

type Geometry = GeoJSON.Geometry;
type FeatureCollection<P> = GeoJSON.FeatureCollection<Geometry, P>;

interface StateProperties {
  name: string;
  type: string;
}

interface DistrictProperties {
  state: string | null;
  district: string | null;
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

  // Deterministic synthetic "value" per region so the choropleth is meaningful
  // without a backend. Bucketed into the ramp by a stable pseudo-metric.
  private metric: Record<string, number> = {};
  private map?: L.Map;
  private geoJsonLayer?: L.GeoJSON;
  private legend?: L.Control;
  private statesFc?: FeatureCollection<StateProperties>;
  private districtsFc?: FeatureCollection<DistrictProperties>;

  currentState: string | null = null;
  error: string | null = null;

  constructor(private http: HttpClient) {}

  ngAfterViewInit(): void {
    this.initMap();
    this.loadStates();
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

  private loadStates(): void {
    this.http
      .get<FeatureCollection<StateProperties>>('assets/data/india-states.geojson')
      .subscribe({
        next: (fc) => {
          this.statesFc = fc;
          fc.features.forEach((f, i) => this.assignMetric(f.properties?.name ?? `State ${i}`));
          this.renderStates();
          this.addLegend();
        },
        error: () => {
          this.error = 'Unable to load India states map data.';
        },
      });
  }

  private loadDistricts(): Promise<FeatureCollection<DistrictProperties>> {
    if (this.districtsFc) return Promise.resolve(this.districtsFc);
    return lastValueFrom(
      this.http.get<FeatureCollection<DistrictProperties>>('assets/data/india-districts.geojson')
    ).then((fc) => {
      this.districtsFc = fc;
      fc.features.forEach((f) => this.assignMetric(f.properties?.district ?? ''));
      return fc;
    });
  }

  // Stable hash of a name into a 20..100 pseudo-value (deterministic, no backend).
  private assignMetric(name: string): void {
    let h = 0;
    for (let c = 0; c < name.length; c++) h = (h * 31 + name.charCodeAt(c)) % 1000;
    this.metric[name] = 20 + (h % 81);
  }

  // Canonicalize a state name so states-file names match district-file state values.
  private normalizeState(name: string): string {
    const n = name.trim().toUpperCase().replace(/&/g, 'AND');
    switch (n) {
      case 'ANDAMAN AND NICOBAR':
        return 'ANDAMAN AND NICOBAR ISLANDS';
      case 'DADRA AND NAGAR HAVELI':
      case 'DAMAN AND DIU':
        return 'DADRA AND NAGAR HAVELI AND DAMAN AND DIU';
      default:
        return n;
    }
  }

  private titleCase(name: string): string {
    return name
      .toLowerCase()
      .split(' ')
      .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
      .join(' ');
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

  private clearLayers(): void {
    if (this.geoJsonLayer) {
      this.map?.removeLayer(this.geoJsonLayer);
      this.geoJsonLayer = undefined;
    }
  }

  private renderStates(): void {
    if (!this.map || !this.statesFc) return;
    this.clearLayers();
    this.currentState = null;

    this.geoJsonLayer = L.geoJSON(this.statesFc, {
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
        layer.bindTooltip(`${name}: ${value}`, { sticky: true });
        layer.on({
          mouseover: (e) => this.highlight(e),
          mouseout: (e) => this.resetHighlight(e),
          click: () => this.drillDown(name),
        });
      },
    }).addTo(this.map);

    this.map.fitBounds(this.geoJsonLayer.getBounds(), { padding: [12, 12] });
  }

  private async drillDown(stateName: string): Promise<void> {
    try {
      const fc = await this.loadDistricts();
      const norm = this.normalizeState(stateName);
      const matched = fc.features.filter(
        (f) => f.properties?.state && this.normalizeState(f.properties.state) === norm
      );
      if (!matched.length || !this.map) return;

      const subset: FeatureCollection<DistrictProperties> = {
        type: 'FeatureCollection',
        features: matched,
      };

      this.clearLayers();
      this.currentState = stateName;

      this.geoJsonLayer = L.geoJSON(subset, {
        style: (feature) => {
          const name = feature?.properties?.district ?? '';
          return {
            weight: 1,
            color: '#ffffff',
            fillColor: this.colorFor(this.metric[name] ?? 0),
            fillOpacity: 0.85,
          };
        },
        onEachFeature: (feature, layer) => {
          const raw = feature?.properties?.district ?? '';
          const name = this.titleCase(raw);
          const value = this.metric[raw] ?? 0;
          layer.bindTooltip(`${name}: ${value}`, { sticky: true });
          layer.on({
            mouseover: (e) => this.highlight(e),
            mouseout: (e) => this.resetHighlight(e),
          });
        },
      }).addTo(this.map);

      this.map.fitBounds(this.geoJsonLayer.getBounds(), { padding: [12, 12] });
    } catch {
      this.error = 'Unable to load district map data.';
    }
  }

  backToStates(): void {
    this.renderStates();
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