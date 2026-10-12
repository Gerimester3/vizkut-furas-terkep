# AGENT.md — Magyarországi fúrás- és vízkút térképes kutató webapp

## Feladat

Készíts egy valóban működő, futtatható webalkalmazást, amely Magyarország korábbi fúrásait / kútadatait interaktív térképen jeleníti meg.

Első tesztterület: **Nyugat-Dunántúl**.

A cél nem statikus látványterv, hanem valódi adatforrásból működő alkalmazás, amely megmutatja:
- hol történt korábbi fúrás,
- milyen mélységig történt a fúrás,
- milyen adatok érhetők el az adott fúrásról,
- később pedig milyen földtani és vízföldtani következtetések vonhatók le.

## KRITIKUS

**Ne használj kamu/demo fúrásokat.**

A térképen megjelenő pontoknak hivatalos HUGEO / SZTFH adatokból kell származniuk. Ne generálj véletlenszerű koordinátákat és ne helyezz el kézzel példapontokat.

Ha az adatforrás nem működik, azt egyértelműen jelezd. Ne állítsd, hogy adatok betöltődtek, ha 0 rekord érkezett.

## Hivatalos adatforrások

HUGEO WFS:

```text
https://map.hugeo.hu/arcgis/services/furas/map_frs_fdt_web_mercator/MapServer/WFSServer
```

HUGEO WMS:

```text
https://map.hugeo.hu/arcgis/services/furas/map_frs_fdt_web_mercator/MapServer/WMSServer
```

A szolgáltatás aktuális struktúráját futtatáskor kell lekérni. Ne feltételezz vakon FeatureType-ot vagy mezőnevet.

## Korábbi hibák, amelyeket el kell kerülni

### 1. Kitalált WFS layer

Ne hardcode-old a FeatureType nevét.

Folyamat:

```text
GetCapabilities
→ FeatureType-ok elemzése
→ megfelelő réteg kiválasztása
→ GetFeature
→ GeoJSON
→ Leaflet
```

### 2. CORS

Ne közvetlenül a böngészőből hívd a HUGEO WFS-t.

Használj:

```text
Browser
  ↓
Node.js / Express proxy
  ↓
HUGEO
```

### 3. Rossz ArcGIS layer

Ne feltételezd, hogy a layer ID `0`, vagy hogy egy korábban talált URL biztosan aktuális.

Derítsd fel:

```text
https://map.hugeo.hu/arcgis/rest/services/furas/map_frs_fdt_web_mercator/MapServer?f=pjson
```

A válaszból keresd meg a tényleges `layers` listát, majd ellenőrizd:
- layer id,
- layer name,
- geometryType,
- objectIdField,
- fields.

## Technológia

Ajánlott:
- Node.js 18+
- Express
- Leaflet
- React + Vite opcionális

Egyszerű HTML/CSS/JS is elfogadható.

## Térkép

Kezdőnézet: Nyugat-Dunántúl.

Kb.:

```text
lat: 47.1
lon: 16.9
zoom: 8–9
```

Legyen:
- zoom,
- pan,
- kattintás,
- címkeresés,
- településkeresés.

## Fúrási pontok

A legfontosabb funkció:

**A térképen tényleges korábbi fúrási pontok jelenjenek meg.**

Minden pont:
- valódi koordinátából származzon,
- legyen kattintható,
- kapcsolódjon a forrásrekordhoz.

Nagy adatmennyiségnél használj clusteringet vagy canvas renderelést.

## Mélység

Ha van teljes fúrásmélység/talpmező, a pontok színezése:

```text
0–50 m       kék
50–100 m     narancs
100–200 m    piros
200+ m       lila
nincs adat   szürke
```

A mező nevét ne hardcode-old. Vizsgáld meg a tényleges `fields` és rekordadatokat.

Lehetséges nevek csak példaként:
- depth
- DEPTH
- melyseg
- MELYSEG
- mélység
- talp
- FURAS_MELY

## Popup

