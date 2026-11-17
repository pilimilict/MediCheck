# MediCheck

PWA open source para recordar la toma de medicamentos, diseñada con accesibilidad extrema para adultos mayores.

## Características (MVP)

- Funciona 100% offline (Service Worker + IndexedDB).
- Vista diaria con tarjetas grandes y botón "Ya la tomé".
- Panel de administración (⚙️) para agregar/editar/eliminar medicamentos, foto, días y horas.
- Historial de cumplimiento de los últimos 14 días.
- Notificaciones locales con acciones.
- Descarga de alarma `.ics` para el calendario del teléfono.
- Respaldo/importación en JSON.
- Datos de ejemplo cargables desde Ajustes.

## Stack

- React 19 + TypeScript + Vite
- Tailwind CSS v4
- vite-plugin-pwa (injectManifest)
- IndexedDB (sin backend)

## Instalación

```bash
npm install
npm run dev
```

Abrir `http://localhost:5173`.

## Build de producción

```bash
npm run build
npm run preview
```

## Licencia

MIT
```