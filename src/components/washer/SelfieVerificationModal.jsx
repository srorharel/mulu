import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { Camera } from '@capacitor/camera';
import { supabase } from '../../lib/supabase.js';

const BUCKET = 'washer-verification';
const FRAMES_NEEDED = 30;

// Oval geometry — JS detection and SVG guide must stay in sync via this constant.
const OVAL = { cx: 0.5, cy: 0.5, rx: 0.38, ry: 0.32 };

const STATES = {
  INIT: 'init',
  PERMISSION_DENIED: 'permission_denied',
  NO_CAMERA: 'no_camera',
  UNSUPPORTED: 'unsupported',
  LOADING_DETECTOR: 'loading_detector',
  READY: 'ready',
  CAPTURING: 'capturing',
  UPLOADING: 'uploading',
  DONE: 'done',
  ERROR: 'error',
};

const OVAL_STROKE = {
  none:       '#9ca3af',
  off_center: '#facc15',
  too_far:    '#facc15',
  too_close:  '#facc15',
  good:       '#22c55e',
};

// Debug gating — overlays visible in dev only, absent in production builds.
const DEBUG_SELFIE = import.meta.env.DEV;
const log  = DEBUG_SELFIE ? console.log.bind(console, '[selfie]')  : () => {};
const warn = console.warn.bind(console, '[selfie]');
const err  = console.error.bind(console, '[selfie]');

function pointInOval(px, py) {
  const dx = (px - OVAL.cx) / OVAL.rx;
  const dy = (py - OVAL.cy) / OVAL.ry;
  return (dx * dx + dy * dy) <= 1;
}

// Exported so unit tests can exercise it directly.
export function evaluateFace(box, vw, vh) {
  if (!box || !vw || !vh) return 'none';

  const x1   = box.x / vw;
  const y1   = box.y / vh;
  const x2   = (box.x + box.width)  / vw;
  const y2   = (box.y + box.height) / vh;
  const size = (box.width * box.height) / (vw * vh);

  if (size < 0.06) return 'too_far';
  if (size > 0.45) return 'too_close';

  // All 4 corners plus the center must be inside the oval.
  const points = [
    [x1, y1], [x2, y1], [x1, y2], [x2, y2],
    [(x1 + x2) / 2, (y1 + y2) / 2],
  ];
  if (!points.every(([px, py]) => pointInOval(px, py))) return 'off_center';
  return 'good';
}

