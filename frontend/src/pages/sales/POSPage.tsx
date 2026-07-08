import { useState, useEffect, useMemo } from 'react';
import { Search, Plus, Minus, Trash2, Printer, CreditCard, Banknote, Smartphone } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../services/api';
import { formatCurrency } from '../../utils/format';
import { authStore } from '../../store/authStore';
import { useTranslation } from '../../i18n/context';

interface CartItem {
  item_id: number;
  name: string;
  quantity: number;
  unit_price: number;
  discount: number;
  current_quantity: number;
}

export default function POSPage() {
  const { t } = useTranslation();
  const [items, setItems] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [clientId, setClientId] = useState<number | ''>('');
  const [discount, setDiscount] = useState(0);
  const [tax, setTax] = useState(0);
  const [paidAmount, setPaidAmount] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [cardNumber, setCardNumber] = useState('');
  const [cardholderName, setCardholderName] = useState('');
  const [transferReference, setTransferReference] = useState('');

  const currentUser = authStore.getUser();

  const invoiceNumber = useMemo(() => {
    return `INV-TEMP-${String(Math.floor(1000 + Math.random() * 9000))}`;
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.get('/items/all'),
      api.get('/clients/all'),
    ]).then(([itemsRes, clientsRes]) => {
      setItems(itemsRes.data);
      setClients(clientsRes.data);
    }).catch(() => {
      toast.error(t('pos.load_error'));
    }).finally(() => setLoading(false));
  }, []);

  const filteredItems = useMemo(() => {
    if (!search) return items;
    const q = search.toLowerCase();
    return items.filter(
      (i: any) =>
        i.name.toLowerCase().includes(q) ||
        (i.code && i.code.toLowerCase().includes(q)) ||
        (i.barcode && i.barcode.toLowerCase().includes(q))
    );
  }, [items, search]);

  const addToCart = (item: any) => {
    if (item.current_quantity <= 0) {
      toast.error(t('pos.no_stock'));
      return;
    }
    setCart(prev => {
      const existing = prev.find(c => c.item_id === item.id);
      if (existing) {
        return prev.map(c =>
          c.item_id === item.id
            ? { ...c, quantity: Math.min(c.quantity + 1, item.current_quantity) }
            : c
        );
      }
      return [...prev, {
        item_id: item.id,
        name: item.name,
        quantity: 1,
        unit_price: item.selling_price,
        discount: 0,
        current_quantity: item.current_quantity,
      }];
    });
  };

  const updateQuantity = (itemId: number, delta: number) => {
    setCart(prev =>
      prev.map(c => {
        if (c.item_id !== itemId) return c;
        const newQty = c.quantity + delta;
        if (newQty <= 0) return c;
        if (newQty > c.current_quantity) {
          toast.error(t('pos.qty_not_available'));
          return c;
        }
        return { ...c, quantity: newQty };
      })
    );
  };

  const removeFromCart = (itemId: number) => {
    setCart(prev => prev.filter(c => c.item_id !== itemId));
  };

  const subtotal = useMemo(
    () => cart.reduce((sum, c) => sum + c.quantity * c.unit_price, 0),
    [cart]
  );

  const totalLineDiscounts = useMemo(
    () => cart.reduce((sum, c) => sum + c.discount, 0),
    [cart]
  );

  const discountAmount = useMemo(() => {
    return (subtotal - totalLineDiscounts) * (discount / 100);
  }, [subtotal, totalLineDiscounts, discount]);

  const afterDiscount = subtotal - totalLineDiscounts - discountAmount;

  const taxAmount = useMemo(() => {
    return afterDiscount * (tax / 100);
  }, [afterDiscount, tax]);

  const total = afterDiscount + taxAmount;
  const remaining = total - paidAmount;
  const change = paidAmount > total ? paidAmount - total : 0;

  const clearCart = () => {
    setCart([]);
    setClientId('');
    setDiscount(0);
    setTax(0);
    setPaidAmount(0);
    setPaymentMethod('cash');
    setCardNumber('');
    setCardholderName('');
    setTransferReference('');
  };

  const handlePrint = () => {
    window.print();
  };

  const handleSubmit = async () => {
    if (cart.length === 0) {
      toast.error(t('pos.add_items_first'));
      return;
    }
    if (paidAmount <= 0 && paymentMethod !== 'credit') {
      toast.error(t('pos.enter_amount'));
      return;
    }

    setSubmitting(true);
    try {
      const payload: Record<string, any> = {
        client_id: clientId || null,
        invoice_date: new Date().toISOString().split('T')[0],
        items: cart.map(c => ({
          item_id: c.item_id,
          quantity: c.quantity,
          unit_price: c.unit_price,
          discount: c.discount,
        })),
        discount,
        tax,
        paid_amount: paidAmount,
        payment_method: paymentMethod,
        sales_rep_id: currentUser?.id || null,
      };
      if (paymentMethod === 'card') {
        payload.card_number = cardNumber || null;
        payload.cardholder_name = cardholderName || null;
      }
      if (paymentMethod === 'transfer') {
        payload.transfer_reference = transferReference || null;
      }
      await api.post('/sales', payload);
      toast.success(t('pos.sale_confirmed'));
      setTimeout(() => handlePrint(), 1000);
      clearCart();
    } catch (err: any) {
      toast.error(err.response?.data?.error || t('pos.error_saving'));
    } finally {
      setSubmitting(false);
    }
  };

  const paymentIcons: Record<string, React.ReactNode> = {
    cash: <Banknote className="w-4 h-4" />,
    card: <CreditCard className="w-4 h-4" />,
    credit: <Smartphone className="w-4 h-4" />,
    transfer: <Smartphone className="w-4 h-4" />,
  };

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col lg:flex-row gap-4 print:h-auto">
      <div className="flex-1 flex flex-col gap-4 overflow-hidden">
        <div className="card shrink-0">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={t('pos.search')}
              className="input-field pr-10 text-lg py-3"
              dir="rtl"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-64 text-gray-500">{t('pos.loading')}</div>
          ) : filteredItems.length === 0 ? (
            <div className="flex items-center justify-center h-64 text-gray-500">{t('pos.no_items')}</div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {filteredItems.map((item: any) => (
                <button
                  key={item.id}
                  onClick={() => addToCart(item)}
                  disabled={item.current_quantity <= 0}
                  className="card p-3 text-right hover:shadow-md hover:border-primary-300 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex flex-col gap-1 cursor-pointer dark:bg-gray-800 dark:border-gray-700 dark:hover:border-primary-600"
                >
                  {item.image && (
                    <div className="w-full h-24 rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-700 mb-1">
                      <img src={item.image} alt={item.name} className="w-full h-full object-cover" loading="lazy" />
                    </div>
                  )}
                  <span className="font-semibold text-sm line-clamp-2 dark:text-white">{item.name}</span>
                  <span className="text-lg font-bold text-primary-600 dark:text-primary-400">{formatCurrency(item.selling_price)}</span>
                  <span className={`text-xs ${item.current_quantity <= 5 ? 'text-red-500' : 'text-gray-500 dark:text-gray-400'}`}>
                    {t('pos.stock')} {item.current_quantity}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="w-full lg:w-96 xl:w-[420px] flex flex-col gap-4 print:w-full print:max-w-none">
        <div className="card shrink-0 dark:bg-gray-800 dark:border-gray-700">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold dark:text-white">{t('pos.sale_invoice')}</h2>
            <span className="text-sm text-gray-500 dark:text-gray-400 font-mono">{invoiceNumber}</span>
          </div>

          <div className="mb-3 flex gap-2">
            <select
              value={clientId}
              onChange={e => setClientId(e.target.value ? parseInt(e.target.value) : '')}
              className="select-field text-sm flex-1 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
            >
              <option value="">{t('pos.cash_client')}</option>
              {clients.map((c: any) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setClientId('')}
              className="px-3 py-2 text-xs font-medium bg-green-50 text-green-700 border border-green-200 rounded-lg hover:bg-green-100 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800 shrink-0"
            >
              نقدي
            </button>
          </div>

          <div className="max-h-64 overflow-y-auto space-y-2">
            {cart.length === 0 ? (
              <p className="text-center text-gray-400 dark:text-gray-500 py-8 text-sm">{t('pos.no_items_in_cart')}</p>
            ) : (
              cart.map((c, idx) => (
                <div key={c.item_id} className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm dark:text-white">{c.name}</span>
                    <button
                      onClick={() => removeFromCart(c.item_id)}
                      className="p-1 text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => updateQuantity(c.item_id, 1)}
                        className="p-1 bg-white dark:bg-gray-600 border dark:border-gray-500 rounded hover:bg-gray-50 dark:hover:bg-gray-500 text-primary-600 dark:text-primary-400"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                      <span className="w-8 text-center font-bold text-sm dark:text-white">{c.quantity}</span>
                      <button
                        onClick={() => updateQuantity(c.item_id, -1)}
                        disabled={c.quantity <= 1}
                        className="p-1 bg-white dark:bg-gray-600 border dark:border-gray-500 rounded hover:bg-gray-50 dark:hover:bg-gray-500 text-primary-600 dark:text-primary-400 disabled:opacity-30"
                      >
                        <Minus className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="text-left">
                      <div className="text-sm font-mono dark:text-white">{formatCurrency(c.quantity * c.unit_price)}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">{formatCurrency(c.unit_price)} {t('pos.per_unit')}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0">{t('pos.item_discount')}</span>
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      value={c.discount || ''}
                      onChange={e => {
                        const val = parseFloat(e.target.value) || 0;
                        setCart(prev =>
                          prev.map(c2 => (c2.item_id === c.item_id ? { ...c2, discount: val } : c2))
                        );
                      }}
                      className="input-field text-xs py-1 w-full dark:bg-gray-600 dark:border-gray-500 dark:text-white"
                      placeholder="0.00"
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="card dark:bg-gray-800 dark:border-gray-700">
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">{t('pos.subtotal')}</span>
              <span className="font-mono font-semibold dark:text-white">{formatCurrency(subtotal)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-600 dark:text-gray-400">{t('pos.discount_percent')}</span>
              <input
                type="number"
                min={0}
                max={100}
                step={0.01}
                value={discount || ''}
                onChange={e => setDiscount(parseFloat(e.target.value) || 0)}
                className="input-field text-xs py-1 w-20 dark:bg-gray-600 dark:border-gray-500 dark:text-white text-left"
                dir="ltr"
              />
            </div>
            {discount > 0 && (
              <div className="flex justify-between text-red-500">
                <span>{t('pos.discount_value')}</span>
                <span className="font-mono">-{formatCurrency(discountAmount)}</span>
              </div>
            )}
            <div className="flex justify-between items-center">
              <span className="text-gray-600 dark:text-gray-400">{t('pos.tax_percent')}</span>
              <input
                type="number"
                min={0}
                max={100}
                step={0.01}
                value={tax || ''}
                onChange={e => setTax(parseFloat(e.target.value) || 0)}
                className="input-field text-xs py-1 w-20 dark:bg-gray-600 dark:border-gray-500 dark:text-white text-left"
                dir="ltr"
              />
            </div>
            {tax > 0 && (
              <div className="flex justify-between text-blue-500">
                <span>{t('pos.tax_value')}</span>
                <span className="font-mono">+{formatCurrency(taxAmount)}</span>
              </div>
            )}
            <div className="flex justify-between text-lg font-bold border-t border-gray-200 dark:border-gray-600 pt-2">
              <span className="dark:text-white">{t('pos.total')}</span>
              <span className="text-primary-600 dark:text-primary-400 font-mono">{formatCurrency(total)}</span>
            </div>
          </div>
        </div>

        <div className="card dark:bg-gray-800 dark:border-gray-700">
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t('pos.payment_method')}</label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { value: 'cash', label: t('pos.cash'), icon: <Banknote className="w-4 h-4" /> },
                  { value: 'card', label: t('pos.card'), icon: <CreditCard className="w-4 h-4" /> },
                  { value: 'credit', label: t('pos.credit'), icon: <Smartphone className="w-4 h-4" /> },
                  { value: 'transfer', label: t('pos.transfer'), icon: <Smartphone className="w-4 h-4" /> },
                ].map(pm => (
                  <button
                    key={pm.value}
                    onClick={() => setPaymentMethod(pm.value)}
                    className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg border text-sm font-medium transition-all ${
                      paymentMethod === pm.value
                        ? 'border-primary-500 bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:border-primary-500 dark:text-primary-300'
                        : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-600'
                    }`}
                  >
                    {pm.icon}
                    {pm.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t('pos.paid_amount')}</label>
              <input
                type="number"
                min={0}
                step={0.01}
                value={paidAmount || ''}
                onChange={e => setPaidAmount(parseFloat(e.target.value) || 0)}
                className="input-field text-lg py-3 font-mono dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                placeholder="0.00"
                dir="ltr"
              />
            </div>

            {paymentMethod === 'card' && (
              <div className="space-y-2 border-t border-gray-100 dark:border-gray-700 pt-2">
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t('pos.card_number')}</label>
                  <input type="text" value={cardNumber} onChange={e => setCardNumber(e.target.value)} className="input-field text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" placeholder="**** **** **** ****" dir="ltr" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t('pos.cardholder_name')}</label>
                  <input type="text" value={cardholderName} onChange={e => setCardholderName(e.target.value)} className="input-field text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" placeholder={t('pos.cardholder_name_placeholder')} />
                </div>
              </div>
            )}
            {paymentMethod === 'transfer' && (
              <div className="border-t border-gray-100 dark:border-gray-700 pt-2">
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t('pos.transfer_reference')}</label>
                <input type="text" value={transferReference} onChange={e => setTransferReference(e.target.value)} className="input-field text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" placeholder={t('pos.transfer_reference_placeholder')} />
              </div>
            )}
            {paidAmount > 0 && (
              <div className="space-y-1">
                <div className={`flex justify-between text-sm ${remaining < 0 ? 'text-red-500' : 'text-gray-600 dark:text-gray-400'}`}>
                  <span>{remaining < 0 ? t('pos.remaining') : t('pos.remaining')}</span>
                  <span className="font-mono">{formatCurrency(Math.abs(remaining))}</span>
                </div>
                {change > 0 && (
                  <div className="flex justify-between text-sm text-green-600 dark:text-green-400">
                    <span>{t('pos.change')}</span>
                    <span className="font-mono">{formatCurrency(change)}</span>
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <button
                onClick={handleSubmit}
                disabled={submitting || cart.length === 0}
                className="flex-1 bg-primary-600 hover:bg-primary-700 disabled:bg-gray-300 dark:disabled:bg-gray-600 text-white py-3 rounded-lg font-semibold text-sm transition-colors flex items-center justify-center gap-2"
              >
                {submitting ? t('pos.confirming') : t('pos.confirm_sale')}
              </button>
              <button
                onClick={handlePrint}
                className="btn-secondary dark:bg-gray-700 dark:text-gray-200 dark:border-gray-600 dark:hover:bg-gray-600 px-4 flex items-center justify-center"
                title={t('pos.print')}
              >
                <Printer className="w-5 h-5" />
              </button>
              <button
                onClick={clearCart}
                className="btn-danger px-4 flex items-center justify-center"
                title={t('pos.clear')}
              >
                <Trash2 className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
