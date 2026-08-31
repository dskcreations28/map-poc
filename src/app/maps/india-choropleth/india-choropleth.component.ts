import { AfterViewInit, Component, ElementRef, OnDestroy, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { lastValueFrom } from 'rxjs';
import * as L from 'leaflet';

const RAMP = [
  '#cde2fb', '#9ec5f4', '#6da7ec', '#5598e7', '#2a78d6', '#184f95', '#0d366b',
];

const ZONE_COLORS = [
  '#e74c3c', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c',
  '#e67e22', '#3498db', '#e91e63', '#00bcd4', '#8bc34a',
  '#ff5722', '#607d8b', '#795548', '#4caf50', '#ff9800',
];

type Geometry = GeoJSON.Geometry;
type FeatureCollection<P> = GeoJSON.FeatureCollection<Geometry, P>;

interface StateProperties { name: string; type: string; }
interface DistrictProperties { state: string | null; district: string | null; }
interface PincodeProperties { pincode: string; district: string; state: string; office_name?: string; }
interface MicromarketInfo { location: string; city: string; zone: string; }

@Component({
  selector: 'app-india-choropleth',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './india-choropleth.component.html',
  styleUrl: './india-choropleth.component.scss',
})
export class IndiaChoroplethComponent implements AfterViewInit, OnDestroy {
  @ViewChild('mapContainer', { static: true }) mapContainer!: ElementRef<HTMLDivElement>;

  private metric: Record<string, number> = {};
  private map?: L.Map;
  private geoJsonLayer?: L.GeoJSON;
  private micromarketLayer?: L.GeoJSON;
  private legend?: L.Control;
  private statesFc?: FeatureCollection<StateProperties>;
  private districtsFc?: FeatureCollection<DistrictProperties>;
  private citiesFc?: FeatureCollection<DistrictProperties>;
  private pincodesFc?: FeatureCollection<PincodeProperties>;
  private micromarketMap = new Map<string, MicromarketInfo>();
  private currentPincodeFeatures: GeoJSON.Feature[] = [];

  currentState: string | null = null;
  currentDistrict: string | null = null;
  currentDistrictTitle: string | null = null;
  showMicromarkets = false;
  drillDownMode: 'district' | 'city' = 'district';
  error: string | null = null;

  constructor(private http: HttpClient) {}

  ngAfterViewInit(): void {
    this.initMap();
    this.loadStates();
    this.loadMicromarkets();
  }

  ngOnDestroy(): void {
    this.map?.remove();
  }

  private initMap(): void {
    this.map = L.map(this.mapContainer.nativeElement, {
      center: [22.5, 80], zoom: 4,
      attributionControl: false, zoomControl: true,
      scrollWheelZoom: false, doubleClickZoom: false,
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
        error: () => { this.error = 'Unable to load India states map data.'; },
      });
  }

  private loadMicromarkets(): void {
    this.http.get('assets/data/micromaps.csv', { responseType: 'text' }).subscribe({
      next: (csv) => {
        const lines = csv.trim().split('\n');
        for (let i = 1; i < lines.length; i++) {
          const cols = lines[i].split(',');
          if (cols.length < 4) continue;
          const pincode = cols[0].trim();
          const location = cols[1].trim();
          const city = cols[2].trim();
          const zone = cols[3].trim();
          if (pincode) this.micromarketMap.set(pincode, { location, city, zone });
        }
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

  private loadCities(): Promise<FeatureCollection<DistrictProperties>> {
    if (this.citiesFc) return Promise.resolve(this.citiesFc);
    return lastValueFrom(
      this.http.get<FeatureCollection<DistrictProperties>>('assets/data/india-cities.geojson')
    ).then((fc) => {
      this.citiesFc = fc;
      fc.features.forEach((f) => this.assignMetric(f.properties?.district ?? ''));
      return fc;
    });
  }

  private loadPincodes(): Promise<FeatureCollection<PincodeProperties>> {
    if (this.pincodesFc) return Promise.resolve(this.pincodesFc);
    return lastValueFrom(
      this.http.get<FeatureCollection<PincodeProperties>>('assets/data/india-pincodes.geojson')
    ).then((fc) => {
      this.pincodesFc = fc;
      fc.features.forEach((f) => this.assignMetric(f.properties?.pincode ?? ''));
      return fc;
    });
  }

  private assignMetric(name: string): void {
    let h = 0;
    for (let c = 0; c < name.length; c++) h = (h * 31 + name.charCodeAt(c)) % 1000;
    this.metric[name] = 20 + (h % 81);
  }

  private normalizeState(name: string): string {
    const n = name.trim().toUpperCase().replace(/&/g, 'AND');
    switch (n) {
      case 'ANDAMAN AND NICOBAR': return 'ANDAMAN AND NICOBAR ISLANDS';
      case 'DADRA AND NAGAR HAVELI':
      case 'DAMAN AND DIU': return 'DADRA AND NAGAR HAVELI AND DAMAN AND DIU';
      default: return n;
    }
  }

  private titleCase(name: string): string {
    return name.toLowerCase().split(' ').map((w) => w ? w[0].toUpperCase() + w.slice(1) : w).join(' ');
  }

  private colorFor(value: number): string {
    const idx = Math.min(RAMP.length - 1, Math.floor((value / 100) * RAMP.length));
    return RAMP[Math.max(0, idx)];
  }

  private highlight(e: L.LeafletMouseEvent): void {
    e.target.setStyle({ weight: 2.5, color: '#0b0b0b', fillOpacity: 1 });
    e.target.bringToFront();
  }

  private resetHighlight(e: L.LeafletMouseEvent): void {
    this.geoJsonLayer?.resetStyle(e.target);
  }

  private clearLayers(): void {
    if (this.geoJsonLayer) {
      this.map?.removeLayer(this.geoJsonLayer);
      this.geoJsonLayer = undefined;
    }
    this.clearMicromarketLayer();
    this.currentPincodeFeatures = [];
  }

  private clearMicromarketLayer(): void {
    if (this.micromarketLayer) {
      this.map?.removeLayer(this.micromarketLayer);
      this.micromarketLayer = undefined;
    }
  }

  private renderStates(): void {
    if (!this.map || !this.statesFc) return;
    this.clearLayers();
    this.currentState = null;
    this.currentDistrict = null;
    this.currentDistrictTitle = null;

    this.geoJsonLayer = L.geoJSON(this.statesFc, {
      style: (feature) => {
        const name = feature?.properties?.name ?? '';
        return { weight: 1, color: '#ffffff', fillColor: this.colorFor(this.metric[name] ?? 0), fillOpacity: 0.85 };
      },
      onEachFeature: (feature, layer) => {
        const name = feature?.properties?.name ?? '';
        const value = this.metric[name] ?? 0;
        layer.bindTooltip(`${name}: ${value}`, { sticky: true });
        layer.on({
          mouseover: (e) => this.highlight(e),
          mouseout: (e) => this.resetHighlight(e),
          click: () => this.drillToDistricts(name),
        });
      },
    }).addTo(this.map);

    this.map.fitBounds(this.geoJsonLayer.getBounds(), { padding: [12, 12] });
  }

  private async drillToDistricts(stateName: string): Promise<void> {
    try {
      const fc = await this.loadDistricts();
      const norm = this.normalizeState(stateName);
      const matched = fc.features.filter(
        (f) => f.properties?.state && this.normalizeState(f.properties.state) === norm
      );
      if (!matched.length || !this.map) return;

      this.clearLayers();
      this.currentState = stateName;
      this.currentDistrict = null;
      this.currentDistrictTitle = null;

      const subset: FeatureCollection<DistrictProperties> = { type: 'FeatureCollection', features: matched };

      this.geoJsonLayer = L.geoJSON(subset, {
        style: (feature) => {
          const name = feature?.properties?.district ?? '';
          return { weight: 1, color: '#ffffff', fillColor: this.colorFor(this.metric[name] ?? 0), fillOpacity: 0.85 };
        },
        onEachFeature: (feature, layer) => {
          const raw = feature?.properties?.district ?? '';
          const name = this.titleCase(raw);
          const value = this.metric[raw] ?? 0;
          layer.bindTooltip(`${name}: ${value}`, { sticky: true });
          layer.on({
            mouseover: (e) => this.highlight(e),
            mouseout: (e) => this.resetHighlight(e),
            click: () => this.drillToPincodes(raw, feature?.properties?.state ?? '', this.drillDownMode),
          });
        },
      }).addTo(this.map);

      this.map.fitBounds(this.geoJsonLayer.getBounds(), { padding: [12, 12] });
    } catch {
      this.error = 'Unable to load district map data.';
    }
  }

  private async drillToPincodes(district: string, state: string, mode: 'district' | 'city' = 'district'): Promise<void> {
    try {
      const fc = await this.loadPincodes();
      const matched = fc.features.filter(
        (f) => f.properties?.district === district && f.properties?.state === state
      );
      if (!matched.length || !this.map) return;

      const subset: FeatureCollection<PincodeProperties> = { type: 'FeatureCollection', features: matched };

      if (mode === 'city') {
        // In city mode: use cities dataset for boundary layer
        this.clearLayers();
        this.currentDistrict = district;
        this.currentDistrictTitle = `City: ${this.titleCase(district)}`;
        this.currentPincodeFeatures = matched;

        // Load and use cities boundary layer
        const citiesFc = await this.loadCities();
        const cityMatched = citiesFc.features.filter(
          (f) => f.properties?.district === district && f.properties?.state === state
        );
        const citySubset = { type: 'FeatureCollection', features: cityMatched };

        this.geoJsonLayer = L.geoJSON(citySubset as any, {
          style: (feature) => {
            const name = feature?.properties?.district ?? '';
            return { weight: 3, color: '#184f95', fillColor: 'transparent', dashArray: '6, 4' };
          },
          onEachFeature: (feature, layer) => {
            const name = feature?.properties?.district ?? '';
            layer.bindTooltip(`${name}: City Mode`, { sticky: true });
          },
        }).addTo(this.map);

        this.map.fitBounds(this.geoJsonLayer.getBounds(), { padding: [12, 12] });

        // Always render micromarket boundaries in city mode
        this.renderMicromarketBoundariesFromView();
      } else {
        // district mode - original behavior
        this.clearLayers();
        this.currentDistrict = district;
        this.currentDistrictTitle = this.titleCase(district);
        this.currentPincodeFeatures = matched;

        this.geoJsonLayer = L.geoJSON(subset, {
          style: (feature) => {
            const pincode = feature?.properties?.pincode ?? '';
            return { weight: 1, color: '#ffffff', fillColor: this.colorFor(this.metric[pincode] ?? 0), fillOpacity: 0.85 };
          },
          onEachFeature: (feature, layer) => {
            const pincode = feature?.properties?.pincode ?? '';
            const value = this.metric[pincode] ?? 0;
            const office = feature?.properties?.office_name?.trim() ?? '';
            const info = this.micromarketMap.get(pincode);
            let tip = office ? `${office} (${pincode}): ${value}` : `PIN ${pincode}: ${value}`;
            if (info) tip += ` [${info.zone}]`;
            layer.bindTooltip(tip, { sticky: true });
            layer.on({
              mouseover: (e) => this.highlight(e),
              mouseout: (e) => this.resetHighlight(e),
            });
          },
        }).addTo(this.map);

        this.map.fitBounds(this.geoJsonLayer.getBounds(), { padding: [12, 12] });

        if (this.showMicromarkets) this.renderMicromarketBoundaries(matched);
      }
    } catch {
      this.error = 'Unable to load pincode map data.';
    }
  }

  toggleMicromarkets(): void {
    this.showMicromarkets = !this.showMicromarkets;
    if (this.showMicromarkets) {
      this.renderMicromarketBoundariesFromView();
    } else {
      this.clearMicromarketLayer();
    }
  }

  private renderMicromarketBoundariesFromView(): void {
    if (this.currentPincodeFeatures.length) {
      this.renderMicromarketBoundaries(this.currentPincodeFeatures as any);
    }
  }

  private renderMicromarketBoundaries(pincodes: GeoJSON.Feature<Geometry, PincodeProperties>[]): void {
    if (!this.map) return;
    this.clearMicromarketLayer();

    const zonePincodes = new Map<string, GeoJSON.Feature[]>();
    for (const f of pincodes) {
      const pincode = f.properties?.pincode ?? '';
      const info = this.micromarketMap.get(pincode);
      if (!info) continue;
      const key = info.zone;
      if (!zonePincodes.has(key)) zonePincodes.set(key, []);
      zonePincodes.get(key)!.push(f);
    }

    if (!zonePincodes.size) return;

    const features: GeoJSON.Feature[] = [];
    let colorIdx = 0;
    zonePincodes.forEach((pf, zoneName) => {
      const color = ZONE_COLORS[colorIdx % ZONE_COLORS.length];
      colorIdx++;
      for (const f of pf) {
        features.push({
          type: 'Feature',
          properties: { zone: zoneName, color },
          geometry: f.geometry,
        });
      }
    });

    this.micromarketLayer = L.geoJSON(
      { type: 'FeatureCollection', features } as any,
      {
        style: (_feature: any) => ({
          fillColor: 'transparent',
          fillOpacity: 0,
          color: '#ff0000',
          weight: 2,
          dashArray: '6, 4',
        }),
        onEachFeature: (feature: any, layer: L.Layer) => {
          const zone = feature?.properties?.zone ?? '';
          layer.bindTooltip(zone, { sticky: true });
        },
      }
    ).addTo(this.map);
  }

  back(): void {
    if (this.currentDistrict) {
      this.drillToDistricts(this.currentState ?? '');
    } else {
      this.renderStates();
      this.drillDownMode = 'district';
    }
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