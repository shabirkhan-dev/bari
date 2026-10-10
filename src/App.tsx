import { createSignal } from "solid-js";
import { formatPKR } from "./domain/money";

export default function App() {
  const [count, setCount] = createSignal(0);
  return (
    <main class="min-h-dvh bg-slate-950 p-4 text-slate-100">
      <h1 class="text-xl font-semibold">Bari</h1>
      <p class="mt-1 text-sm text-slate-400">Scaffold — UI arrives in milestone 3.</p>
      <button
        class="mt-4 rounded-lg bg-emerald-600 px-4 py-2 font-medium"
        onClick={() => setCount(c => c + 1)}
      >
        {formatPKR(count() * 20000)}
      </button>
    </main>
  );
}
