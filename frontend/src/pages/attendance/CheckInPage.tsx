import { useState } from 'react';
import { MapPin, Camera, Clock, CheckCircle, Loader2, ExternalLink, Map, ArrowLeft, User, Image } from 'lucide-react';
import api from '../../services/api';
import PageHeader from '../../components/ui/PageHeader';
import PrintButton from '../../components/ui/PrintButton';
import CameraCapture from '../../components/ui/CameraCapture';
import { formatTime } from '../../utils/format';
import { useTranslation } from '../../i18n/context';

export default function CheckInPage() {
  const { t } = useTranslation();
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [selfieFile, setSelfieFile] = useState<File | null>(null);
  const [placeFile, setPlaceFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<'in' | 'out'>('in');
  const [step, setStep] = useState<'location' | 'selfie' | 'place' | 'confirm'>('location');

  const getLocation = () => {
    if (!navigator.geolocation) {
      setError(t('error.location_unavailable'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setStep('selfie');
        setError('');
      },
      () => {
        setError(t('error.location'));
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleSelfieCapture = (_blob: Blob, file: File) => {
    setSelfieFile(file);
    setStep('place');
  };

  const handlePlaceCapture = (_blob: Blob, file: File) => {
    setPlaceFile(file);
    setStep('confirm');
  };

  const handleSubmit = async () => {
    if (!location) { setError(t('error.location_required')); return; }
    setLoading(true);
    setError('');

    const formData = new FormData();
    formData.append('latitude', location.lat.toString());
    formData.append('longitude', location.lng.toString());
    if (selfieFile) formData.append('selfie', selfieFile);
    if (placeFile) formData.append('place_photo', placeFile);

    try {
      const endpoint = mode === 'in' ? '/attendance/check-in' : '/attendance/check-out';
      const res = await api.post(endpoint, formData);
      setResult(res.data);
    } catch (err: any) {
      setError(err.response?.data?.error || t('error.unknown'));
    } finally { setLoading(false); }
  };

  const resetAll = () => {
    setResult(null);
    setLocation(null);
    setSelfieFile(null);
    setPlaceFile(null);
    setError('');
    setStep('location');
  };

  const steps = [
    { key: 'location', label: t('attendance.step_location'), icon: MapPin },
    { key: 'selfie', label: t('attendance.step_selfie'), icon: User },
    { key: 'place', label: t('attendance.step_place'), icon: Image },
    { key: 'confirm', label: t('attendance.step_confirm'), icon: CheckCircle },
  ];
  const currentStepIdx = steps.findIndex(s => s.key === step);

  return (
    <div>
      <PageHeader title={t('attendance.check_in')} subtitle={t('attendance.check_in_subtitle')} actions={<PrintButton />} />

      <div className="max-w-lg mx-auto">
        <div className="card">
          {/* Mode selector */}
          <div className="flex gap-2 mb-6">
            <button onClick={() => { setMode('in'); resetAll(); }} className={`flex-1 py-3 rounded-xl text-center font-medium transition-colors ${mode === 'in' ? 'bg-primary-600 text-white shadow-lg shadow-primary-200' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              <Clock className="w-5 h-5 mx-auto mb-1" />{t('attendance.sign_in')}
            </button>
            <button onClick={() => { setMode('out'); resetAll(); }} className={`flex-1 py-3 rounded-xl text-center font-medium transition-colors ${mode === 'out' ? 'bg-primary-600 text-white shadow-lg shadow-primary-200' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              <Clock className="w-5 h-5 mx-auto mb-1" />{t('attendance.sign_out')}
            </button>
          </div>

          {/* Progress steps */}
          <div className="flex items-center justify-between mb-8 px-2">
            {steps.map((s, idx) => {
              const Icon = s.icon;
              const isActive = idx === currentStepIdx;
              const isDone = idx < currentStepIdx;
              return (
                <div key={s.key} className="flex items-center flex-1">
                  <div className={`flex flex-col items-center ${idx === 0 ? '' : 'mr-0'}`}>
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold transition-all ${isDone ? 'bg-green-500 text-white' : isActive ? 'bg-primary-600 text-white ring-4 ring-primary-100' : 'bg-gray-100 text-gray-400'}`}>
                      {isDone ? <CheckCircle className="w-5 h-5" /> : <Icon className="w-4 h-4" />}
                    </div>
                    <span className={`text-[10px] mt-1 whitespace-nowrap ${isActive ? 'text-primary-600 font-bold' : isDone ? 'text-green-600' : 'text-gray-400'}`}>{s.label}</span>
                  </div>
                  {idx < steps.length - 1 && <div className={`flex-1 h-0.5 mx-2 mt-[-1.5rem] ${idx < currentStepIdx ? 'bg-green-500' : 'bg-gray-200'}`} />}
                </div>
              );
            })}
          </div>

          {result ? (
            <div className="text-center py-8 animate-slideUp">
              <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-10 h-10 text-green-600" />
              </div>
              <h3 className="text-xl font-bold text-green-600">{t('attendance.success')}</h3>
              <p className="text-gray-500 mt-2 text-lg">{mode === 'in' ? t('attendance.sign_in') : t('attendance.sign_out')}</p>
              <div className="bg-gray-50 rounded-xl p-4 mt-4 text-right space-y-2 max-w-xs mx-auto">
                <div className="flex justify-between text-sm"><span className="text-gray-500">{t('attendance.time')}</span><span className="font-medium">{formatTime(result.time)}</span></div>
                {result.work_hours > 0 && <div className="flex justify-between text-sm"><span className="text-gray-500">{t('attendance.work_hours')}</span><span className="font-medium">{result.work_hours} {t('common.hour')}</span></div>}
                {result.status === 'late' && <div className="flex justify-between text-sm"><span className="text-red-500">{t('attendance.late')}</span><span className="font-medium text-red-600">{result.late_minutes} {t('common.min')}</span></div>}
                {result.early_checkout && <div className="flex justify-between text-sm"><span className="text-amber-500">{t('attendance.early_checkout')}</span><span className="font-medium text-amber-600">{result.early_minutes} {t('common.min')}</span></div>}
              </div>
              {location && (
                <a href={`https://www.google.com/maps?q=${location.lat},${location.lng}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline mt-3">
                  <Map className="w-4 h-4" /> {location.lat.toFixed(5)}, {location.lng.toFixed(5)} <ExternalLink className="w-3 h-3" />
                </a>
              )}
              <button onClick={resetAll} className="btn-primary mt-6 px-8 py-3 text-base">{t('common.done')}</button>
            </div>
          ) : (
            <div className="space-y-6 animate-fadeIn">
              {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm flex items-center gap-2"><span className="w-2 h-2 bg-red-500 rounded-full" />{error}</div>}

              {/* Step 1: Location */}
              {step === 'location' && (
                <div className="text-center py-4">
                  <div className="w-20 h-20 bg-primary-50 rounded-full flex items-center justify-center mx-auto mb-4">
                    <MapPin className="w-10 h-10 text-primary-600" />
                  </div>
                  <h4 className="text-lg font-bold mb-2">{t('attendance.location_title')}</h4>
                  <p className="text-sm text-gray-500 mb-6">{t('attendance.location_desc')}</p>
                  <button onClick={getLocation} className="btn-primary px-8 py-3 text-base flex items-center gap-2 mx-auto">
                    <MapPin className="w-5 h-5" /> {t('attendance.get_location')}
                  </button>
                </div>
              )}

              {/* Step 2: Selfie */}
              {step === 'selfie' && (
                <div>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 bg-primary-50 rounded-full flex items-center justify-center">
                      <User className="w-5 h-5 text-primary-600" />
                    </div>
                    <div>
                      <h4 className="font-bold text-sm">{t('attendance.selfie_title')}</h4>
                      <p className="text-xs text-gray-500">{t('attendance.selfie_desc')}</p>
                    </div>
                  </div>
                  {selfieFile ? (
                    <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center">
                      <Camera className="w-10 h-10 text-green-600 mx-auto mb-2" />
                      <p className="text-sm font-medium text-green-700">{t('attendance.captured')}</p>
                      <button onClick={() => { setSelfieFile(null); setStep('selfie'); }} className="btn-outline text-sm mt-3">{t('attendance.retake')}</button>
                    </div>
                  ) : (
                    <CameraCapture onCapture={handleSelfieCapture} facingMode="user" />
                  )}
                </div>
              )}

              {/* Step 3: Place Photo */}
              {step === 'place' && (
                <div>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 bg-primary-50 rounded-full flex items-center justify-center">
                      <Image className="w-5 h-5 text-primary-600" />
                    </div>
                    <div>
                      <h4 className="font-bold text-sm">{t('attendance.place_title')}</h4>
                      <p className="text-xs text-gray-500">{t('attendance.place_desc')}</p>
                    </div>
                  </div>
                  {placeFile ? (
                    <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center">
                      <Camera className="w-10 h-10 text-green-600 mx-auto mb-2" />
                      <p className="text-sm font-medium text-green-700">{t('attendance.captured')}</p>
                      <button onClick={() => { setPlaceFile(null); setStep('place'); }} className="btn-outline text-sm mt-3">{t('attendance.retake')}</button>
                    </div>
                  ) : (
                    <CameraCapture onCapture={handlePlaceCapture} facingMode="environment" />
                  )}
                </div>
              )}

              {/* Step 4: Confirm */}
              {step === 'confirm' && (
                <div className="space-y-4">
                  <div className="bg-gray-50 rounded-xl p-4 space-y-3">
                    <div className="flex items-center gap-3">
                      <MapPin className="w-5 h-5 text-primary-600" />
                      <div>
                        <p className="text-xs text-gray-500">{t('attendance.location')}</p>
                        <p className="text-sm font-medium">{location?.lat.toFixed(5)}, {location?.lng.toFixed(5)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <User className="w-5 h-5 text-green-600" />
                      <div>
                        <p className="text-xs text-gray-500">{t('attendance.selfie')}</p>
                        <p className="text-sm font-medium text-green-600">{t('attendance.captured')}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Image className="w-5 h-5 text-green-600" />
                      <div>
                        <p className="text-xs text-gray-500">{t('attendance.place_photo')}</p>
                        <p className="text-sm font-medium text-green-600">{t('attendance.captured')}</p>
                      </div>
                    </div>
                  </div>

                  <button type="button" onClick={handleSubmit} disabled={loading} className="btn-primary w-full py-3 text-base flex items-center justify-center gap-2">
                    {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle className="w-5 h-5" />}
                    {loading ? t('attendance.registering') : mode === 'in' ? t('attendance.sign_in') : t('attendance.sign_out')}
                  </button>

                  <button onClick={() => setStep('place')} className="btn-ghost w-full text-sm flex items-center justify-center gap-1">
                    <ArrowLeft className="w-4 h-4" /> {t('common.back')}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
