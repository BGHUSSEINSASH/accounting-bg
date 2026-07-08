import { useState, useEffect, useRef, useCallback } from 'react';
import { Clock, UserCheck } from 'lucide-react';
import api from '../../services/api';
import PageHeader from '../../components/ui/PageHeader';
import PrintButton from '../../components/ui/PrintButton';
import { formatTime, formatDate } from '../../utils/format';
import { useTranslation } from '../../i18n/context';

interface EmpMarker {
  id: number;
  lat: number;
  lng: number;
  name: string;
  department: string;
  status: string;
  checkIn: string;
  checkOut: string;
  lateMinutes: number;
  userId: number;
}

export default function EmployeeMapPage() {
  const { t } = useTranslation();
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEmployee, setSelectedEmployee] = useState<any>(null);
  const [employeeHistory, setEmployeeHistory] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const markersRef = useRef<EmpMarker[]>([]);

  const loadEmployeeHistory = async (userId: number) => {
    setHistoryLoading(true);
    try {
      const res = await api.get(`/attendance-map/${userId}?limit=10`);
      setSelectedEmployee(res.data.user);
      setEmployeeHistory(res.data.records || []);
    } catch { }
    setHistoryLoading(false);
  };

  const renderMap = useCallback(() => {
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

    const markers: EmpMarker[] = records.filter(r => r.check_in_location_lat).map(r => ({
      id: r.id, lat: r.check_in_location_lat, lng: r.check_in_location_lng,
      name: r.full_name || '', department: r.department || '', status: r.status || 'present',
      checkIn: r.check_in_time || '', checkOut: r.check_out_time || '',
      lateMinutes: r.late_minutes || 0, userId: r.user_id
    }));
    markersRef.current = markers;

    if (markers.length === 0) {
      ctx.fillStyle = '#f3f4f6';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#9ca3af';
      ctx.font = '16px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(t('employee_map.no_employees'), w / 2, h / 2);
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
    const margin = 50;
    const mapW = w - margin * 2;
    const mapH = h - margin * 2;
    const toX = (lng: number) => margin + ((lng - bMinLng) / (bMaxLng - bMinLng)) * mapW;
    const toY = (lat: number) => margin + mapH - ((lat - bMinLat) / (bMaxLat - bMinLat)) * mapH;

    ctx.fillStyle = '#f0f4f8';
    ctx.fillRect(0, 0, w, h);

    for (let i = 0; i <= 4; i++) {
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 1;
      const x = margin + (mapW / 4) * i;
      ctx.beginPath(); ctx.moveTo(x, margin); ctx.lineTo(x, margin + mapH); ctx.stroke();
      const y = margin + (mapH / 4) * i;
      ctx.beginPath(); ctx.moveTo(margin, y); ctx.lineTo(margin + mapW, y); ctx.stroke();
      const lat = bMaxLat - ((bMaxLat - bMinLat) / 4) * i;
      const lng = bMinLng + ((bMaxLng - bMinLng) / 4) * i;
      ctx.fillStyle = '#94a3b8';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(lat.toFixed(3), margin - 36, y + 3);
      ctx.fillText(lng.toFixed(3), x, margin + mapH + 14);
    }

    markers.forEach(m => {
      const x = toX(m.lng);
      const y = toY(m.lat);
      const isLate = m.status === 'late';
      ctx.beginPath();
      ctx.arc(x, y, 10, 0, Math.PI * 2);
      ctx.fillStyle = isLate ? '#f59e0b' : '#22c55e';
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(isLate ? 'L' : 'P', x, y);
      ctx.fillStyle = '#1e293b';
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(m.name, x + 14, y + 4);
    });

    canvas.onclick = (e) => {
      const rect2 = canvas.getBoundingClientRect();
      const cx = e.clientX - rect2.left;
      const cy = e.clientY - rect2.top;
      for (const m of markers) {
        const mx = toX(m.lng);
        const my = toY(m.lat);
        if (Math.sqrt((cx - mx) ** 2 + (cy - my) ** 2) < 14) {
          loadEmployeeHistory(m.userId);
          break;
        }
      }
    };
  }, [records]);

  useEffect(() => {
    api.get('/attendance-map').then(r => {
      setRecords(r.data.records || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!loading) renderMap();
  }, [loading, renderMap]);

  if (loading) return <div className="text-center py-8">{t('common.loading')}</div>;

  return (
    <div>
      <PageHeader title={t('employee_map.title')} subtitle={t('employee_map.subtitle')} actions={<PrintButton />} />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <div className="card p-0 overflow-hidden">
            <canvas ref={canvasRef} style={{ width: '100%', height: '500px', display: 'block' }} />
          </div>
        </div>
        <div className="space-y-4">
          <div className="card">
            <h3 className="font-bold text-sm mb-3">{t('employee_map.employees_today')} ({records.length})</h3>
            {records.length === 0 ? (
              <p className="text-sm text-gray-500">{t('employee_map.no_employees')}</p>
            ) : (
              <div className="space-y-2 max-h-[420px] overflow-y-auto">
                {records.map(r => (
                  <button key={r.id} onClick={() => loadEmployeeHistory(r.user_id)}
                    className={`w-full text-right p-3 rounded-lg border transition-colors ${selectedEmployee?.id === r.user_id ? 'border-primary-500 bg-primary-50' : 'border-gray-200 hover:border-gray-300'}`}>
                    <div className="flex items-center gap-2">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold ${r.status === 'late' ? 'bg-amber-500' : 'bg-green-500'}`}>{r.full_name?.charAt(0) || '?'}</div>
                      <div className="flex-1 min-w-0"><p className="text-sm font-medium truncate">{r.full_name}</p><p className="text-xs text-gray-500 truncate">{r.department || ''}</p></div>
                      <span className={`badge ${r.status === 'present' ? 'badge-success' : r.status === 'late' ? 'badge-warning' : 'badge-danger'} text-xs`}>{r.status === 'present' ? t('attendance_report.present') : t('attendance_report.late')}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
          {selectedEmployee && (
            <div className="card">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center"><UserCheck className="w-5 h-5 text-primary-600" /></div>
                <div><h4 className="font-bold text-sm">{selectedEmployee.full_name}</h4><p className="text-xs text-gray-500">{selectedEmployee.department || ''}</p></div>
              </div>
              {historyLoading ? (
                <p className="text-sm text-gray-500">{t('common.loading')}</p>
              ) : (
                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                  {employeeHistory.map((h: any) => (
                    <div key={h.id} className="p-2 border border-gray-100 rounded-lg text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{formatDate(h.date)}</span>
                        <span className={`badge ${h.status === 'present' ? 'badge-success' : h.status === 'late' ? 'badge-warning' : 'badge-danger'} text-xs`}>{h.status === 'present' ? t('attendance_report.present') : h.status === 'late' ? t('attendance_report.late') : t('attendance_report.absent')}</span>
                      </div>
                      <div className="flex gap-3 mt-1 text-gray-500">
                        <span>{t('today_attendance.check_in')}: {h.check_in_time ? formatTime(h.check_in_time) : '-'}</span>
                        <span>{t('today_attendance.check_out')}: {h.check_out_time ? formatTime(h.check_out_time) : '-'}</span>
                      </div>
                      {h.work_hours > 0 && <p className="text-gray-500">{t('today_attendance.work_hours')}: {h.work_hours} {t('attendance_report.hour')}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
