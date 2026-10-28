"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { STREETS } from "../lib/data";
import { fmtNum, type Lang } from "../lib/i18n";
import { Wordmark } from "./brand/Logo";
import { useHref, useLang } from "./LangProvider";
import LangSwitch from "./LangSwitch";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";

// CSV column names and template content are a file format, never translated.
const REQUIRED = ["place", "time", "pm1", "pm2.5", "pm4", "pm10", "temperature", "humidity", "close_pass_distance_cm"];

const CSV_TEMPLATE = [
  "place,time,pm1,pm2.5,pm4,pm10,temperature,humidity,close_pass_distance_cm",
  "Bergstrasse,2026-07-14T08:15:00,8,12,15,18,24.5,55,120",
  "Salzstrasse,2026-07-14T08:22:00,10,14,17,21,25.1,58,95",
].join("\n");

const GEOJSON_TEMPLATE = JSON.stringify(
  {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        geometry: { type: "Point", coordinates: [9.22, 49.14] },
        properties: {
          place: "Bergstrasse",
          time: "2026-07-14T08:15:00",
          pm1: 8,
          "pm2.5": 12,
          pm4: 15,
          pm10: 18,
          temperature: 24.5,
          humidity: 55,
          close_pass_distance_cm: 120,
        },
      },
    ],
  },
  null,
  2
);

const SOURCE_URLS = [
  "https://globalinnovationgathering.org/2025/12/17/senseboxbike-citizen-science/",
  "https://www.wecity.nl/en/snifferbike",
  "https://pubmed.ncbi.nlm.nih.gov/41305305/",
  "https://www.nature.com/articles/s41612-025-01216-4",
  "https://environment.ec.europa.eu/news/air-pollution-data-citizen-operated-sensors-improved-novel-quality-control-system-2025-11-06_en",
  "https://www.mdpi.com/1424-8220/26/20/6441",
  "https://egusphere.copernicus.org/preprints/2025/egusphere-2025-5194/egusphere-2025-5194-manuscript-version2.pdf",
  "https://dec.ny.gov/sites/default/files/2024-08/aclimamethod.pdf",
  "https://www.frontiersin.org/journals/environmental-health/articles/10.3389/fenvh.2023.1232867/full",
  "https://www.heilbronn.de/fileadmin/daten/stadtheilbronn/formulare/umwelt_mobilitaet/EGC/European_Green_Capital_Bewerbung_Heilbronn_2027.pdf",
  "https://elib.dlr.de/225306/1/HHN_EGU26-10792.html.pdf",
  "https://moewex.github.io/academic/publication/2020-simra/2020-simra.pdf",
  "https://link.springer.com/article/10.1186/s12544-025-00760-7",
  "https://sensebox.github.io/en/osem",
  "https://pmc.ncbi.nlm.nih.gov/articles/PMC10404226/",
  "https://www.b-tu.de/en/news/article/19779-mit-dem-fahrrad-forschen-fuer-mehr-sicherheit-auf-brandenburgs-strassen",
  "https://scambs.moderngov.co.uk/documents/s141417/Appendix%20B%20-%20Zephyr%20report%20-%20Comberton.pdf",
];

