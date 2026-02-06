import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import mqtt from 'mqtt';

@Injectable({ providedIn: 'root' })
export class MqttService {
  private client?: mqtt.MqttClient;

  private readonly _status$ = new BehaviorSubject<'disconnected' | 'connecting' | 'connected'>('disconnected');
  public readonly status$ = this._status$.asObservable();

  private readonly _telemetry$ = new BehaviorSubject<any>(null);
  public readonly telemetry$ = this._telemetry$.asObservable();

  connect(url = 'ws://127.0.0.1:9001', topic = 'drone/telemetry') {
    if (this.client?.connected) return;

    this._status$.next('connecting');
    console.log('[MQTT] Connecting to', url);

    this.client = mqtt.connect(url, {
      clientId: 'drone-ui-' + Math.random().toString(16).slice(2),
      reconnectPeriod: 1000,
      keepalive: 30,
      clean: true,
    });

    this.client.on('connect', () => {
      console.log('[MQTT] Connected');
      this._status$.next('connected');
      this.client?.subscribe(topic, { qos: 0 });
    });

    this.client.on('message', (_t, payload) => {
      try {
        this._telemetry$.next(JSON.parse(payload.toString()));
      } catch {
        // ignore non JSON
      }
    });

    this.client.on('reconnect', () => this._status$.next('connecting'));
    this.client.on('close', () => this._status$.next('disconnected'));

    this.client.on('error', (err) => {
      console.error('[MQTT] Error', err);
      this._status$.next('disconnected');
    });
  }

  disconnect() {
    this.client?.end(true);
    this.client = undefined;
    this._status$.next('disconnected');
  }
}
