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
}

export async function getDashboard(committeeId: string): Promise<Dashboard> {
  const { data, error } = await supabase.rpc("committee_dashboard", { p_committee_id: committeeId });
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
