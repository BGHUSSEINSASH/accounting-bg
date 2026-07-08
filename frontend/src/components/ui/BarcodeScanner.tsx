import { useState } from 'react';
import { Search, X } from 'lucide-react';

interface BarcodeScannerProps {
  onScan: (barcode: string) => void;
  onClose?: () => void;
}

export default function BarcodeScanner({ onScan, onClose }: BarcodeScannerProps) {
  const [manualBarcode, setManualBarcode] = useState('');

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualBarcode.trim()) {
      onScan(manualBarcode.trim());
      setManualBarcode('');
    }
  };

  return (
    <div className="relative">
      <form onSubmit={handleManualSubmit} className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={manualBarcode}
            onChange={(e) => setManualBarcode(e.target.value)}
            placeholder="ادخل الباركود... (اضغط Enter)"
            className="input-field pr-10 pl-4 text-right"
            dir="auto"
          />
        </div>
        {onClose && (
          <button type="button" onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        )}
      </form>
      {manualBarcode && (
        <div className="absolute top-full mt-2 w-full p-2 bg-blue-50 text-blue-700 rounded-lg text-sm text-center">
          <p>اضغط Enter للبحث عن الباركود: {manualBarcode}</p>
        </div>
      )}
    </div>
  );
}
