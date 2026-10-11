import { createMemo, createSignal, Errored, Loading, Match, onSettled, Show, Switch } from "solid-js";
import { attachReceipt, getDashboard, myLedgerV2, myPayable, recordReceiptReading, submitPayment, type Dashboard, type LedgerV2, type Payable } from "../../lib/api";
import type { Profile } from "../../lib/auth";
import { describeError } from "../../lib/errors";
import { back, navigate } from "../../lib/router";
import { prepareReceipt, readReceipt, ReceiptError, type PreparedReceipt } from "../../lib/receipt";
import { takeShared } from "../../lib/shared";
import { parseJazzCashReceipt, type ParsedReceipt } from "../../domain/receipt";
import { todayInPKT } from "../../domain/dates";
import { clock, money, t } from "../../i18n";
import { firstName, GIcon, GMoney, GNote, GScreen, GSegmented, GSheet, GSkeleton, Halo, SlideToConfirm, WideHalo } from "../../ui/glass";
import { tick, useCopy } from "../../ui/kit";
import { Check } from "../../ui/pickers";
import { groupedTid, periodOf, periodsLabel, spacedPhone, unitCount } from "./common";

export function PayToday(props: { id: string; me: Profile }) {
  const dash = createMemo(() => getDashboard(props.id));
  const payable = createMemo(() => myPayable(props.id));
  const ledger = createMemo(() => myLedgerV2(props.id));
  return (
    <Errored fallback={err => <GScreen title={t("g.p.title")}><GNote tone="error">{describeError(err())}</GNote></GScreen>}>
      <Loading fallback={<GScreen title={t("g.p.title")}><GSkeleton /></GScreen>}>
        <PayForm d={dash()} items={payable()} l={ledger()} me={props.me} />
      </Loading>
    </Errored>
  );
}

type OcrState = "idle" | "reading" | "done" | "failed";

