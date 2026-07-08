import { useState, useEffect } from 'react';
import { Upload, Trash2, CheckCircle, XCircle, FileText, RefreshCw, Ban } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../services/api';
import DataTable from '../../components/ui/DataTable';
import Modal from '../../components/ui/Modal';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import { Breadcrumbs } from '../../components/ui/Breadcrumbs';
import PageHeader from '../../components/ui/PageHeader';
import PrintButton from '../../components/ui/PrintButton';
import StatCard from '../../components/ui/StatCard';
import { formatDate, formatCurrency } from '../../utils/format';
import { useTranslation } from '../../i18n/context';

export default function BankReconciliationPage() {
  const { t } = useTranslation();
  const [bankAccounts, setBankAccounts] = useState<any[]>([]);
  const [selectedBankId, setSelectedBankId] = useState<string>('');

  const [activeTab, setActiveTab] = useState<'statements' | 'reconciliation'>('statements');
  const [statements, setStatements] = useState<any[]>([]);
  const [statementsLoading, setStatementsLoading] = useState(false);
  const [statementsPage, setStatementsPage] = useState(1);
  const [statementsTotal, setStatementsTotal] = useState(0);
  const [reconciledFilter, setReconciledFilter] = useState<string>('');

  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadData, setUploadData] = useState('');

  const [summary, setSummary] = useState<any>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);

  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [unmatchedStatements, setUnmatchedStatements] = useState<any[]>([]);
  const [unmatchedEntries, setUnmatchedEntries] = useState<any[]>([]);
  const [matchedItems, setMatchedItems] = useState<any[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);

  const [showMatchModal, setShowMatchModal] = useState(false);
  const [selectedStatement, setSelectedStatement] = useState<any>(null);
  const [selectedEntryId, setSelectedEntryId] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<{id: number; type: 'statement' | 'unmatch'} | null>(null);

  useEffect(() => { fetchBankAccounts(); }, []);

  const fetchBankAccounts = async () => {
    try {
      const res = await api.get('/bank-accounts');
      const accountsData = res.data.accounts || [];
      setBankAccounts(accountsData);
      if (accountsData.length > 0) setSelectedBankId(String(accountsData[0].id));
    } catch { toast.error(t('error.load')); }
  };

  useEffect(() => {
    if (selectedBankId) {
      fetchStatements();
      fetchSummary();
    }
  }, [selectedBankId, statementsPage, reconciledFilter]);

  const fetchStatements = async () => {
    setStatementsLoading(true);
    try {
      const params = new URLSearchParams({ page: String(statementsPage), limit: '20' });
      if (reconciledFilter) params.append('is_reconciled', reconciledFilter);
      const res = await api.get(`/bank-reconciliation/statements/${selectedBankId}?${params}`);
      setStatements(res.data.statements || res.data.data || []);
      setStatementsTotal(res.data.total || 0);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || t('error.load'));
    } finally { setStatementsLoading(false); }
  };

  const fetchSummary = async () => {
    setLoadingSummary(true);
    try {
      const res = await api.get(`/bank-reconciliation/reconcile/${selectedBankId}`);
      setSummary(res.data);
    } catch { /* ignore */ }
    finally { setLoadingSummary(false); }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (!uploadData.trim()) { toast.error(t('error.enter_data_or_file')); return; }
      await api.post('/bank-reconciliation/statements/upload', {
        bank_account_id: parseInt(selectedBankId),
        entries: JSON.parse(uploadData),
      });
      toast.success(t('common.success'));
      setShowUploadModal(false);
      setUploadData('');
      fetchStatements();
      fetchSummary();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || t('error.save'));
    }
  };

  const handleDeleteStatement = async (id: number) => {
    try {
      await api.delete(`/bank-reconciliation/statements/${id}`);
      toast.success(t('common.success'));
      fetchStatements();
      fetchSummary();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || t('error.delete'));
    }
  };

  const fetchSuggestions = async () => {
    setLoadingSuggestions(true);
    try {
      const res = await api.get(`/bank-reconciliation/reconcile/suggestions/${selectedBankId}`);
      setUnmatchedStatements(res.data.unmatched_statements || []);
      setUnmatchedEntries(res.data.unmatched_entries || []);
      setMatchedItems(res.data.matched_items || []);
      setSuggestions(res.data.suggestions || []);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || t('error.load'));
    } finally { setLoadingSuggestions(false); }
  };

  useEffect(() => {
    if (activeTab === 'reconciliation' && selectedBankId) {
      fetchSuggestions();
    }
  }, [activeTab, selectedBankId]);

  const handleMatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEntryId) { toast.error(t('error.select_entry')); return; }
    try {
      await api.post('/bank-reconciliation/reconcile/match', {
        bank_statement_id: selectedStatement.id,
        journal_entry_id: parseInt(selectedEntryId),
      });
      toast.success(t('common.success'));
      setShowMatchModal(false);
      setSelectedStatement(null);
      setSelectedEntryId('');
      fetchSuggestions();
      fetchStatements();
      fetchSummary();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || t('error.save'));
    }
  };

  const handleUnmatch = async (id: number) => {
    try {
      await api.post(`/bank-reconciliation/reconcile/unmatch/${id}`);
      toast.success(t('common.success'));
      fetchSuggestions();
      fetchStatements();
      fetchSummary();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || t('error.save'));
    }
  };

  const statementColumns = [
    { key: 'statement_date', label: t('reconciliation.statement_date'), render: (v: string) => v ? formatDate(v) : '-' },
    { key: 'reference', label: t('reconciliation.reference') },
    { key: 'description', label: t('reconciliation.description') },
    { key: 'debit', label: t('common.debit'), render: (v: number) => <span className="font-mono">{v ? formatCurrency(v) : '-'}</span> },
    { key: 'credit', label: t('common.credit'), render: (v: number) => <span className="font-mono">{v ? formatCurrency(v) : '-'}</span> },
    { key: 'balance', label: t('reconciliation.balance'), render: (v: number) => <span className="font-mono">{v != null ? formatCurrency(v) : '-'}</span> },
    { key: 'is_reconciled', label: t('reconciliation.status'), render: (_: any, row: any) => row.is_reconciled ? <span className="badge badge-success flex items-center gap-1 w-fit"><CheckCircle className="w-3 h-3" /> {t('reconciliation.reconciled')}</span> : <span className="badge badge-warning flex items-center gap-1 w-fit"><XCircle className="w-3 h-3" /> {t('reconciliation.unreconciled')}</span> },
  ];

  return (
    <div>
      <Breadcrumbs items={[{ label: t('common.accounting'), path: '/accounting' }, { label: t('reconciliation.title') }]} />
      <PageHeader title={t('reconciliation.title')} actions={<PrintButton />} />

      <div className="mb-6">
        <label className="block text-sm font-medium mb-1">{t('reconciliation.select_bank')}</label>
        <select value={selectedBankId} onChange={e => { setSelectedBankId(e.target.value); setStatementsPage(1); }} className="select-field w-72">
          <option value="">{t('reconciliation.select_hint')}</option>
          {bankAccounts.map((a: any) => <option key={a.id} value={a.id}>{a.account_name} - {a.bank_name} ({a.currency})</option>)}
        </select>
      </div>

      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
          <StatCard title={t('reconciliation.total_statements')} value={summary.total_statements || 0} icon={<FileText className="w-6 h-6" />} color="primary" />
          <StatCard title={t('reconciliation.reconciled')} value={summary.reconciled_count || 0} icon={<CheckCircle className="w-6 h-6" />} color="green" />
          <StatCard title={t('reconciliation.unreconciled')} value={summary.unmatched_count || 0} icon={<XCircle className="w-6 h-6" />} color="red" />
          <StatCard title={t('reconciliation.opening_balance')} value={formatCurrency(summary.opening_balance || 0)} icon={<FileText className="w-6 h-6" />} color="yellow" />
          <StatCard title={t('reconciliation.closing_balance')} value={formatCurrency(summary.closing_balance || 0)} icon={<FileText className="w-6 h-6" />} color="purple" />
        </div>
      )}

      <div className="flex items-center gap-2 border-b border-gray-200 mb-6">
        <button onClick={() => setActiveTab('statements')} className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${activeTab === 'statements' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>{t('reconciliation.statements_tab')}</button>
        <button onClick={() => setActiveTab('reconciliation')} className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${activeTab === 'reconciliation' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>{t('reconciliation.reconciliation_tab')}</button>
      </div>

      {activeTab === 'statements' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <button onClick={() => setShowUploadModal(true)} className="btn-primary flex items-center gap-2"><Upload className="w-4 h-4" /> {t('reconciliation.upload')}</button>
            </div>
            <select value={reconciledFilter} onChange={e => { setReconciledFilter(e.target.value); setStatementsPage(1); }} className="select-field w-44">
              <option value="">{t('reconciliation.all')}</option>
              <option value="1">{t('reconciliation.filter_reconciled')}</option>
              <option value="0">{t('reconciliation.filter_unreconciled')}</option>
            </select>
          </div>
          <DataTable columns={statementColumns} data={statements} loading={statementsLoading} page={statementsPage} total={statementsTotal} onPageChange={setStatementsPage} />
        </div>
      )}

      {activeTab === 'reconciliation' && (
        <div className="space-y-6">
          {loadingSuggestions ? (
            <div className="text-center py-8 text-gray-500">{t('common.loading')}</div>
          ) : (
            <>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="card">
                  <h3 className="font-semibold mb-3 text-red-600">{t('reconciliation.bank_unmatched')}</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead><tr><th className="table-header">{t('reconciliation.statement_date')}</th><th className="table-header">{t('reconciliation.reference')}</th><th className="table-header">{t('reconciliation.description')}</th><th className="table-header text-left">{t('reconciliation.amount')}</th><th className="table-header"></th></tr></thead>
                      <tbody>
                        {unmatchedStatements.length === 0 ? <tr><td colSpan={5} className="text-center py-4 text-gray-500">{t('reconciliation.no_data')}</td></tr> :
                          unmatchedStatements.map((s: any) => (
                            <tr key={s.id} className="hover:bg-gray-50">
                              <td className="table-cell">{s.statement_date ? formatDate(s.statement_date) : '-'}</td>
                              <td className="table-cell"><span className="text-gray-500">{s.reference || '-'}</span></td>
                              <td className="table-cell">{s.description || '-'}</td>
                              <td className="table-cell text-left font-mono">{formatCurrency(s.debit || s.credit || 0)}</td>
                              <td className="table-cell">
                                <button onClick={() => { setSelectedStatement(s); setSelectedEntryId(''); setShowMatchModal(true); }} className="btn-primary text-xs py-1 px-2">{t('reconciliation.reconcile_btn')}</button>
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="card">
                  <h3 className="font-semibold mb-3 text-blue-600">{t('reconciliation.journal_unmatched')}</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead><tr><th className="table-header">{t('reconciliation.entry_number')}</th><th className="table-header">{t('reconciliation.statement_date')}</th><th className="table-header">{t('reconciliation.description')}</th><th className="table-header text-left">{t('reconciliation.amount')}</th></tr></thead>
                      <tbody>
                        {unmatchedEntries.length === 0 ? <tr><td colSpan={4} className="text-center py-4 text-gray-500">{t('reconciliation.no_data')}</td></tr> :
                          unmatchedEntries.map((e: any) => (
                            <tr key={e.id} className="hover:bg-gray-50">
                              <td className="table-cell font-medium">{e.entry_number || e.id}</td>
                              <td className="table-cell">{e.entry_date ? formatDate(e.entry_date) : '-'}</td>
                              <td className="table-cell">{e.description || '-'}</td>
                              <td className="table-cell text-left font-mono">{formatCurrency(Math.abs(e.debit - e.credit) || 0)}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {matchedItems.length > 0 && (
                <div className="card">
                  <h3 className="font-semibold mb-3 text-green-600">{t('reconciliation.matched_items')}</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead><tr><th className="table-header">{t('reconciliation.statement_date')}</th><th className="table-header">{t('reconciliation.statement_desc')}</th><th className="table-header">{t('reconciliation.entry_number')}</th><th className="table-header">{t('reconciliation.entry_desc')}</th><th className="table-header text-left">{t('reconciliation.amount')}</th><th className="table-header">{t('reconciliation.reconciled_at')}</th><th className="table-header"></th></tr></thead>
                      <tbody>
                        {matchedItems.map((m: any) => (
                          <tr key={m.id} className="hover:bg-gray-50">
                            <td className="table-cell">{m.statement_date ? formatDate(m.statement_date) : '-'}</td>
                            <td className="table-cell">{m.statement_description || '-'}</td>
                            <td className="table-cell font-medium">{m.entry_number || '-'}</td>
                            <td className="table-cell">{m.entry_description || '-'}</td>
                            <td className="table-cell text-left font-mono">{formatCurrency(m.amount || 0)}</td>
                            <td className="table-cell">{m.reconciled_at ? formatDate(m.reconciled_at) : '-'}</td>
                            <td className="table-cell"><button onClick={() => setConfirmDelete({id: m.id, type: 'unmatch'})} className="p-1 hover:bg-gray-100 rounded"><Ban className="w-4 h-4 text-red-500" /></button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      <Modal isOpen={showUploadModal} onClose={() => setShowUploadModal(false)} title={t('reconciliation.upload_title')} size="lg">
        <form onSubmit={handleUpload} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">{t('reconciliation.upload_json')}</label>
            <textarea value={uploadData} onChange={e => setUploadData(e.target.value)} className="input-field" rows={8} placeholder='[{"statement_date":"2024-01-01","reference":"REF001","description":"...","debit":0,"credit":1000,"balance":1000}]' />
          </div>
        
          <button type="submit" className="btn-primary w-full flex items-center justify-center gap-2"><Upload className="w-4 h-4" /> {t('reconciliation.upload_btn')}</button>
        </form>
      </Modal>

      <Modal isOpen={showMatchModal} onClose={() => { setShowMatchModal(false); setSelectedStatement(null); setSelectedEntryId(''); }} title={t('reconciliation.match_title')}>
        <form onSubmit={handleMatch} className="space-y-4">
          {selectedStatement && (
            <div className="bg-gray-50 p-3 rounded-lg space-y-1">
              <p className="text-sm"><span className="text-gray-500">{t('reconciliation.statement_info')}</span> {selectedStatement.description || '-'}</p>
              <p className="text-sm"><span className="text-gray-500">{t('reconciliation.statement_amount')}</span> <span className="font-mono">{formatCurrency(selectedStatement.debit || selectedStatement.credit || 0)}</span></p>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium mb-1">{t('reconciliation.select_entry')}</label>
            <select value={selectedEntryId} onChange={e => setSelectedEntryId(e.target.value)} className="select-field" required>
              <option value="">{t('reconciliation.select_entry_hint')}</option>
              {unmatchedEntries.map((e: any) => (
                <option key={e.id} value={e.id}>#{e.entry_number || e.id} - {e.description || ''} ({formatCurrency(Math.abs(e.debit - e.credit) || 0)})</option>
              ))}
            </select>
          </div>
          <button type="submit" className="btn-primary w-full">{t('reconciliation.confirm_match')}</button>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => {
          if (confirmDelete?.type === 'statement') handleDeleteStatement(confirmDelete.id);
          else if (confirmDelete?.type === 'unmatch') handleUnmatch(confirmDelete.id);
          setConfirmDelete(null);
        }}
        title={t('reconciliation.confirm_title')}
        message={confirmDelete?.type === 'statement' ? t('reconciliation.confirm_delete_statement') : t('reconciliation.confirm_unmatch')}
        variant="danger"
      />
    </div>
  );
}
