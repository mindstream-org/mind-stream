import SprocketRail from "./SprocketRail.jsx";
import PanelHeader from "./PanelHeader.jsx";

export default function PanelShell({ state, progress, children }) {
  return (
    <div className="w-full h-screen min-h-140 bg-ink flex overflow-hidden text-paper font-sans">
      <SprocketRail />
      <div className="flex-1 flex flex-col min-w-0">
        <PanelHeader state={state} progress={progress} />
        <div className="flex-1 px-6 py-7 flex flex-col relative overflow-hidden">
          {children}
        </div>
      </div>
    </div>
  );
}
