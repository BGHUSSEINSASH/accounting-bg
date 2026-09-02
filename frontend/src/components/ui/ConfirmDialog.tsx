import Modal from './Modal';

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose?: () => void;
  onCancel?: () => void;
  onConfirm: () => void;
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'info';
}

export default function ConfirmDialog({
  isOpen,
  onClose,
  onCancel,
  onConfirm,
  title = 'تأكيد',
  message,
  confirmText = 'تأكيد',
  cancelText = 'إلغاء',
  variant = 'danger',
}: ConfirmDialogProps) {
  const handleClose = onCancel || onClose || (() => {});
  const variantStyles: Record<string, string> = {
    danger: 'bg-red-600 hover:bg-red-700',
    warning: 'bg-yellow-500 hover:bg-yellow-600',
    info: 'bg-blue-600 hover:bg-blue-700',
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={title} size="sm">
      <div className="space-y-4">
        <p className="text-gray-600 dark:text-gray-300">{message}</p>
        <div className="flex gap-3 justify-end">
          <button onClick={handleClose} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">
            {cancelText}
          </button>
          <button onClick={onConfirm} className={`px-4 py-2 text-white rounded-lg ${variantStyles[variant]}`}>
            {confirmText}
          </button>
        </div>
      </div>
    </Modal>
  );
}
