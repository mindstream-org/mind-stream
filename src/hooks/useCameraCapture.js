import { useCallback, useEffect, useRef, useState } from "react";
import { CAPTURE_DURATION_MS } from "../lib/constants.js";

/**
 * Handles the permission request + ~3s recording window. This hook must
 * only be used inside the capture popup window (see src/capture/), never
 * the side panel — Chrome auto-dismisses getUserMedia's permission prompt
 * when it's requested from a side panel, which is exactly why capture was
 * split out into its own window in the first place.
 *
 * Usage:
 *   const { phase, videoRef, start, blob, error } = useCameraCapture();
 *   phase is one of: "idle" | "requesting" | "recording" | "done" | "error"
 */
export function useCameraCapture({ durationMs = CAPTURE_DURATION_MS } = {}) {
  const [phase, setPhase] = useState("idle");
  const [blob, setBlob] = useState(null);
  const [blobUrl, setBlobUrl] = useState(null);
  const [error, setError] = useState(null);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  // A ref, not state: state updates are async and too slow to prevent a
  // second start() call arriving milliseconds after the first (e.g. React
  // StrictMode's dev-only double-invoke of effects). Two concurrent
  // getUserMedia() calls make Chrome auto-dismiss the pending prompt.
  const inProgressRef = useRef(false);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    // Clear the srcObject on the video element too — without this the
    // browser/OS can keep reporting the camera as "in use" (the GNOME
    // top-panel camera icon stays visible until the tab/window closes).
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const start = useCallback(async () => {
    if (inProgressRef.current) {
      console.log("[mindstream] start() ignored — capture already in progress");
      return null;
    }
    inProgressRef.current = true;

    setError(null);
    setBlob(null);
    setBlobUrl(null);
    setPhase("requesting");

    try {
      console.log("[mindstream] requesting camera access...");
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480 },
        audio: false,
      });
      console.log("[mindstream] camera access granted");
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
      // Stop the stream immediately after recording to remove the OS camera indicator
      stopStream();
      // Create a blob URL for playback in ConfirmState
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

  // CaptureState and ConfirmState each render their own <video> element, so
  // switching between them mounts a fresh DOM node — the stream has to be
  // re-attached each time, since setting srcObject once on the old node
  // doesn't carry over.
  useEffect(() => {
    if (streamRef.current && videoRef.current && videoRef.current.srcObject !== streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => {});
    }
  }, [phase]);

  // Cleanup blob URL on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
      }
    };
  }, [blobUrl]);

  return { phase, videoRef, start, blob, blobUrl, error, stopStream };
}
