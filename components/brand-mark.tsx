import Image from "next/image";

export function BrandMark({
  className = "h-8 w-auto",
}: {
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-2 font-display text-lg tracking-[0.3em] ${className}`}
    >
      <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-black/10 bg-white shadow-retro-sm">
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          className="h-4 w-4 text-brand"
        >
          <path
            d="M12 3a7 7 0 0 1 4.95 11.95l-2.03 2.03a1 1 0 0 1-1.41 0L8.05 12.5a3.5 3.5 0 0 1 4.95-4.95l1.41 1.41"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      <span className="uppercase text-sm">Ether</span>
    </span>
  );
}
