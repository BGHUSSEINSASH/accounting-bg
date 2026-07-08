import { useState, useEffect } from 'react';
import { Shield, Plus, Pencil, Trash2, UserPlus, Users, Save, X, RefreshCw, Check, User as UserIcon } from 'lucide-react';
import api from '../../services/api';
import PageHeader from '../../components/ui/PageHeader';
import PrintButton from '../../components/ui/PrintButton';
import Modal from '../../components/ui/Modal';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import { Breadcrumbs } from '../../components/ui/Breadcrumbs';
import toast from 'react-hot-toast';
import { useTranslation } from '../../i18n/context';

interface PermissionGroup {
  id: number;
  name: string;
  description: string;
  is_system: number;
}

interface Permission {
  resource: string;
  can_view: number;
  can_create: number;
  can_edit: number;
  can_delete: number;
  can_approve: number;
}

interface GroupUser {
  id: number;
  user_id: number;
  user_name: string;
}

interface SimpleUser {
  id: number;
  full_name: string;
  username: string;
}

export default function PermissionsPage() {
  const { t } = useTranslation();
  const [groups, setGroups] = useState<PermissionGroup[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<PermissionGroup | null>(null);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [groupUsers, setGroupUsers] = useState<GroupUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'permissions' | 'users'>('permissions');

  const [showGroupModal, setShowGroupModal] = useState(false);
  const [groupForm, setGroupForm] = useState({ name: '', description: '' });
  const [editGroupId, setEditGroupId] = useState<number | null>(null);

  const [showAddPermission, setShowAddPermission] = useState(false);
  const [newPermission, setNewPermission] = useState({ resource: '', can_view: true, can_create: false, can_edit: false, can_delete: false, can_approve: false });

  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [users, setUsers] = useState<SimpleUser[]>([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<{id: number; type: 'group' | 'user'} | null>(null);

  const fetchGroups = async () => {
    try {
      const { data } = await api.get('/permissions/groups');
      setGroups(data);
    } catch {
      toast.error(t('error.load'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchGroups(); }, []);

  useEffect(() => {
    if (!selectedGroup) return;
    api.get(`/permissions/groups/${selectedGroup.id}/permissions`).then(({ data }) => setPermissions(data)).catch(() => {});
    api.get(`/permissions/groups/${selectedGroup.id}/users`).then(({ data }) => setGroupUsers(data)).catch(() => {});
  }, [selectedGroup]);

  const handleInitDefaults = async () => {
    try {
      await api.post('/permissions/init-defaults');
      toast.success(t('permissions.init_defaults'));
      fetchGroups();
    } catch {
      toast.error(t('error.save'));
    }
  };

  const handleSaveGroup = async () => {
    try {
      if (editGroupId) {
        await api.put(`/permissions/groups/${editGroupId}`, groupForm);
        toast.success(t('common.update'));
      } else {
        await api.post('/permissions/groups', groupForm);
        toast.success(t('common.create'));
      }
      setShowGroupModal(false);
      setEditGroupId(null);
      setGroupForm({ name: '', description: '' });
      fetchGroups();
    } catch {
      toast.error(t('error.save'));
    }
  };

  const handleDeleteGroup = async (id: number) => {
    try {
      await api.delete(`/permissions/groups/${id}`);
      toast.success(t('common.delete'));
      if (selectedGroup?.id === id) setSelectedGroup(null);
      fetchGroups();
    } catch {
      toast.error(t('error.delete'));
    }
  };

  const handleSavePermissions = async () => {
    try {
      if (!selectedGroup) return;
      const permData = permissions.map(p => ({
        resource: p.resource,
        can_view: p.can_view,
        can_create: p.can_create,
        can_edit: p.can_edit,
        can_delete: p.can_delete,
        can_approve: p.can_approve,
      }));
      await api.post(`/permissions/groups/${selectedGroup.id}/permissions`, { permissions: permData });
      toast.success(t('common.save'));
    } catch {
      toast.error(t('error.save'));
    }
  };

  const togglePermission = (index: number, field: keyof Permission) => {
    setPermissions(prev => prev.map((p, i) => i === index ? { ...p, [field]: p[field] ? 0 : 1 } : p));
  };

  const addNewPermission = () => {
    if (!newPermission.resource) { toast.error(t('permissions.resource_required')); return; }
    setPermissions(prev => [...prev, {
      resource: newPermission.resource,
      can_view: newPermission.can_view ? 1 : 0,
      can_create: newPermission.can_create ? 1 : 0,
      can_edit: newPermission.can_edit ? 1 : 0,
      can_delete: newPermission.can_delete ? 1 : 0,
      can_approve: newPermission.can_approve ? 1 : 0,
    }]);
    setNewPermission({ resource: '', can_view: true, can_create: false, can_edit: false, can_delete: false, can_approve: false });
    setShowAddPermission(false);
  };

  const openAddUser = async () => {
    try {
      const { data } = await api.get('/auth/users');
      setUsers(data);
      setSelectedUserId('');
      setShowAddUserModal(true);
    } catch { toast.error(t('error.load')); }
  };

  const handleAddUser = async () => {
    if (!selectedUserId || !selectedGroup) return;
    try {
      await api.post(`/permissions/groups/${selectedGroup.id}/users`, { user_id: parseInt(selectedUserId) });
      toast.success(t('common.create'));
      setShowAddUserModal(false);
      const { data } = await api.get(`/permissions/groups/${selectedGroup.id}/users`);
      setGroupUsers(data);
    } catch { toast.error(t('error.save')); }
  };

  const handleRemoveUser = async (userId: number) => {
    if (!selectedGroup) return;
    try {
      await api.delete(`/permissions/groups/${selectedGroup.id}/users/${userId}`);
      toast.success(t('common.delete'));
      const { data } = await api.get(`/permissions/groups/${selectedGroup.id}/users`);
      setGroupUsers(data);
    } catch { toast.error(t('error.delete')); }
  };

  const permCheckboxes = (index: number, field: keyof Permission) => (
    <input type="checkbox" checked={!!permissions[index]?.[field]} onChange={() => togglePermission(index, field)} className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500" />
  );

  return (
    <div>
      <Breadcrumbs items={[{ label: t('admin.title') }, { label: t('admin.permissions') }]} />
      <PageHeader title={t('admin.permissions')} subtitle={t('permissions.subtitle')} actions={
        <><button onClick={handleInitDefaults} className="btn-secondary flex items-center gap-2"><RefreshCw className="w-4 h-4" /> {t('permissions.init_defaults')}</button><PrintButton /></>
      } />

      <div className="flex gap-6">
        <div className="w-80 shrink-0">
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-medium">{t('permissions.groups')}</h3>
              <button onClick={() => { setEditGroupId(null); setGroupForm({ name: '', description: '' }); setShowGroupModal(true); }} className="btn-primary btn-sm flex items-center gap-1"><Plus className="w-3 h-3" /> {t('common.add')}</button>
            </div>
            {loading ? <p className="text-gray-500 text-sm py-4 text-center">{t('common.loading')}</p> : (
              <div className="space-y-2">
                {groups.map(g => (
                  <div key={g.id} onClick={() => setSelectedGroup(g)} className={`p-3 rounded-lg cursor-pointer transition-colors ${selectedGroup?.id === g.id ? 'bg-primary-50 border border-primary-200' : 'hover:bg-gray-50 border border-transparent'}`}>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-sm">{g.name}</p>
                        {g.description && <p className="text-xs text-gray-500 mt-0.5">{g.description}</p>}
                      </div>
                      {!g.is_system && (
                        <div className="flex gap-1 shrink-0">
                          <button onClick={(e) => { e.stopPropagation(); setEditGroupId(g.id); setGroupForm({ name: g.name, description: g.description || '' }); setShowGroupModal(true); }} className="p-1 hover:bg-gray-100 rounded"><Pencil className="w-3.5 h-3.5 text-gray-500" /></button>
                          <button onClick={(e) => { e.stopPropagation(); setConfirmDelete({id: g.id, type: 'group'}); }} className="p-1 hover:bg-red-50 rounded"><Trash2 className="w-3.5 h-3.5 text-red-500" /></button>
                        </div>
                      )}
                    </div>
                    {g.is_system === 1 && <span className="badge badge-info mt-1 inline-block">{t('permissions.system')}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex-1">
          {!selectedGroup ? (
            <div className="card flex items-center justify-center py-16">
              <div className="text-center text-gray-400">
                <Shield className="w-12 h-12 mx-auto mb-3" />
                <p>{t('permissions.select_group')}</p>
              </div>
            </div>
          ) : (
            <div className="card">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-medium">{selectedGroup.name}</h3>
              </div>

              <div className="flex gap-4 mb-4 border-b border-gray-200">
                <button onClick={() => setActiveTab('permissions')} className={`px-4 py-2 border-b-2 text-sm transition-colors ${activeTab === 'permissions' ? 'border-primary-600 text-primary-600 font-medium' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>{t('admin.permissions')}</button>
                <button onClick={() => setActiveTab('users')} className={`px-4 py-2 border-b-2 text-sm transition-colors ${activeTab === 'users' ? 'border-primary-600 text-primary-600 font-medium' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>{t('admin.users')}</button>
              </div>

              {activeTab === 'permissions' && (
                <div>
                  <div className="flex justify-between items-center mb-3">
                    <p className="text-sm text-gray-500">{t('permissions.manage_resources')}</p>
                    <div className="flex gap-2">
                      <button onClick={() => setShowAddPermission(true)} className="btn-primary btn-sm flex items-center gap-1"><Plus className="w-3 h-3" /> {t('permissions.add_permission')}</button>
                      <button onClick={handleSavePermissions} className="btn-primary btn-sm flex items-center gap-1"><Save className="w-3 h-3" /> {t('common.save')}</button>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50 text-gray-500">
                          <th className="text-right p-2">{t('permissions.resource')}</th>
                          <th className="text-center p-2">{t('permissions.view')}</th>
                          <th className="text-center p-2">{t('common.add')}</th>
                          <th className="text-center p-2">{t('common.edit')}</th>
                          <th className="text-center p-2">{t('common.delete')}</th>
                          <th className="text-center p-2">{t('permissions.approve')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {permissions.map((p, i) => (
                          <tr key={p.resource} className="border-t border-gray-100 hover:bg-gray-50">
                            <td className="p-2 font-medium">{p.resource}</td>
                            <td className="text-center p-2">{permCheckboxes(i, 'can_view')}</td>
                            <td className="text-center p-2">{permCheckboxes(i, 'can_create')}</td>
                            <td className="text-center p-2">{permCheckboxes(i, 'can_edit')}</td>
                            <td className="text-center p-2">{permCheckboxes(i, 'can_delete')}</td>
                            <td className="text-center p-2">{permCheckboxes(i, 'can_approve')}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {activeTab === 'users' && (
                <div>
                  <div className="flex justify-between items-center mb-3">
                    <p className="text-sm text-gray-500">{t('permissions.group_users')}</p>
                    <button onClick={openAddUser} className="btn-primary btn-sm flex items-center gap-1"><UserPlus className="w-3 h-3" /> {t('permissions.add_user_to_group')}</button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50 text-gray-500">
                          <th className="text-right p-2">{t('common.name')}</th>
                          <th className="text-center p-2"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {groupUsers.map(gu => (
                          <tr key={gu.id} className="border-t border-gray-100 hover:bg-gray-50">
                            <td className="p-2"><div className="flex items-center gap-2"><UserIcon className="w-4 h-4 text-gray-400" /> {gu.user_name}</div></td>
                            <td className="p-2 text-center">
                              <button onClick={() => setConfirmDelete({id: gu.user_id, type: 'user'})} className="p-1 hover:bg-red-50 rounded"><X className="w-4 h-4 text-red-500" /></button>
                            </td>
                          </tr>
                        ))}
                        {groupUsers.length === 0 && <tr><td colSpan={2} className="text-center py-4 text-gray-400">{t('permissions.no_users')}</td></tr>}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <Modal isOpen={showGroupModal} onClose={() => setShowGroupModal(false)} title={editGroupId ? t('permissions.edit_group') : t('permissions.add_group')}>
        <div className="space-y-4">
          <input className="input-field" placeholder={t('permissions.name')} value={groupForm.name} onChange={e => setGroupForm({...groupForm, name: e.target.value})} />
          <input className="input-field" placeholder={t('permissions.description')} value={groupForm.description} onChange={e => setGroupForm({...groupForm, description: e.target.value})} />
          <div className="flex gap-3 justify-end mt-6">
            <button onClick={() => setShowGroupModal(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">{t('common.cancel')}</button>
            <button onClick={handleSaveGroup} className="btn-primary">{editGroupId ? t('common.update') : t('common.add')}</button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={showAddPermission} onClose={() => setShowAddPermission(false)} title={t('permissions.add_permission_title')} size="sm">
        <div className="space-y-4">
          <input className="input-field" placeholder={t('permissions.resource_placeholder')} value={newPermission.resource} onChange={e => setNewPermission({...newPermission, resource: e.target.value})} />
          <div className="grid grid-cols-2 gap-3">
            {(['can_view', 'can_create', 'can_edit', 'can_delete', 'can_approve'] as const).map(field => (
              <label key={field} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={newPermission[field]} onChange={e => setNewPermission({...newPermission, [field]: e.target.checked})} className="w-4 h-4 rounded border-gray-300 text-primary-600" />
                {{ can_view: t('permissions.view'), can_create: t('common.add'), can_edit: t('common.edit'), can_delete: t('common.delete'), can_approve: t('permissions.approve') }[field]}
              </label>
            ))}
          </div>
          <div className="flex gap-3 justify-end mt-6">
            <button onClick={() => setShowAddPermission(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">{t('common.cancel')}</button>
            <button onClick={addNewPermission} className="btn-primary">{t('common.add')}</button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={showAddUserModal} onClose={() => setShowAddUserModal(false)} title={t('permissions.add_user_to_group')} size="sm">
        <div className="space-y-4">
          <select className="input-field" value={selectedUserId} onChange={e => setSelectedUserId(e.target.value)}>
            <option value="">{t('permissions.select_user')}</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.full_name || u.username}</option>)}
          </select>
          <div className="flex gap-3 justify-end mt-6">
            <button onClick={() => setShowAddUserModal(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">{t('common.cancel')}</button>
            <button onClick={handleAddUser} className="btn-primary">{t('common.add')}</button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => {
          if (confirmDelete?.type === 'group') handleDeleteGroup(confirmDelete.id);
          else if (confirmDelete?.type === 'user') handleRemoveUser(confirmDelete.id);
          setConfirmDelete(null);
        }}
        title={t('common.confirm_title')}
        message={confirmDelete?.type === 'group' ? t('permissions.confirm_delete_group') : t('permissions.confirm_remove_user')}
        variant="danger"
      />
    </div>
  );
}