const EN = {
  title: "How to collect data",
  tagline: "Good data first. A street score is only as good as the rides and stations behind it.",
  badgeDev: "DEV MODE, DEMO ONLY",
  intro1:
    "This page is in dev mode and demo only. It is not official city data, and street scores here are still a sample, not official measurements. This page is for the city and the hackathon organisers. It shows how to collect street data in a clean way, and how to try a new file at once in this page.",
  intro2:
    "Nothing on this page sends data to a server, and nothing here changes the home page list. An upload changes only the demo list on this page, until you reload or clear it. Nothing here tracks a person.",
  back: "Back to the route map",
  rulesAria: "Important rules",
  rulesH: "Three rules first",
  rulesP:
    "Street scores are historical screening, not live data, and not a legal compliance measurement. Use only data from the organisers and partners, ATRAI, openSenseMap, heat walks, and OpenStreetMap. Do not invent a street score, a ride count, or any other number to fill a gap. If data is missing, mark the street as little data.",
  collectAria: "How to collect",
  collectH: "1. How to collect",
  cards: [
    {
      h: "Fixed stations anchor time and calibration",
      p: "Fixed school stations measure day and night. They show the daily curve, the season curve, and school gate peaks. They also anchor the bike data in time. Heilbronn already has two official LUBW stations, one traffic station and one background station. Use them as the reference, do not build a second calibration chain from scratch if you can partner with them.",
    },
    {
      h: "Bike sensors give street detail",
      p: "senseBox:bike on a normal ride measures dust, temperature, humidity, overtaking distance, road surface, and speed, with GPS. This is how a street gets its own score. But bikes only ride where cyclists ride, so bike data alone will miss side streets and school streets.",
    },
    {
      h: "Assigned walking routes fill the gaps",
      p: "Walk the streets bikes miss. Plan the same walking routes each time, on side streets and school streets, at pavement height. For heat, walk on clear, calm warm nights, and also in daytime shade. Log sun or shade and surface with each point, because sun on asphalt is not the same as shade.",
    },
    {
      h: "Fleet vehicles only as a bonus",
      p: "Buses or waste trucks can repeat the same main roads for months, with power and care built in. They are a bonus only, and only if the city and the operator agree in writing. They still miss side streets, and their own exhaust and heat must be controlled. Do not promise fleet coverage until the agreement is signed.",
    },
  ],
  satellite:
    "Satellite heat is a surface model, not the air temperature people feel. Use it only to choose where to measure next, and label it as modelled.",
  qualityAria: "Quality checks",
  qualityH: "2. Quality checks",
  quality: [
    ["Co-location first:", "Put every new sensor next to a reference station for 2 weeks before it goes out, on dry days and humid days, if possible. That is the step that makes a low cost sensor trustworthy."],
    ["Golden units:", "Keep 1 or 2 units at the background station all the time. Compare other units to them, so drift shows up fast."],
    ["Humidity correction:", "Always log humidity and temperature with dust, at the same time, from the same unit. Dust without humidity cannot be corrected. Humid readings over 75 percent can overstate dust, so they are removed in the staged check."],
    ["Ventilated temperature housing:", "Do not mount a temperature sensor in direct sun on a dark box, or against the rider body. Sun and low wind can bias it by more than 1 to 2 degrees."],
    ["Re-check every season:", "Re-run a short co-location each season, and after any repair, cleaning, or software change. Record the calibration version with every dataset, so a score can be reproduced."],
    ["Outliers and stuck sensors:", "Flag a sensor that repeats the same value for hours, a value outside the valid range, or a single channel spike. Those rows stay internal only, never in a public score."],
  ] as [string, string][],
  gateAria: "Coverage gate",
  gateH: "3. Coverage gate",
  badgeProposal: "PROPOSAL",
  gateIntro:
    "These gates are a proposal built from published ranges, not a published finding. They stop a thin street from becoming Fix Number 1.",
  gateCols: ["Level", "Rule", "What it means"],
  gateRows: [
    ["Screening", "At least 10 passes over at least 5 days", "Show it greyed, as indicative only."],
    ["Trusted", "At least 20 passes over at least 10 days, in at least 3 time bands", "Only trusted streets can be ranked for a fix."],
    ["Close pass rate", "At least 20 overtakes on the street", "Below that, show the count and say too few overtakes to rank. Never show 0 percent or 100 percent from 1 or 2 events."],
    ["Too little data", "Below screening", "Show as not yet measured. Check on the ground first, no automatic fix."],
  ] as [string, string, string][],
  gateBundles:
    "Assign route bundles, not free rides. Each rider gets a mix, for example 1 busy road, 1 side street, 1 school street, and 1 green alternative. Recruit where data is missing, through schools, clubs, and cargo bike parents, with loan kits, not only riders who already own a kit.",
  timeAria: "Time rules",
  timeH: "4. Time rules",
  timeList: [
    "Tag every point with season, school term or holiday, and time of day. Do not compare summer heat with winter bike data directly. Compare the same season.",
    "School scores use term time only. Holiday rides help the yearly layers, but they do not belong in a school peak score.",
    "For trusted status, cover at least 3 time bands, for example morning peak, midday, and afternoon or evening. A street ridden only at noon gets a noon score, not an all day score.",
    "Keep night heat and daytime comfort as two layers. A tree lined street can be cool at night and hot in sun, or the other way round.",
    "After a fix is built, measure again with the same protocol, in the same season window, and report before and after with uncertainty. One ride after a fix proves nothing.",
  ],
  privacyAria: "Privacy",
  privacyH: "5. Privacy",
  privacyList: [
    "Publish street averages only, never personal ride tracks. Raw tracks stay access controlled, never public, and never shown to the city as tracks.",
    "Crop the start and end of every ride, about 200 m, so a home or school address does not leak from a track. For school campaigns, start at a neutral meeting point, not the school gate.",
    "Suppress any segment or time cell with few riders or days. Show insufficient data, not a number that could single out one rider commute.",
    "Do not use cameras, number plates, audio, or phone contacts. Overtake sensors measure distance only, not identity.",
    "For school routes, prefer adult riders on the school route, plus fixed school gate stations and walking audits, rather than tracking children.",
  ],
  uploadAria: "Upload and stage data",
  uploadH: "6. Upload data in dev mode",
  uploadIntro:
    "If you already have data, use the template below. Your file is checked in this browser only. It is not sent anywhere and not stored. In dev mode, a file that passes the checks is applied straight away in this page, as demo only.",
  templateH: "Template columns",
  templateP:
    "place, time, pm1, pm2.5, pm4, pm10, temperature, humidity, close_pass_distance_cm. Place is a street name only, not a home address. Time is a date and time, for example 2026-07-14T08:15:00. Temperature is in degrees Celsius. Humidity is in percent. Close pass distance is in centimetres, and can be blank for walking rows.",
  dlCsv: "Download CSV template",
  dlGeo: "Download GeoJSON template",
  checkH: "Check a file in this browser",
  fileLabel: "Choose a CSV or GeoJSON file",
  checkNote: "Checks run in your browser only. No file leaves this page. No server receives it.",
  okB: "Applied in this page, dev mode, demo only.",
  okRest:
    " This is not official city data. The uploaded rows below are now shown in this page, and demo street values that match by street name are updated in the list below. This change lives only in this page. Reload the page, or tap Clear uploaded data, to go back to the original demo list.",
  failB: "Not ready yet. Fix the failed checks below, then check the file again.",
  checksH: "Checks",
  notesH: "Notes",
  errorsH: "Failed checks, fix these",
  previewH: "Preview, first rows",
  uploadedH: "Uploaded data list",
  uploadedP:
    "Grouped by street name. A street name is matched to the demo list without case and without German letter differences, so Bergstrasse matches Bergstraße. Unmatched streets are shown too, but they do not change a demo score.",
  uploadedCols: ["Place", "Rows", "Avg close pass", "Avg PM10", "Avg PM2.5", "Avg temp", "Date range", "Matched demo street"],
  noValue: "No value",
  noMatch: "No match in demo list",
  noDate: "No date",
  range: (a: string, b: string) => `${a} to ${b}`,
  demoH: "Demo street values updated in this page",
  noChange:
    "No demo street score changed, because no matched street had a close pass distance in the upload. The uploaded list above still shows. Add a close pass distance to change a demo score, using the same formula as the demo list: score equals 100 minus average close pass distance in cm divided by 2.",
  changed: (oldS: number | null, newS: number | null, avgCm: string, rows: number) =>
    ` demo score ${oldS} to ${newS}, from average close pass ${avgCm} cm in ${rows} uploaded rows. This is demo only, in this page only.`,
  clear: "Clear uploaded data",
  devH: "What dev mode does and does not do",
  devList: [
    "Does: check the file in your browser, show the uploaded list above, and update matched demo street values in this page only.",
    "Does not: send the file anywhere, save it on a server, change the home page list, or publish official city data.",
    "Does not: keep the change after a reload. Reload, or tap Clear uploaded data, to go back to the original demo list.",
    "For a real city release, this dev shortcut would be replaced by a Green City approval step before any score goes public, with old and new scores side by side and a rollback option. That approval step is not the flow in dev mode.",
    "When a file is approved for a real release, the full check is: match each point to the nearest street, at most 20 m away, average per street with the same danger formulas and gates, remove humid readings over 75 percent and outliers, mark streets with little data, and publish street averages only, never personal ride tracks.",
  ],
  notPromiseAria: "What not to promise",
  notPromiseH: "What not to promise",
  notPromiseList: [
    "Do not claim legal limit compliance or exceedance from low cost sensors. Compliance is the job of the official stationary network.",
    "Do not claim live air quality, temperature, or safety from campaign or historical data. If there is no live feed, say so.",
    "Do not claim a street is safe because few overtakes were recorded. Few overtakes can mean few cyclists, few passes, or no data.",
    "Do not claim one close pass proves an illegal overtake, or identifies a driver. Use aggregate rates, with sensor error and context.",
    "Do not promise a street average within 10 percent from a handful of rides. Promise tiers and uncertainty instead.",
    "Do not promise trees will cool a street by a fixed number of degrees, or that calming will cut dust by a fixed percent, without a before and after design.",
  ],
  notVerifiedAria: "Not verified yet",
  notVerifiedH: "Not verified yet, say so plainly",
  notVerifiedP:
    "These items were flagged as not verified in the research, and are not claimed here: vendor prices for sensor kits, signed agreements with LUBW, UrbanAirLab, or any fleet operator, the total Heilbronn segment count, and official Baden-Württemberg holiday dates for the campaign year. Confirm them before you commit them to the city.",
  sourcesAria: "Sources",
  sourcesH: "Sources",
  sourcesP:
    "All sources below come from the research report dated 27 Oct 2026. Counts and gates marked as proposal on this page are not from these sources alone.",
  sourceLabels: [
    "senseBox:bike, citizen science bike sensor",
    "Snifferbike, Utrecht bike dust sensing",
    "SenseBike, automatic overtake detection and dust",
    "Nature review, low cost sensor calibration and lifetime",
    "EU FILTER quality control for citizen sensors",
    "Humidity and temperature correction for low cost dust sensors",
    "Temperature shielding and radiation bias",
    "Aclima method, passes per road section and modelled averages",
    "Antwerp mobile study, passages needed for a stable average",
    "Heilbronn European Green Capital application, LUBW stations",
    "UrbanAirLab Heilbronn, low cost network and LUBW co-location",
    "SimRa, delayed recording, ride cropping, and per ride pseudonyms",
    "GPS track privacy, start and end blurring",
    "openSenseMap, open data and open API",
    "City Scanner, low cost fleet sensing",
    "OpenBikeSensor, overtaking distance rules in Germany",
    "School term and holiday air quality, UK case study",
  ],
  brandLine: "GrünRoute Heilbronn, built with open Heilbronn sensor data, no app, no sign up, no personal tracking.",
  // CSV upload checks and errors. Column names stay in English, they are the file format.
  v: {
    timeMissing: (r: number) => `Row ${r}: time is missing.`,
    timeInvalid: (r: number, v: string) => `Row ${r}: time "${v}" is not a valid date.`,
    placeMissing: (r: number) => `Row ${r}: place is missing.`,
    notNumber: (r: number, name: string, v: string) => `Row ${r}: ${name} "${v}" is not a number.`,
    rowsChecked: (n: number) => `Rows checked: ${n}.`,
    requiredPresent: (list: string) => `Required columns present: ${list}.`,
    dateRange: (a: string, b: string) => `Date range: ${a} to ${b}.`,
    missingValues: (n: number) => `Missing values: ${n} empty cells in required columns.`,
    missingIn: (col: string, n: number) => `Missing in ${col}: ${n}.`,
    notNumbers: (n: number) => `Values that are not numbers: ${n}.`,
    humid: (n: number) =>
      `${n} rows have humidity over 75 percent. Those rows will be removed in the staged check, because humid readings can overstate dust.`,
    closeBlank: "Close pass distance can be blank for walking rows, because a walk has no overtake.",
    placeTimeRequired: "Place and time must be filled in every row, because a street score needs a place and a date.",
    numericRequired: "Dust, temperature, and humidity must be filled in every row, except close pass distance on walking rows.",
    noRows: "File has no data rows. Add at least one data row under the header.",
    colsMissing: (list: string) => `Required columns missing: ${list}.`,
    notJson: "File is not valid JSON.",
    geoInvalid: "GeoJSON must be a FeatureCollection with at least one feature.",
    fieldsMissing: (list: string) => `Fields missing in some features: ${list}.`,
    unsupported: "File type not supported. Choose a CSV file, or a GeoJSON file.",
  },
};

