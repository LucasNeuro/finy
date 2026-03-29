"use client";

import Link from "next/link";
import { BRAND_DOMAIN, BRAND_NAME } from "@/lib/brand";

type LandingFooterProps = {
  onTermos?: () => void;
  onPrivacidade?: () => void;
};

export function LandingFooter({ onTermos, onPrivacidade }: LandingFooterProps) {
  return (
    <footer
      role="contentinfo"
      className="mt-auto bg-[#0F172A] text-white py-8 border-t border-[#334155]"
    >
      <div className="mx-auto w-[92%] max-w-6xl px-4">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-sm sm:text-base text-white/90">
            <span className="font-semibold text-white">{BRAND_NAME}</span>
            {" · "}
            <Link
              href={`https://${BRAND_DOMAIN}`}
              className="text-white/80 underline-offset-2 hover:text-white hover:underline"
            >
              {BRAND_DOMAIN}
            </Link>
          </p>
          <nav aria-label="Links legais" className="flex items-center gap-6">
            {onTermos && (
              <button
                type="button"
                onClick={onTermos}
                className="text-sm text-white/80 hover:text-white transition-colors underline-offset-2 hover:underline"
              >
                Termos de uso
              </button>
            )}
            {onPrivacidade && (
              <button
                type="button"
                onClick={onPrivacidade}
                className="text-sm text-white/80 hover:text-white transition-colors underline-offset-2 hover:underline"
              >
                Privacidade
              </button>
            )}
          </nav>
        </div>
      </div>
    </footer>
  );
}