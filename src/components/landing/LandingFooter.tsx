"use client";

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
            Criado com <span className="text-red-400" aria-hidden="true">❤️</span> por{" "}
            <span className="font-semibold text-white">ClicVend</span>
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