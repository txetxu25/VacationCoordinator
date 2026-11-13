import { useState } from 'react';
import { type Settings, spreadsheetIdFrom } from './settings';

export function Setup({ settings, onSave }: { settings: Settings; onSave: (s: Settings) => void }) {
  const [clientId, setClientId] = useState(settings.clientId);
  const [sheet, setSheet] = useState(settings.spreadsheetId);
  const ready = clientId.trim() && sheet.trim();
  return (
    <main className="center setup">
      <h1>Coordinador de vacaciones</h1>
      <p>Conecta la app con vuestra hoja de cálculo de Google. Solo hay que hacerlo una vez en cada dispositivo.</p>
      <label>
        Enlace de la hoja de cálculo
        <input value={sheet} onChange={(e) => setSheet(e.target.value)} placeholder="https://docs.google.com/spreadsheets/d/…" />
      </label>
      <label>
        ID de cliente de Google (OAuth)
        <input value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder="….apps.googleusercontent.com" />
      </label>
      <button
        className="primary"
        disabled={!ready}
        onClick={() => onSave({ mode: 'google', clientId: clientId.trim(), spreadsheetId: spreadsheetIdFrom(sheet) })}
      >
        Conectar
      </button>
      <button className="link" onClick={() => onSave({ ...settings, mode: 'demo' })}>
        Probar en modo demo (datos solo en este navegador)
      </button>
    </main>
  );
}
