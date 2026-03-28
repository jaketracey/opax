"use client";

import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

/* ── Fix Leaflet default marker icons (webpack breaks the asset paths) ── */
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

/* ── Electorate center coordinates ── */

const STATE_CAPITALS: Record<string, [number, number]> = {
  NSW: [-33.87, 151.21],
  VIC: [-37.81, 144.96],
  QLD: [-27.47, 153.03],
  WA: [-31.95, 115.86],
  SA: [-34.93, 138.6],
  TAS: [-42.88, 147.33],
  ACT: [-35.28, 149.13],
  NT: [-12.46, 130.84],
};

const ELECTORATE_CENTERS: Record<string, [number, number]> = {
  // NSW
  Grayndler: [-33.88, 151.15],
  Sydney: [-33.87, 151.21],
  Watson: [-33.91, 151.08],
  McMahon: [-33.83, 150.92],
  Warringah: [-33.78, 151.26],
  Wentworth: [-33.88, 151.27],
  "North Sydney": [-33.83, 151.21],
  Bennelong: [-33.8, 151.1],
  Chifley: [-33.74, 150.87],
  Parramatta: [-33.82, 151.0],
  Fowler: [-33.88, 150.92],
  Blaxland: [-33.87, 151.0],
  Barton: [-33.94, 151.13],
  Cook: [-34.03, 151.11],
  Hughes: [-34.05, 150.99],
  Mackellar: [-33.73, 151.28],
  Bradfield: [-33.77, 151.15],
  Reid: [-33.86, 151.1],
  "New England": [-30.52, 151.67],
  Hume: [-34.75, 149.72],
  Cowper: [-30.3, 153.1],
  Lyne: [-31.9, 152.46],
  Page: [-28.81, 153.28],
  Richmond: [-28.65, 153.44],
  Eden_Monaro: [-36.25, 149.13],
  Calare: [-33.28, 149.1],
  Riverina: [-34.29, 146.05],
  Farrer: [-35.93, 145.95],
  Gilmore: [-34.75, 150.77],
  Whitlam: [-34.42, 150.89],
  Cunningham: [-34.42, 150.89],
  Hunter: [-32.92, 151.78],
  Shortland: [-32.95, 151.7],
  Newcastle: [-32.93, 151.78],
  Paterson: [-32.73, 151.55],
  Dobell: [-33.3, 151.5],
  Robertson: [-33.42, 151.34],
  Macquarie: [-33.57, 150.69],
  Lindsay: [-33.75, 150.73],
  Werriwa: [-33.93, 150.85],
  Greenway: [-33.72, 150.95],
  Mitchell: [-33.7, 151.0],
  Berowra: [-33.62, 151.1],
  Banks: [-33.95, 151.04],
  "Kingsford Smith": [-33.93, 151.23],

  // VIC
  Melbourne: [-37.81, 144.96],
  Kooyong: [-37.83, 145.03],
  Higgins: [-37.87, 145.0],
  Goldstein: [-37.92, 145.0],
  Hotham: [-37.9, 145.1],
  Chisholm: [-37.82, 145.13],
  Menzies: [-37.78, 145.15],
  Deakin: [-37.83, 145.17],
  Casey: [-37.85, 145.35],
  "La Trobe": [-37.96, 145.37],
  Flinders: [-38.2, 145.15],
  Dunkley: [-38.12, 145.12],
  Isaacs: [-38.0, 145.12],
  Bruce: [-37.93, 145.2],
  Holt: [-38.03, 145.25],
  Gorton: [-37.78, 144.72],
  Gellibrand: [-37.8, 144.82],
  Maribyrnong: [-37.78, 144.88],
  Scullin: [-37.68, 145.03],
  Jagajaga: [-37.73, 145.08],
  Wills: [-37.75, 144.97],
  "Melbourne Ports": [-37.85, 144.97],
  Aston: [-37.88, 145.23],
  Ballarat: [-37.56, 143.85],
  Bendigo: [-36.76, 144.28],
  Gippsland: [-38.1, 146.0],
  Indi: [-36.35, 146.32],
  Mallee: [-35.75, 142.02],
  Wannon: [-37.56, 142.16],
  Corio: [-38.15, 144.36],
  Corangamite: [-38.33, 144.25],
  Fraser: [-37.73, 144.78],
  Calwell: [-37.67, 144.88],
  Cooper: [-37.77, 145.0],
  Macnamara: [-37.85, 144.97],

  // QLD
  Griffith: [-27.49, 153.05],
  "Ryan": [-27.5, 152.95],
  Brisbane: [-27.47, 153.03],
  Moreton: [-27.53, 153.0],
  Oxley: [-27.58, 152.97],
  Rankin: [-27.63, 153.1],
  Bonner: [-27.5, 153.1],
  Lilley: [-27.42, 153.04],
  Petrie: [-27.32, 153.0],
  Dickson: [-27.37, 152.95],
  Longman: [-27.1, 152.95],
  "Fisher": [-26.76, 152.95],
  Fadden: [-27.9, 153.33],
  McPherson: [-28.05, 153.43],
  Moncrieff: [-28.0, 153.4],
  Fairfax: [-26.65, 153.05],
  "Wide Bay": [-25.52, 152.7],
  Hinkler: [-25.3, 152.35],
  Flynn: [-23.37, 150.51],
  Capricornia: [-23.38, 150.5],
  Dawson: [-20.73, 148.74],
  Herbert: [-19.26, 146.81],
  Leichhardt: [-16.92, 145.77],
  Kennedy: [-19.5, 146.0],
  Maranoa: [-26.56, 148.79],
  Blair: [-27.62, 152.76],
  Forde: [-27.67, 153.15],
  Wright: [-27.63, 152.68],

  // WA
  Perth: [-31.95, 115.86],
  Curtin: [-31.95, 115.8],
  Fremantle: [-32.06, 115.75],
  Swan: [-31.88, 115.99],
  Tangney: [-32.0, 115.85],
  Stirling: [-31.86, 115.82],
  Moore: [-31.73, 115.82],
  Cowan: [-31.78, 115.85],
  Hasluck: [-31.9, 116.05],
  "Brand": [-32.33, 115.77],
  Canning: [-32.17, 115.96],
  Pearce: [-31.65, 116.0],
  Burt: [-32.1, 115.95],
  Forrest: [-33.33, 115.64],
  "O'Connor": [-33.86, 121.89],
  Durack: [-24.87, 113.66],

  // SA
  Adelaide: [-34.93, 138.6],
  Sturt: [-34.95, 138.65],
  Boothby: [-35.0, 138.58],
  Makin: [-34.83, 138.68],
  Kingston: [-35.07, 138.55],
  Hindmarsh: [-34.92, 138.52],
  Mayo: [-35.03, 138.82],
  Barker: [-35.5, 139.0],
  Grey: [-32.49, 137.78],
  Wakefield: [-34.27, 138.6],
  Spence: [-34.82, 138.58],

  // TAS
  Clark: [-42.88, 147.33],
  Franklin: [-43.0, 147.2],
  Lyons: [-41.93, 147.5],
  Bass: [-41.44, 147.14],
  Braddon: [-41.05, 145.87],

  // ACT
  Fenner: [-35.25, 149.07],
  Canberra: [-35.31, 149.2],
  Bean: [-35.35, 149.08],

  // NT
  Solomon: [-12.46, 130.84],
  Lingiari: [-23.7, 133.88],
};