const DE: typeof EN = {
  title: "So sammelst du Daten",
  tagline: "Erst gute Daten. Ein Straßenwert ist nur so gut wie die Fahrten und Stationen dahinter.",
  badgeDev: "ENTWICKLUNGSMODUS, NUR DEMO",
  intro1:
    "Diese Seite ist im Entwicklungsmodus und nur eine Demo. Das sind keine offiziellen Daten der Stadt, und die Straßenwerte hier sind noch eine Stichprobe, keine offiziellen Messungen. Die Seite ist für die Stadt und die Hackathon-Veranstalter. Sie zeigt, wie man Straßendaten sauber sammelt und wie man eine neue Datei direkt auf dieser Seite ausprobiert.",
  intro2:
    "Nichts auf dieser Seite sendet Daten an einen Server, und nichts hier ändert die Liste auf der Startseite. Ein Upload ändert nur die Demo-Liste auf dieser Seite, bis du neu lädst oder sie leerst. Nichts hier verfolgt eine Person.",
  back: "Zurück zur Routenkarte",
  rulesAria: "Wichtige Regeln",
  rulesH: "Zuerst drei Regeln",
  rulesP:
    "Straßenwerte sind ein Screening aus vergangenen Daten, keine Live-Daten und keine rechtliche Messung zur Einhaltung von Grenzwerten. Nutze nur Daten der Veranstalter und Partner, ATRAI, openSenseMap, Hitze-Rundgänge und OpenStreetMap. Erfinde keinen Straßenwert, keine Zahl von Fahrten und keine andere Zahl, um eine Lücke zu füllen. Fehlen Daten, markiere die Straße mit wenig Daten.",
  collectAria: "So sammelst du",
  collectH: "1. So sammelst du",
  cards: [
    {
      h: "Feste Stationen verankern Zeit und Kalibrierung",
      p: "Feste Stationen an Schulen messen Tag und Nacht. Sie zeigen den Tagesverlauf, den Verlauf über die Jahreszeit und Spitzen am Schultor. Sie verankern auch die Raddaten zeitlich. Heilbronn hat schon zwei offizielle LUBW-Stationen, eine Verkehrsstation und eine Hintergrundstation. Nutze sie als Referenz und baue keine zweite Kalibrierkette von Grund auf, wenn eine Zusammenarbeit möglich ist.",
    },
    {
      h: "Radsensoren liefern Details pro Straße",
      p: "senseBox:bike misst auf einer normalen Fahrt Staub, Temperatur, Luftfeuchte, Überholabstand, Straßenbelag und Tempo, mit GPS. So bekommt eine Straße ihren eigenen Wert. Räder fahren aber nur dort, wo Radfahrende fahren, darum fehlen in reinen Raddaten Nebenstraßen und Schulstraßen.",
    },
    {
      h: "Feste Fußwege füllen die Lücken",
      p: "Geh die Straßen ab, die Räder auslassen. Plane jedes Mal dieselben Fußwege, auf Nebenstraßen und Schulstraßen, auf Gehweghöhe. Für Hitze gehst du in klaren, ruhigen, warmen Nächten und auch tagsüber im Schatten. Notiere bei jedem Punkt Sonne oder Schatten und den Belag, denn Sonne auf Asphalt ist nicht dasselbe wie Schatten.",
    },
    {
      h: "Flottenfahrzeuge nur als Bonus",
      p: "Busse oder Müllwagen können monatelang dieselben Hauptstraßen fahren, mit Strom und Wartung schon dabei. Sie sind nur ein Bonus, und nur wenn Stadt und Betreiber es schriftlich vereinbaren. Nebenstraßen fehlen trotzdem, und ihre eigenen Abgase und ihre Wärme müssen kontrolliert werden. Versprich keine Abdeckung durch Flotten, bevor die Vereinbarung unterschrieben ist.",
    },
  ],
  satellite:
    "Hitze aus Satellitendaten ist ein Modell der Oberfläche, nicht die Lufttemperatur, die Menschen spüren. Nutze sie nur, um zu wählen, wo du als Nächstes misst, und kennzeichne sie als modelliert.",
  qualityAria: "Qualitätsprüfungen",
  qualityH: "2. Qualitätsprüfungen",
  quality: [
    ["Zuerst Vergleichsmessung:", "Stell jeden neuen Sensor 2 Wochen neben eine Referenzstation, bevor er rausgeht, wenn möglich an trockenen und an feuchten Tagen. Dieser Schritt macht einen günstigen Sensor vertrauenswürdig."],
    ["Referenzgeräte:", "Lass 1 oder 2 Geräte immer an der Hintergrundstation. Vergleiche die anderen Geräte mit ihnen, dann fällt eine Drift schnell auf."],
    ["Korrektur der Luftfeuchte:", "Miss Luftfeuchte und Temperatur immer zusammen mit Staub, zur selben Zeit, mit demselben Gerät. Staub ohne Luftfeuchte lässt sich nicht korrigieren. Werte über 75 Prozent Luftfeuchte können Staub überschätzen, darum werden sie in der gestuften Prüfung entfernt."],
    ["Belüftetes Gehäuse für die Temperatur:", "Bau einen Temperatursensor nicht in praller Sonne an eine dunkle Box oder direkt am Körper der fahrenden Person an. Sonne und wenig Wind können ihn um mehr als 1 bis 2 Grad verfälschen."],
    ["Jede Jahreszeit neu prüfen:", "Wiederhole in jeder Jahreszeit eine kurze Vergleichsmessung, und nach jeder Reparatur, Reinigung oder Softwareänderung. Notiere die Kalibrierversion bei jedem Datensatz, damit sich ein Wert nachrechnen lässt."],
    ["Ausreißer und hängende Sensoren:", "Markiere einen Sensor, der stundenlang denselben Wert liefert, einen Wert außerhalb des gültigen Bereichs oder eine Spitze in nur einem Kanal. Diese Zeilen bleiben intern und kommen nie in einen öffentlichen Wert."],
  ],
  gateAria: "Mindestabdeckung",
  gateH: "3. Mindestabdeckung",
  badgeProposal: "VORSCHLAG",
  gateIntro:
    "Diese Schwellen sind ein Vorschlag auf Basis veröffentlichter Spannen, kein veröffentlichtes Ergebnis. Sie verhindern, dass eine dünn gemessene Straße auf Platz 1 landet.",
  gateCols: ["Stufe", "Regel", "Was das heißt"],
  gateRows: [
    ["Screening", "Mindestens 10 Durchfahrten an mindestens 5 Tagen", "Grau zeigen, nur als Hinweis."],
    ["Vertrauenswürdig", "Mindestens 20 Durchfahrten an mindestens 10 Tagen, in mindestens 3 Zeitfenstern", "Nur vertrauenswürdige Straßen dürfen für eine Maßnahme gereiht werden."],
    ["Anteil enger Überholungen", "Mindestens 20 Überholungen auf der Straße", "Darunter die Anzahl zeigen und sagen, dass es zu wenige Überholungen für eine Reihung sind. Nie 0 Prozent oder 100 Prozent aus 1 oder 2 Ereignissen zeigen."],
    ["Zu wenig Daten", "Unter Screening", "Als noch nicht gemessen zeigen. Erst vor Ort prüfen, keine automatische Maßnahme."],
  ],
  gateBundles:
    "Verteile feste Routenpakete statt freier Fahrten. Jede fahrende Person bekommt eine Mischung, zum Beispiel 1 belebte Straße, 1 Nebenstraße, 1 Schulstraße und 1 grüne Alternative. Such Mitmachende dort, wo Daten fehlen, über Schulen, Vereine und Eltern mit Lastenrad, mit Leihkits, nicht nur Leute, die schon ein Kit haben.",
  timeAria: "Zeitregeln",
  timeH: "4. Zeitregeln",
  timeList: [
    "Versieh jeden Punkt mit Jahreszeit, Schulzeit oder Ferien und Tageszeit. Vergleiche Sommerhitze nicht direkt mit Raddaten aus dem Winter. Vergleiche dieselbe Jahreszeit.",
    "Schulwerte nutzen nur die Schulzeit. Fahrten in den Ferien helfen den Jahresebenen, gehören aber nicht in einen Wert zur Spitzenzeit an Schulen.",
    "Für den Status vertrauenswürdig deckst du mindestens 3 Zeitfenster ab, zum Beispiel Morgenspitze, Mittag und Nachmittag oder Abend. Eine Straße, die nur mittags befahren wurde, bekommt einen Mittagswert, keinen Wert für den ganzen Tag.",
    "Halte Hitze in der Nacht und Komfort am Tag als zwei Ebenen getrennt. Eine Straße mit Bäumen kann nachts kühl und in der Sonne heiß sein, oder umgekehrt.",
    "Nach einer Maßnahme misst du erneut mit demselben Ablauf, im selben Zeitraum der Jahreszeit, und berichtest vorher und nachher mit Unsicherheit. Eine Fahrt nach einer Maßnahme beweist nichts.",
  ],
  privacyAria: "Datenschutz",
  privacyH: "5. Datenschutz",
  privacyList: [
    "Veröffentliche nur Durchschnitte pro Straße, nie persönliche Fahrtspuren. Rohspuren bleiben zugangsgeschützt, nie öffentlich und werden der Stadt nie als Spuren gezeigt.",
    "Schneide Anfang und Ende jeder Fahrt ab, etwa 200 m, damit keine Wohn- oder Schuladresse aus einer Spur sichtbar wird. Bei Schulaktionen startest du an einem neutralen Treffpunkt, nicht am Schultor.",
    "Blende jeden Abschnitt und jedes Zeitfeld mit wenigen Fahrenden oder Tagen aus. Zeig zu wenig Daten statt einer Zahl, die den Arbeitsweg einer einzelnen Person verraten könnte.",
    "Nutze keine Kameras, Kennzeichen, Tonaufnahmen oder Kontakte aus dem Handy. Überholsensoren messen nur den Abstand, nicht die Identität.",
    "Für Schulwege sind Erwachsene auf dem Schulweg besser, dazu feste Stationen am Schultor und Begehungen zu Fuß, statt Kinder zu verfolgen.",
  ],
  uploadAria: "Daten hochladen und vorbereiten",
  uploadH: "6. Daten im Entwicklungsmodus hochladen",
  uploadIntro:
    "Wenn du schon Daten hast, nutze die Vorlage unten. Deine Datei wird nur in diesem Browser geprüft. Sie wird nirgendwohin gesendet und nicht gespeichert. Im Entwicklungsmodus wird eine Datei, die die Prüfungen besteht, sofort auf dieser Seite übernommen, nur als Demo.",
  templateH: "Spalten der Vorlage",
  templateP:
    "place, time, pm1, pm2.5, pm4, pm10, temperature, humidity, close_pass_distance_cm. place ist nur ein Straßenname, keine Wohnadresse. time ist Datum und Uhrzeit, zum Beispiel 2026-07-14T08:15:00. temperature ist in Grad Celsius. humidity ist in Prozent. close_pass_distance_cm ist der Überholabstand in Zentimetern und darf bei Zeilen zu Fuß leer bleiben.",
  dlCsv: "CSV-Vorlage laden",
  dlGeo: "GeoJSON-Vorlage laden",
  checkH: "Eine Datei in diesem Browser prüfen",
  fileLabel: "Wähle eine CSV- oder GeoJSON-Datei",
  checkNote: "Die Prüfungen laufen nur in deinem Browser. Keine Datei verlässt diese Seite. Kein Server bekommt sie.",
  okB: "Auf dieser Seite übernommen, Entwicklungsmodus, nur Demo.",
  okRest:
    " Das sind keine offiziellen Daten der Stadt. Die hochgeladenen Zeilen siehst du jetzt unten auf dieser Seite, und Demo-Werte von Straßen mit passendem Namen sind in der Liste unten aktualisiert. Diese Änderung gilt nur auf dieser Seite. Lade die Seite neu oder tippe auf Hochgeladene Daten löschen, um zur ursprünglichen Demo-Liste zurückzukehren.",
  failB: "Noch nicht fertig. Behebe die fehlgeschlagenen Prüfungen unten und prüfe die Datei dann noch einmal.",
  checksH: "Prüfungen",
  notesH: "Hinweise",
  errorsH: "Fehlgeschlagene Prüfungen, bitte beheben",
  previewH: "Vorschau, erste Zeilen",
  uploadedH: "Liste der hochgeladenen Daten",
  uploadedP:
    "Nach Straßenname gruppiert. Ein Straßenname wird ohne Groß- und Kleinschreibung und ohne Unterschiede bei deutschen Buchstaben mit der Demo-Liste abgeglichen, so passt Bergstrasse zu Bergstraße. Straßen ohne Treffer werden auch gezeigt, ändern aber keinen Demo-Wert.",
  uploadedCols: ["Ort", "Zeilen", "Ø enges Überholen", "Ø PM10", "Ø PM2.5", "Ø Temp.", "Zeitraum", "Passende Demo-Straße"],
  noValue: "Kein Wert",
  noMatch: "Kein Treffer in der Demo-Liste",
  noDate: "Kein Datum",
  range: (a: string, b: string) => `${a} bis ${b}`,
  demoH: "Demo-Werte der Straßen, auf dieser Seite aktualisiert",
  noChange:
    "Kein Demo-Wert hat sich geändert, weil keine passende Straße einen Überholabstand im Upload hatte. Die hochgeladene Liste oben bleibt sichtbar. Füge einen Überholabstand hinzu, um einen Demo-Wert zu ändern, mit derselben Formel wie die Demo-Liste: Wert gleich 100 minus durchschnittlicher Überholabstand in cm geteilt durch 2.",
  changed: (oldS: number | null, newS: number | null, avgCm: string, rows: number) =>
    ` Demo-Wert ${oldS} auf ${newS}, aus einem durchschnittlichen Überholabstand von ${avgCm} cm in ${rows} hochgeladenen Zeilen. Das ist nur eine Demo, nur auf dieser Seite.`,
  clear: "Hochgeladene Daten löschen",
  devH: "Was der Entwicklungsmodus tut und nicht tut",
  devList: [
    "Tut: die Datei in deinem Browser prüfen, die hochgeladene Liste oben zeigen und passende Demo-Werte von Straßen nur auf dieser Seite aktualisieren.",
    "Tut nicht: die Datei irgendwohin senden, sie auf einem Server speichern, die Liste auf der Startseite ändern oder offizielle Daten der Stadt veröffentlichen.",
    "Tut nicht: die Änderung nach dem Neuladen behalten. Lade neu oder tippe auf Hochgeladene Daten löschen, um zur ursprünglichen Demo-Liste zurückzukehren.",
    "Für eine echte Veröffentlichung durch die Stadt würde diese Abkürzung durch einen Freigabeschritt von Green City ersetzt, bevor ein Wert öffentlich wird, mit alten und neuen Werten nebeneinander und einer Möglichkeit zum Zurücksetzen. Dieser Freigabeschritt ist nicht der Ablauf im Entwicklungsmodus.",
    "Wird eine Datei für eine echte Veröffentlichung freigegeben, ist die volle Prüfung: jeden Punkt der nächsten Straße zuordnen, höchstens 20 m entfernt, pro Straße mit denselben Gefahrenformeln und Schwellen mitteln, Werte über 75 Prozent Luftfeuchte und Ausreißer entfernen, Straßen mit wenig Daten markieren und nur Durchschnitte pro Straße veröffentlichen, nie persönliche Fahrtspuren.",
  ],
  notPromiseAria: "Was du nicht versprechen solltest",
  notPromiseH: "Was du nicht versprechen solltest",
  notPromiseList: [
    "Behaupte nicht, dass günstige Sensoren zeigen, ob ein Grenzwert eingehalten oder überschritten wird. Das ist Aufgabe des offiziellen festen Messnetzes.",
    "Behaupte keine Live-Werte zu Luft, Temperatur oder Sicherheit aus Kampagnen- oder älteren Daten. Gibt es keine Live-Daten, sag das.",
    "Behaupte nicht, dass eine Straße sicher ist, weil wenige Überholungen erfasst wurden. Wenige Überholungen können wenige Radfahrende, wenige Durchfahrten oder keine Daten bedeuten.",
    "Behaupte nicht, dass ein enges Überholen ein verbotenes Überholen beweist oder einen Fahrer erkennt. Nutze zusammengefasste Anteile, mit Sensorfehler und Kontext.",
    "Versprich keinen Straßendurchschnitt auf 10 Prozent genau aus einer Handvoll Fahrten. Versprich stattdessen Stufen und Unsicherheit.",
    "Versprich nicht, dass Bäume eine Straße um eine feste Zahl von Grad kühlen oder dass Verkehrsberuhigung Staub um einen festen Prozentsatz senkt, ohne einen Vorher-Nachher-Vergleich.",
  ],
  notVerifiedAria: "Noch nicht geprüft",
  notVerifiedH: "Noch nicht geprüft, sag das offen",
  notVerifiedP:
    "Diese Punkte wurden in der Recherche als nicht geprüft markiert und werden hier nicht behauptet: Herstellerpreise für Sensorkits, unterschriebene Vereinbarungen mit LUBW, UrbanAirLab oder einem Flottenbetreiber, die Gesamtzahl der Abschnitte in Heilbronn und die offiziellen Ferientermine in Baden-Württemberg für das Kampagnenjahr. Bestätige sie, bevor du sie der Stadt zusagst.",
  sourcesAria: "Quellen",
  sourcesH: "Quellen",
  sourcesP:
    "Alle Quellen unten stammen aus dem Recherchebericht vom 27. Okt. 2026. Zahlen und Schwellen, die auf dieser Seite als Vorschlag markiert sind, stammen nicht allein aus diesen Quellen.",
  sourceLabels: [
    "senseBox:bike, Radsensor für Bürgerwissenschaft",
    "Snifferbike, Staubmessung mit dem Rad in Utrecht",
    "SenseBike, automatische Erkennung von Überholungen und Staub",
    "Nature-Übersicht, Kalibrierung und Lebensdauer günstiger Sensoren",
    "EU FILTER, Qualitätskontrolle für Bürgersensoren",
    "Korrektur von Luftfeuchte und Temperatur für günstige Staubsensoren",
    "Strahlungsschutz für Temperatursensoren und Strahlungsfehler",
    "Aclima-Methode, Durchfahrten pro Straßenabschnitt und modellierte Mittelwerte",
    "Mobile Studie Antwerpen, nötige Durchfahrten für einen stabilen Mittelwert",
    "Bewerbung Heilbronns als European Green Capital, LUBW-Stationen",
    "UrbanAirLab Heilbronn, Netz günstiger Sensoren und Vergleichsmessung mit LUBW",
    "SimRa, verzögerte Aufzeichnung, Kürzen von Fahrten und Pseudonyme pro Fahrt",
    "Datenschutz bei GPS-Spuren, Unschärfe an Start und Ziel",
    "openSenseMap, offene Daten und offene API",
    "City Scanner, Messung mit günstigen Sensoren auf Flotten",
    "OpenBikeSensor, Regeln zum Überholabstand in Deutschland",
    "Luftqualität in Schulzeit und Ferien, Fallstudie aus Großbritannien",
  ],
  brandLine:
    "GrünRoute Heilbronn, gebaut mit offenen Heilbronner Sensordaten, keine App, keine Anmeldung, kein persönliches Tracking.",
  v: {
    timeMissing: (r: number) => `Zeile ${r}: time fehlt.`,
    timeInvalid: (r: number, v: string) => `Zeile ${r}: time "${v}" ist kein gültiges Datum.`,
    placeMissing: (r: number) => `Zeile ${r}: place fehlt.`,
    notNumber: (r: number, name: string, v: string) => `Zeile ${r}: ${name} "${v}" ist keine Zahl.`,
    rowsChecked: (n: number) => `Geprüfte Zeilen: ${n}.`,
    requiredPresent: (list: string) => `Vorhandene Pflichtspalten: ${list}.`,
    dateRange: (a: string, b: string) => `Zeitraum: ${a} bis ${b}.`,
    missingValues: (n: number) => `Fehlende Werte: ${n} leere Zellen in Pflichtspalten.`,
    missingIn: (col: string, n: number) => `Fehlend in ${col}: ${n}.`,
    notNumbers: (n: number) => `Werte, die keine Zahl sind: ${n}.`,
    humid: (n: number) =>
      `${n} Zeilen haben über 75 Prozent Luftfeuchte. Diese Zeilen werden in der gestuften Prüfung entfernt, weil feuchte Messwerte Staub überschätzen können.`,
    closeBlank: "close_pass_distance_cm darf bei Zeilen zu Fuß leer sein, weil es zu Fuß kein Überholen gibt.",
    placeTimeRequired: "place und time müssen in jeder Zeile ausgefüllt sein, weil ein Straßenwert einen Ort und ein Datum braucht.",
    numericRequired:
      "Staub, Temperatur und Luftfeuchte müssen in jeder Zeile ausgefüllt sein. Nur close_pass_distance_cm darf bei Zeilen zu Fuß fehlen.",
    noRows: "Die Datei hat keine Datenzeilen. Füge unter der Kopfzeile mindestens eine Datenzeile hinzu.",
    colsMissing: (list: string) => `Fehlende Pflichtspalten: ${list}.`,
    notJson: "Die Datei ist kein gültiges JSON.",
    geoInvalid: "GeoJSON muss eine FeatureCollection mit mindestens einem Feature sein.",
    fieldsMissing: (list: string) => `Felder fehlen in einigen Features: ${list}.`,
    unsupported: "Dateityp nicht unterstützt. Wähle eine CSV-Datei oder eine GeoJSON-Datei.",
  },
};

