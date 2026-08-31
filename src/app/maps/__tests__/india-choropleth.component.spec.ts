import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { IndiaChoroplethComponent } from '../india-choropleth.component';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';

describe('IndiaChoroplethComponent', () => {
  let component: IndiaChoroplethComponent;
  let fixture: ComponentFixture<IndiaChoroplethComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        IndiaChoroplethComponent,
        HttpClientTestingModule,
        NoopAnimationsModule,
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(IndiaChoroplethComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create the component', () => {
    expect(component).toBeTruthy();
  });

  it('should initialize with district mode', () => {
    expect(component.drillDownMode).toBe('district');
  });

  it('should toggle drill-down mode to city', () => {
    component.drillDownMode = 'city' as const;
    fixture.detectChanges();
    expect(component.drillDownMode).toBe('city');
  });

  it('should have initial state null', () => {
    expect(component.currentState).toBeNull();
  });

  it('should toggle micromarkets', () => {
    expect(component.showMicromarkets).toBeFalse();
    component.toggleMicromarkets();
    expect(component.showMicromarkets).toBeTrue();
    component.toggleMicromarkets();
    expect(component.showMicromarkets).toBeFalse();
  });

  it('should have back method', () => {
    expect(component.back).toBeDefined();
  });
});