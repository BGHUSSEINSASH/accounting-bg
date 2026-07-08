import { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from 'react-leaflet';
import { Icon } from 'leaflet';
import { MapPin } from 'lucide-react';
import { apiUrl } from '../../utils/apiUrl';

const markerIcon = new Icon({
  iconUrl: apiUrl('/leaflet-assets/marker-icon.png'),
  iconRetinaUrl: apiUrl('/leaflet-assets/marker-icon-2x.png'),
  shadowUrl: apiUrl('/leaflet-assets/marker-shadow.png'),
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
});

function DraggableMarker({ position, setPosition }: { position: [number, number]; setPosition: (p: [number, number]) => void }) {
  useMapEvents({
    click(e) {
      setPosition([e.latlng.lat, e.latlng.lng]);
    },
  });
  return <Marker position={position} icon={markerIcon} draggable eventHandlers={{ dragend: (e) => { const m = e.target; const ll = m.getLatLng(); setPosition([ll.lat, ll.lng]); } }} />;
}

function ChangeView({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => { map.setView(center, map.getZoom()); }, [center]);
  return null;
}

interface LocationPickerProps {
  onLocationChange: (lat: number, lng: number) => void;
}

export default function LocationPicker({ onLocationChange }: LocationPickerProps) {
  const [position, setPosition] = useState<[number, number]>([24.7136, 46.6753]);
  const [loading, setLoading] = useState(false);

  const getLocation = () => {
    if (!navigator.geolocation) return;
    setLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const p: [number, number] = [pos.coords.latitude, pos.coords.longitude];
        setPosition(p);
        onLocationChange(p[0], p[1]);
        setLoading(false);
      },
      () => setLoading(false),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleMarkerMove = (p: [number, number]) => {
    setPosition(p);
    onLocationChange(p[0], p[1]);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <button type="button" onClick={getLocation} disabled={loading} className="btn-secondary text-sm flex items-center gap-1">
          <MapPin className="w-4 h-4" /> {loading ? '...' : 'تحديد الموقع الحالي'}
        </button>
      </div>
      <div className="h-48 rounded-xl overflow-hidden border border-gray-200">
        <MapContainer center={position} zoom={13} scrollWheelZoom style={{ height: '100%', width: '100%' }}>
          <TileLayer url={apiUrl('/map-tiles/{z}/{x}/{y}.png')} />
          <ChangeView center={position} />
          <DraggableMarker position={position} setPosition={handleMarkerMove} />
        </MapContainer>
      </div>
      <p className="text-xs text-gray-400">{position[0].toFixed(6)}, {position[1].toFixed(6)}</p>
    </div>
  );
}