/* Guess state from electorate name to pick a capital fallback */
const ELECTORATE_STATES: Record<string, string> = {
  Fenner: "ACT",
  Canberra: "ACT",
  Bean: "ACT",
  Solomon: "NT",
  Lingiari: "NT",
  Clark: "TAS",
  Franklin: "TAS",
  Lyons: "TAS",
  Bass: "TAS",
  Braddon: "TAS",
};

function getCenter(electorateName: string): [number, number] {
  if (ELECTORATE_CENTERS[electorateName]) {
    return ELECTORATE_CENTERS[electorateName];
  }
  // Fallback to state capital if we know the state
  const state = ELECTORATE_STATES[electorateName];
  if (state && STATE_CAPITALS[state]) {
    return STATE_CAPITALS[state];
  }
  // Default: approximate center of Australia's populated areas
  return [-33.87, 151.21]; // Sydney as generic fallback
}

/* ── Props ── */

interface ElectorateMapProps {
  electorateName: string;
}

export default function ElectorateMap({ electorateName }: ElectorateMapProps) {
  const center = getCenter(electorateName);

  return (
    <MapContainer
      center={center}
      zoom={12}
      scrollWheelZoom={false}
      style={{ height: "100%", width: "100%", borderRadius: "0.75rem" }}
      attributionControl={false}
    >
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>'
      />
      <Marker position={center}>
        <Popup>
          <span style={{ color: "#0a0a0f", fontWeight: 600 }}>
            {electorateName}
          </span>
        </Popup>
      </Marker>
    </MapContainer>
  );
}
