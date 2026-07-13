import { useState } from "react";
import PanelShell from "../components/layout/PanelShell.jsx";
import IdleState from "./states/IdleState.jsx";
import PendingState from "./states/PendingState.jsx";
import ReadyState from "./states/ReadyState.jsx";
import PlayerState from "./states/PlayerState.jsx";
import ErrorState from "./states/ErrorState.jsx";
import { useCycleStatus } from "../hooks/useCycleStatus.js";
import { closeSidePanel, sendMessage } from "../lib/chromeApi.js";
import { CYCLE_STATUS, PANEL_STATE, MESSAGE_TYPES } from "../lib/constants.js";

export default function SidePanel() {
  const { cycle, setCycle } = useCycleStatus();
  const [playing, setPlaying] = useState(false);
  const [isStarting, setIsStarting] = useState(false);

  const isPending = cycle.cycle_status === CYCLE_STATUS.PENDING;

  const handleAcceptCheckIn = () => {
    if (isStarting) return; // guard against double-clicks
    setIsStarting(true);

    sendMessage({ type: MESSAGE_TYPES.START_CHECKIN }).then(() => {
      // The capture window (background opened it) owns the rest of the
      // flow from here — the panel doesn't need to stay open for it.
      closeSidePanel();
      setIsStarting(false);
    });
  };

  const handleDismissPrompt = () => {
    closeSidePanel();
  };

  const handlePlay = () => setPlaying(true);

  const handleDone = () => {
    setPlaying(false);
    setCycle({
      cycle_status: CYCLE_STATUS.IDLE,
      job_id: null,
      reel_url: null,
      emotion_label: null,
    });
  };

  const handleLater = () => {
    closeSidePanel();
  };

  const handleRetry = () => {
    sendMessage({ type: MESSAGE_TYPES.START_CHECKIN });
    closeSidePanel();
  };

  const handleDismissError = () => {
    setCycle({ cycle_status: CYCLE_STATUS.IDLE, error_message: null });
  };

  const handleCancelGeneration = () => {
    sendMessage({ type: MESSAGE_TYPES.CANCEL_GENERATION });
  };

  // --- Resolve which visual state to render ---------------------------
  let panelState = PANEL_STATE.IDLE;
  if (cycle.cycle_status === CYCLE_STATUS.FAILED) panelState = PANEL_STATE.ERROR;
  else if (cycle.cycle_status === CYCLE_STATUS.READY) panelState = playing ? PANEL_STATE.PLAYER : PANEL_STATE.READY;
  else if (isPending) panelState = PANEL_STATE.PENDING;

  return (
    <PanelShell state={panelState}>
      {panelState === PANEL_STATE.IDLE && <IdleState onAccept={handleAcceptCheckIn} onDismiss={handleDismissPrompt} />}
      {panelState === PANEL_STATE.PENDING && (
        <PendingState hasJobId={!!cycle.job_id} onCancel={handleCancelGeneration} />
      )}
      {panelState === PANEL_STATE.READY && (
        <ReadyState emotionLabel={cycle.emotion_label ?? "neutral"} onPlay={handlePlay} onLater={handleLater} />
      )}
      {panelState === PANEL_STATE.PLAYER && (
        <PlayerState reelUrl={cycle.reel_url} onDone={handleDone} />
      )}
      {panelState === PANEL_STATE.ERROR && (
        <ErrorState message={cycle.error_message} onRetry={handleRetry} onDismiss={handleDismissError} />
      )}
    </PanelShell>
  );
}
