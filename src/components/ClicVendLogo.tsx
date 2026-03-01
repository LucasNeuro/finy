"use client";

type ClicVendLogoProps = {
  /** Tamanho do ícone (lado do quadrado). Wordmark escala junto. */
  size?: "sm" | "md" | "lg";
  /** Mostrar só o ícone, sem texto */
  iconOnly?: boolean;
  className?: string;
};

const sizes = {
  sm: { icon: 28, text: "text-xl" },
  md: { icon: 36, text: "text-2xl" },
  lg: { icon: 48, text: "text-3xl" },
};

export function ClicVendLogo({ size = "md", iconOnly = false, className = "" }: ClicVendLogoProps) {
  const { icon: iconPx, text } = sizes[size];

  return (
    <div className={`inline-flex items-center gap-2 ${className}`}>
      {/* Ícone: triângulo/play em azul-cinza */}
      <svg
        width={iconPx}
        height={iconPx}
        viewBox="0 0 40 40"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden
      >
        <path
          d="M8 6v28l24-14L8 6z"
          fill="url(#clicvend-icon)"
        />
        <defs>
          <linearGradient id="clicvend-icon" x1="8" y1="6" x2="32" y2="20" gradientUnits="userSpaceOnUse">
            <stop stopColor="#475569" />
            <stop offset="1" stopColor="#2563EB" />
          </linearGradient>
        </defs>
      </svg>
      {!iconOnly && (
        <span className={`font-bold text-[#1E293B] ${text}`}>
          ClicVend
        </span>
      )}
    </div>
  );
}