const T: Record<Lang, typeof EN> = { en: EN, de: DE };
type Msg = (typeof EN)["v"];

type CheckResult = {
  status: "idle" | "ok" | "fail";
  fileName: string;
  checks: string[];
  errors: string[];
  warnings: string[];
  previewHeaders: string[];
  previewRows: string[][];
  allHeaders: string[];
  allRows: string[][];
};

const EMPTY_RESULT: CheckResult = {
  status: "idle",
  fileName: "",
  checks: [],
  errors: [],
  warnings: [],
  previewHeaders: [],
  previewRows: [],
  allHeaders: [],
  allRows: [],
};

function downloadFile(name: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      quoted = !quoted;
    } else if (ch === "," && !quoted) {
      out.push(cur.trim());
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur.trim());
  return out;
}

function isValidDate(value: string): boolean {
  const d = new Date(value);
  return !Number.isNaN(d.getTime());
}

function validateRows(headers: string[], rows: string[][], m: Msg): CheckResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const checks: string[] = [];
  const missing: Record<string, number> = {};
  REQUIRED.forEach((c) => {
    missing[c] = 0;
  });
  const times: string[] = [];
  let humidOver75 = 0;
  let badNumber = 0;

  rows.forEach((row, ri) => {
    headers.forEach((h, hi) => {
      const v = row[hi] ?? "";
      if (REQUIRED.includes(h) && v === "") {
        missing[h] += 1;
      }
    });
    const get = (name: string) => {
      const idx = headers.indexOf(name);
      return idx >= 0 ? (row[idx] ?? "") : "";
    };
    const time = get("time");
    if (time === "") {
      errors.push(m.timeMissing(ri + 2));
    } else if (!isValidDate(time)) {
      errors.push(m.timeInvalid(ri + 2, time));
    } else {
      times.push(time);
    }
    const place = get("place");
    if (place === "") {
      errors.push(m.placeMissing(ri + 2));
    }
    ["pm1", "pm2.5", "pm4", "pm10", "temperature", "humidity", "close_pass_distance_cm"].forEach((name) => {
      const v = get(name);
      if (v === "") return;
      if (Number.isNaN(Number(v))) {
        badNumber += 1;
        errors.push(m.notNumber(ri + 2, name, v));
      }
    });
    const hum = get("humidity");
    if (hum !== "" && !Number.isNaN(Number(hum)) && Number(hum) > 75) {
      humidOver75 += 1;
    }
  });

  const missingTotal = Object.values(missing).reduce((a, b) => a + b, 0);
  checks.push(m.rowsChecked(rows.length));
  checks.push(m.requiredPresent(REQUIRED.filter((c) => headers.includes(c)).join(", ")));
  if (times.length > 0) {
    const sorted = [...times].sort();
    checks.push(m.dateRange(sorted[0], sorted[sorted.length - 1]));
  }
  checks.push(m.missingValues(missingTotal));
  Object.entries(missing).forEach(([col, n]) => {
    if (n > 0) checks.push(m.missingIn(col, n));
  });
  if (badNumber > 0) checks.push(m.notNumbers(badNumber));
  if (humidOver75 > 0) {
    warnings.push(m.humid(humidOver75));
  }
  warnings.push(m.closeBlank);
  if (missing["place"] > 0 || missing["time"] > 0) {
    errors.push(m.placeTimeRequired);
  }
  const numericMissing = ["pm1", "pm2.5", "pm4", "pm10", "temperature", "humidity"].reduce((a, c) => a + missing[c], 0);
  if (numericMissing > 0) {
    errors.push(m.numericRequired);
  }

  return {
    status: errors.length === 0 ? "ok" : "fail",
    fileName: "",
    checks,
    errors,
    warnings,
    previewHeaders: headers,
    previewRows: rows.slice(0, 5),
    allHeaders: headers,
    allRows: rows,
  };
}

