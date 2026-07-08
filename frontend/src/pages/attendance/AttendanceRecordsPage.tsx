import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink, MapPin } from 'lucide-react';
import api from '../../services/api';
import PageHeader from '../../components/ui/PageHeader';
import PrintButton from '../../components/ui/PrintButton';
import Pagination from '../../components/ui/Pagination';
import { formatDate, formatTime, getStatusBadgeClass, getStatusText } from '../../utils/format';
import { useTranslation } from '../../i18n/context';

export default function AttendanceRecordsPage() {
  const { t } = useTranslation();
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1); const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState({ from: '', to: '', status: '' });

  useEffect(() => { fetchRecords(); }, [page]);

  const fetchRecords = async () => {
    const params = new URLSearchParams({ page: page.toString(), limit: '20' });
    if (filter.from) params.append('from', filter.from);
    if (filter.to) params.append('to', filter.to);
    if (filter.status) params.append('status', filter.status);
    const res = await api.get(`/attendance?${params}`);
    setRecords(res.data.records || []);
    setTotal(res.data.total || 0);
    setLoading(false);
  };

  const googleMapsLink = (lat: number, lng: number) => `https://www.google.com/maps?q=${lat},${lng}`;

  return (
    <div>
      <PageHeader title={t('attendance_records.title')} actions={<PrintButton />} />
      <div className="card">
        <div className="flex gap-3 mb-4">
          <input type="date" value={filter.from} onChange={e => setFilter({ ...filter, from: e.target.value })} className="input-field w-40" />
          <input type="date" value={filter.to} onChange={e => setFilter({ ...filter, to: e.target.value })} className="input-field w-40" />
          <select value={filter.status} onChange={e => setFilter({ ...filter, status: e.target.value })} className="select-field w-36">
            <option value="">{t('attendance_records.all_statuses')}</option><option value="present">{t('attendance_report.present')}</option><option value="late">{t('attendance_report.late')}</option><option value="absent">{t('attendance_report.absent')}</option>
          </select>
          <button onClick={() => { setPage(1); fetchRecords(); }} className="btn-primary">{t('common.search')}</button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className="table-header">{t('common.date')}</th>
                <th className="table-header">{t('attendance.employee')}</th>
                <th className="table-header">{t('today_attendance.department')}</th>
                <th className="table-header">{t('today_attendance.check_in')}</th>
                <th className="table-header">{t('today_attendance.check_out')}</th>
                <th className="table-header">{t('attendance_records.hours')}</th>
                <th className="table-header">{t('attendance_records.late_minutes')}</th>
                <th className="table-header">{t('attendance.early_checkout_short')}</th>
                <th className="table-header">{t('attendance_records.location')}</th>
                <th className="table-header">{t('common.status')}</th>
              </tr>
            </thead>
            <tbody>
              {loading ? <tr><td colSpan={10} className="text-center py-8">{t('common.loading')}</td></tr> : records.length === 0 ? <tr><td colSpan={10} className="text-center py-8 text-gray-500">{t('attendance_records.no_records')}</td></tr> : records.map((r: any) => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="table-cell">{formatDate(r.date)}</td>
                  <td className="table-cell font-medium"><Link to={'/hr/employees'} className="hover:text-primary-600 transition-colors">{r.full_name}</Link></td>
                  <td className="table-cell">{r.department || '-'}</td>
                  <td className="table-cell whitespace-nowrap">
                    {r.check_in_time ? formatTime(r.check_in_time) : '-'}
                    {r.check_in_location_lat && (
                      <a href={googleMapsLink(r.check_in_location_lat, r.check_in_location_lng)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center text-blue-500 hover:text-blue-700 ml-1" title={t('attendance_records.view_location')}>
                        <MapPin className="w-3 h-3" />
                      </a>
                    )}
                  </td>
                  <td className="table-cell whitespace-nowrap">
                    {r.check_out_time ? formatTime(r.check_out_time) : '-'}
                    {r.check_out_location_lat && (
                      <a href={googleMapsLink(r.check_out_location_lat, r.check_out_location_lng)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center text-blue-500 hover:text-blue-700 ml-1" title={t('attendance_records.view_location')}>
                        <MapPin className="w-3 h-3" />
                      </a>
                    )}
                  </td>
                  <td className="table-cell">{r.work_hours ? `${r.work_hours}` : '-'}</td>
                  <td className="table-cell">{r.late_minutes ? `${r.late_minutes} ${t('attendance_report.minute')}` : '-'}</td>
                  <td className="table-cell">{r.early_minutes ? `${r.early_minutes} ${t('attendance_report.minute')}` : '-'}</td>
                  <td className="table-cell">
                    {r.check_in_location_lat ? (
                      <a href={googleMapsLink(r.check_in_location_lat, r.check_in_location_lng)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center text-blue-600 hover:underline text-xs" title={t('attendance_records.view_location')}>
                        <ExternalLink className="w-3 h-3 ml-1" />{t('attendance_records.view_map')}
                      </a>
                    ) : '-'}
                  </td>
                  <td className="table-cell"><span className={`badge ${getStatusBadgeClass(r.status)}`}>{getStatusText(r.status)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination page={page} total={total} limit={20} onPageChange={setPage} />
      </div>
    </div>
  );
}
