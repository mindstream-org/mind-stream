const VARIANTS = {
  primary: "bg-teal text-ink hover:brightness-110",
  ghost: "bg-transparent text-fog border border-hairline hover:border-fog-dim hover:text-paper",
};

export default function Button({ variant = "primary", className = "", children, ...props }) {
  return (
    <button
      className={`font-sans text-[13.5px] font-semibold px-4.5 py-3 rounded-[10px] inline-flex items-center justify-center gap-2 transition-transform active:scale-[0.97] ${VARIANTS[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