Pontra kattintva legalább:
- FRS ID / azonosító, ha van,
- koordináta,
- település, ha van,
- fúrás éve,
- teljes mélység,
- további elérhető attribútumok.

Legyen egy „Összes adat” rész is.

## Dinamikus mezőkezelés

Ne feltételezd, hogy minden rekord azonos mezőkkel rendelkezik.

Használd:
```js
Object.keys(properties)
```

A releváns mezőket próbáld felismerni, de az ismeretlen mezőket ne dobd el.

## Térképi lekérés

Ne töltsd le egész Magyarország összes rekordját egyszerre.

Az aktuális bounding box alapján kérdezz:

```text
minLon,minLat,maxLon,maxLat
```

A `moveend` eseményt debounce-old kb. 500–1000 ms-ra.

Nagy területnél jelezd, hogy zoomoljon közelebb.

## Címkeresés

Legyen:

```text
[ Település vagy cím ] [ Keresés ]
```

Példa:
```text
Pápa
```

A térkép ugorjon a helyre, majd töltse be a közeli fúrásokat.

Használható Nominatim / OpenStreetMap, lehetőleg backend proxyval.

## Mélységszűrés

Legyen:
```text
Összes
50 m+
100 m+
200 m+
500 m+
```

Később minimum + maximum mező is legyen.

## Sugár alapú elemzés

Választható:
```text
5 km
10 km
20 km
```

A felhasználó kattintson egy pontra. Rajzolj kört, majd számold a körön belüli fúrásokat.

Mutasd:
- fúrások száma,
- átlagos mélység,
- medián mélység,
- minimum,
- maximum.

## FONTOS szakmai különbség

**A teljes fúrásmélység nem azonos a vízadó réteg mélységével.**

Ne következtesd azt, hogy:
> „150 m-es fúrás van itt, tehát 150 m-en van a víz.”

A vízadó réteghez további adatok kellenek:
- rétegsor,
- vízadó intervallum,
- vízszint,
- kútkiképzés,
- szűrőzés,
- hidrogeológiai adatok.

## Következő fejlesztés: rétegsor

Ha strukturált adat elérhető, jeleníts meg függőleges profilt:

```text
0 m
│
├── termőtalaj
├── agyag
├── homok
├── kavicsos homok ← lehetséges vízadó
├── agyag
└── 150 m
```

## Vízadó réteg becslés

Csak megfelelő adatok alapján adj becslést.

Különítsd el:
```text
TÉNYADAT
```
és:
```text
BECSLÉS
```

## Heatmap

Későbbi funkció:

„Valószínű vízadó mélység”

Lehetséges kategóriák:
```text
50–70 m
70–90 m
90–120 m
120–150 m
150 m+
```

**Ne készíts heatmapet pusztán teljes fúrásmélységekből.**

## 5 / 10 / 20 km összehasonlítás

Egy címnél hasonlítsd össze:

| Sugár | Fúrások | Medián mélység | Vízzadó intervallum |
|---|---:|---:|---|
| 5 km | ... | ... | ... |
| 10 km | ... | ... | ... |
| 20 km | ... | ... | ... |

## Bizonytalanság

A későbbi vízadó-becsléshez legyen:
- becsült mélység,
- valószínű tartomány,
- bizonyossági szint.

A bizonyosság függjön:
- közeli fúrások számától,
- távolságától,
- adatok minőségétől,
- rétegsor meglététől,
- geológiai modell minőségétől.

## HUGEO 3D Geológia

Vizsgáld meg:
```text
https://map.hugeo.hu/3d_foldtan/
```

Később integrálható a földtani modell a kiválasztott koordinátához.

## WMS fallback

Használd fallbackként:

```text
https://map.hugeo.hu/arcgis/services/furas/map_frs_fdt_web_mercator/MapServer/WMSServer
```

WMS csak vizuális térképi réteg; részletes kattintható attribútumokhoz strukturált WFS/REST adat kell.

## Diagnosztikai panel

Legyen fejlesztői állapot:

