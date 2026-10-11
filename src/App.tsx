import { createMemo, createRenderEffect, Errored, Loading, Match, onSettled, refresh, Show, Switch } from "solid-js";
import { fetchProfile, session, type Profile } from "./lib/auth";
import { describeError } from "./lib/errors";
import { match, navigate, path, takeRememberedPath } from "./lib/router";
import { Splash } from "./ui/SignIn";
import { ProfileStep } from "./ui/ProfileStep";
import { Welcome } from "./ui/Welcome";
import { setMeName } from "./ui/glass";
import { t } from "./i18n";
import { Committee } from "./screens/Committee";
import { Pay } from "./screens/Pay";
import { Share } from "./screens/Share";
import { Settings } from "./screens/Settings";
import { Activity } from "./screens/Activity";
import { Round } from "./screens/Round";
import { WithCommittee } from "./screens/g/common";
import { HomeG } from "./screens/g/HomeG";
import { LedgerG } from "./screens/g/LedgerG";
import { TossG } from "./screens/g/TossG";
import { PayToday } from "./screens/g/PayToday";
import { ReceiptG } from "./screens/g/ReceiptG";
import { OrganizerHomeG } from "./screens/g/OrganizerHomeG";
import { HomeListG } from "./screens/g/HomeListG";
import { MembersG } from "./screens/g/MembersG";
import { ReceiptsG } from "./screens/g/ReceiptsG";
import { UpdatesG } from "./screens/g/UpdatesG";
import { SettingsG } from "./screens/g/SettingsG";
import { NewCommitteeG } from "./screens/g/NewCommitteeG";
import { JoinG } from "./screens/g/JoinG";
import { PayoutG } from "./screens/g/PayoutG";

export default function App() {
  return (
    <Errored fallback={(err, reset) => { console.error(err()); return <Failure message={describeError(err())} retry={reset} />; }}>
      <Switch>
        <Match when={session() === undefined}>
          <Splash />
        </Match>
        <Match when={session() === null}>
          <Welcome />
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
      <Show when={profile().phone} fallback={<ProfileStep profile={profile()} onSaved={() => refresh(profile)} />}>
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

  createRenderEffect(() => props.me.display_name, n => { setMeName(n); });
  // The older list Home (with its dock) shows while no committee is running.
  const legacyHome = () => <HomeListG />;
  return (
    <>
      <Switch fallback={<HomeListG />}>
        <Match when={path() === "/"}>
          <WithCommittee fallback={legacyHome()}>{(id, items) => (
            <Show when={items().find(i => i.id === id)?.role !== "member"} fallback={<HomeG id={id} items={items} />}>
              <OrganizerHomeG id={id} items={items} />
            </Show>
          )}</WithCommittee>
        </Match>
        <Match when={path() === "/ledger"}>
          <WithCommittee title={t("g.l.title")} fallback={legacyHome()}>{id => <LedgerG id={id} />}</WithCommittee>
        </Match>
        <Match when={path() === "/toss"}>
          <WithCommittee title={t("g.t.title")} fallback={legacyHome()}>{id => <TossG id={id} />}</WithCommittee>
        </Match>
        <Match when={path() === "/members"}>
          <WithCommittee title={t("m.title")} fallback={legacyHome()}>{(id, items) => <MembersG id={id} items={items} />}</WithCommittee>
        </Match>
        <Match when={path() === "/receipts"}>
          <WithCommittee title={t("rq.title")} fallback={legacyHome()}>{id => <ReceiptsG id={id} nav />}</WithCommittee>
        </Match>
        <Match when={path() === "/me"}><SettingsG me={props.me} onSaved={props.onProfileSaved} /></Match>
        <Match when={path() === "/new"}><NewCommitteeG me={props.me} /></Match>
        <Match when={match("/join/:code", path())}>{p => <JoinG code={p().code ?? ""} />}</Match>
        <Match when={path() === "/join"}><JoinG /></Match>
        <Match when={match("/c/:id", path())}>{p => <Committee id={p().id ?? ""} />}</Match>
        <Match when={match("/c/:id/pay", path())}>{p => <PayToday id={p().id ?? ""} me={props.me} />}</Match>
        <Match when={match("/c/:id/pay/:member", path())}>{p => <Pay id={p().id ?? ""} memberId={p().member ?? ""} />}</Match>
        <Match when={match("/c/:id/settings", path())}>{p => <Settings id={p().id ?? ""} />}</Match>
        <Match when={match("/c/:id/activity", path())}>{p => <Activity id={p().id ?? ""} />}</Match>
        <Match when={match("/c/:id/round/:n", path())}>{p => <Round id={p().id ?? ""} n={Number(p().n)} />}</Match>
        <Match when={path() === "/inbox"}><UpdatesG /></Match>
        <Match when={match("/c/:id/review", path())}>{p => <ReceiptsG id={p().id ?? ""} />}</Match>
        <Match when={match("/c/:id/payout/:n", path())}>{p => <PayoutG id={p().id ?? ""} n={Number(p().n)} />}</Match>
        <Match when={match("/c/:id/review/:sid", path())}>{p => <ReceiptG id={p().id ?? ""} sid={p().sid ?? ""} />}</Match>
        <Match when={path() === "/share"}><Share /></Match>
      </Switch>
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
