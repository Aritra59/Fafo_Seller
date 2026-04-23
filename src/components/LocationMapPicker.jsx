import L from 'leaflet';
import { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

import iconRetina from 'leaflet/dist/images/marker-icon-2x.png';
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';
import { DEFAULT_MAP_CENTER } from '../constants/map.js';
import { LocationSearchBox } from './LocationSearchBox.jsx';

const DefaultIcon = L.icon({
  iconRetinaUrl: iconRetina,
  iconUrl: icon,
  shadowUrl: iconShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});
L.Marker.prototype.options.icon = DefaultIcon;

function MapClick({ onPick }) {
  useMapEvents({
    click(e) {
      onPick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

/** Pans/zooms only when `flyTick` changes (search selection), not when dragging the pin. */
function MapFlyTo({ lat, lng, flyTick }) {
  const map = useMap();
  const posRef = useRef({ lat, lng });
  posRef.current = { lat, lng };

  useEffect(() => {
    if (flyTick <= 0) return;
    const { lat: la, lng: ln } = posRef.current;
    map.flyTo([la, ln], 16, { duration: 1.05 });
  }, [flyTick, map]);

  return null;
}

/**
 * Search (Photon/OSM) + OpenStreetMap tiles + draggable marker.
 *
 * @param {{
 *   lat: number,
 *   lng: number,
 *   onChange: (lat: number, lng: number) => void,
 *   onAddressHint?: (label: string) => void,
 *   height?: number
 * }} props
 */
export function LocationMapPicker({ lat, lng, onChange, onAddressHint, height = 260 }) {
  const markerPosition = useMemo(() => L.latLng(lat, lng), [lat, lng]);
  const [flyTick, setFlyTick] = useState(0);

  const [initialCenter] = useState(
    () => [DEFAULT_MAP_CENTER.lat, DEFAULT_MAP_CENTER.lng],
  );

  const onDragEnd = (e) => {
    const p = e.target.getLatLng();
    onChange(p.lat, p.lng);
  };

  function handleSearchSelect(place) {
    onChange(place.lat, place.lng);
    onAddressHint?.(place.label);
    setFlyTick((t) => t + 1);
  }

  return (
    <div className="onboarding-map-wrap">
      <LocationSearchBox onSelect={handleSearchSelect} />

      <MapContainer
        center={initialCenter}
        zoom={5}
        className="onboarding-map"
        style={{ height, width: '100%', borderRadius: 12 }}
        scrollWheelZoom
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapFlyTo lat={lat} lng={lng} flyTick={flyTick} />
        <Marker position={markerPosition} draggable eventHandlers={{ dragend: onDragEnd }} />
        <MapClick
          onPick={(newLat, newLng) => {
            onChange(newLat, newLng);
          }}
        />
      </MapContainer>
      <p className="muted" style={{ margin: '0.5rem 0 0', fontSize: '0.8125rem' }}>
        Search above, or drag the pin / tap the map to refine your stall location.
      </p>
    </div>
  );
}
