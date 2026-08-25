import { useEffect, useRef, useState } from "react";
import PanelShell from "../components/layout/PanelShell.jsx";
import SkeletonState from "../panel/states/SkeletonState.jsx";
import CaptureState from "../panel/states/CaptureState.jsx";
import ConfirmState from "../panel/states/ConfirmState.jsx";
import CountdownState from "../panel/states/CountdownState.jsx";
import Button from "../components/ui/Button.jsx";
import { useCameraCapture } from "../hooks/useCameraCapture.js";
import { saveCapture } from "../lib/checkIn.js";
import { sendMessage } from "../lib/chromeApi.js";
import { MESSAGE_TYPES, PANEL_STATE, API_ROUTES, BACKEND_UNREACHABLE } from "../lib/constants.js";

/**
 * Popup window that owns the webcam capture flow.
 * getUserMedia only works reliably in a popup, not the side panel.
 *
 * Flow: skeleton -> capture (3s) -> confirm -> countdown -> close
 */
export default function CaptureWindow() {
  const camera = useCameraCapture();
  const startedRef = useRef(false);
  const [submit, setSubmit] = useState(null);
  const [countdownProgress, setCountdownProgress] = useState(null);
  useEffect(() => {
    if (!startedRef.current) {
      startedRef.current = true;
      camera.start();
    }
  }, []);

  // Safety net: stop the camera stream if this window is force-closed.
  useEffect(() => {
    const cleanup = () => camera.stopStream();
    window.addEventListener("pagehide", cleanup);
    window.addEventListener("beforeunload", cleanup);
    return () => {
      window.removeEventListener("pagehide", cleanup);
      window.removeEventListener("beforeunload", cleanup);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera.stopStream]);

  useEffect(() => {
    if (camera.phase !== "error") return;
    sendMessage({ type: MESSAGE_TYPES.CANCEL_CHECKIN });
  }, [camera.phase]);

  const handleAccept = async () => {
    setSubmit({ status: "sending" });
    camera.stopStream();

    const clipPath = await saveCapture(camera.blob);
    if (!clipPath) {
      setSubmit({ status: "failed", error: "The clip couldn't be saved to your downloads folder." });
      return;
    }

    let result = await sendMessage({ type: MESSAGE_TYPES.CLIP_SAVED, clipPath });
    if (!result) {
      result = await fetch(API_ROUTES.HEALTH, { signal: AbortSignal.timeout(3000) })
        .then((r) => ({ ok: r.ok }))
        .catch(() => ({ ok: false }));
    }

    setSubmit(
      result.ok
        ? { status: "started" }
        : { status: "failed", error: result.error ?? BACKEND_UNREACHABLE },
    );
  };

  const handleDecline = async () => {
    camera.stopStream();
    await sendMessage({ type: MESSAGE_TYPES.CANCEL_CHECKIN });
    window.close();
  };

  let panelState = PANEL_STATE.SKELETON;
  if (camera.phase === "recording") panelState = PANEL_STATE.CAPTURE;
  else if (camera.phase === "done" && !submit) panelState = PANEL_STATE.CONFIRM;
  else if (camera.phase === "done" && submit) panelState = PANEL_STATE.COUNTDOWN;
  else if (camera.phase === "error") panelState = PANEL_STATE.ERROR;

  return (
    <PanelShell state={panelState} progress={countdownProgress}>
      {panelState === PANEL_STATE.SKELETON && <SkeletonState />}
      {panelState === PANEL_STATE.CAPTURE && <CaptureState videoRef={camera.videoRef} />}
      {panelState === PANEL_STATE.CONFIRM && (
        <ConfirmState blobUrl={camera.blobUrl} onAccept={handleAccept} onDecline={handleDecline} />
      )}
      {panelState === PANEL_STATE.COUNTDOWN && (
        <CountdownState
          status={submit.status}
          error={submit.error}
          onProgress={setCountdownProgress}
          onDone={() => window.close()}
        />
      )}
      {panelState === PANEL_STATE.ERROR && (
        <div className="flex flex-col animate-fadein">
          <div className="w-11 h-11 rounded-full bg-surface-raised border border-border text-fg-subtle flex items-center justify-center font-mono font-bold mb-4">
            !
          </div>
          <h1 className="text-[22px] font-bold leading-tight mb-2 tracking-[-0.01em]">
            Couldn't get camera access.
          </h1>
          <p className="text-[13px] leading-relaxed text-fg-muted mb-5">
            Check the extension's site permissions, then try the check-in again from the side panel.
          </p>
          <Button variant="primary" onClick={() => window.close()}>
            Close this window
          </Button>
        </div>
      )}
    </PanelShell>
  );
}
