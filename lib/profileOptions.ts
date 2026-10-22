// Fixed dropdown values — must stay in sync with the check constraints on
// profiles: job_title (0026_capability_helpers.sql) and site (0001_init.sql).
//
// job_title drives permissions, but this list only feeds the dropdown and the
// create-user validation. Which titles hold which capability lives in the
// database (title_has_capability, 0026) and is never copied here.

export const JOB_TITLES = [
  "Coach",
  "Lead Coach",
  "Club Head Coach",
  "Regional General Manager",
  "Head of Gymnastics",
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
