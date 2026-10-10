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
