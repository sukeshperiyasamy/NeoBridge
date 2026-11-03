import type { Metadata } from "next";

import { MotherView } from "./view";

export const metadata: Metadata = { title: "Mother" };

export default function MotherDashboard() {
  return <MotherView />;
}
