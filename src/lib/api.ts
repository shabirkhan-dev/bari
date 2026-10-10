import { supabase } from "./supabase";
import { describeError } from "./errors";
import type { Frequency } from "../domain/schedule";
import type { ObligationState } from "../domain/ledger";

const fail = (e: unknown): never => { throw new Error(describeError(e)); };

export interface CommitteeSummary {
  id: string;
  name: string;
  status: "forming" | "active" | "completed" | "cancelled";
  member_count: number;
  contribution_paisa: number;
  frequency: Frequency;
  start_date: string;
  payout_paisa: number;
  joined: number;
}

export async function listMyCommittees(): Promise<CommitteeSummary[]> {
  const { data, error } = await supabase
    .from("committees")
    .select("id, name, status, member_count, contribution_paisa, frequency, start_date, payout_paisa, committee_members(count)")
    .order("created_at", { ascending: false });
  if (error) fail(error);
  return (data ?? []).map(({ committee_members, ...c }) => ({
    ...(c as Omit<CommitteeSummary, "joined">),
    joined: (committee_members as unknown as { count: number }[])[0]?.count ?? 0
  }));
}

export interface NewCommittee {
  name: string;
  description: string | null;
  memberCount: number;
  contributionPaisa: number;
  frequency: Frequency;
  intervalDays: number | null;
  periodsPerRound: number;
  startDate: string;
  payoutPaisa: number;
  accountTitle: string;
  accountNumber: string;
  instructions: string | null;
}

export async function createCommittee(c: NewCommittee): Promise<string> {
  const { data, error } = await supabase.rpc("create_committee", {
    p_name: c.name, p_description: c.description, p_member_count: c.memberCount,
    p_contribution_paisa: c.contributionPaisa, p_frequency: c.frequency, p_interval_days: c.intervalDays,
    p_periods_per_round: c.periodsPerRound, p_start_date: c.startDate, p_payout_paisa: c.payoutPaisa,
    p_account_title: c.accountTitle, p_account_number: c.accountNumber, p_instructions: c.instructions,
    p_monthly_receive_limit_paisa: null, p_monthly_send_limit_paisa: null, p_rules: null
  });
  if (error) fail(error);
  return data as string;
}

export async function latestInvitation(committeeId: string): Promise<{ code: string; expires_at: string } | null> {
  const { data, error } = await supabase
    .from("committee_invitations")
    .select("code, expires_at")
    .eq("committee_id", committeeId)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) fail(error);
  return data;
}

export async function createInvitation(committeeId: string): Promise<string> {
  const { data, error } = await supabase.rpc("create_invitation", { p_committee_id: committeeId, p_valid_hours: 168 });
  if (error) fail(error);
  return data as string;
}

export async function joinCommittee(code: string): Promise<string> {
  const { data, error } = await supabase.rpc("join_committee", { p_code: code });
  if (error) fail(error);
  return data as string;
}

export async function activateCommittee(committeeId: string): Promise<void> {
  const { error } = await supabase.rpc("activate_committee", { p_committee_id: committeeId });
  if (error) fail(error);
}

export interface DashboardMember {
  member_id: string;
  user_id: string;
  name: string;
  phone: string | null;
  role: "owner" | "organizer" | "member";
  today_state: ObligationState | null;
  overdue_paisa: number;
  overdue_count: number;
  pending_paisa: number;
  paid_out: boolean;
}

export interface DashboardRound {
  round: number;
  first_due: string;
  toss_date: string;
  verified_paisa: number;
  status: "drawn" | "paid" | "confirmed" | "disputed" | null;
  winner_member_id: string | null;
}

export interface Dashboard {
  today: string;
  committee: {
    id: string; name: string; description: string | null; status: CommitteeSummary["status"];
    member_count: number; contribution_paisa: number; frequency: Frequency; interval_days: number | null;
    periods_per_round: number; start_date: string; payout_paisa: number;
    account_title: string; account_number: string; instructions: string | null;
  };
  me: { member_id: string; role: DashboardMember["role"] };
  current_round: number | null;
  rounds: DashboardRound[];
  members: DashboardMember[];
  /** Payments waiting for this organizer's check (0 for members). */
  pending_reviews: number;
  /** This PKT calendar month, for JazzCash limit warnings. */
  month: {
    receive_limit_paisa: number | null;
    send_limit_paisa: number | null;
    received_paisa: number;
    expected_paisa: number;
    sent_paisa: number;
    payouts_due_paisa: number;
  };
}

export async function getDashboard(committeeId: string): Promise<Dashboard> {
  const { data, error } = await supabase.rpc("committee_dashboard_v2", { p_committee_id: committeeId });
  if (error) fail(error);
  return data as Dashboard;
}

