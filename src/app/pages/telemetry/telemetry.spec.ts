import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TelemetryChartComponent } from './telemetry';

describe('TelemetryComponent', () => {
  let component: TelemetryChartComponent;
  let fixture: ComponentFixture<TelemetryChartComponent>;
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TelemetryChartComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(TelemetryChartComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
