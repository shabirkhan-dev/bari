import { createMemo, Errored, Loading, Match, onSettled, refresh, Show, Switch } from "solid-js";
import { fetchProfile, session, type Profile } from "./lib/auth";
import { describeError } from "./lib/errors";
import { match, navigate, path, takeRememberedPath } from "./lib/router";
import { CompleteProfile, Login, Splash } from "./ui/SignIn";
import { TabBar } from "./ui/kit";
import { Home } from "./screens/Home";
import { CreateCommittee } from "./screens/CreateCommittee";
import { Committee } from "./screens/Committee";
import { Join } from "./screens/Join";
import { Me } from "./screens/Me";

export default function App() {
  return (
    <Errored fallback={(err, reset) => <Failure message={describeError(err())} retry={reset} />}>
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
        <Shell me={profile()} onProfileSaved={() => refresh(profile)} />
      </Show>
    </Loading>
  );
}

function Shell(props: { me: Profile; onProfileSaved: () => void }) {
  // Back to the invite link someone opened before signing in.
  onSettled(() => {
    const p = takeRememberedPath();
    if (p && p !== location.pathname) navigate(p, { replace: true, direction: "none" });
  });

  const isTab = () => path() === "/" || path() === "/me";
  return (
    <>
      <Switch fallback={<Home />}>
        <Match when={path() === "/"}><Home /></Match>
        <Match when={path() === "/me"}><Me me={props.me} onSaved={props.onProfileSaved} /></Match>
        <Match when={path() === "/new"}><CreateCommittee me={props.me} /></Match>
        <Match when={match("/join/:code", path())}>{p => <Join code={p().code ?? ""} />}</Match>
        <Match when={path() === "/join"}><Join /></Match>
        <Match when={match("/c/:id", path())}>{p => <Committee id={p().id ?? ""} />}</Match>
      </Switch>
      <Show when={isTab()}><TabBar /></Show>
    </>
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