export interface HomeItem {
  id: string;
  name: string;
  status: CommitteeSummary["status"];
  role: DashboardMember["role"];
  member_count: number;
  joined: number;
  contribution_paisa: number;
  frequency: Frequency;
  interval_days: number | null;
  start_date: string;
  payout_paisa: number;
  rounds_total: number;
  current_round: number | null;
  toss_date: string | null;
  today_state: ObligationState | null;
  due_today_paisa: number;
  overdue_paisa: number;
}

export async function getHome(): Promise<HomeItem[]> {
  const { data, error } = await supabase.rpc("my_home");
  if (error) fail(error);
  return (data ?? []) as HomeItem[];
}

/* ───────────── Payments ───────────── */

export interface Payable { id: string; due_date: string; amount_paisa: number; state: "due" | "rejected" }

export async function myPayable(committeeId: string): Promise<Payable[]> {
  const { data, error } = await supabase.rpc("my_payable", { p_committee_id: committeeId });
  if (error) fail(error);
  return (data ?? []) as Payable[];
}

/** Payable days of any member (organizers recording on someone's behalf). */
export async function memberPayable(memberId: string): Promise<Payable[]> {
  const { data, error } = await supabase.rpc("member_payable", { p_member_id: memberId });
  if (error) fail(error);
  return (data ?? []) as Payable[];
}

export async function submitPayment(p: {
  memberId: string; obligationIds: string[]; amountPaisa: number; tid: string | null;
  transferredAt: string | null; paidByName: string | null; requestId: string;
}): Promise<string> {
  const { data, error } = await supabase.rpc("submit_payment", {
    p_member_id: p.memberId, p_obligation_ids: p.obligationIds, p_amount_paisa: p.amountPaisa,
    p_tid: p.tid, p_transferred_at: p.transferredAt, p_paid_by_name: p.paidByName, p_note: null,
    p_client_request_id: p.requestId
  });
  if (error) fail(error);
  return data as string;
}

/** Upload to the private bucket, then register it against the submission. */
export async function attachReceipt(committeeId: string, submissionId: string, r: { blob: Blob; mime: string; ext: string; sha256: string }) {
  const path = `${committeeId}/${submissionId}/${r.sha256}.${r.ext}`;
  const up = await supabase.storage.from("receipts").upload(path, r.blob, { contentType: r.mime, upsert: false });
  if (up.error && !/exists/i.test(up.error.message)) fail(up.error);
  const { error } = await supabase.rpc("attach_receipt", {
    p_submission_id: submissionId, p_storage_path: path, p_mime_type: r.mime, p_size_bytes: r.blob.size, p_sha256: r.sha256
  });
  if (error) fail(error);
}

export interface ReviewItem {
  id: string;
  status: "pending" | "disputed";
  member_id: string;
  member_name: string;
  member_phone: string | null;
  submitted_by_name: string;
  paid_by_name: string | null;
  amount_paisa: number;
  tid: string | null;
  transferred_at: string | null;
  created_at: string;
  due_dates: string[];
  receipt_path: string | null;
  receipt_type: string | null;
  can_decide: boolean;
}

export async function reviewQueue(committeeId: string): Promise<ReviewItem[]> {
  const { data, error } = await supabase.rpc("review_queue", { p_committee_id: committeeId });
  if (error) fail(error);
  return (data ?? []) as ReviewItem[];
}

export async function receiptUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from("receipts").createSignedUrl(path, 600);
  if (error) fail(error);
  return data!.signedUrl;
}

export async function verifySubmission(id: string, amountPaisa: number) {
  const { error } = await supabase.rpc("verify_submission", { p_submission_id: id, p_confirmed_amount_paisa: amountPaisa });
  if (error) fail(error);
}

export async function rejectSubmission(id: string, reason: string) {
  const { error } = await supabase.rpc("reject_submission", { p_submission_id: id, p_reason: reason });
  if (error) fail(error);
}

/* ───────────── Settings & membership ───────────── */

export interface CommitteeEdit {
  name: string; description: string | null; instructions: string | null; startDate: string;
  accountTitle: string; accountNumber: string; receiveLimitPaisa: number | null; sendLimitPaisa: number | null;
}

export async function updateCommittee(id: string, e: CommitteeEdit) {
  const { error } = await supabase.rpc("update_committee", {
    p_committee_id: id, p_name: e.name, p_description: e.description, p_instructions: e.instructions,
    p_start_date: e.startDate, p_account_title: e.accountTitle, p_account_number: e.accountNumber,
    p_monthly_receive_limit_paisa: e.receiveLimitPaisa, p_monthly_send_limit_paisa: e.sendLimitPaisa
  });
  if (error) fail(error);
}

