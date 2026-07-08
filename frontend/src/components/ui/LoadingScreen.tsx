import { Building2 } from 'lucide-react';

export default function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <Building2 className="w-12 h-12 text-primary-600 animate-pulse mx-auto" />
        <p className="mt-4 text-gray-500">جاري التحميل...</p>
      </div>
    </div>
  );
}