function normalizePlace(value: string): string {
  return value
    .toLowerCase()
    .replace(/ß/g, "ss")
    .replace(/ä/g, "a")
    .replace(/ö/g, "o")
    .replace(/ü/g, "u")
    .replace(/[^a-z0-9]/g, "");
}

type UploadedGroup = {
  place: string;
  rows: number;
  avgClose: number | null;
  avgPm10: number | null;
  avgPm25: number | null;
  avgTemp: number | null;
  firstTime: string | null;
  lastTime: string | null;
  matched: string | null;
  oldScore: number | null;
  newScore: number | null;
};

function avg(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export default function DataCollection() {
  const lang = useLang();
  const t = T[lang];
  const href = useHref();
  const [result, setResult] = useState<CheckResult>(EMPTY_RESULT);
  // One decimal, 12.5 in English and 12,5 in German.
  const f1 = (n: number) => fmtNum(n, lang, { minimumFractionDigits: 1, maximumFractionDigits: 1, useGrouping: false });

  const uploadedGroups: UploadedGroup[] = useMemo(() => {
    if (result.status !== "ok") return [];
    const headers = result.allHeaders;
    const idx = (name: string) => headers.indexOf(name);
    const byPlace = new Map<string, { display: string; rows: string[][] }>();
    result.allRows.forEach((row) => {
      const place = row[idx("place")] ?? "";
      const key = normalizePlace(place);
      if (!byPlace.has(key)) byPlace.set(key, { display: place, rows: [] });
      byPlace.get(key)?.rows.push(row);
    });
    const groups: UploadedGroup[] = [];
    byPlace.forEach((entry) => {
      const getNums = (name: string) =>
        entry.rows
          .map((r) => r[idx(name)] ?? "")
          .filter((v) => v !== "" && !Number.isNaN(Number(v)))
          .map((v) => Number(v));
      const times = entry.rows
        .map((r) => r[idx("time")] ?? "")
        .filter((v) => v !== "")
        .sort();
      const match = STREETS.find((s) => normalizePlace(s.name) === normalizePlace(entry.display));
      const close = avg(getNums("close_pass_distance_cm"));
      const newScore = match && close !== null ? Math.max(0, Math.min(100, Math.round(100 - close / 2))) : null;
      groups.push({
        place: entry.display,
        rows: entry.rows.length,
        avgClose: close,
        avgPm10: avg(getNums("pm10")),
        avgPm25: avg(getNums("pm2.5")),
        avgTemp: avg(getNums("temperature")),
        firstTime: times.length > 0 ? times[0] : null,
        lastTime: times.length > 0 ? times[times.length - 1] : null,
        matched: match ? match.name : null,
        oldScore: match ? match.score : null,
        newScore,
      });
    });
    return groups;
  }, [result]);

  async function handleFile(file: File) {
    const m = t.v;
    const text = await file.text();
    const name = file.name.toLowerCase();
    if (name.endsWith(".csv")) {
      const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
      if (lines.length < 2) {
        setResult({ ...EMPTY_RESULT, status: "fail", fileName: file.name, errors: [m.noRows] });
        return;
      }
      const headers = parseCsvLine(lines[0]);
      const missingCols = REQUIRED.filter((c) => !headers.includes(c));
      if (missingCols.length > 0) {
        setResult({
          ...EMPTY_RESULT,
          status: "fail",
          fileName: file.name,
          errors: [m.colsMissing(missingCols.join(", "))],
        });
        return;
      }
      const rows = lines.slice(1).map((l) => parseCsvLine(l));
      const checked = validateRows(headers, rows, m);
      setResult({ ...checked, fileName: file.name });
      return;
    }
    if (name.endsWith(".json") || name.endsWith(".geojson")) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        setResult({ ...EMPTY_RESULT, status: "fail", fileName: file.name, errors: [m.notJson] });
        return;
      }
      const obj = parsed as { type?: string; features?: Array<{ properties?: Record<string, unknown> }> };
      if (obj.type !== "FeatureCollection" || !Array.isArray(obj.features) || obj.features.length === 0) {
        setResult({
          ...EMPTY_RESULT,
          status: "fail",
          fileName: file.name,
          errors: [m.geoInvalid],
        });
        return;
      }
      const props = obj.features.map((f) => f.properties ?? {});
      const missingCols = REQUIRED.filter((c) => !props.every((p) => p[c] !== undefined && p[c] !== null && p[c] !== ""));
      if (missingCols.length > 0) {
        setResult({
          ...EMPTY_RESULT,
          status: "fail",
          fileName: file.name,
          errors: [m.fieldsMissing(missingCols.join(", "))],
        });
        return;
      }
      const headers = REQUIRED;
      const rows = props.map((p) => REQUIRED.map((c) => String(p[c] ?? "")));
      const checked = validateRows(headers, rows, m);
      setResult({ ...checked, fileName: file.name });
      return;
    }
    setResult({
      ...EMPTY_RESULT,
      status: "fail",
      fileName: file.name,
      errors: [m.unsupported],
    });
  }

  const changedGroups = uploadedGroups.filter((g) => g.matched && g.newScore !== null);

  return (
    <main className="wrap">
      <header className="slim-header">
        <Wordmark href={href("/")} lang={lang} />
        <LangSwitch />
      </header>
      <section className="hero">
        <h1>{t.title}</h1>
        <p className="tagline">{t.tagline}</p>
        <p><Badge variant="destructive">{t.badgeDev}</Badge></p>
        <p>{t.intro1}</p>
        <p>{t.intro2}</p>
        <p className="back-link">
          <Link href={href("/")}>{t.back}</Link>
        </p>
      </section>

      <section className="datasource" aria-label={t.rulesAria}>
        <h2>{t.rulesH}</h2>
        <p>{t.rulesP}</p>
      </section>

      <section className="dc-section" aria-label={t.collectAria}>
        <h2>{t.collectH}</h2>
        <div className="dc-grid">
          {t.cards.map((c) => (
            <article className="dc-card" key={c.h}>
              <h3>{c.h}</h3>
              <p>{c.p}</p>
            </article>
          ))}
        </div>
        <p className="dc-note">{t.satellite}</p>
      </section>

      <section className="dc-section" aria-label={t.qualityAria}>
        <h2>{t.qualityH}</h2>
        <ul className="dc-list">
          {t.quality.map(([b, rest]) => (
            <li key={b}><b>{b}</b> {rest}</li>
          ))}
        </ul>
      </section>

      <section className="dc-section" aria-label={t.gateAria}>
        <h2>{t.gateH}</h2>
        <p><Badge variant="secondary">{t.badgeProposal}</Badge> {t.gateIntro}</p>
        <table className="dc-table">
          <thead>
            <tr>
              {t.gateCols.map((c) => (
                <th scope="col" key={c}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {t.gateRows.map(([level, rule, meaning]) => (
              <tr key={level}><td><b>{level}</b></td><td>{rule}</td><td>{meaning}</td></tr>
            ))}
          </tbody>
        </table>
        <p>{t.gateBundles}</p>
      </section>

      <section className="dc-section" aria-label={t.timeAria}>
        <h2>{t.timeH}</h2>
        <ul className="dc-list">
          {t.timeList.map((li) => (
            <li key={li}>{li}</li>
          ))}
        </ul>
      </section>

      <section className="dc-section" aria-label={t.privacyAria}>
        <h2>{t.privacyH}</h2>
        <ul className="dc-list">
          {t.privacyList.map((li) => (
            <li key={li}>{li}</li>
          ))}
        </ul>
      </section>

      <section className="dc-section" aria-label={t.uploadAria}>
        <h2>{t.uploadH}</h2>
        <p>{t.uploadIntro}</p>
        <h3>{t.templateH}</h3>
        <p>{t.templateP}</p>
        <div className="dc-actions">
          <Button variant="primary" onClick={() => downloadFile("grunroute-template.csv", CSV_TEMPLATE, "text/csv")}>{t.dlCsv}</Button>
          <Button variant="outline" onClick={() => downloadFile("grunroute-template.geojson", GEOJSON_TEMPLATE, "application/geo+json")}>{t.dlGeo}</Button>
        </div>
        <h3>{t.checkH}</h3>
        <label className="gr-label" htmlFor="dataFile">{t.fileLabel}</label>
        <input
          id="dataFile"
          className="gr-input"
          type="file"
          accept=".csv,.json,.geojson,text/csv,application/json"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
        />
        <p className="dc-note">{t.checkNote}</p>
        {result.status !== "idle" && (
          <div className="dc-result" aria-live="polite">
            <h3>{result.fileName}</h3>
            {result.status === "ok" ? (
              <p className="dc-ok"><b>{t.okB}</b>{t.okRest}</p>
            ) : (
              <p className="dc-fail"><b>{t.failB}</b></p>
            )}
            <h4>{t.checksH}</h4>
            <ul>
              {result.checks.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
            {result.warnings.length > 0 && (
              <>
                <h4>{t.notesH}</h4>
                <ul>
                  {result.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </>
            )}
            {result.errors.length > 0 && (
              <>
                <h4>{t.errorsH}</h4>
                <ul>
                  {result.errors.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              </>
            )}
            {result.previewRows.length > 0 && (
              <>
                <h4>{t.previewH}</h4>
                <div className="dc-preview">
                  <table className="dc-table">
                    <thead>
                      <tr>
                        {result.previewHeaders.map((h) => (
                          <th key={h} scope="col">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {result.previewRows.map((row, ri) => (
                        <tr key={ri}>
                          {result.previewHeaders.map((h, hi) => (
                            <td key={h}>{row[hi] ?? ""}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}
        {result.status === "ok" && (
          <>
            <h3>{t.uploadedH}</h3>
            <p>{t.uploadedP}</p>
            <table className="dc-table">
              <thead>
                <tr>
                  {t.uploadedCols.map((c) => (
                    <th scope="col" key={c}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {uploadedGroups.map((g) => (
                  <tr key={g.place}>
                    <td>{g.place}</td>
                    <td>{g.rows}</td>
                    <td>{g.avgClose !== null ? `${f1(g.avgClose)} cm` : t.noValue}</td>
                    <td>{g.avgPm10 !== null ? f1(g.avgPm10) : t.noValue}</td>
                    <td>{g.avgPm25 !== null ? f1(g.avgPm25) : t.noValue}</td>
                    <td>{g.avgTemp !== null ? `${f1(g.avgTemp)} C` : t.noValue}</td>
                    <td>{g.firstTime !== null && g.lastTime !== null ? t.range(g.firstTime, g.lastTime) : t.noDate}</td>
                    <td>{g.matched ?? t.noMatch}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <h3>{t.demoH}</h3>
            {changedGroups.length === 0 ? (
              <p>{t.noChange}</p>
            ) : (
              <ul className="dc-list">
                {changedGroups.map((g) => (
                  <li key={g.place}>
                    <b>{g.matched}:</b>
                    {t.changed(g.oldScore, g.newScore, g.avgClose !== null ? f1(g.avgClose) : "", g.rows)}
                  </li>
                ))}
              </ul>
            )}
            <div className="dc-actions">
              <Button variant="outline" onClick={() => setResult(EMPTY_RESULT)}>{t.clear}</Button>
            </div>
          </>
        )}
        <h3>{t.devH}</h3>
        <ul className="dc-list">
          {t.devList.map((li) => (
            <li key={li}>{li}</li>
          ))}
        </ul>
      </section>

      <section className="dc-section" aria-label={t.notPromiseAria}>
        <h2>{t.notPromiseH}</h2>
        <ul className="dc-list">
          {t.notPromiseList.map((li) => (
            <li key={li}>{li}</li>
          ))}
        </ul>
      </section>

      <section className="dc-section" aria-label={t.notVerifiedAria}>
        <h2>{t.notVerifiedH}</h2>
        <p>{t.notVerifiedP}</p>
      </section>

      <section className="dc-section" aria-label={t.sourcesAria}>
        <h2>{t.sourcesH}</h2>
        <p>{t.sourcesP}</p>
        <ul className="dc-sources">
          {SOURCE_URLS.map((url, i) => (
            <li key={url}><a href={url} target="_blank" rel="noreferrer">{t.sourceLabels[i]}</a></li>
          ))}
        </ul>
      </section>

      <footer>
        <p className="brand-line">{t.brandLine}</p>
        <p className="back-link"><Link href={href("/")}>{t.back}</Link></p>
      </footer>
    </main>
  );
}
