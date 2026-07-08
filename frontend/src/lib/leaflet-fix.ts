import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { apiUrl } from '../utils/apiUrl';

try {
  const DefaultIcon = L.icon({
    iconRetinaUrl: apiUrl('/leaflet-assets/marker-icon-2x.png'),
    iconUrl: apiUrl('/leaflet-assets/marker-icon.png'),
    shadowUrl: apiUrl('/leaflet-assets/marker-shadow.png'),
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41],
  });
  L.Marker.prototype.options.icon = DefaultIcon;
} catch (_e) {
  console.warn('Leaflet initialization failed, map features will be unavailable');
}