import {
  AfterViewInit,
  Component,
  ElementRef,
  Input,
  OnDestroy,
  OnChanges,
  SimpleChanges,
  ViewChild,
} from '@angular/core';

import * as echarts from 'echarts';

type ChartType = 'line' | 'bar' | 'area';

@Component({
  selector: 'app-telemetry-chart',
  standalone: true,
  templateUrl: './telemetry.html',
  styleUrl: './telemetry.scss',
})
export class TelemetryChartComponent implements AfterViewInit, OnDestroy, OnChanges {
  @Input() chartType: ChartType = 'line';

  /** ✅ Historique (Django) */
  @Input() history: any[] | null = null;

  /** ✅ Point temps réel (MQTT) */
  @Input() point: any = null;

  @ViewChild('chartEl', { static: true }) chartEl!: ElementRef<HTMLDivElement>;

  private chart?: echarts.ECharts;
  private timer?: number;

  private maxPoints = 60;
  private labels: string[] = [];
  private temp: (number | null)[] = [];
  private battery: (number | null)[] = [];
  private rssi: (number | null)[] = [];

  /** ✅ Pour éviter de recharger l'historique plusieurs fois */
  private historyLoaded = false;

  ngAfterViewInit(): void {
    this.chart = echarts.init(this.chartEl.nativeElement);
    this.render();

    this.timer = window.setTimeout(() => this.chart?.resize(), 0);
    window.addEventListener('resize', this.onResize);
  }

  ngOnDestroy(): void {
    if (this.timer) window.clearTimeout(this.timer);
    window.removeEventListener('resize', this.onResize);
    this.chart?.dispose();
  }

  ngOnChanges(changes: SimpleChanges): void {
    // ✅ Si history change (nouveau device / nouveau filtre), on recharge
    if (changes['history']) {
      this.historyLoaded = false;
      this.loadHistoryOnce();
    }

    // ✅ Ajouter point live
    if (changes['point'] && this.point) {
      this.pushPoint(this.point);
    }

    // ✅ Si chartType change, juste re-render
    this.render();
  }

  private onResize = () => this.chart?.resize();

  /** ✅ Charger historique une seule fois */
  private loadHistoryOnce() {
    if (this.historyLoaded) return;
    if (!this.history || this.history.length === 0) return;

    // on vide les buffers avant de remplir
    this.labels = [];
    this.temp = [];
    this.battery = [];
    this.rssi = [];

    // on prend les derniers points
    const last = this.history.slice(-this.maxPoints);

    for (const p of last) {
      // ts en secondes venant de Django (int)
      const label = p?.ts
        ? new Date(p.ts * 1000).toLocaleTimeString()
        : new Date().toLocaleTimeString();

      this.labels.push(label);
      this.temp.push(this.toNum(p?.temp));
      this.battery.push(this.toNum(p?.battery));
      this.rssi.push(this.toNum(p?.rssi));
    }

    this.historyLoaded = true;
  }

  private pushPoint(p: any) {
    const label = new Date().toLocaleTimeString();

    this.labels.push(label);
    this.temp.push(this.toNum(p?.temp));
    this.battery.push(this.toNum(p?.battery));
    this.rssi.push(this.toNum(p?.rssi));

    if (this.labels.length > this.maxPoints) {
      this.labels.shift();
      this.temp.shift();
      this.battery.shift();
      this.rssi.shift();
    }
  }

  private toNum(v: any): number | null {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  private render() {
    if (!this.chart) return;

    const isArea = this.chartType === 'area';
    const type = this.chartType === 'area' ? 'line' : this.chartType;

    const series = [
      {
        name: 'Temp (°C)',
        type,
        smooth: true,
        showSymbol: false,
        data: this.temp,
        areaStyle: isArea ? {} : undefined,
      },
      {
        name: 'Batterie (%)',
        type,
        smooth: true,
        showSymbol: false,
        data: this.battery,
        areaStyle: isArea ? {} : undefined,
      },
      {
        name: 'RSSI (dBm)',
        type,
        smooth: true,
        showSymbol: false,
        data: this.rssi,
        areaStyle: isArea ? {} : undefined,
      },
    ];

    this.chart.setOption(
      {
        tooltip: { trigger: 'axis' },
        legend: { top: 0 },
        grid: { left: 40, right: 20, top: 35, bottom: 30 },
        xAxis: { type: 'category', data: this.labels },
        yAxis: { type: 'value' },
        series,
      },
      { notMerge: true }
    );
  }
}
