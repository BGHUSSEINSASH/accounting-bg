import { useRef, useEffect, useState } from 'react';
import { Camera, RefreshCw, CameraOff } from 'lucide-react';
import { useTranslation } from '../../i18n/context';

interface CameraCaptureProps {
  onCapture: (blob: Blob, file: File) => void;
  autoCapture?: boolean;
  facingMode?: 'user' | 'environment';
}

export default function CameraCapture({ onCapture, autoCapture = false, facingMode = 'user' }: CameraCaptureProps) {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [captured, setCaptured] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);

  useEffect(() => {
    return () => stopCamera();
  }, []);

  const startCamera = async () => {
    setLoading(true);
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode, width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play();
          setLoading(false);
          setCameraOn(true);
          if (autoCapture) setTimeout(capture, 1000);
        };
      }
    } catch {
      setError(t('attendance.camera_error'));
      setLoading(false);
    }
  };

  const capture = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const file = new File([blob], `capture_${Date.now()}.jpg`, { type: 'image/jpeg' });
      onCapture(blob, file);
      setCaptured(true);
      stopCamera();
    }, 'image/jpeg', 0.8);
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setCameraOn(false);
  };

  const retake = () => {
    setCaptured(false);
    setError('');
    startCamera();
  };

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
        <CameraOff className="w-10 h-10 text-red-400 mx-auto mb-3" />
        <p className="text-sm text-red-600 mb-3">{error}</p>
        <button type="button" onClick={retake} className="btn-primary text-sm">{t('common.retry')}</button>
      </div>
    );
  }

  if (captured) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center">
        <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
          <Camera className="w-6 h-6 text-green-600" />
        </div>
        <p className="text-sm font-medium text-green-700 mb-2">{t('attendance.captured')}</p>
        <button type="button" onClick={retake} className="btn-outline text-sm flex items-center gap-1.5 mx-auto">
          <RefreshCw className="w-3.5 h-3.5" /> {t('attendance.retake')}
        </button>
      </div>
    );
  }

  if (!cameraOn && !loading) {
    return (
      <div className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center">
        <Camera className="w-12 h-12 text-gray-300 mx-auto mb-3" />
        <p className="text-sm text-gray-500 mb-4">{t('attendance.tap_to_start')}</p>
        <button type="button" onClick={startCamera} className="btn-primary flex items-center gap-2 mx-auto">
          <Camera className="w-4 h-4" /> {t('attendance.open_camera')}
        </button>
      </div>
    );
  }

  return (
    <div className="relative rounded-xl overflow-hidden bg-black">
      {loading && <div className="absolute inset-0 flex items-center justify-center bg-black/60 z-10"><div className="animate-spin rounded-full h-10 w-10 border-2 border-white border-t-transparent" /></div>}
      <video ref={videoRef} className="w-full h-56 object-cover" playsInline muted />
      <canvas ref={canvasRef} className="hidden" />
      <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/70 to-transparent">
        <button type="button" onClick={capture} className="w-14 h-14 rounded-full bg-white mx-auto flex items-center justify-center hover:bg-gray-100 transition-all active:scale-95 shadow-lg border-4 border-white/50">
          <div className="w-10 h-10 rounded-full bg-primary-600" />
        </button>
      </div>
    </div>
  );
}
