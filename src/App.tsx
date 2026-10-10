import { createMemo, createSignal, Errored, Loading, Match, onSettled, refresh, Show, Switch } from "solid-js";
import { fetchProfile, session, type Profile } from "./lib/auth";
import { describeError } from "./lib/errors";
import { match, navigate, path, takeRememberedPath } from "./lib/router";
import { CompleteProfile, Login, Splash } from "./ui/SignIn";
import { ActionRow, Dock, Sheet } from "./ui/kit";
import { IconKey, IconPlus } from "./ui/icons";
import { t } from "./i18n";
import { Home } from "./screens/Home";
import { CreateCommittee } from "./screens/CreateCommittee";
import { Committee } from "./screens/Committee";
import { Join } from "./screens/Join";
import { Me } from "./screens/Me";
import { Pay } from "./screens/Pay";
import { Review } from "./screens/Review";
import { Share } from "./screens/Share";
import { Settings } from "./screens/Settings";
import { Activity } from "./screens/Activity";
import { Round } from "./screens/Round";
import { Inbox } from "./screens/Inbox";

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
  const [adding, setAdding] = createSignal(false);
  const go = (to: string) => { setAdding(false); navigate(to); };
  return (
    <>
      <Switch fallback={<Home me={props.me} />}>
        <Match when={path() === "/"}><Home me={props.me} /></Match>
        <Match when={path() === "/me"}><Me me={props.me} onSaved={props.onProfileSaved} /></Match>
        <Match when={path() === "/new"}><CreateCommittee me={props.me} /></Match>
        <Match when={match("/join/:code", path())}>{p => <Join code={p().code ?? ""} />}</Match>
        <Match when={path() === "/join"}><Join /></Match>
        <Match when={match("/c/:id", path())}>{p => <Committee id={p().id ?? ""} />}</Match>
        <Match when={match("/c/:id/pay", path())}>{p => <Pay id={p().id ?? ""} />}</Match>
        <Match when={match("/c/:id/pay/:member", path())}>{p => <Pay id={p().id ?? ""} memberId={p().member ?? ""} />}</Match>
        <Match when={match("/c/:id/settings", path())}>{p => <Settings id={p().id ?? ""} />}</Match>
        <Match when={match("/c/:id/activity", path())}>{p => <Activity id={p().id ?? ""} />}</Match>
        <Match when={match("/c/:id/round/:n", path())}>{p => <Round id={p().id ?? ""} n={Number(p().n)} />}</Match>
        <Match when={path() === "/inbox"}><Inbox /></Match>
        <Match when={match("/c/:id/review", path())}>{p => <Review id={p().id ?? ""} />}</Match>
        <Match when={path() === "/share"}><Share /></Match>
      </Switch>
      <Show when={isTab()}><Dock onAdd={() => setAdding(true)} /></Show>
      <Sheet open={adding()} onClose={() => setAdding(false)} label={t("tabs.add")}>
        <div class="flex flex-col gap-1">
          <ActionRow icon={<IconPlus />} title={t("sheet.new")} sub={t("sheet.newSub")} onClick={() => go("/new")} />
          <ActionRow icon={<IconKey />} title={t("sheet.join")} sub={t("sheet.joinSub")} onClick={() => go("/join")} />
        </div>
      </Sheet>
    </>
  );
}

function Failure(props: { message: string; retry: () => void }) {
  return (
    <main class="grid min-h-dvh place-items-center bg-bg px-6 text-ink">
      <div class="flex max-w-sm flex-col gap-4 text-center">
        <h1 class="text-xl font-semibold">{t("common.somethingWrong")}</h1>
        <p class="text-[15px] text-ink-2">{props.message}</p>
        <button type="button" class="h-14 rounded-full bg-cta font-semibold text-cta-ink" onClick={() => props.retry()}>
          {t("common.tryAgain")}
        </button>
      </div>
    </main>
  );
}
