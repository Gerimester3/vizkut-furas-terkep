# Nyugat-Dunántúl fúrási térkép (HUGEO)

Valódi HUGEO / SZTFH fúrási pontokat megjelenítő webalkalmazás. Nincs demo / kitalált adat.

## Indítás (Windows)

```bat
start.bat
```

vagy:

```bat
npm install
npm start
```

Majd nyisd meg: [http://localhost:3000](http://localhost:3000)

## Mit csinál

- HUGEO MapServer layer felderítés (`?f=pjson`) — nem hardcode-olt FeatureType
- Bounding box alapú lekérdezés (debounce a `moveend` eseményre)
- Leaflet + clustering, mélység szerinti színezés
- Cím / település keresés (Nominatim, backend proxyn keresztül)
- Mélységszűrés és 5 / 10 / 20 km sugárelemzés
- Diagnosztikai panel (kapcsolat, layer, mezők, rekordszám)

## Fontos

A **teljes fúrásmélység (talpmélység) nem azonos a vízadó réteg mélységével.**

## Adatforrás

- REST: `https://map.hugeo.hu/arcgis/rest/services/furas/map_frs_fdt_web_mercator/MapServer`
- WFS / WMS: ugyanazon MapServer kiterjesztései

## Követelmény

Node.js 18+
