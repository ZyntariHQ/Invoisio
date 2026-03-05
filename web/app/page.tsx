import Image from "next/image";

export default function Home() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex min-h-screen w-full max-w-3xl flex-col items-center justify-center gap-6 px-4 text-center">
      <h1 className="text-2xl">Welcome to Invisio</h1>
      </main>
    </div>
  );
}
