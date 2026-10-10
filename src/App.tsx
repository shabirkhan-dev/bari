import { createMemo, Errored, Loading, Match, refresh, Show, Switch } from "solid-js";
import { fetchProfile, session, signOut } from "./lib/auth";
import { CompleteProfile, Login, Splash } from "./ui/SignIn";
import { Mark } from "./ui/Mark";

export default function App() {
  return (
    <Errored fallback={(err, reset) => <Failure message={String(err())} retry={reset} />}>
      <Switch>
        <Match when={session() === undefined}>
          <Splash />
        </Match>
        <Match when={session() === null}>
          <Login />
        </Match>
        <Match when={session()}>{s => <SignedIn userId={s().user.id} />}</Match>
      </Switch>
    </Errored>
  );
}

function SignedIn(props: { userId: string }) {
  const profile = createMemo(() => fetchProfile(props.userId));
  return (
    <Loading fallback={<Splash />}>
      <Show when={profile().phone} fallback={<CompleteProfile profile={profile()} onSaved={() => refresh(profile)} />}>
        <Home name={profile().display_name} />
      </Show>
    </Loading>
  );
}

/** Placeholder until the committee screens land (next milestone). */
function Home(props: { name: string }) {
  return (
    <main class="min-h-dvh bg-bari-ground px-6 pb-8 pt-[max(2rem,env(safe-area-inset-top))] text-bari-ink">
      <div class="mx-auto flex max-w-sm flex-col gap-8">
        <header class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <Mark size={36} />
            <span class="text-xl font-bold tracking-tight">bari</span>
          </div>
          <button type="button" class="h-11 rounded-xl px-3 text-bari-muted" onClick={() => signOut()}>
            Sign out
          </button>
        </header>
        <div>
          <h1 class="text-2xl font-semibold">Salam, {props.name}</h1>
          <p class="mt-1 text-bari-muted">You're signed in. Committees arrive in the next update.</p>
        </div>
      </div>
    </main>
  );
}

function Failure(props: { message: string; retry: () => void }) {
  return (
    <main class="grid min-h-dvh place-items-center bg-bari-ground px-6 text-bari-ink">
      <div class="flex max-w-sm flex-col gap-4 text-center">
        <h1 class="text-xl font-semibold">Something went wrong</h1>
        <p class="text-sm text-bari-muted">{props.message}</p>
        <button type="button" class="h-12 rounded-xl bg-bari-emerald font-semibold text-white" onClick={() => props.retry()}>
          Try again
        </button>
      </div>
    </main>
  );
}
