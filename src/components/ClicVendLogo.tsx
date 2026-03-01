"use client";

import Image from "next/image";

type ClicVendLogoProps = {
  /** Tamanho do logo (altura aproximada em px). Wordmark escala junto. */
  size?: "sm" | "md" | "lg";
  /** Mostrar só o ícone, sem texto */
  iconOnly?: boolean;
  className?: string;
};

const sizes = {
  sm: { h: 28, w: 28 },
  md: { h: 36, w: 36 },
  lg: { h: 48, w: 48 },
};

export function ClicVendLogo({ size = "md", iconOnly = false, className = "" }: ClicVendLogoProps) {
  const { h, w } = sizes[size];

  if (iconOnly) {
    return (
      <Image
        src="/logo-icon.svg"
        alt="ClicVend"
        width={w}
        height={h}
        className={`inline-block ${className}`}
        priority
      />
    );
  }

  return (
    <Image
      src="/logo.svg"
      alt="ClicVend"
      width={size === "sm" ? 110 : size === "md" ? 140 : 180}
      height={h}
      className={`inline-block ${className}`}
      priority
    />
  );
}
