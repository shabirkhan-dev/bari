import { createMemo, createSignal, Errored, Loading, Show } from "solid-js";
import { getDashboard, payoutRound, recordPayoutWithProof, uploadPayoutProof, type Dashboard, type PayoutRound } from "../../lib/api";
import { describeError } from "../../lib/errors";
import { back, navigate } from "../../lib/router";
import { prepareReceipt, readReceipt, ReceiptError, type PreparedReceipt } from "../../lib/receipt";
import { dateShort, money, t } from "../../i18n";
import { GAvatar, GIcon, GMoney, GNote, GScreen, GSheet, GSkeleton, Halo, SlideToConfirm, WideHalo } from "../../ui/glass";
import { tick, useCopy } from "../../ui/kit";
import { groupedTid, spacedPhone } from "./common";

/** Figma "Payout": the organizer sends the pot to the winner and attaches proof. */
export function PayoutG(props: { id: string; n: number }) {
  const dash = createMemo(() => getDashboard(props.id));
  const pr = createMemo(() => payoutRound(props.id, props.n));
  return (
    <Errored fallback={err => <GScreen title={t("po.title")} left="back"><GNote tone="error">{describeError(err())}</GNote></GScreen>}>
      <Loading fallback={<GScreen title={t("po.title")}><GSkeleton /></GScreen>}>
        <Show when={pr()} fallback={
          <GScreen title={t("po.title")} left="back">
            <div class="mt-8"><GNote>{t("g.t.on", { date: dateShort(dash().rounds.find(r => r.round === props.n)?.toss_date ?? dash().today) })}</GNote></div>
          </GScreen>
        }>
          {p => <Form d={dash()} p={p()} />}
        </Show>
      </Loading>
    </Errored>
  );
}

