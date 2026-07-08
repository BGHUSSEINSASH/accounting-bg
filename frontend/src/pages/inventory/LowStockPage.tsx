import { useState, useEffect } from 'react';
import { Package, AlertTriangle } from 'lucide-react';
import api from '../../services/api';
import PageHeader from '../../components/ui/PageHeader';
import PrintButton from '../../components/ui/PrintButton';
import { formatCurrency } from '../../utils/format';
import { useTranslation } from '../../i18n/context';

export default function LowStockPage() {
  const { t } = useTranslation();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/items/low-stock').then(res => { setItems(res.data || []); setLoading(false); });
  }, []);

  return (
    <div>
      <PageHeader title={t('low_stock.title')} subtitle={t('low_stock.subtitle')} actions={<PrintButton />} />
      <div className="card">
        {loading ? <div className="text-center py-8">{t('common.loading')}</div> : items.length === 0 ? (
          <div className="text-center py-12">
            <Package className="w-16 h-16 text-green-500 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-green-600">{t('low_stock.no_items')}</h3>
            <p className="text-gray-500">{t('low_stock.safe_level')}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {items.map((item: any) => (
              <div key={item.id} className="border border-red-200 rounded-xl p-4 bg-red-50">
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="font-medium">{item.name}</h4>
                    <p className="text-xs text-gray-500">{item.code} - {item.category || t('low_stock.general')}</p>
                  </div>
                  <AlertTriangle className="w-5 h-5 text-red-500" />
                </div>
                <div className="mt-3 flex items-center gap-4">
                  <div><span className="text-xs text-gray-500">{t('low_stock.current_qty')}</span><p className="text-xl font-bold text-red-600">{item.current_quantity}</p></div>
                  <div><span className="text-xs text-gray-500">{t('low_stock.min_qty')}</span><p className="text-lg font-medium">{item.min_quantity}</p></div>
                  <div><span className="text-xs text-gray-500">{t('low_stock.selling_price')}</span><p className="text-lg font-medium">{formatCurrency(item.selling_price)}</p></div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
