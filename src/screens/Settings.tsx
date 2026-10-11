import { createMemo, createSignal, Errored, For, Loading, refresh, Show, untrack } from "solid-js";
import {
  getDashboard, leaveCommittee, removeMember, revokeInvitations, setMemberRole, updateCommittee, setDailyCutoff,
  type Dashboard, type DashboardMember
} from "../lib/api";
import { describeError } from "../lib/errors";
import { DateField, TimeField } from "../ui/pickers";
import { navigate } from "../lib/router";
import { todayInPKT } from "../domain/dates";
import { rupees } from "../domain/money";
import { formatPkMobile, normalizePkMobile } from "../domain/phone";
import { t, timeOfDay } from "../i18n";
import { ActionRow, Avatar, Badge, Button, Card, ErrorNote, Field, inputClass, Screen, Sheet, Skeleton } from "../ui/kit";
import { IconClock } from "../ui/icons";

export function Settings(props: { id: string }) {
  const dash = createMemo(() => getDashboard(props.id));
  return (
    <Screen backTo={`/c/${props.id}`} title={t("settings.title")}>
      <Errored fallback={err => <ErrorNote message={describeError(err())} />}>
        <Loading fallback={<Skeleton lines={3} />}>
          <SettingsBody d={dash()} onChange={() => refresh(dash)} />
        </Loading>
      </Errored>
    </Screen>
  );
}

const organizer = (d: Dashboard) => d.me.role === "owner" || d.me.role === "organizer";

function SettingsBody(props: { d: Dashboard; onChange: () => void }) {
  const forming = () => props.d.committee.status === "forming";
  const [confirm, setConfirm] = createSignal<null | { title: string; body?: string; action: () => Promise<void>; danger?: boolean; label: string }>(null);
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal("");
  const [note, setNote] = createSignal("");

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try { await fn(); setConfirm(null); props.onChange(); }
    catch (e) { setError(describeError(e)); }
    finally { setBusy(false); }
  };
  const hasCoOrganizer = () => props.d.members.some(m => m.role === "organizer");

  return (
    <>
      <Show when={organizer(props.d)}>
        <DetailsForm d={props.d} forming={forming()} onSaved={props.onChange} />
      </Show>

      <Card class="flex flex-col gap-3 p-2">
        <div class="px-3 pt-3">
          <h2 class="text-lg font-semibold">{t("settings.members")}</h2>
          <p class="text-sm text-ink-2">{t("settings.coOrgHint")}</p>
          <Show when={props.d.me.role === "owner" && !hasCoOrganizer()}>
            <p class="mt-2 rounded-2xl bg-warn-soft px-3 py-2 text-sm text-warn">{t("settings.noCoOrg")}</p>
          </Show>
        </div>
        <ul>
          <For each={props.d.members}>{m => (
            <li class="flex flex-wrap items-center gap-3 rounded-[20px] p-3">
              <Avatar name={m.name} />
              <span class="min-w-0 flex-1">
                <span class="block truncate text-[17px] font-medium">{m.name}</span>
                <Show when={m.role !== "member"}><Badge tone="neutral">{m.role === "owner" ? t("c.organizer") : t("c.coOrganizer")}</Badge></Show>
              </span>
              <MemberActions d={props.d} m={m} forming={forming()} busy={busy()}
                onRole={role => run(() => setMemberRole(m.member_id, role))}
                onRemove={() => setConfirm({ title: t("settings.removeConfirm", { name: m.name }), label: t("settings.remove"), danger: true, action: () => removeMember(m.member_id) })} />
            </li>
          )}</For>
        </ul>
      </Card>

      <Show when={organizer(props.d) && forming()}>
        <Card class="flex flex-col gap-3">
          <h2 class="text-lg font-semibold">{t("settings.invites")}</h2>
          <Button variant="soft" disabled={busy()} onClick={() => run(async () => { const n = await revokeInvitations(props.d.committee.id); setNote(t("settings.revoked", { n })); })}>
            {t("settings.revoke")}
          </Button>
          <Show when={note()}><p class="text-sm text-ink-2" aria-live="polite">{note()}</p></Show>
        </Card>
      </Show>

      <Card class="p-2">
        <ActionRow icon={<IconClock size={20} />} title={t("settings.activity")} sub={t("settings.activitySub")}
          onClick={() => navigate(`/c/${props.d.committee.id}/activity`)} />
      </Card>

      <Show when={error()}><ErrorNote message={error()} /></Show>

      <Show when={forming() && props.d.me.role !== "owner"}>
        <Button variant="secondary" onClick={() => setConfirm({
          title: t("settings.leaveConfirm", { name: props.d.committee.name }), label: t("settings.leave"), danger: true,
          action: async () => { await leaveCommittee(props.d.committee.id); navigate("/", { replace: true, direction: "back" }); }
        })}>{t("settings.leave")}</Button>
      </Show>

      <Sheet open={!!confirm()} onClose={() => setConfirm(null)} label={confirm()?.title ?? ""}>
        <div class="flex flex-col gap-5 px-2">
          <h2 class="text-2xl font-bold">{confirm()?.title}</h2>
          <Show when={error()}><ErrorNote message={error()} /></Show>
          <div class="grid grid-cols-2 gap-3">
            <Button variant="soft" onClick={() => setConfirm(null)}>{t("common.cancel")}</Button>
            <Button variant={confirm()?.danger ? "danger" : "primary"} disabled={busy()} onClick={() => { const c = confirm(); if (c) void run(c.action); }}>
              {confirm()?.label}
            </Button>
          </div>
        </div>
      </Sheet>
    </>
  );
}

