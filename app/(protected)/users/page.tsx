import UsersTable from "@/components/UsersTable";

export default function UsersPage() {
  // TODO: redirect non-admins to / per build doc section 2.
  return (
    <main className="p-8">
      <h1 className="text-2xl font-semibold text-ink">Users</h1>
      <UsersTable />
    </main>
  );
}