export default function SelfieVerificationModal({ userId, onCapture, onClose }) {
  const { t } = useTranslation();

  const videoRef      = useRef(null);
  const streamRef     = useRef(null);
  const detectorRef   = useRef(null);
  const rafRef        = useRef(null);
  const goodFramesRef = useRef(0);
  const capturedRef   = useRef(false);
  const startRef      = useRef(null);

  const [state,     setState]     = useState(STATES.INIT);
  const [faceState, setFaceState] = useState('none');
  const [errorMsg,  setErrorMsg]  = useState('');
  const [debug,     setDebug]     = useState({ frames: 0, lastDetect: null });

  function stopCamera() {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    streamRef.current?.getTracks().forEach(tr => {
      log('stopping track', tr.kind);
      tr.stop();
    });
    streamRef.current = null;
  }

  async function loadDetector() {
    setState(STATES.LOADING_DETECTOR);
    log('checking FaceDetector...');

    if ('FaceDetector' in window) {
      try {
        const d = new window.FaceDetector({ fastMode: true, maxDetectedFaces: 1 });
        await d.detect(videoRef.current);
        detectorRef.current = {
          type: 'native',
          isAsync: true,
          detect: (v) => d.detect(v),
        };
        log('native FaceDetector ready');
        return;
      } catch (e) {
        warn('native FaceDetector failed smoke test', e);
      }
    }

    log('falling back to MediaPipe...');
    try {
      const vision = await import('@mediapipe/tasks-vision');
      const fileset = await vision.FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm'
      );
      const mp = await vision.FaceDetector.createFromOptions(fileset, {
        baseOptions: {
          modelAssetPath:
            'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite',
        },
        runningMode: 'VIDEO',
      });
      detectorRef.current = {
        type: 'mediapipe',
        isAsync: false,
        detect: (v) => {
          const r = mp.detectForVideo(v, performance.now());
          return r.detections.map(d => ({
            boundingBox: {
              x: d.boundingBox.originX,
              y: d.boundingBox.originY,
              width: d.boundingBox.width,
              height: d.boundingBox.height,
            },
          }));
        },
      };
      log('MediaPipe ready');
    } catch (e) {
      err('MediaPipe load failed', e);
      setState(STATES.UNSUPPORTED);
      throw e;
    }
  }

  function startLoop() {
    log('loop starting');
    let frameCount = 0;
    capturedRef.current = false;

    const tick = async () => {
      if (capturedRef.current) return;
      const video = videoRef.current;
      if (!video || !detectorRef.current) {
        warn('tick aborted, no video or detector');
        return;
      }

      try {
        const { isAsync, detect } = detectorRef.current;
        const rawFaces = isAsync ? await detect(video) : detect(video);
        frameCount++;

        const box = rawFaces.length > 0
          ? (rawFaces[0].boundingBox || rawFaces[0])
          : null;

        const vw = video.videoWidth  || video.clientWidth  || 1;
        const vh = video.videoHeight || video.clientHeight || 1;
        const evaluation = evaluateFace(box, vw, vh);

        setFaceState(evaluation);

        if (evaluation === 'good') {
          goodFramesRef.current++;
          if (goodFramesRef.current >= FRAMES_NEEDED) {
            log('threshold reached, capturing');
            capturedRef.current = true;
            await capture(video);
            return;
          }
        } else {
          goodFramesRef.current = 0;
        }

        if (DEBUG_SELFIE && frameCount % 10 === 0) {
          setDebug({ frames: frameCount, lastDetect: box || null });
        }
      } catch (e) {
        err('detect error', e);
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
  }

  async function capture(video) {
    stopCamera();
    setState(STATES.UPLOADING);
    try {
      const canvas   = document.createElement('canvas');
      canvas.width   = video.videoWidth  || 640;
      canvas.height  = video.videoHeight || 480;
      canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.85));
      const path = `${userId}/selfie.jpg`;
      const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
        contentType: 'image/jpeg', upsert: true,
      });
      if (error) throw error;
      setState(STATES.DONE);
      onCapture(URL.createObjectURL(blob), path);
    } catch (e) {
      err('upload failed', e);
      capturedRef.current = false;
      setState(STATES.ERROR);
      setErrorMsg(e.message || t('washerSignup.verify.submitError'));
    }
  }

  async function start() {
    stopCamera();
    goodFramesRef.current = 0;
    capturedRef.current = false;
    setState(STATES.INIT);
    setFaceState('none');
    setErrorMsg('');
    setDebug({ frames: 0, lastDetect: null });

    log('start, native?', Capacitor.isNativePlatform());

    if (Capacitor.isNativePlatform()) {
      let perm = await Camera.checkPermissions();
      if (perm.camera === 'granted') {
        // already granted — proceed
      } else if (perm.camera === 'denied') {
        // system has permanently denied; requesting again would be a no-op
        setState(STATES.PERMISSION_DENIED);
        return;
      } else {
        // 'prompt' or 'limited' — ask the user
        perm = await Camera.requestPermissions({ permissions: ['camera'] });
        if (perm.camera !== 'granted') {
          setState(STATES.PERMISSION_DENIED);
          return;
        }
      }
    }

    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'user' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      log('stream ok, tracks:', stream.getTracks().length);
    } catch (e) {
      err('camera open failed', e.name, e.message);
      if (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError') {
        setState(STATES.PERMISSION_DENIED);
      } else if (e.name === 'NotFoundError' || e.name === 'DevicesNotFoundError') {
        setState(STATES.NO_CAMERA);
      } else {
        setState(STATES.UNSUPPORTED);
      }
      return;
    }

    streamRef.current = stream;
    const video = videoRef.current;
    if (!video) return;

    video.srcObject = stream;
    await video.play().catch(() => {});
    log('video playing, size:', video.videoWidth, 'x', video.videoHeight);

    try {
      await loadDetector();
    } catch {
      return;
    }

    if (video.readyState < 2) {
      await new Promise(r => video.addEventListener('loadeddata', r, { once: true }));
    }

    log('starting detection loop, dims:', video.videoWidth, 'x', video.videoHeight);
    setState(STATES.READY);
    startLoop();
  }

  useEffect(() => {
    startRef.current = start;
    start();
    return () => stopCamera();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const selfieT = (key) => t(`washerSignup.verify.sectionSelfie.${key}`);

  const ovalStroke = state === STATES.UPLOADING
    ? '#16a34a'
    : (OVAL_STROKE[faceState] ?? '#9ca3af');

  const statusText = (() => {
    if (state === STATES.READY || state === STATES.CAPTURING) {
      if (faceState === 'good')       return `${selfieT('hold')} ${Math.ceil((FRAMES_NEEDED - goodFramesRef.current) / 10)}…`;
      if (faceState === 'off_center') return selfieT('fitInOval');
      if (faceState === 'too_far')    return selfieT('closer');
      if (faceState === 'too_close')  return selfieT('farther');
      return selfieT('position');
    }
    if (state === STATES.UPLOADING) return selfieT('captured');
    return '';
  })();

  const showVideo = state === STATES.INIT || state === STATES.LOADING_DETECTOR ||
    state === STATES.READY || state === STATES.CAPTURING || state === STATES.UPLOADING;

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: '#000', zIndex: 50, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}
      role="dialog"
      aria-modal="true"
    >
      {DEBUG_SELFIE && (
        <div style={{ position: 'fixed', top: 0, left: 0, background: 'red', color: 'white', padding: '4px 8px', zIndex: 9999, fontSize: '10px' }}>
          BUILD: {new Date().toISOString()} v8
        </div>
      )}

      {state !== STATES.DONE && state !== STATES.UPLOADING && (
        <button
          type="button"
          aria-label={selfieT('cancel')}
          onClick={() => { stopCamera(); onClose(); }}
          style={{ position: 'fixed', top: 8, right: 8, background: 'rgba(0,0,0,0.6)', color: 'white', border: 'none', borderRadius: 20, padding: '4px 12px', fontSize: 14, zIndex: 10000 }}
        >
          ✕
        </button>
      )}

      {showVideo && (
        <div style={{ position: 'relative', width: '100%', maxWidth: 480, aspectRatio: '3/4', background: '#111', overflow: 'hidden' }} dir="ltr">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            poster=""
            style={{
              width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)',
              background: '#000',
              opacity: (state === STATES.READY || state === STATES.CAPTURING || state === STATES.UPLOADING) ? 1 : 0,
              transition: 'opacity 200ms',
            }}
          />
          {(state === STATES.READY || state === STATES.CAPTURING) && (
            <svg
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
              aria-hidden="true"
            >
              <defs>
                <mask id="face-oval-mask">
                  <rect width="100%" height="100%" fill="white" />
                  <ellipse
                    cx={`${OVAL.cx * 100}%`}
                    cy={`${OVAL.cy * 100}%`}
                    rx={`${OVAL.rx * 100}%`}
                    ry={`${OVAL.ry * 100}%`}
                    fill="black"
                  />
                </mask>
              </defs>
              <rect width="100%" height="100%" fill="rgba(0,0,0,0.45)" mask="url(#face-oval-mask)" />
              <ellipse
                cx={`${OVAL.cx * 100}%`}
                cy={`${OVAL.cy * 100}%`}
                rx={`${OVAL.rx * 100}%`}
                ry={`${OVAL.ry * 100}%`}
                fill="none"
                stroke={ovalStroke}
                strokeWidth="4"
                style={{ transition: 'stroke 150ms' }}
              />
            </svg>
          )}
          {(state === STATES.INIT || state === STATES.LOADING_DETECTOR) && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, background: '#000' }}>
              <Loader2 size={40} color="white" className="animate-spin" />
              <span style={{ color: 'white', fontSize: 14 }}>{selfieT('starting')}</span>
            </div>
          )}
        </div>
      )}

      {statusText ? (
        <p style={{ marginTop: 24, color: 'white', fontSize: 16, fontWeight: 500, textAlign: 'center', padding: '0 24px' }}>
          {statusText}
        </p>
      ) : null}

      {state === STATES.PERMISSION_DENIED && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, padding: 32, textAlign: 'center' }}>
          <p style={{ color: 'white', fontSize: 16 }}>{selfieT('permissionDenied')}</p>
          <button
            type="button"
            onClick={() => startRef.current?.()}
            style={{ padding: '12px 24px', background: 'white', color: 'black', borderRadius: 12, fontWeight: 600, fontSize: 14, border: 'none' }}
          >
            {selfieT('tryAgain')}
          </button>
        </div>
      )}

      {state === STATES.NO_CAMERA && (
        <p style={{ color: 'white', fontSize: 16, textAlign: 'center', padding: 32 }}>
          {selfieT('noCameraFound')}
        </p>
      )}

      {state === STATES.UNSUPPORTED && (
        <p style={{ color: 'white', fontSize: 16, textAlign: 'center', padding: 32 }}>
          {selfieT('unsupported')}
        </p>
      )}

      {state === STATES.ERROR && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, padding: 32, textAlign: 'center' }}>
          <p style={{ color: 'white', fontSize: 16 }}>{errorMsg}</p>
          <button
            type="button"
            onClick={() => startRef.current?.()}
            style={{ padding: '12px 24px', background: 'white', color: 'black', borderRadius: 12, fontWeight: 600, fontSize: 14, border: 'none' }}
          >
            {selfieT('retake')}
          </button>
        </div>
      )}

      {DEBUG_SELFIE && (
        <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: 'rgba(0,0,0,0.8)', color: 'lime', padding: 8, fontSize: 11, fontFamily: 'monospace', zIndex: 100 }}>
          state: {state} | face: {faceState} | frames: {debug.frames} | good: {goodFramesRef.current}
          {debug.lastDetect && <span> | box: {JSON.stringify(debug.lastDetect)}</span>}
        </div>
      )}
    </div>
  );
}