function PayForm(props: { d: Dashboard; items: Payable[]; l: LedgerV2; me: Profile }) {
  const today = todayInPKT();
  const requestId = crypto.randomUUID(); // the same id on retry, so no duplicate payment
  const c = () => props.d.committee;
  const sorted = () => [...props.items].sort((a, b) => a.due_date.localeCompare(b.due_date));
  const owedCount = () => sorted().filter(p => p.due_date <= today).length;
  const choices = () => {
    const n = sorted().length;
    const base = Math.min(Math.max(owedCount(), 1), n);
    return [...new Set([base, 3, 7].filter(x => x >= base && x <= n))].sort((a, b) => a - b);
  };
  const [count, setCount] = createSignal<number | null>(null);
  const chosen = () => count() ?? choices()[0] ?? 0;
  const selection = () => sorted().slice(0, chosen()); // oldest unpaid first
  const total = () => selection().reduce((s, p) => s + p.amount_paisa, 0);
  const refs = () => selection().map(p => props.l.days.find(d => d.id === p.id)).filter(d => !!d).map(d => ({ round: props.l.current_round, n: d!.n }));

  const [receipt, setReceipt] = createSignal<PreparedReceipt | null>(null);
  const [ocr, setOcr] = createSignal<OcrState>("idle");
  const [parsed, setParsed] = createSignal<ParsedReceipt | null>(null);
  const [tid, setTid] = createSignal("");
  const [typeTid, setTypeTid] = createSignal(false);
  const [someoneElse, setSomeoneElse] = createSignal(false);
  const [paidBy, setPaidBy] = createSignal("");
  const [error, setError] = createSignal("");
  const [help, setHelp] = createSignal(false);
  const [sent, setSent] = createSignal<SentInfo | null>(null);
  const { copied, copy } = useCopy();
  let fileInput: HTMLInputElement | undefined;

  const useFile = async (file: Blob) => {
    setError("");
    try {
      const r = await prepareReceipt(file);
      setReceipt(r);
      setParsed(null);
      if (r.mime === "application/pdf") return setOcr("idle");
      setOcr("reading");
      try {
        const p = await readReceipt(r.blob);
        setParsed(p);
        if (p.tid) setTid(p.tid);
        setOcr(p.tid || p.amountPaisa ? "done" : "failed");
      } catch {
        setOcr("failed");
      }
    } catch (e) {
      setError(e instanceof ReceiptError && e.message === "size" ? t("pay.errSize") : t("pay.errType"));
    }
  };

  // A receipt shared from JazzCash arrives here ready to use.
  onSettled(() => {
    const shared = takeShared();
    if (shared?.file) void useFile(shared.file);
    else if (shared?.text) {
      const p = parseJazzCashReceipt(shared.text);
      setParsed(p);
      if (p.tid) { setTid(p.tid); setTypeTid(true); }
    }
  });

  const submit = async () => {
    if (selection().length === 0) return setError(t("pay.errNone"));
    const cleanTid = tid().replace(/\D/g, "") || null;
    if (!receipt() && !cleanTid) { setTypeTid(true); return setError(t("g.p.needProof")); }
    setError("");
    try {
      const id = await submitPayment({
        memberId: props.d.me.member_id,
        obligationIds: selection().map(p => p.id),
        amountPaisa: total(),
        tid: cleanTid,
        transferredAt: parsed()?.occurredAt ?? null,
        paidByName: someoneElse() ? paidBy().trim() || null : null,
        requestId
      });
      let warning: string | null = null;
      const r = receipt();
      if (r) {
        try { await attachReceipt(c().id, id, r); }
        catch (e) { warning = t("pay.errUpload", { error: describeError(e) }); }
      }
      // What the phone read is saved for the organizer's checks; it's never proof by itself.
      const p = parsed();
      if (p) await recordReceiptReading(id, p.amountPaisa ?? null, p.tid || p.amountPaisa ? p.saysSuccessful : null).catch(() => undefined);
      tick();
      setSent({
        amount: total(), warning, tid: cleanTid, at: parsed()?.occurredAt ?? new Date().toISOString(),
        receipt: r ? { size: r.blob.size, at: new Date().toISOString(), url: r.previewUrl } : null,
        organizer: firstName(c().account_title), streak: props.l.streak
      });
    } catch (e) {
      setError(describeError(e));
    }
  };

  const organizer = () => firstName(c().account_title);
  const last4 = () => (props.me.phone ?? "").slice(-4);

  return (
    <Show when={!sent()} fallback={<Sent s={sent()!} />}>
      <GScreen title={t("g.p.title")} bottom={
        <>
          <Halo w={64} label={t("common.back")} onClick={() => back("/")}><GIcon.undo /></Halo>
          <SlideToConfirm label={t("g.p.slide")} busyLabel={t("g.p.sending")} onConfirm={submit} disabled={sorted().length === 0} />
          <Halo w={64} label={t("g.p.help")} onClick={() => setHelp(true)}><GIcon.help /></Halo>
        </>
      }>
        <div class="mt-3 flex justify-center">
          <a href="/me" class="g-halo" style={{ height: "48px" }} aria-label={t("g.p.number")}
            onClick={e => { e.preventDefault(); tick(); navigate("/me"); }}>
            <span class="relative m-[5px] flex h-[34px] items-center gap-2 rounded-full pe-3 ps-1.5" style={{ background: "var(--g-inner)", "box-shadow": "var(--g-inner-shadow)" }}>
              <span class="grid h-6 w-6 place-items-center rounded-full text-[12px] font-semibold" style={{ background: "var(--g-cta)", color: "var(--g-cta-ink)" }}>J</span>
              <span class="text-[13px] font-semibold" lang="en">JazzCash</span>
              <span class="text-[12px]" style={{ color: "var(--g-faint)" }} dir="ltr">···· {last4()}</span>
              <GIcon.caret />
            </span>
          </a>
        </div>

        <Show when={sorted().length > 0} fallback={<div class="mt-8"><GNote>{t("pay.nothingDue")}</GNote></div>}>
          <section class="mt-2.5 flex flex-col items-center text-center" aria-live="polite">
            <p class="text-[11px]" style={{ color: "var(--g-muted)" }}>
              {refs().length === 1 ? periodOf(c().frequency, refs()[0]!.n, props.l.periods_per_round) : periodsLabel(c().frequency, refs())}
              {refs().length ? " · " : ""}{c().name}
            </p>
            <p class="mt-1 flex items-baseline gap-3" dir="ltr">
              <GMoney paisa={total()} size={62} prefix={false} tight={-0.03} plainCents />
              <span class="text-[17px]" style={{ color: "var(--g-faint)" }}>PKR</span>
            </p>
          </section>

          <Show when={choices().length > 1}>
            <div class="mt-4">
              <GSegmented label={t("g.p.howMany")} value={chosen()} onChange={v => setCount(v)}
                options={choices().map(n => ({ value: n, label: unitCount(c().frequency, n) }))} />
            </div>
          </Show>

          <section class="g-card mt-4 px-4 pb-4 pt-3.5">
            <div class="flex items-start gap-3">
              <span class="g-step mt-0.5">1</span>
              <div class="min-w-0 flex-1">
                <h2 class="g-serif text-[17px]">{t("g.p.send", { amount: money(total()), name: organizer() })}</h2>
                <p class="mt-2.5 text-[20px] font-semibold tracking-wide" dir="ltr" style={{ "font-family": "Manrope, sans-serif", "text-align": "start" }}>{spacedPhone(c().account_number)}</p>
                <p class="mt-1 text-[11px]" style={{ color: "var(--g-muted)" }}>{t("g.p.organizer")}</p>
              </div>
              <Halo w={92} h={48} class="self-center" onClick={() => copy(c().account_number)} label={t("common.copy")}>
                <span class="flex items-center gap-1.5 text-[13px] font-medium">
                  {copied() ? <GIcon.check size={15} /> : <GIcon.copy />}{copied() ? t("common.copied") : t("common.copy")}
                </span>
              </Halo>
            </div>
          </section>

          <section class="g-card mt-3 px-4 pb-4 pt-3.5">
            <div class="flex items-center gap-3">
              <span class="g-step">2</span>
              <h2 class="g-serif text-[17px]">{t("g.p.attach")}</h2>
            </div>
            <input ref={el => (fileInput = el)} type="file" accept="image/*,application/pdf" class="sr-only" tabindex="-1"
              onChange={e => { const f = e.currentTarget.files?.[0]; if (f) void useFile(f); e.currentTarget.value = ""; }} />
            <Show when={receipt()} fallback={
              <button type="button" onClick={() => { tick(); fileInput?.click(); }}
                class="mt-3 flex w-full items-center gap-3.5 rounded-[22px] border border-dashed p-4 text-start"
                style={{ "border-color": "var(--g-dash)" }}>
                <Halo w={52}><GIcon.image /></Halo>
                <span class="min-w-0">
                  <span class="block text-[14px] font-medium">{t("g.p.upload")}</span>
                  <span class="mt-0.5 block text-[11px]" style={{ color: "var(--g-muted)" }}>{t("g.p.uploadSub")}</span>
                </span>
              </button>
            }>
              {r => (
                <div class="mt-3 flex items-center gap-3 rounded-[22px] border border-dashed p-3" style={{ "border-color": "var(--g-dash)" }}>
                  <Show when={r().previewUrl} fallback={<span class="grid h-[72px] w-14 shrink-0 place-items-center rounded-xl text-[12px] font-semibold" style={{ background: "var(--g-inner)" }}>PDF</span>}>
                    <img src={r().previewUrl!} alt="" class="h-[72px] w-14 shrink-0 rounded-xl object-cover object-top" />
                  </Show>
                  <div class="min-w-0 flex-1 text-[12px]" aria-live="polite">
                    <Switch>
                      <Match when={ocr() === "reading"}><p style={{ color: "var(--g-muted)" }}>{t("pay.reading")}</p></Match>
                      <Match when={ocr() === "failed"}><p style={{ color: "var(--g-amber)" }}>{t("pay.readFail")}</p></Match>
                      <Match when={ocr() === "done" && parsed()?.amountPaisa !== undefined && parsed()!.amountPaisa !== total()}>
                        <p style={{ color: "var(--g-red)" }}>{t("pay.mismatch", { receipt: money(parsed()!.amountPaisa!), selected: money(total()) })}</p>
                      </Match>
                      <Match when={ocr() === "done"}><span class="g-chip g-chip-green">{parsed()?.amountPaisa === total() ? t("pay.matches") : t("g.r.chkTid")}</span></Match>
                    </Switch>
                    <Show when={tid()}><p class="mt-1 font-semibold" dir="ltr" style={{ "text-align": "start" }}>TID {groupedTid(tid())}</p></Show>
                    <Show when={ocr() === "done" && parsed() && !parsed()!.saysSuccessful}><p class="mt-1" style={{ color: "var(--g-amber)" }}>{t("pay.notSuccessful")}</p></Show>
                  </div>
                  <Halo w={84} h={44} onClick={() => fileInput?.click()}><span class="text-[12px] font-medium">{t("pay.change")}</span></Halo>
                </div>
              )}
            </Show>
            <div class="mt-2.5 flex items-center justify-between gap-3 text-[12px] font-medium" style={{ color: "var(--g-muted)" }}>
              <Show when={!receipt() && !typeTid()} fallback={<span />}>
                <button type="button" class="min-h-9 underline underline-offset-4" onClick={() => { tick(); setTypeTid(true); }}>{t("pay.tid")}</button>
              </Show>
              <span class="flex min-h-9 items-center gap-2">
                <Check checked={someoneElse()} onChange={setSomeoneElse} label={t("pay.someoneElse")} />
                <span aria-hidden="true" onClick={() => setSomeoneElse(!someoneElse())}>{t("pay.someoneElse")}</span>
              </span>
            </div>
            <Show when={typeTid() || ocr() === "failed" || (ocr() === "idle" && !!receipt())}>
              <label class="mt-2 block">
                <span class="text-[12px]" style={{ color: "var(--g-muted)" }}>{t("pay.tid")}</span>
                <input class="mt-1 h-12 w-full rounded-2xl px-4 text-[17px] font-semibold tracking-wider outline-none" inputmode="numeric" dir="ltr"
                  style={{ background: "var(--g-inner)", color: "var(--g-ink)" }} placeholder="726755086850"
                  value={tid()} onInput={e => setTid(e.currentTarget.value.replace(/[^\d]/g, "").slice(0, 20))} />
              </label>
            </Show>
            <Show when={someoneElse()}>
              <input class="mt-2 h-12 w-full rounded-2xl px-4 text-[15px] outline-none" style={{ background: "var(--g-inner)", color: "var(--g-ink)" }}
                aria-label={t("pay.paidBy")} placeholder={t("pay.paidByPh")} value={paidBy()} maxlength="80" onInput={e => setPaidBy(e.currentTarget.value)} />
            </Show>
          </section>

          <Show when={error()}><div class="mt-3"><GNote tone="error">{error()}</GNote></div></Show>

          <div class="mt-4 flex items-center gap-3 px-1">
            <span class="g-step">3</span>
            <p class="text-[12px]" style={{ color: "var(--g-ink-2)" }}>{t("g.p.step3")}</p>
          </div>
        </Show>

        <GSheet open={help()} onClose={() => setHelp(false)} label={t("g.p.helpTitle")}>
          <h2 class="g-serif text-[24px]">{t("g.p.helpTitle")}</h2>
          <p class="text-[14px] leading-relaxed" style={{ color: "var(--g-ink-2)" }}>{t("g.p.helpBody")}</p>
          <Show when={c().instructions}>
            <div class="g-card px-4 py-3">
              <p class="text-[12px]" style={{ color: "var(--g-muted)" }}>{t("g.p.note")}</p>
              <p class="mt-1 text-[14px]">{c().instructions}</p>
            </div>
          </Show>
          <p class="text-[12px]" style={{ color: "var(--g-muted)" }}>{t("app.safetyShort")}</p>
          <WideHalo h={56} dark onClick={() => setHelp(false)}><span class="text-[15px] font-medium">{t("common.continue")}</span></WideHalo>
        </GSheet>
      </GScreen>
    </Show>
  );
}

