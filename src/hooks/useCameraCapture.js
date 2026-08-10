import { useCallback, useEffect, useRef, useState } from "react";
import { CAPTURE_DURATION_MS } from "../lib/constants.js";

// Must only be used in the capture popup window, not the side panel.
// Chrome silently dismisses getUserMedia permission prompts in side panels.
export function useCameraCapture({ durationMs = CAPTURE_DURATION_MS } = {}) {
  const [phase, setPhase] = useState("idle");
  const [blob, setBlob] = useState(null);
  const [blobUrl, setBlobUrl] = useState(null);
  const [error, setError] = useState(null);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  // Ref instead of state: prevents a second getUserMedia call from React StrictMode's
  // double-invoke, which would cause Chrome to auto-dismiss the permission prompt.
  const inProgressRef = useRef(false);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    // pause() + load() ensures the OS camera indicator is cleared immediately.
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.srcObject = null;
      videoRef.current.load();
    }
  }, []);

  const start = useCallback(async () => {
    if (inProgressRef.current) return null;
    inProgressRef.current = true;

    setError(null);
    setBlob(null);
    setBlobUrl(null);
    setPhase("requesting");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480 },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      setPhase("recording");

      const recorder = new MediaRecorder(stream, { mimeType: "video/webm" });
      const chunks = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };

      const recordingDone = new Promise((resolve) => {
        recorder.onstop = () => resolve(new Blob(chunks, { type: "video/webm" }));
      });

      recorder.start();
      await new Promise((resolve) => setTimeout(resolve, durationMs));
      recorder.stop();

      const finalBlob = await recordingDone;
      stopStream();
      const url = URL.createObjectURL(finalBlob);
      setBlob(finalBlob);
      setBlobUrl(url);
      setPhase("done");
      return finalBlob;
    } catch (err) {
      console.error("[mindstream] getUserMedia failed:", err);
      stopStream();
      setError(err);
      setPhase("error");
      return null;
    } finally {
      inProgressRef.current = false;
    }
  }, [durationMs, stopStream]);

  // CaptureState and ConfirmState each mount a new <video> element.
  // Re-attach the stream whenever the phase changes.
  useEffect(() => {
    if (streamRef.current && videoRef.current && videoRef.current.srcObject !== streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => {});
    }
  }, [phase]);

  useEffect(() => {
    return () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [blobUrl]);

  return { phase, videoRef, start, blob, blobUrl, error, stopStream };
}