```text
HUGEO kapcsolat: OK
Service: ...
Layer ID: ...
Layer name: ...
Geometry: Point
Rekordok: ...
Mélységmező: ...
```

Ha 0 rekord:
> „A lekérdezés 0 fúrást adott vissza.”

Ne legyen hamis „sikeres betöltés”.

## Kötelező indulási ellenőrzés

1. `MapServer?f=pjson`
2. layer lista
3. tényleges Point layer
4. fields lista
5. ObjectID / geometry / depth / year / FRS_ID azonosítása, ha létezik
6. bounding box query
7. ellenőrzés: `features.length > 0`
8. ellenőrzés: van geometry
9. ellenőrzés: Point geometry
10. pontok megjelenítése

## UI

Modern, egyszerű, nem túlzsúfolt.

Bal oldali panel például:

```text
Nyugat-Dunántúl fúrási térkép

[ Cím / település ] [ Keresés ]

Minimum mélység
[ Összes ▼ ]

Elemzési sugár
[ 10 km ▼ ]

[ Pont kijelölése ]

Fúrások
123

Átlagmélység
94 m

Minimum
12 m

Maximum
248 m
```

A térkép legyen a fő elem.

## Projektstruktúra

```text
project/
├── AGENT.md
├── README.md
├── package.json
├── server.js
├── .env.example
├── public/
│   ├── index.html
│   ├── app.js
│   └── style.css
└── src/
    ├── huggeo/
    │   ├── capabilities.js
    │   ├── layers.js
    │   └── query.js
    ├── analysis/
    │   ├── radius.js
    │   ├── depth.js
    │   └── statistics.js
    └── geocoding/
        └── nominatim.js
```

## Windows indítás

Készüljön `start.bat`:

```bat
@echo off
cd /d "%~dp0"

if not exist node_modules (
    call npm install
)

start "" cmd /c "timeout /t 2 >nul & start http://localhost:3000"

npm start
```

## Tesztelési checklist

- [ ] npm install működik
- [ ] szerver elindul
- [ ] frontend betölt
- [ ] térkép betölt
- [ ] HUGEO metadata lekérhető
- [ ] tényleges Point layer azonosítható
- [ ] tényleges rekordok lekérhetők
- [ ] legalább egy rekord geometry-je Point
- [ ] valódi pontok látszanak
- [ ] pont kattintható
- [ ] popup működik
- [ ] mélység megjelenik, ha van
- [ ] mélységszűrés működik
- [ ] címkeresés működik
- [ ] térképmozgatás után új adatok tölthetők
- [ ] 5/10/20 km elemzés működik
- [ ] 0 rekordnál korrekt hiba jelenik meg
- [ ] HUGEO forrás fel van tüntetve
- [ ] nincs kitalált adat

## Fejlesztési sorrend

### Fázis 1 — kötelező minimum

```text
HUGEO
 ↓
backend
 ↓
tényleges layer felderítése
 ↓
GeoJSON / objektumok
 ↓
Leaflet
 ↓
valódi fúrási pontok
```

### Fázis 2

- popup
- mélység
- színezés
- szűrés
- keresés

### Fázis 3

- 5/10/20 km
- statisztikák
- medián
- eloszlás

### Fázis 4

- rétegsor
- vízadó intervallum
- vízszint
- kútkiképzés

### Fázis 5

- vízadó mélység becslés
- bizonytalanság
- heatmap
- HUGEO 3D geológia

## Végső utasítás az AI agentnek

**Ne csak tervezz. Implementálj.**

A végén teljesen futtatható projektet adj át.

A legfontosabb mérföldkő:

> A felhasználó megnyitja a térképet, Nyugat-Dunántúlra zoomol, és valódi korábbi fúrási pontokat lát. Egy pontra kattintva meg tudja nézni a forrásrekord adatait és — ha a forrásban elérhető — a fúrás mélységét.

A siker nem egy szép üres térkép.

A siker:
```text
valós HUGEO adatok
+
valós koordináták
+
kattintható fúrások
+
mélység
+
szűrés
+
sugár elemzés
```
