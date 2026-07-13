import { useEffect, useRef, useState } from "react";
import PanelShell from "../components/layout/PanelShell.jsx";
import SkeletonState from "../panel/states/SkeletonState.jsx";
import CaptureState from "../panel/states/CaptureState.jsx";
import ConfirmState from "../panel/states/ConfirmState.jsx";
import CountdownState from "../panel/states/CountdownState.jsx";
import Button from "../components/ui/Button.jsx";
import { useCameraCapture } from "../hooks/useCameraCapture.js";
import { useCycleStatus } from "../hooks/useCycleStatus.js";
import { submitCheckIn } from "../lib/checkIn.js";
import { sendMessage } from "../lib/chromeApi.js";
import { MESSAGE_TYPES, PANEL_STATE } from "../lib/constants.js";

/**
 * This is a normal extension popup window, not a side panel — getUserMedia's
 * permission prompt only renders reliably here (see MINDSTREAM_PROJECT_SUMMARY.md
 * for why capture had to move out of the side panel entirely).
 *
 * Flow: skeleton (permission pending) -> capture (3s recording, stream stays
 * open) -> confirm ("Let's go!" / "Not now" — nothing submitted yet) ->
 * countdown (only after confirming) -> window closes itself.
 */
export default function CaptureWindow() {
  const camera = useCameraCapture();
  const { setCycle } = useCycleStatus();
  const startedRef = useRef(false);
  const [confirmed, setConfirmed] = useState(false);
  const [countdownProgress, setCountdownProgress] = useState(null);

  // Single trigger point — no side panel to race against here.
  useEffect(() => {
    if (!startedRef.current) {
      startedRef.current = true;
      camera.start();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Safety net: if this window gets force-closed (red ✕) mid-flow, make
  // sure the camera stream actually stops rather than lingering — that's
  // what leaves the OS-level "camera in use" indicator stuck on.
  useEffect(() => {
    window.addEventListener("pagehide", camera.stopStream);
    return () => window.removeEventListener("pagehide", camera.stopStream);
  }, [camera.stopStream]);

  useEffect(() => {
    if (camera.phase !== "error") return;
    sendMessage({ type: MESSAGE_TYPES.CANCEL_CHECKIN });
  }, [camera.phase]);

  const handleAccept = async () => {
    setConfirmed(true);
    camera.stopStream(); // ensure camera is released before we submit
    const result = await submitCheckIn(camera.blob);
    await setCycle({ job_id: result?.job_id ?? null });
  };

  const handleDecline = async () => {
    camera.stopStream(); // release the camera before closing
    await sendMessage({ type: MESSAGE_TYPES.CANCEL_CHECKIN });
    window.close();
  };

  const handleCountdownComplete = () => {
    camera.stopStream(); // safety net — release camera before closing
    window.close();
  };

  let panelState = PANEL_STATE.SKELETON;
  if (camera.phase === "recording") panelState = PANEL_STATE.CAPTURE;
  else if (camera.phase === "done" && !confirmed) panelState = PANEL_STATE.CONFIRM;
  else if (camera.phase === "done" && confirmed) panelState = PANEL_STATE.COUNTDOWN;
  else if (camera.phase === "error") panelState = PANEL_STATE.ERROR;

  return (
    <PanelShell state={panelState} progress={countdownProgress}>
      {panelState === PANEL_STATE.SKELETON && <SkeletonState />}
      {panelState === PANEL_STATE.CAPTURE && <CaptureState videoRef={camera.videoRef} />}
      {panelState === PANEL_STATE.CONFIRM && (
        <ConfirmState blobUrl={camera.blobUrl} onAccept={handleAccept} onDecline={handleDecline} />
      )}
      {panelState === PANEL_STATE.COUNTDOWN && (
        <CountdownState onComplete={handleCountdownComplete} onProgress={setCountdownProgress} />
      )}
      {panelState === PANEL_STATE.ERROR && (
        <div className="flex flex-col animate-fadein">
          <div className="w-11 h-11 rounded-full bg-coral-soft border border-coral text-coral flex items-center justify-center font-mono font-bold mb-4.5">
            !
          </div>
          <h1 className="text-[22px] font-bold leading-tight mb-2.5 tracking-[-0.01em]">
            Couldn't get camera access.
          </h1>
          <p className="text-[13.5px] leading-relaxed text-fog mb-5">
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
