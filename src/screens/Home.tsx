import { createMemo, Errored, For, Loading, Show } from "solid-js";
import { listMyCommittees, type CommitteeSummary } from "../lib/api";
import { navigate } from "../lib/router";
import { describeError } from "../lib/errors";
import { contributionLabel, longDate } from "../domain/display";
import { todayInPKT } from "../domain/dates";
import { formatPKR } from "../domain/money";
import { Button, Card, Chip, ErrorNote, Screen, Skeleton, tick } from "../ui/kit";
import { Mark } from "../ui/Mark";

export function Home() {
  const committees = createMemo(() => listMyCommittees());
  return (
    <Screen title="Committees" tabs>
      <Errored fallback={err => <ErrorNote message={describeError(err())} />}>
        <Loading fallback={<Skeleton lines={2} />}>
          <Show when={committees().length > 0} fallback={<Empty />}>
            <div class="flex flex-col gap-3">
              <For each={committees()}>{c => <CommitteeCard c={c} />}</For>
            </div>
            <div class="grid grid-cols-2 gap-3 pt-2">
              <Button variant="secondary" onClick={() => navigate("/join")}>Join</Button>
              <Button onClick={() => navigate("/new")}>New committee</Button>
            </div>
          </Show>
        </Loading>
      </Errored>
    </Screen>
  );
}

function CommitteeCard(props: { c: CommitteeSummary }) {
  return (
    <a
      href={`/c/${props.c.id}`}
      class="block rounded-3xl border border-bari-line/70 bg-white p-4 active:scale-[0.99] active:bg-bari-mint/40"
      onClick={e => { e.preventDefault(); tick(); navigate(`/c/${props.c.id}`); }}
    >
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <h2 class="truncate text-lg font-semibold text-bari-ink">{props.c.name}</h2>
          <p class="mt-0.5 text-sm text-bari-muted">{contributionLabel(props.c.contribution_paisa, props.c.frequency)}</p>
        </div>
        <Show when={props.c.status === "forming"} fallback={
          <Chip tone={props.c.status === "active" ? "ok" : "neutral"}>{props.c.status === "active" ? "Running" : "Finished"}</Chip>
        }>
          <Chip tone="wait">{props.c.joined} of {props.c.member_count} joined</Chip>
        </Show>
      </div>
      <div class="mt-4 flex items-end justify-between">
        <div>
          <p class="text-xs uppercase tracking-wide text-bari-muted">Each payout</p>
          <p class="text-2xl font-bold tabular-nums text-bari-ink">{formatPKR(props.c.payout_paisa)}</p>
        </div>
        <p class="text-sm text-bari-muted">{props.c.start_date <= todayInPKT() ? "Started" : "Starts"} {longDate(props.c.start_date)}</p>
      </div>
    </a>
  );
}

function Empty() {
  return (
    <div class="flex flex-1 flex-col items-center justify-center gap-6 px-4 py-10 text-center">
      <Mark size={96} />
      <div>
        <h2 class="text-2xl font-semibold text-bari-ink">No committees yet</h2>
        <p class="mt-2 text-bari-muted">Start one for your family or friends, or join with the code someone sent you.</p>
      </div>
      <div class="flex w-full flex-col gap-3">
        <Button onClick={() => navigate("/new")}>Start a committee</Button>
        <Button variant="secondary" onClick={() => navigate("/join")}>I have a code</Button>
      </div>
      <Card class="w-full text-left">
        <p class="text-sm leading-relaxed text-bari-muted">
          Bari keeps track; <span class="font-medium text-bari-ink">JazzCash moves the money.</span> Members send their share to the committee's JazzCash number, and the organizer confirms it here.
        </p>
      </Card>
    </div>
  );
}
