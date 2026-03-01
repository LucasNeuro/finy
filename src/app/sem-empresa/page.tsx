import Link from "next/link";

export default function SemEmpresaPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[#F8FAFC] p-8">
      <h1 className="text-xl font-semibold text-[#1E293B]">Sem empresa vinculada</h1>
      <p className="mt-2 max-w-md text-center text-[#64748B]">
        Sua conta ainda não está vinculada a nenhuma empresa. Entre em contato com o administrador ou acesse com outra conta.
      </p>
      <Link
        href="/onboarding"
        className="mt-4 rounded-lg bg-[#6366F1] px-4 py-2 text-white hover:bg-[#4F46E5]"
      >
        Criar empresa
      </Link>
      <Link
        href="/login"
        className="mt-6 rounded-lg border border-[#E2E8F0] px-4 py-2 text-[#64748B] hover:bg-[#F8FAFC]"
      >
        Voltar ao login
      </Link>
    </main>
  );
}
