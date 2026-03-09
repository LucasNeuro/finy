"use client";

type LandingFooterProps = {
  onTermos?: () => void;
  onPrivacidade?: () => void;
};

export function LandingFooter({ onTermos, onPrivacidade }: LandingFooterProps) {
  return (
    <footer className="fixed bottom-0 left-0 right-0 bg-gradient-to-r from-[#1E293B] via-[#0F172A] to-[#020617] text-white py-4 border-t border-[#334155]/50 backdrop-blur-sm z-40">
      <div className="mx-auto w-[92%] max-w-6xl">
        <div className="flex flex-col items-center justify-center gap-2">
          <p className="text-sm">
            Criado com ❤️ por{" "}
            <span className="font-semibold">ClicVend</span>
          </p>
          
          {/* Links mínimos de termos e privacidade */}
          <div className="flex gap-4 text-xs text-white/70">
            {onTermos && (
              <button
                type="button"
                onClick={onTermos}
                className="hover:text-white transition-colors"
              >
                Termos
              </button>
            )}
            {onPrivacidade && (
              <button
                type="button"
                onClick={onPrivacidade}
                className="hover:text-white transition-colors"
              >
                Privacidade
              </button>
            )}
          </div>
        </div>
      </div>
    </footer>
  );
}