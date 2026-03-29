"use client";

import { BRAND_NAME } from "@/lib/brand";

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

/** Dimensões do logo completo (wordmark) por size — SVG Smart Vendas */
const logoWidths = { sm: 140, md: 175, lg: 220 };

export function ClicVendLogo({ size = "md", iconOnly = false, className = "" }: ClicVendLogoProps) {
  const { h, w } = sizes[size];

  if (iconOnly) {
    return (
      <img
        src="/logo-icon.svg"
        alt={BRAND_NAME}
        width={w}
        height={h}
        className={`inline-block object-contain ${className}`}
        loading="eager"
        fetchPriority="high"
      />
    );
  }

  const width = logoWidths[size];
  return (
    <img
      src="/logo.svg"
      alt={BRAND_NAME}
      width={width}
      height={h}
      className={`inline-block object-contain ${className}`}
      loading="eager"
      fetchPriority="high"
    />
  );
}
