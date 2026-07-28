// Fixed dropdown values — must stay in sync with the check constraints in
// supabase/migrations/0001_init.sql.

export const ROLES = ["admin", "coach"] as const;
export type Role = (typeof ROLES)[number];

export const JOB_TITLES = [
  "Coach",
  "Lead Coach",
  "Club Head Coach",
  "Regional General Manager",
  "Head of Gymnastics",
  "Head of People",
  "Head of Operations",
] as const;
export type JobTitle = (typeof JOB_TITLES)[number];

export const SITES = [
  "Burnley",
  "Coventry",
  "Leeds",
  "Mansfield",
  "Rotherham",
  "Wirral",
  "Wolverhampton",
  "Head Office",
] as const;
export type Site = (typeof SITES)[number];
