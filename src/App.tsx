import React, { useEffect, useRef, useState } from 'react';
import type { Medication, DoseLog, View, Weekday } from './types';
import { getAll, putItem, deleteItem, clearStore, STORES } from './db/indexedDB';
import { todayStr, formatDateLong, formatTime12 } from './utils/dates';
import { requestNotificationPermission, notificationPermission, showLocalNotification, testNotification } from './utils/notifications';
import { downloadIcs } from './utils/ics';
import { compressImage } from './utils/imageCompression';
import { Pill, Calendar, Settings, Home, History, CheckCircle2, Undo2, Plus, Trash2, Pencil, Camera, Download, Upload, Sparkles } from 'lucide-react';
import { SEED_MEDICATIONS } from './data/seed';

const App: React.FC = () => {
  const [medications, setMedications] = useState<Medication[]>([]);
  const [logs, setLogs] = useState<DoseLog[]>([]);
  const [view, setView] = useState<View>('home');
  const [loading, setLoading] = useState(true);
  const notifiedRef = useRef<Set<string>>(new Set());

  // Load data from IndexedDB
  useEffect(() => {
    (async () => {
      try {
        const meds = await getAll<Medication>(STORES.medications);
        const lgs = await getAll<DoseLog>(STORES.logs);
        setMedications(meds);
        setLogs(lgs);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Listen for messages from service worker (notification actions)
  useEffect(() => {
    const handler = (ev: MessageEvent) => {
      const msg = ev.data;
      if (!msg) return;
      if (msg.type === 'DOSE_TAKEN') {
        takeDose(msg.medId, msg.date || todayStr(), msg.time);
      } else if (msg.type === 'SNOOZE') {
        const key = `${msg.medId}-${msg.date}-${msg.time}`;
        notifiedRef.current.delete(key);
        setTimeout(() => {
          const med = medications.find((m) => m.id === msg.medId);
          if (med) {
            showLocalNotification(
              'Recordatorio pospuesto',
              `${med.name} - ${med.dose}`,
              key,
              { medId: med.id, date: msg.date, time: msg.time },
            );
          }
        }, 10 * 60 * 1000);
      }
    };
    navigator.serviceWorker?.addEventListener('message', handler);
    return () => navigator.serviceWorker?.removeEventListener('message', handler);
  }, [medications]);

  // Notification scheduler (every minute)
  useEffect(() => {
    const check = () => {
      if (notificationPermission() !== 'granted') return;
      const now = new Date();
      const hhmm = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
      const today = todayStr();
      const weekday = now.getDay();
      for (const med of medications) {
        if (med.days.length > 0 && !med.days.includes(weekday as any)) continue;
        for (const time of med.times) {
          if (time !== hhmm) continue;
          const log = logs.find((l) => l.medicationId === med.id && l.date === today && l.time === time);
          if (log && log.takenAt) continue;
          const key = `${med.id}-${today}-${time}`;
          if (notifiedRef.current.has(key)) continue;
          notifiedRef.current.add(key);
          showLocalNotification(
            `Hora de tomar ${med.name}`,
            `${med.dose} - ${formatTime12(time)}`,
            key,
            { medId: med.id, date: today, time },
          );
        }
      }
    };
    const id = window.setInterval(check, 60000);
    check();
    return () => window.clearInterval(id);
  }, [medications, logs]);

  async function takeDose(medId: string, date: string, time: string) {
    const id = `${medId}-${date}-${time}`;
    const updated: DoseLog = {
      id,
      medicationId: medId,
      date,
      time,
      takenAt: Date.now(),
    };
    await putItem(STORES.logs, updated);
    setLogs((prev) => {
      const others = prev.filter((l) => l.id !== id);
      return [...others, updated];
    });
  }

  async function undoDose(medId: string, date: string, time: string) {
    const id = `${medId}-${date}-${time}`;
    const updated: DoseLog = {
      id,
      medicationId: medId,
      date,
      time,
      takenAt: null,
    };
    await putItem(STORES.logs, updated);
    setLogs((prev) => {
      const others = prev.filter((l) => l.id !== id);
      return [...others, updated];
    });
  }

  async function saveMedication(med: Medication) {
    await putItem(STORES.medications, med);
    setMedications((prev) => {
      const others = prev.filter((m) => m.id !== med.id);
      return [...others, med];
    });
  }

  async function removeMedication(id: string) {
    await deleteItem(STORES.medications, id);
    setMedications((prev) => prev.filter((m) => m.id !== id));
    // remove related logs
    const related = logs.filter((l) => l.medicationId === id);
    for (const l of related) await deleteItem(STORES.logs, l.id);
    setLogs((prev) => prev.filter((l) => l.medicationId !== id));
  }

  async function loadSeed() {
    for (const m of SEED_MEDICATIONS) {
      await putItem(STORES.medications, m);
    }
    const meds = await getAll<Medication>(STORES.medications);
    setMedications(meds);
  }

  async function exportData() {
    const data = { medications, logs, exportedAt: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `medicheck-backup-${todayStr()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function importData(file: File) {
    const text = await file.text();
    const data = JSON.parse(text);
    if (Array.isArray(data.medications)) {
      for (const m of data.medications) await putItem(STORES.medications, m);
    }
    if (Array.isArray(data.logs)) {
      for (const l of data.logs) await putItem(STORES.logs, l);
    }
    const meds = await getAll<Medication>(STORES.medications);
    const lgs = await getAll<DoseLog>(STORES.logs);
    setMedications(meds);
    setLogs(lgs);
  }


  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-2xl">
        Cargando MediCheck...
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <Header view={view} setView={setView} />
      <main className="max-w-3xl mx-auto p-4 pb-24">
        {view === 'home' && (
          <HomeView
            medications={medications}
            logs={logs}
            onTake={takeDose}
            onUndo={undoDose}
          />
        )}
        {view === 'admin' && (
          <AdminView
            medications={medications}
            onSave={saveMedication}
            onRemove={removeMedication}
            onAlarm={(med) => {
              for (const t of med.times) downloadIcs(med, t);
            }}
          />
        )}
        {view === 'history' && <HistoryView medications={medications} logs={logs} />}
        {view === 'settings' && (
          <SettingsView
            onLoadSeed={loadSeed}
            onExport={exportData}
            onImport={importData}
            onClear={async () => {
              await clearStore(STORES.medications);
              await clearStore(STORES.logs);
              setMedications([]);
              setLogs([]);
            }}
          />
        )}
      </main>
      <BottomNav view={view} setView={setView} />
    </div>
  );
};

// ---------- Header ----------
const Header: React.FC<{ view: View; setView: (v: View) => void }> = ({ view, setView }) => {
  return (
    <header className="bg-gradient-to-r from-[#0F4C81] to-[#1E6BB8] text-white px-5 py-4 flex items-center justify-between sticky top-0 z-10 shadow-lg backdrop-blur">
      <div className="flex items-center gap-2">
        <div className="w-10 h-10 rounded-2xl bg-white/15 flex items-center justify-center">
          <Pill className="w-6 h-6" />
        </div>
        <h1 className="text-2xl font-extrabold tracking-tight">MediCheck</h1>
      </div>
      <button
        onClick={() => setView(view === 'admin' ? 'home' : 'admin')}
        aria-label="Administración"
        className="w-11 h-11 rounded-2xl bg-white/15 hover:bg-white/25 flex items-center justify-center transition"
      >
        <Settings className="w-6 h-6" />
      </button>
    </header>
  );
};

// ---------- Bottom Nav ----------
const BottomNav: React.FC<{ view: View; setView: (v: View) => void }> = ({ view, setView }) => {
  const items: { id: View; label: string; icon: React.ReactNode }[] = [
    { id: 'home', label: 'Hoy', icon: <Home className="w-6 h-6" /> },
    { id: 'history', label: 'Historial', icon: <Calendar className="w-6 h-6" /> },
    { id: 'settings', label: 'Ajustes', icon: <Settings className="w-6 h-6" /> },
  ];
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white/80 backdrop-blur-xl border-t border-white/60 flex justify-around py-2 shadow-2xl">
      {items.map((it) => (
        <button
          key={it.id}
          onClick={() => setView(it.id)}
          className={`flex flex-col items-center gap-1 text-sm px-5 py-2 rounded-2xl transition-all ${
            view === it.id
              ? 'text-[#0F4C81] font-bold bg-blue-50'
              : 'text-gray-500 hover:text-[#0F4C81]'
          }`}
        >
          {it.icon}
          {it.label}
        </button>
      ))}
    </nav>
  );
};

// ---------- Home View ----------
interface HomeProps {
  medications: Medication[];
  logs: DoseLog[];
  onTake: (medId: string, date: string, time: string) => void;
  onUndo: (medId: string, date: string, time: string) => void;
}

const HomeView: React.FC<HomeProps> = ({ medications, logs, onTake, onUndo }) => {
  const today = todayStr();
  const weekday = new Date().getDay();
  const doses: { med: Medication; time: string; log?: DoseLog }[] = [];
  for (const med of medications) {
    if (med.days.length > 0 && !med.days.includes(weekday as any)) continue;
    for (const time of med.times) {
      const log = logs.find((l) => l.medicationId === med.id && l.date === today && l.time === time);
      doses.push({ med, time, log });
    }
  }
  doses.sort((a, b) => a.time.localeCompare(b.time));

  const pending = doses.filter((d) => !d.log?.takenAt);
  const nextPending = pending[0];

  return (
    <div className="space-y-5">
      <div className="animate-fade-in-up">
        <p className="text-base text-gray-500 capitalize font-medium">{formatDateLong(today)}</p>
        {nextPending && (
          <div className="mt-3 p-5 bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-3xl shadow-sm">
            <div className="flex items-center gap-2 text-amber-700 font-semibold text-sm uppercase tracking-wide">
              <Sparkles className="w-4 h-4" /> Próximo medicamento
            </div>
            <p className="text-2xl font-extrabold text-[#0F4C81] mt-1">{nextPending.med.name}</p>
            <p className="text-lg text-gray-700">
              {nextPending.med.dose} · {formatTime12(nextPending.time)}
            </p>
          </div>
        )}
        {doses.length === 0 && (
          <div className="p-8 text-center text-gray-500 text-xl bg-white/60 rounded-3xl border border-dashed border-gray-300">
            No hay medicamentos programados para hoy.
          </div>
        )}
      </div>

      <div className="space-y-4">
        {doses.map((d, i) => {
          const taken = !!d.log?.takenAt;
          return (
            <div
              key={`${d.med.id}-${d.time}`}
              className={`animate-fade-in-up rounded-3xl p-5 shadow-lg border transition-all duration-300 ${
                taken
                  ? 'bg-gradient-to-br from-emerald-50 to-green-100 border-emerald-200'
                  : 'bg-white border-gray-100 hover:shadow-xl hover:-translate-y-0.5'
              }`}
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <div className="flex gap-4 items-start">
                {d.med.photo ? (
                  <img
                    src={d.med.photo}
                    alt={d.med.name}
                    className="w-20 h-20 object-cover rounded-2xl shadow-md border-2 border-white"
                  />
                ) : (
                  <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-100 to-emerald-100 flex items-center justify-center shadow-inner">
                    <Pill className="w-10 h-10 text-[#0F4C81]" />
                  </div>
                )}
                <div className="flex-1">
                  <h2 className="text-2xl font-extrabold text-[#0F4C81] leading-tight">{d.med.name}</h2>
                  <p className="text-lg text-gray-600">{d.med.dose}</p>
                  <div className="inline-flex items-center gap-1.5 mt-1 px-3 py-1 rounded-full bg-blue-50 text-[#0F4C81] font-semibold text-base">
                    <Calendar className="w-4 h-4" /> {formatTime12(d.time)}
                  </div>
                  {taken && d.log?.takenAt && (
                    <p className="text-emerald-700 font-semibold mt-2 flex items-center gap-1.5">
                      <CheckCircle2 className="w-5 h-5" /> Tomada hoy a las{' '}
                      {new Date(d.log.takenAt).toLocaleTimeString('es-ES', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  )}
                </div>
              </div>
              <div className="mt-4">
                {!taken ? (
                  <button
                    onClick={() => onTake(d.med.id, today, d.time)}
                    className="w-full bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 text-white text-2xl font-bold py-4 rounded-2xl shadow-lg hover:shadow-xl active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                  >
                    <CheckCircle2 className="w-7 h-7" /> Ya la tomé
                  </button>
                ) : (
                  <div className="flex items-center justify-between bg-white/60 rounded-2xl px-4 py-3">
                    <span className="text-emerald-700 text-xl font-bold flex items-center gap-2">
                      <CheckCircle2 className="w-6 h-6" /> Completado
                    </span>
                    <button
                      onClick={() => onUndo(d.med.id, today, d.time)}
                      className="text-sm text-gray-500 hover:text-gray-700 underline px-3 py-2 flex items-center gap-1"
                    >
                      <Undo2 className="w-4 h-4" /> Deshacer
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ---------- Admin View ----------
interface AdminProps {
  medications: Medication[];
  onSave: (m: Medication) => void;
  onRemove: (id: string) => void;
  onAlarm: (m: Medication) => void;
}

const AdminView: React.FC<AdminProps> = ({ medications, onSave, onRemove, onAlarm }) => {
  const [editing, setEditing] = useState<Medication | null>(null);
  const [name, setName] = useState('');
  const [dose, setDose] = useState('');
  const [times, setTimes] = useState('08:00');
  const [days, setDays] = useState<Weekday[]>([]);
  const [photo, setPhoto] = useState<string | undefined>(undefined);

  const resetForm = () => {
    setEditing(null);
    setName('');
    setDose('');
    setTimes('08:00');
    setDays([]);
    setPhoto(undefined);
  };

  const startEdit = (m: Medication) => {
    setEditing(m);
    setName(m.name);
    setDose(m.dose);
    setTimes(m.times.join(', '));
    setDays(m.days);
    setPhoto(m.photo);
  };

  const handlePhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const compressed = await compressImage(file);
    setPhoto(compressed);
  };

  const toggleDay = (d: number) => {
    setDays((prev) => (prev.includes(d as Weekday) ? prev.filter((x) => x !== d) : [...prev, d as Weekday]));
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsedTimes = times
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    const med: Medication = {
      id: editing?.id || crypto.randomUUID(),
      name: name.trim(),
      dose: dose.trim(),
      times: parsedTimes,
      days,
      photo,
      createdAt: editing?.createdAt || Date.now(),
    };
    onSave(med);
    resetForm();
  };

  const dayLabels = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

  return (
    <div>
      <h2 className="text-2xl font-extrabold text-[#0F4C81] mb-5 flex items-center gap-2">
        <Pencil className="w-6 h-6" /> Administración de medicamentos
      </h2>

      <form onSubmit={submit} className="bg-white/90 backdrop-blur rounded-3xl p-5 shadow-xl space-y-4 mb-6 border border-white/60">
        <div>
          <label className="block text-lg font-semibold mb-1">Nombre del medicamento</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="w-full text-lg p-3 border-2 rounded-xl"
            placeholder="Ej. Losartán"
          />
        </div>
        <div>
          <label className="block text-lg font-semibold mb-1">Dosis</label>
          <input
            value={dose}
            onChange={(e) => setDose(e.target.value)}
            required
            className="w-full text-lg p-3 border-2 rounded-xl"
            placeholder="Ej. 1 pastilla"
          />
        </div>
        <div>
          <label className="block text-lg font-semibold mb-1">Horas (separadas por coma)</label>
          <input
            value={times}
            onChange={(e) => setTimes(e.target.value)}
            required
            className="w-full text-lg p-3 border-2 rounded-xl"
            placeholder="08:00, 20:00"
          />
        </div>
        <div>
          <label className="block text-lg font-semibold mb-2">Días de la semana (vacío = todos)</label>
          <div className="flex gap-2 flex-wrap">
            {dayLabels.map((lbl, idx) => (
              <button
                type="button"
                key={idx}
                onClick={() => toggleDay(idx)}
                className={`px-3 py-2 rounded-xl border-2 text-lg ${
                  days.includes(idx as Weekday)
                    ? 'bg-[#0F4C81] text-white border-[#0F4C81]'
                    : 'bg-white text-gray-700 border-gray-300'
                }`}
              >
                {lbl}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="block text-lg font-semibold mb-1 flex items-center gap-2">
            <Camera className="w-5 h-5" /> Foto (opcional)
          </label>
          <input type="file" accept="image/*" onChange={handlePhoto} className="text-lg file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:bg-blue-50 file:text-[#0F4C81] file:font-semibold" />
          {photo && <img src={photo} alt="preview" className="mt-2 w-24 h-24 object-cover rounded-2xl shadow-md border-2 border-white" />}
        </div>
        <div className="flex gap-3">
          <button
            type="submit"
            className="flex-1 bg-gradient-to-r from-[#0F4C81] to-[#1E6BB8] text-white text-xl font-bold py-3 rounded-2xl shadow-lg hover:shadow-xl active:scale-[0.98] transition-all flex items-center justify-center gap-2"
          >
            <Plus className="w-6 h-6" /> {editing ? 'Guardar cambios' : 'Agregar medicamento'}
          </button>
          {editing && (
            <button
              type="button"
              onClick={resetForm}
              className="px-4 py-3 rounded-2xl border-2 text-lg"
            >
              Cancelar
            </button>
          )}
        </div>
      </form>

      <div className="space-y-3">
        {medications.map((m) => (
          <div key={m.id} className="bg-white/90 backdrop-blur rounded-3xl p-4 shadow-lg flex items-center gap-4 border border-white/60 hover:shadow-xl transition">
            {m.photo ? (
              <img src={m.photo} alt={m.name} className="w-16 h-16 object-cover rounded-2xl shadow" />
            ) : (
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-100 to-emerald-100 flex items-center justify-center">
                <Pill className="w-8 h-8 text-[#0F4C81]" />
              </div>
            )}
            <div className="flex-1">
              <p className="text-xl font-extrabold text-[#0F4C81]">{m.name}</p>
              <p className="text-lg text-gray-700">{m.dose}</p>
              <p className="text-base text-gray-500 flex items-center gap-1.5">
                <Calendar className="w-4 h-4" /> {m.times.join(' · ')}
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => startEdit(m)}
                className="w-11 h-11 rounded-2xl bg-blue-50 text-[#0F4C81] flex items-center justify-center hover:bg-blue-100 transition"
                aria-label="Editar"
              >
                <Pencil className="w-5 h-5" />
              </button>
              <button
                onClick={() => onAlarm(m)}
                className="w-11 h-11 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center hover:bg-amber-100 transition"
                title="Añadir alarma al calendario"
                aria-label="Alarma"
              >
                <Download className="w-5 h-5" />
              </button>
              <button
                onClick={() => onRemove(m.id)}
                className="w-11 h-11 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center hover:bg-red-100 transition"
                aria-label="Eliminar"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ---------- History View ----------
interface HistoryProps {
  medications: Medication[];
  logs: DoseLog[];
}

const HistoryView: React.FC<HistoryProps> = ({ medications, logs }) => {
  const days = 14;
  const today = new Date();
  const list: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const y = d.getFullYear();
    const m = (d.getMonth() + 1).toString().padStart(2, '0');
    const dd = d.getDate().toString().padStart(2, '0');
    list.push(`${y}-${m}-${dd}`);
  }

  return (
    <div>
      <h2 className="text-2xl font-extrabold text-[#0F4C81] mb-5 flex items-center gap-2">
        <History className="w-6 h-6" /> Historial de cumplimiento
      </h2>
      <div className="space-y-3">
        {list.map((date) => {
          // scheduled doses that day
          const wd = new Date(date + 'T00:00:00').getDay();
          const scheduled: { med: Medication; time: string }[] = [];
          for (const med of medications) {
            if (med.days.length > 0 && !med.days.includes(wd as any)) continue;
            for (const t of med.times) scheduled.push({ med, time: t });
          }
          const takenCount = scheduled.filter((s) =>
            logs.some((l) => l.medicationId === s.med.id && l.date === date && l.time === s.time && l.takenAt),
          ).length;
          const total = scheduled.length;
          const isToday = date === todayStr();
          return (
            <div key={date} className="bg-white/90 backdrop-blur rounded-3xl p-4 shadow-lg border border-white/60">
              <div className="flex items-center justify-between">
                <p className="text-lg font-semibold capitalize text-gray-700">
                  {new Date(date + 'T00:00:00').toLocaleDateString('es-ES', {
                    weekday: 'short',
                    day: 'numeric',
                    month: 'short',
                  })}
                </p>
                <span
                  className={`px-3 py-1 rounded-full text-sm font-bold ${
                    total === 0
                      ? 'bg-gray-100 text-gray-400'
                      : takenCount === total
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-amber-100 text-amber-700'
                  }`}
                >
                  {takenCount}/{total}
                </span>
              </div>
              {scheduled.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {scheduled.map((s) => {
                    const log = logs.find(
                      (l) => l.medicationId === s.med.id && l.date === date && l.time === s.time,
                    );
                    const done = !!log?.takenAt;
                    return (
                      <li key={`${s.med.id}-${s.time}`} className="flex items-center justify-between text-base">
                        <span>
                          {s.med.name} - {formatTime12(s.time)}
                        </span>
                        <span className={done ? 'text-green-600' : isToday ? 'text-gray-400' : 'text-red-500'}>
                          {done
                            ? '✅'
                            : isToday
                            ? '⏳'
                            : '❌'}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ---------- Settings View ----------
interface SettingsProps {
  onLoadSeed: () => void;
  onExport: () => void;
  onImport: (f: File) => void;
  onClear: () => void;
}

const SettingsView: React.FC<SettingsProps> = ({ onLoadSeed, onExport, onImport, onClear }) => {
  const [perm, setPerm] = useState(notificationPermission());

  const enableNotif = async () => {
    const p = await requestNotificationPermission();
    setPerm(p);
  };

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-extrabold text-[#0F4C81] mb-5 flex items-center gap-2">
        <Settings className="w-6 h-6" /> Ajustes
      </h2>

      <div className="bg-white/90 backdrop-blur rounded-3xl p-5 shadow-lg space-y-3 border border-white/60">
        <h3 className="text-xl font-bold text-gray-800">Notificaciones</h3>
        <p className="text-base text-gray-600">
          Estado: <strong>{perm}</strong>
        </p>
        <button
          onClick={enableNotif}
          className="w-full bg-gradient-to-r from-[#0F4C81] to-[#1E6BB8] text-white text-lg font-bold py-3 rounded-2xl shadow-lg hover:shadow-xl active:scale-[0.98] transition-all"
        >
          Activar notificaciones
        </button>
        <button
          onClick={() => testNotification()}
          className="w-full bg-gray-100 text-gray-700 text-lg font-bold py-3 rounded-2xl hover:bg-gray-200 transition"
        >
          Probar notificación
        </button>
      </div>

      <div className="bg-white/90 backdrop-blur rounded-3xl p-5 shadow-lg space-y-3 border border-white/60">
        <h3 className="text-xl font-bold text-gray-800">Datos</h3>
        <button
          onClick={onLoadSeed}
          className="w-full bg-emerald-100 text-emerald-700 text-lg font-bold py-3 rounded-2xl hover:bg-emerald-200 transition flex items-center justify-center gap-2"
        >
          <Sparkles className="w-5 h-5" /> Cargar ejemplo
        </button>
        <button
          onClick={onExport}
          className="w-full bg-blue-100 text-[#0F4C81] text-lg font-bold py-3 rounded-2xl hover:bg-blue-200 transition flex items-center justify-center gap-2"
        >
          <Download className="w-5 h-5" /> Exportar respaldo (.json)
        </button>
        <label className="block w-full bg-gray-100 text-gray-700 text-lg font-bold py-3 rounded-2xl text-center cursor-pointer hover:bg-gray-200 transition flex items-center justify-center gap-2">
          <Upload className="w-5 h-5" /> Importar respaldo (.json)
          <input
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onImport(f);
            }}
          />
        </label>
        <button
          onClick={() => {
            if (confirm('¿Borrar todos los datos?')) onClear();
          }}
          className="w-full bg-red-100 text-red-700 text-lg font-bold py-3 rounded-2xl hover:bg-red-200 transition flex items-center justify-center gap-2"
        >
          <Trash2 className="w-5 h-5" /> Borrar todo
        </button>
      </div>
    </div>
  );
};

export default App;