interface SentInfo {
  amount: number; warning: string | null; tid: string | null; at: string;
  receipt: { size: number; at: string; url: string | null } | null; organizer: string; streak: number;
}

/** Figma "Payment submitted": what happened, and what's next. */
function Sent(props: { s: SentInfo }) {
  const [view, setView] = createSignal(false);
  const s = () => props.s;
  const kb = (n: number) => `${Math.max(1, Math.round(n / 1024))} KB`;
  const step = (done: boolean, title: string, sub: string, time: string | null, last = false) => (
    <li class="relative flex gap-3.5 pb-5">
      <Show when={!last}><span class="absolute start-[10px] top-6 h-[calc(100%-18px)] w-[2px]" style={{ background: done ? "var(--g-chip)" : "var(--g-tick)" }} /></Show>
      <span class="relative grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full"
        style={done ? { background: "var(--g-chip)", color: "#fff" } : { border: "1.5px dashed var(--g-dash)", background: "var(--g-inner)" }}>
        <Show when={done}><GIcon.check size={12} /></Show>
      </span>
      <span class="min-w-0 flex-1">
        <span class="flex items-baseline justify-between gap-2">
          <span class="text-[15px] font-medium">{title}</span>
          <Show when={time}><span class="shrink-0 text-[11px]" style={{ color: "var(--g-faint)" }}>{time}</span></Show>
        </span>
        <span class="mt-0.5 block text-[12px]" style={{ color: "var(--g-muted)" }} dir="auto">{sub}</span>
      </span>
    </li>
  );
  return (
    <GScreen title={t("ps.title")} bare bottom={
      <>
        <Show when={s().receipt?.url}>
          <button type="button" class="g-halo w-[44%] shrink-0" style={{ height: "64px" }} onClick={() => { tick(); setView(true); }}>
            <span class="g-core justify-start gap-2.5 ps-[5px]">
              <span class="grid h-10 w-10 place-items-center rounded-full border border-dashed" style={{ "border-color": "var(--g-dash)" }}><GIcon.receipt /></span>
              <span class="truncate text-[13px] font-medium">{t("ps.view")}</span>
            </span>
          </button>
        </Show>
        <WideHalo h={64} dark class="flex-1" onClick={() => navigate("/", { replace: true, direction: "back" })}><span class="text-[15px] font-medium">{t("ps.home")}</span></WideHalo>
      </>
    }>
      <section class="g-rise mt-[calc(64px+env(safe-area-inset-top))] flex flex-col items-center text-center">
        <Halo w={116}><span class="absolute inset-[6px] grid place-items-center rounded-full" style={{ background: "var(--g-chip)", color: "#fff" }}><GIcon.check size={34} /></span></Halo>
        <h2 class="g-serif mt-5 text-[30px]">{t("ps.title")}</h2>
        <p class="mt-1 text-[13px]" style={{ color: "var(--g-muted)" }}>{t("ps.sub", { name: s().organizer })}</p>
        <GMoney paisa={s().amount} size={46} class="mt-3" />
      </section>
      <ol class="g-card mt-6 px-4 pt-5">
        {step(true, t("ps.sent"), s().tid ? `TID ${groupedTid(s().tid!)}` : t("ps.noTid"), clock(s().at))}
        {step(!!s().receipt, t("ps.uploaded"), s().receipt ? t("ps.shot", { size: kb(s().receipt!.size) }) : t("ps.noReceipt"), s().receipt ? clock(s().receipt!.at) : null)}
        {step(false, t("ps.check"), t("ps.checkSub"), null, true)}
      </ol>
      <Show when={s().streak >= 2}>
        <div class="mt-4 flex justify-center"><span class="g-chip g-chip-green">{t("ps.streak", { n: s().streak })}</span></div>
      </Show>
      <Show when={s().warning}><div class="mt-3"><GNote tone="error">{s().warning}</GNote></div></Show>
      <GSheet open={view()} onClose={() => setView(false)} label={t("ps.view")}>
        <img src={s().receipt?.url ?? ""} alt={t("ps.view")} class="max-h-[75dvh] w-full rounded-2xl object-contain" />
      </GSheet>
    </GScreen>
  );
}