export async function setMemberRole(memberId: string, role: "organizer" | "member") {
  const { error } = await supabase.rpc("set_member_role", { p_member_id: memberId, p_role: role });
  if (error) fail(error);
}

export async function removeMember(memberId: string) {
  const { error } = await supabase.rpc("remove_member", { p_member_id: memberId });
  if (error) fail(error);
}

export async function leaveCommittee(committeeId: string) {
  const { error } = await supabase.rpc("leave_committee", { p_committee_id: committeeId });
  if (error) fail(error);
}

export async function revokeInvitations(committeeId: string): Promise<number> {
  const { data, error } = await supabase.rpc("revoke_invitations", { p_committee_id: committeeId });
  if (error) fail(error);
  return data as number;
}

export interface AuditEntry { id: number; action: string; actor_name: string | null; details: Record<string, unknown>; created_at: string }

export async function auditFeed(committeeId: string): Promise<AuditEntry[]> {
  const { data, error } = await supabase.rpc("audit_feed", { p_committee_id: committeeId, p_limit: 200 });
  if (error) fail(error);
  return (data ?? []) as AuditEntry[];
}

/* ───────────── Toss & payout ───────────── */

export interface Eligibility { member_id: string; eligible: boolean; reason: "already_paid_out" | "arrears" | null; arrears_paisa: number }

export async function tossEligibility(committeeId: string, round: number): Promise<Eligibility[]> {
  const { data, error } = await supabase.rpc("toss_eligibility", { p_committee_id: committeeId, p_round: round });
  if (error) fail(error);
  return (data ?? []) as Eligibility[];
}

export async function drawToss(committeeId: string, round: number, method: "app" | "manual", winner?: string): Promise<string> {
  const { data, error } = await supabase.rpc("draw_toss", { p_committee_id: committeeId, p_round: round, p_method: method, p_manual_winner: winner ?? null });
  if (error) fail(error);
  return data as string;
}

export interface PayoutRound {
  id: string; round: number; toss_date: string; draw_method: "app" | "manual";
  eligible_member_ids: string[]; excluded: { member_id: string; reason: string; arrears_paisa: number }[];
  random_value: number | null; winner_member_id: string; drawn_at: string;
  status: "drawn" | "paid" | "confirmed" | "disputed";
  payout: PayoutRecord | null;
}

export interface PayoutRecord { amount_paisa: number; tid: string | null; paid_at: string; confirmed_at: string | null; dispute_reason: string | null }

export async function payoutRound(committeeId: string, round: number): Promise<PayoutRound | null> {
  const { data, error } = await supabase
    .from("payout_rounds")
    .select("id, round, toss_date, draw_method, eligible_member_ids, excluded, random_value, winner_member_id, drawn_at, status, payout_records(amount_paisa, tid, paid_at, confirmed_at, dispute_reason)")
    .eq("committee_id", committeeId).eq("round", round).maybeSingle();
  if (error) fail(error);
  if (!data) return null;
  // payout_records is one-to-one with its round: the API returns an object (older versions: an array).
  const { payout_records, ...rest } = data as unknown as Omit<PayoutRound, "payout"> & { payout_records: PayoutRecord | PayoutRecord[] | null };
  const payout = Array.isArray(payout_records) ? payout_records[0] ?? null : payout_records;
  return { ...rest, payout };
}

export async function recordPayout(roundId: string, amountPaisa: number, tid: string | null, paidAt: string) {
  const { error } = await supabase.rpc("record_payout", { p_payout_round_id: roundId, p_amount_paisa: amountPaisa, p_tid: tid, p_paid_at: paidAt, p_evidence_path: null });
  if (error) fail(error);
}

export async function confirmPayout(roundId: string, received: boolean, reason?: string) {
  const { error } = await supabase.rpc("confirm_payout", { p_payout_round_id: roundId, p_received: received, p_reason: reason ?? null });
  if (error) fail(error);
}

/* ───────────── Notifications ───────────── */

export interface Notice {
  id: string; kind: string; payload: Record<string, unknown>; read_at: string | null; created_at: string;
  committee_id: string | null; committees: { name: string } | null;
}

export async function listNotifications(): Promise<Notice[]> {
  const { data, error } = await supabase
    .from("notifications")
    .select("id, kind, payload, read_at, created_at, committee_id, committees(name)")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) fail(error);
  return (data ?? []) as unknown as Notice[];
}

export async function unreadCount(): Promise<number> {
  const { count, error } = await supabase.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null);
  if (error) fail(error);
  return count ?? 0;
}

export async function markAllRead() {
  const { error } = await supabase.from("notifications").update({ read_at: new Date().toISOString() }).is("read_at", null);
  if (error) fail(error);
}