function Form(props: { d: Dashboard; p: PayoutRound }) {
  const w = () => props.d.members.find(m => m.member_id === props.p.winner_member_id);
  const round = () => props.d.rounds.find(r => r.round === props.p.round);
  const amount = () => props.d.committee.payout_paisa;
  const short = () => (round()?.verified_paisa ?? 0) < amount();
  const [receipt, setReceipt] = createSignal<PreparedReceipt | null>(null);
  const [tid, setTid] = createSignal<string | null>(null);
  const [reading, setReading] = createSignal(false);
  const [error, setError] = createSignal("");
  const [help, setHelp] = createSignal(false);
  const { copied, copy } = useCopy();
  let file: HTMLInputElement | undefined;
  const after = `/toss`;

  const use = async (f: Blob) => {
    setError("");
    try {
      const r = await prepareReceipt(f);
      setReceipt(r);
      if (r.mime === "application/pdf") return;
      setReading(true);
      try { const p = await readReceipt(r.blob); setTid(p.tid ?? null); } catch { /* typed later if needed */ }
      finally { setReading(false); }
    } catch (e) { setError(e instanceof ReceiptError && e.message === "size" ? t("pay.errSize") : t("pay.errType")); }
  };
  const confirm = async () => {
    setError("");
    if (props.p.status !== "drawn") return navigate(after, { replace: true });
    try {
      const r = receipt();
      const path = r ? await uploadPayoutProof(props.d.committee.id, props.p.id, r) : null;
      await recordPayoutWithProof(props.p.id, amount(), tid(), new Date().toISOString(), path);
      tick();
      navigate(after, { replace: true });
    } catch (e) { setError(describeError(e)); }
  };

  return (
    <GScreen title={t("po.title")} bottom={
      <>
        <Halo w={64} label={t("common.back")} onClick={() => back(after)}><GIcon.undo /></Halo>
        <Show when={props.p.status === "drawn"} fallback={
          <div class="g-halo flex-1" style={{ height: "64px" }}><span class="g-core text-[13px]" style={{ color: "var(--g-emerald)" }}>{t("po.done")}</span></div>
        }>
          <SlideToConfirm label={t("po.slide")} busyLabel={t("po.saving")} onConfirm={confirm} />
        </Show>
        <Halo w={64} label={t("g.p.help")} onClick={() => setHelp(true)}><GIcon.help /></Halo>
      </>
    }>
      <section class="mt-2 flex flex-col items-center text-center">
        <Halo w={84}><GAvatar name={w()?.name ?? "?"} seed={w()?.user_id} size={70} /></Halo>
        <h2 class="g-serif mt-3 text-[22px]">{t("po.sendTo", { name: w()?.name ?? "—" })}</h2>
        <span class="g-chip g-chip-green mt-2">{t("po.won", { n: props.p.round })}</span>
        <GMoney paisa={amount()} size={46} class="mt-3" />
      </section>
      <Show when={short()}><div class="mt-3"><GNote>{t("po.short", { verified: money(round()?.verified_paisa ?? 0) })}</GNote></div></Show>

      <section class="g-card mt-4 px-4 pb-4 pt-3.5">
        <div class="flex items-start gap-3">
          <span class="g-step mt-0.5">1</span>
          <div class="min-w-0 flex-1">
            <h3 class="g-serif text-[17px]">{t("po.send")}</h3>
            <Show when={w()?.phone} fallback={<p class="mt-2 text-[13px]" style={{ color: "var(--g-amber)" }}>{t("po.noPhone", { name: w()?.name ?? "" })}</p>}>
              <p class="mt-2.5 text-[20px] font-semibold tracking-wide" dir="ltr" style={{ "font-family": "Manrope, sans-serif", "text-align": "start" }}>{spacedPhone(w()!.phone!)}</p>
            </Show>
            <p class="mt-1 text-[11px]" style={{ color: "var(--g-muted)" }}>{w()?.name} · JazzCash</p>
          </div>
          <Show when={w()?.phone}>
            <Halo w={92} h={48} class="self-center" onClick={() => copy(w()!.phone!)} label={t("common.copy")}>
              <span class="flex items-center gap-1.5 text-[13px] font-medium">{copied() ? <GIcon.check size={15} /> : <GIcon.copy />}{copied() ? t("common.copied") : t("common.copy")}</span>
            </Halo>
          </Show>
        </div>
      </section>

      <section class="g-card mt-3 px-4 pb-4 pt-3.5">
        <div class="flex items-center gap-3"><span class="g-step">2</span><h3 class="g-serif text-[17px]">{t("po.attach")}</h3></div>
        <input ref={el => (file = el)} type="file" accept="image/*,application/pdf" class="sr-only" tabindex="-1"
          onChange={e => { const f = e.currentTarget.files?.[0]; if (f) void use(f); e.currentTarget.value = ""; }} />
        <button type="button" onClick={() => { tick(); file?.click(); }} class="mt-3 flex w-full items-center gap-3.5 rounded-[22px] border border-dashed p-4 text-start" style={{ "border-color": "var(--g-dash)" }}>
          <Show when={receipt()?.previewUrl} fallback={<Halo w={52}><GIcon.receipt /></Halo>}>
            <img src={receipt()!.previewUrl!} alt="" class="h-[60px] w-[46px] rounded-[9px] object-cover object-top" />
          </Show>
          <span class="min-w-0">
            <span class="block text-[14px] font-medium">{receipt() ? (reading() ? t("pay.reading") : tid() ? `TID ${groupedTid(tid()!)}` : t("pay.change")) : t("g.p.upload")}</span>
            <span class="mt-0.5 block text-[11px]" style={{ color: "var(--g-muted)" }}>{t("po.attachSub")}</span>
          </span>
        </button>
      </section>

      <div class="mt-4 flex items-center gap-3 px-1">
        <span class="g-step">3</span>
        <p class="text-[12px]" style={{ color: "var(--g-ink-2)" }}>{t("po.step3")}</p>
      </div>
      <Show when={error()}><div class="mt-3"><GNote tone="error">{error()}</GNote></div></Show>

      <GSheet open={help()} onClose={() => setHelp(false)} label={t("g.p.help")}>
        <h2 class="g-serif text-[24px]">{t("po.title")}</h2>
        <p class="text-[14px] leading-relaxed" style={{ color: "var(--g-ink-2)" }}>{t("po.help")}</p>
        <WideHalo h={56} href={`/c/${props.d.committee.id}/round/${props.p.round}`}><span class="text-[14px] font-medium">{t("g.t.details")}</span></WideHalo>
      </GSheet>
    </GScreen>
  );
}