function MemberActions(props: {
  d: Dashboard; m: DashboardMember; forming: boolean; busy: boolean;
  onRole: (role: "organizer" | "member") => void; onRemove: () => void;
}) {
  const isOwner = () => props.d.me.role === "owner";
  const self = () => props.m.member_id === props.d.me.member_id;
  return (
    <span class="flex gap-2">
      <Show when={isOwner() && props.m.role !== "owner"}>
        <Button variant="soft" class="h-10 px-4 text-sm" disabled={props.busy}
          onClick={() => props.onRole(props.m.role === "organizer" ? "member" : "organizer")}>
          {props.m.role === "organizer" ? t("settings.removeCo") : t("settings.makeCo")}
        </Button>
      </Show>
      <Show when={organizer(props.d) && props.forming && props.m.role !== "owner" && !self()}>
        <Button variant="soft" class="h-10 px-4 text-sm text-late" disabled={props.busy} onClick={props.onRemove}>{t("settings.remove")}</Button>
      </Show>
    </span>
  );
}

function DetailsForm(props: { d: Dashboard; forming: boolean; onSaved: () => void }) {
  const c = untrack(() => props.d.committee);
  const lim = untrack(() => props.d.month);
  const [name, setName] = createSignal(c.name);
  const [note, setNote] = createSignal(c.instructions ?? "");
  const [start, setStart] = createSignal(c.start_date);
  const [acct, setAcct] = createSignal(c.account_number);
  const [title, setTitle] = createSignal(c.account_title);
  const [recv, setRecv] = createSignal(lim.receive_limit_paisa ? String(lim.receive_limit_paisa / 100) : "");
  const [send, setSend] = createSignal(lim.send_limit_paisa ? String(lim.send_limit_paisa / 100) : "");
  const [cutoff, setCutoff] = createSignal(untrack(() => props.d.cutoff) || "21:00");
  const [state, setState] = createSignal<"idle" | "saving" | "saved">("idle");
  const [error, setError] = createSignal("");
  const accountChanged = () => normalizePkMobile(acct()) !== c.account_number || title().trim() !== c.account_title;
  const limit = (v: string) => (v.trim() ? rupees(Number(v)) : null);

  const save = async (e: SubmitEvent) => {
    e.preventDefault();
    const number = normalizePkMobile(acct());
    if (name().trim().length < 2) return setError(t("create.errName"));
    if (!number) return setError(t("create.errAcct"));
    if (title().trim().length < 2) return setError(t("create.errTitle"));
    if (props.forming && start() < todayInPKT()) return setError(t("create.errPast"));
    setState("saving");
    setError("");
    try {
      await updateCommittee(c.id, {
        name: name().trim(), description: c.description, instructions: note().trim() || null, startDate: start(),
        accountTitle: title().trim(), accountNumber: number, receiveLimitPaisa: limit(recv()), sendLimitPaisa: limit(send())
      });
      if (cutoff() && cutoff() !== untrack(() => props.d.cutoff)) await setDailyCutoff(c.id, cutoff());
      setState("saved");
      props.onSaved();
    } catch (err) {
      setError(describeError(err));
      setState("idle");
    }
  };
  const touched = () => setState("idle");

  return (
    <form onSubmit={save} novalidate>
      <Card class="flex flex-col gap-5">
        <h2 class="text-lg font-semibold">{t("settings.details")}</h2>
        <Field label={t("create.name")}>
          <input class={inputClass} value={name()} maxlength="80" onInput={e => { setName(e.currentTarget.value); touched(); }} />
        </Field>
        <Field label={t("create.first")} hint={props.forming ? undefined : t("settings.startLocked")}>
          <DateField value={start()} min={todayInPKT()} disabled={!props.forming} label={t("create.first")} onChange={v => { setStart(v); touched(); }} />
        </Field>
        <Field label={t("create.acct")} hint={!props.forming && accountChanged() ? t("settings.accountWarn") : normalizePkMobile(acct()) ? formatPkMobile(normalizePkMobile(acct())!) : undefined}>
          <input class={[inputClass, "tracking-wide"]} type="tel" inputmode="numeric" dir="ltr" value={acct()} onInput={e => { setAcct(e.currentTarget.value); touched(); }} />
        </Field>
        <Field label={t("create.acctTitle")}>
          <input class={inputClass} value={title()} maxlength="80" onInput={e => { setTitle(e.currentTarget.value); touched(); }} />
        </Field>
        <Field label={t("g.s.cutoff")} hint={t("g.s.cutoffHint", { time: timeOfDay(cutoff() || "21:00") })}>
          <TimeField value={cutoff()} label={t("g.s.cutoff")} onChange={v => { setCutoff(v); touched(); }} />
        </Field>
        <Field label={t("create.note")}>
          <textarea class={[inputClass, "h-24 py-3 text-base"]} value={note()} maxlength="2000" onInput={e => { setNote(e.currentTarget.value); touched(); }} />
        </Field>
        <div class="flex flex-col gap-3">
          <div>
            <p class="text-[15px] font-medium text-ink-2">{t("settings.limits")}</p>
            <p class="text-sm text-ink-3">{t("settings.limitsHint")}</p>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <Field label={t("settings.receiveLimit")}>
              <input class={[inputClass, "num"]} inputmode="numeric" dir="ltr" placeholder="300000" value={recv()} onInput={e => { setRecv(e.currentTarget.value.replace(/\D/g, "").slice(0, 9)); touched(); }} />
            </Field>
            <Field label={t("settings.sendLimit")}>
              <input class={[inputClass, "num"]} inputmode="numeric" dir="ltr" placeholder="300000" value={send()} onInput={e => { setSend(e.currentTarget.value.replace(/\D/g, "").slice(0, 9)); touched(); }} />
            </Field>
          </div>
        </div>
        <Show when={error()}><ErrorNote message={error()} /></Show>
        <Button type="submit" disabled={state() === "saving"}>
          {state() === "saving" ? t("common.saving") : state() === "saved" ? t("settings.saved") : t("settings.save")}
        </Button>
      </Card>
    </form>
  );
}

