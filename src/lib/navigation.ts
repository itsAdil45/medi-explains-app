// Which bottom tabs each role gets - the same role rules the old hamburger
// menu used. Account is available to everyone.
export type TabName =
  | "dashboard"
  | "NewConsultation"
  | "queue"
  | "appointments"
  | "account";

export function visibleTabs(role?: string): Set<TabName> {
  const tabs = new Set<TabName>(["account"]);
  // Receptionists never have consultations of their own - the queue is
  // their day-to-day workspace instead of the dashboard.
  if (role !== "receptionist") tabs.add("dashboard");
  if (role === "doctor") tabs.add("NewConsultation");
  if (role === "doctor" || role === "receptionist") tabs.add("queue");
  if (role === "patient" || role === "doctor" || role === "receptionist")
    tabs.add("appointments");
  return tabs;
}

// Where a signed-in user lands.
export function homeRouteFor(role?: string) {
  return role === "receptionist" ? "/queue" : "/dashboard";
}
