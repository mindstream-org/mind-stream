import PanelHeader from "./PanelHeader.jsx";

export default function PanelShell({ state, progress, headerProps, children }) {
  const isPlayer = state === "player";

  if (isPlayer) {
    return (
      <div className="w-full h-screen bg-bg flex flex-col text-fg font-sans">
        {children}
      </div>
    );
  }

  return (
    <div className="w-full h-screen bg-bg flex flex-col text-fg font-sans">
      <PanelHeader state={state} progress={progress} {...headerProps} />
      <div className="flex-1 px-5 pb-6 flex flex-col">
        {children}
      </div>
    </div>
  );
}
