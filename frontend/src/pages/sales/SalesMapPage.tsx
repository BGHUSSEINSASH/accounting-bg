import { useState, useEffect, useRef } from 'react';
import api from '../../services/api';
import PageHeader from '../../components/ui/PageHeader';
import PrintButton from '../../components/ui/PrintButton';
import { formatCurrency, formatDate } from '../../utils/format';
import { useTranslation } from '../../i18n/context';

interface MapMarker {
  lat: number;
  lng: number;
  label: string;
  sublabel?: string;
  amount?: number;
  date?: string;
  type: 'client' | 'sale';
}

export default function SalesMapPage() {
  const { t } = useTranslation();
  const [sales, setSales] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    Promise.all([api.get('/sales/map/data'), api.get('/clients/map/data')]).then(([s, c]) => {
      setSales(Array.isArray(s.data) ? s.data : []);
      setClients(Array.isArray(c.data) ? c.data : []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (loading) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    const w = rect.width;
    const h = rect.height;

    const markers: MapMarker[] = [
      ...clients.map(c => ({ lat: c.latitude, lng: c.longitude, label: c.name, sublabel: c.city, amount: c.current_balance, type: 'client' as const })),
      ...sales.map(s => ({ lat: s.location_lat, lng: s.location_lng, label: s.invoice_number, sublabel: s.client_name, amount: s.total, date: s.invoice_date, type: 'sale' as const }))
    ].filter(m => m.lat && m.lng);

    if (markers.length === 0) {
      ctx.fillStyle = '#f3f4f6';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#9ca3af';
      ctx.font = '16px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(t('sales_map.no_data'), w / 2, h / 2);
      return;
    }

    const lats = markers.map(m => m.lat);
    const lngs = markers.map(m => m.lng);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);

    const pad = 0.05;
    const latRange = maxLat - minLat || 0.1;
    const lngRange = maxLng - minLng || 0.1;
    const bMinLat = minLat - latRange * pad;
    const bMaxLat = maxLat + latRange * pad;
    const bMinLng = minLng - lngRange * pad;
    const bMaxLng = maxLng + lngRange * pad;

    const margin = 60;
    const mapW = w - margin * 2;
    const mapH = h - margin * 2;

    const toX = (lng: number) => margin + ((lng - bMinLng) / (bMaxLng - bMinLng)) * mapW;
    const toY = (lat: number) => margin + mapH - ((lat - bMinLat) / (bMaxLat - bMinLat)) * mapH;

    ctx.fillStyle = '#f0f4f8';
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 5; i++) {
      const x = margin + (mapW / 5) * i;
      const y = margin + (mapH / 5) * i;
      ctx.beginPath();
      ctx.moveTo(x, margin);
      ctx.lineTo(x, margin + mapH);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(margin, y);
      ctx.lineTo(margin + mapW, y);
      ctx.stroke();

      const lat = bMaxLat - ((bMaxLat - bMinLat) / 5) * i;
      const lng = bMinLng + ((bMaxLng - bMinLng) / 5) * i;
      ctx.fillStyle = '#94a3b8';
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(lat.toFixed(2), margin - 40, y + 4);
      ctx.textAlign = 'center';
      ctx.fillText(lng.toFixed(2), x, margin + mapH + 16);
    }

    markers.forEach(m => {
      const x = toX(m.lng);
      const y = toY(m.lat);
      const isClient = m.type === 'client';

      ctx.beginPath();
      ctx.arc(x, y, isClient ? 8 : 6, 0, Math.PI * 2);
      ctx.fillStyle = isClient ? '#3b82f6' : '#f59e0b';
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = '#1e293b';
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(m.label, x + 12, y + 4);
    });

  }, [loading, clients, sales]);

  if (loading) return <div className="text-center py-8">{t('common.loading')}</div>;

  const hasData = clients.length > 0 || sales.length > 0;

  return (
    <div>
      <PageHeader title={t('sales_map.title')} subtitle={t('sales_map.subtitle')} actions={<PrintButton />} />
      {!hasData && <div className="card mb-4 p-6 text-center text-gray-500">{t('sales_map.no_data')}</div>}
      <div className="card p-0 overflow-hidden">
        <canvas ref={canvasRef} style={{ width: '100%', height: '600px', display: 'block' }} />
      </div>
    </div>
  );
}
