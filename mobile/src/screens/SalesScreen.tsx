import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, RefreshControl, Alert, TextInput, ScrollView } from 'react-native';
import { useTranslation } from '../i18n/context';
import api from '../services/api';

export default function SalesScreen() {
  const { t } = useTranslation();
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [clients, setClients] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [form, setForm] = useState({
    client_id: '', invoice_date: new Date().toISOString().split('T')[0],
    paid_amount: '0', payment_method: 'cash'
  });
  const [cart, setCart] = useState<any[]>([]);

  useEffect(() => {
    fetchInvoices();
    api.get('/clients/all').then(r => setClients(r.data));
    api.get('/items/all').then(r => setItems(r.data));
  }, []);

  const fetchInvoices = async () => {
    setLoading(true);
    try {
      const res = await api.get('/sales?limit=50');
      setInvoices(res.data.invoices);
    } catch (err) { console.error(err); }
    setLoading(false);
  };

  const addToCart = (item: any) => {
    const existing = cart.find(c => c.item_id === item.id);
    if (existing) {
      setCart(cart.map(c => c.item_id === item.id ? { ...c, quantity: c.quantity + 1 } : c));
    } else {
      setCart([...cart, { item_id: item.id, name: item.name, quantity: 1, unit_price: item.selling_price }]);
    }
  };

  const removeFromCart = (itemId: number) => {
    setCart(cart.filter(c => c.item_id !== itemId));
  };

  const submitInvoice = async () => {
    if (cart.length === 0) { Alert.alert(t('common.error'), t('sales.add_items_warning')); return; }
    try {
      await api.post('/sales', {
        ...form,
        client_id: form.client_id ? parseInt(form.client_id) : null,
        paid_amount: parseFloat(form.paid_amount),
        items: cart.map(c => ({ item_id: c.item_id, quantity: c.quantity, unit_price: c.unit_price }))
      });
      Alert.alert(t('common.success'), t('sales.invoice_created'));
      setCart([]);
      setShowNew(false);
      fetchInvoices();
    } catch (err: any) {
      Alert.alert(t('common.error'), err.response?.data?.error || t('common.error_occurred'));
    }
  };

  if (showNew) {
    const total = cart.reduce((s, c) => s + c.quantity * c.unit_price, 0);
    return (
      <ScrollView style={styles.container}>
        <Text style={styles.title}>{t('sales.new_invoice')}</Text>

        <Text style={styles.sectionTitle}>{t('sales.items')}</Text>
        <ScrollView horizontal style={styles.itemsScroll}>
          {items.map((item: any) => (
            <TouchableOpacity key={item.id} style={styles.itemCard} onPress={() => addToCart(item)}>
              <Text style={styles.itemName}>{item.name}</Text>
              <Text style={styles.itemPrice}>{item.selling_price} ر.س</Text>
              <Text style={styles.itemQty}>{t('sales.available')}: {item.current_quantity}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {cart.length > 0 && (
          <View style={styles.cartSection}>
            <Text style={styles.sectionTitle}>{t('sales.cart')}</Text>
            {cart.map((c, i) => (
              <View key={i} style={styles.cartItem}>
                <Text style={styles.cartItemName}>{c.name} x{c.quantity}</Text>
                <Text style={styles.cartItemPrice}>{(c.quantity * c.unit_price).toFixed(2)} ر.س</Text>
                <TouchableOpacity onPress={() => removeFromCart(c.item_id)}><Text style={{ color: 'red' }}>✕</Text></TouchableOpacity>
              </View>
            ))}
            <Text style={styles.totalText}>{t('sales.total')}: {total.toFixed(2)} ر.س</Text>
          </View>
        )}

        <TouchableOpacity style={styles.submitBtn} onPress={submitInvoice}>
          <Text style={styles.submitText}>{t('sales.save_invoice')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowNew(false)}>
          <Text style={styles.cancelText}>{t('common.cancel')}</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.newInvoiceBtn} onPress={() => setShowNew(true)}>
        <Text style={styles.newInvoiceText}>+ {t('sales.new_invoice')}</Text>
      </TouchableOpacity>

      <FlatList
        data={invoices}
        keyExtractor={(item) => item.id.toString()}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchInvoices} />}
        renderItem={({ item }) => (
          <View style={styles.invoiceCard}>
            <View style={styles.invoiceHeader}>
              <Text style={styles.invoiceNumber}>{item.invoice_number}</Text>
              <Text style={[styles.invoiceStatus, {
                color: item.payment_status === 'paid' ? '#10b981' : item.payment_status === 'partial' ? '#f59e0b' : '#ef4444'
              }]}>{item.payment_status === 'paid' ? t('sales.paid') : item.payment_status === 'partial' ? t('sales.partial') : t('sales.unpaid')}</Text>
            </View>
            <Text style={styles.invoiceClient}>{item.client_name || t('sales.cash_client')}</Text>
            <Text style={styles.invoiceTotal}>{item.total?.toFixed(2)} ر.س</Text>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.emptyText}>{t('sales.no_invoices')}</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#f8fafc' },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 16, textAlign: 'right' },
  sectionTitle: { fontSize: 16, fontWeight: '600', marginBottom: 8, marginTop: 16, textAlign: 'right' },
  newInvoiceBtn: { backgroundColor: '#3b82f6', padding: 14, borderRadius: 12, alignItems: 'center', marginBottom: 16 },
  newInvoiceText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  invoiceCard: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 8, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  invoiceHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  invoiceNumber: { fontWeight: 'bold', fontSize: 14 },
  invoiceStatus: { fontSize: 12, fontWeight: '600' },
  invoiceClient: { color: '#64748b', fontSize: 13 },
  invoiceTotal: { fontSize: 18, fontWeight: 'bold', marginTop: 4, color: '#3b82f6' },
  emptyText: { textAlign: 'center', color: '#94a3b8', marginTop: 40 },
  itemsScroll: { marginBottom: 16 },
  itemCard: { backgroundColor: '#fff', borderRadius: 12, padding: 12, marginRight: 8, minWidth: 100, borderWidth: 1, borderColor: '#e2e8f0' },
  itemName: { fontSize: 13, fontWeight: '600' },
  itemPrice: { fontSize: 12, color: '#3b82f6' },
  itemQty: { fontSize: 11, color: '#94a3b8' },
  cartSection: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 16 },
  cartItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  cartItemName: { fontSize: 14, flex: 1 },
  cartItemPrice: { fontSize: 14, fontWeight: '600', marginHorizontal: 8 },
  totalText: { fontSize: 18, fontWeight: 'bold', textAlign: 'left', marginTop: 12, color: '#3b82f6' },
  submitBtn: { backgroundColor: '#3b82f6', padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 8 },
  submitText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  cancelBtn: { padding: 12, alignItems: 'center', marginTop: 8 },
  cancelText: { color: '#64748b' },
});
