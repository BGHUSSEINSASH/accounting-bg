import { useState, useEffect } from 'react';
import { Clock, UserCheck, UserX, AlertTriangle, ExternalLink, MapPin } from 'lucide-react';
import api from '../../services/api';
import PageHeader from '../../components/ui/PageHeader';
import PrintButton from '../../components/ui/PrintButton';
import { formatTime } from '../../utils/format';
import { useTranslation } from '../../i18n/context';

export default function TodayAttendancePage() {
  const { t } = useTranslation();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/attendance/today').then(r => { setData(r.data); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const records = data?.records || [];
  const summary = data?.summary || { present: 0, late: 0, absent: 0 };

  if (loading) return <div className="text-center py-8">{t('common.loading')}</div>;
  if (!data) return <div className="text-center py-8">{t('common.no_data')}</div>;

  const googleMapsLink = (lat: number, lng: number) => `https://www.google.com/maps?q=${lat},${lng}`;

  return (
    <div>
      <PageHeader title={t('attendance.today')} subtitle={data.date} actions={<PrintButton />} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="stat-card"><div className="p-3 rounded-xl bg-green-50 text-green-600"><UserCheck className="w-6 h-6" /></div><div><p className="text-sm text-gray-500">{t('attendance_report.present')}</p><p className="text-2xl font-bold text-green-600">{summary.present}</p></div></div>
        <div className="stat-card"><div className="p-3 rounded-xl bg-yellow-50 text-yellow-600"><AlertTriangle className="w-6 h-6" /></div><div><p className="text-sm text-gray-500">{t('attendance_report.late')}</p><p className="text-2xl font-bold text-yellow-600">{summary.late}</p></div></div>
        <div className="stat-card"><div className="p-3 rounded-xl bg-red-50 text-red-600"><UserX className="w-6 h-6" /></div><div><p className="text-sm text-gray-500">{t('attendance_report.absent')}</p><p className="text-2xl font-bold text-red-600">{summary.absent}</p></div></div>
        <div className="stat-card"><div className="p-3 rounded-xl bg-blue-50 text-blue-600"><Clock className="w-6 h-6" /></div><div><p className="text-sm text-gray-500">{t('common.total')}</p><p className="text-2xl font-bold">{records.length}</p></div></div>
      </div>

      <div className="card">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead><tr><th className="table-header">{t('attendance.employee')}</th><th className="table-header">{t('today_attendance.department')}</th><th className="table-header">{t('today_attendance.check_in')}</th><th className="table-header">{t('today_attendance.check_out')}</th><th className="table-header">{t('today_attendance.work_hours')}</th><th className="table-header">{t('attendance.late')}</th><th className="table-header">{t('attendance.early_checkout_short')}</th><th className="table-header">{t('attendance_records.location')}</th><th className="table-header">{t('today_attendance.status')}</th></tr></thead>
            <tbody>
              {records.length === 0 ? <tr><td colSpan={9} className="text-center py-8 text-gray-500">{t('today_attendance.no_records')}</td></tr> : records.map((r: any) => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="table-cell font-medium">{r.full_name}</td>
                  <td className="table-cell">{r.department || '-'}</td>
                  <td className="table-cell whitespace-nowrap">
                    {r.check_in_time ? formatTime(r.check_in_time) : '-'}
                    {r.check_in_location_lat && (
                      <a href={googleMapsLink(r.check_in_location_lat, r.check_in_location_lng)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center text-blue-500 hover:text-blue-700 ml-1">
                        <MapPin className="w-3 h-3" />
                      </a>
                    )}
                  </td>
                  <td className="table-cell whitespace-nowrap">
                    {r.check_out_time ? formatTime(r.check_out_time) : '-'}
                    {r.check_out_location_lat && (
                      <a href={googleMapsLink(r.check_out_location_lat, r.check_out_location_lng)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center text-blue-500 hover:text-blue-700 ml-1">
                        <MapPin className="w-3 h-3" />
                      </a>
                    )}
                  </td>
                  <td className="table-cell">{r.work_hours ? `${r.work_hours} ${t('attendance_report.hour')}` : '-'}</td>
                  <td className="table-cell">{r.late_minutes ? `${r.late_minutes} ${t('attendance_report.minute')}` : '-'}</td>
                  <td className="table-cell">{r.early_minutes ? `${r.early_minutes} ${t('attendance_report.minute')}` : '-'}</td>
                  <td className="table-cell">
                    {r.check_in_location_lat ? (
                      <a href={googleMapsLink(r.check_in_location_lat, r.check_in_location_lng)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center text-blue-600 hover:underline text-xs">
                        <ExternalLink className="w-3 h-3 ml-1" />{t('attendance_records.view_map')}
                      </a>
                    ) : '-'}
                  </td>
                  <td className="table-cell"><span className={`badge ${r.status === 'present' ? 'badge-success' : r.status === 'late' ? 'badge-warning' : 'badge-danger'}`}>{r.status === 'present' ? t('attendance_report.present') : r.status === 'late' ? t('attendance_report.late') : t('attendance_report.absent')}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
