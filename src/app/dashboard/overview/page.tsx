"use client";

import BucketsPage from "@/app/dashboard/buckets/page";
import GoalsPage from "@/app/dashboard/goals/page";

export default function OverviewPage() {
  return (
    <div className="overview-page" style={{ padding: 32, maxWidth: 1040 }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, color: "var(--primary)", margin: "0 0 28px" }}>
        Overview
      </h1>

      <section aria-labelledby="buckets-heading" style={{ marginBottom: 40 }}>
        <BucketsPage embedded />
      </section>

      <section aria-labelledby="goals-heading">
        <GoalsPage embedded />
      </section>
    </div>
  );
}
