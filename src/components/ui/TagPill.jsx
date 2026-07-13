export default function TagPill({ children }) {
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-[11px] px-2.5 py-1.25 rounded-full bg-teal-soft text-teal w-fit">
      {children}
    </span>
  );
}
