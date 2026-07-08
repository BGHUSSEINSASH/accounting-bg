import { useState, useEffect } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import api from '../../services/api';
import PageHeader from '../../components/ui/PageHeader';
import PrintButton from '../../components/ui/PrintButton';
import { formatDate } from '../../utils/format';
import { useTranslation } from '../../i18n/context';

const COLORS = ['#10b981', '#f59e0b', '#ef4444'];

export default function AttendanceReportPage() {
  const { t } = useTranslation();
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/attendance/summary').then(r => { setData(r.data); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-center py-8">{t('common.loading')}</div>;
  if (data.length === 0) return <div className="text-center py-8 text-gray-500">{t('attendance_report.no_data')}</div>;

  return (
    <div>
      <PageHeader title={t('reports.attendance')} subtitle={t('reports.attendance_subtitle')} actions={<PrintButton />} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {data.map((employee: any) => {
          const pieData = [
            { name: t('attendance_report.present'), value: employee.present_days },
            { name: t('attendance_report.late'), value: employee.late_days },
            { name: t('attendance_report.absent'), value: employee.absent_days },
          ].filter(d => d.value > 0);

          return (
            <div key={employee.user_id} className="card">
              <h3 className="font-semibold mb-4">{employee.full_name}</h3>
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="text-center p-2 bg-green-50 rounded-lg"><p className="text-2xl font-bold text-green-600">{employee.present_days}</p><p className="text-xs text-gray-500">{t('attendance_report.present')}</p></div>
                <div className="text-center p-2 bg-yellow-50 rounded-lg"><p className="text-2xl font-bold text-yellow-600">{employee.late_days}</p><p className="text-xs text-gray-500">{t('attendance_report.late')}</p></div>
                <div className="text-center p-2 bg-red-50 rounded-lg"><p className="text-2xl font-bold text-red-600">{employee.absent_days}</p><p className="text-xs text-gray-500">{t('attendance_report.absent')}</p></div>
              </div>
              <div className="text-sm text-gray-500 space-y-1">
                <p>{t('attendance_report.total_hours')}: {employee.total_work_hours?.toFixed(1)} {t('attendance_report.hour')}</p>
                <p>{t('attendance_report.total_late')}: {employee.total_late_minutes} {t('attendance_report.minute')}</p>
              </div>
              {pieData.length > 0 && (
                <div className="h-40 mt-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={pieData} cx="50%" cy="50%" innerRadius={40} outerRadius={60} dataKey="value">
                        {pieData.map((_, idx) => <Cell key={idx} fill={COLORS[idx]} />)}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
