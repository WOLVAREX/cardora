import { CARDORA_MARK } from "@/lib/cardora";

export function BrandMark({ size = "md", className = "" }: { size?: "sm" | "md" | "lg"; className?: string }) {
  const dimensions = size === "lg" ? "h-12 w-12" : size === "sm" ? "h-8 w-8" : "h-10 w-10";
  return (
    <img
      src={CARDORA_MARK}
      alt=""
      aria-hidden="true"
      className={`${dimensions} shrink-0 rounded-xl object-cover ${className}`}
      onError={event => { event.currentTarget.style.visibility = "hidden"; }}
    />
  );
}

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <BrandMark size={compact ? "sm" : "md"} />
      <span className={`brand-wordmark ${compact ? "text-xl" : "text-2xl"}`}>Cardora</span>
    </div>
  );
}
