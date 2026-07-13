import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';

// Exposes capture() via ref, returning a data: URL JPEG frame from the live
// stream. Manages its own camera lifecycle (start on mount, stop on unmount).
export const WebcamCapture = forwardRef(function WebcamCapture({ className }, ref) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  useEffect(() => {
    let stream;
    const start = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (err) {
        console.error('Error accessing webcam:', err);
      }
    };
    start();

    return () => {
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  useImperativeHandle(ref, () => ({
    capture: () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas) return null;
      // readyState < 2 (HAVE_CURRENT_DATA) means no real frame has decoded
      // yet -- drawing now would silently capture a blank/black frame.
      if (video.readyState < 2 || video.videoWidth === 0) return null;

      // Match the canvas to the stream's real dimensions instead of a fixed
      // 640x480 -- most webcams are 16:9, so a hardcoded 4:3 canvas distorts
      // the face and can throw off face detection.
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const context = canvas.getContext('2d');
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/jpeg');
    },
  }));

  return (
    <div className={className || 'w-full aspect-video bg-black rounded-2xl shadow-2xl overflow-hidden'}>
      <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover" />
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
});
