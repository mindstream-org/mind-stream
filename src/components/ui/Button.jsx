const BASE =
  "font-sans inline-flex items-center justify-center gap-2 cursor-pointer transition-colors duration-150 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed select-none";

const VARIANTS = {
  primary: "bg-primary text-primary-fg hover:bg-primary/90 text-[13px] font-medium rounded-[8px] px-4 py-2.5",
  ghost:   "bg-transparent text-fg-muted border border-border hover:text-fg hover:border-fg-subtle text-[13px] font-medium rounded-[8px] px-4 py-2.5",
  subtle:  "bg-transparent text-fg-subtle hover:text-fg-muted text-[13px] font-medium rounded-[6px] px-2 py-1.5",
};

export default function Button({ variant = "primary", className = "", children, ...props }) {
  return (
    <button className={`${BASE} ${VARIANTS[variant]} ${className}`} {...props}>
      {children}
    </button>
  );
}
