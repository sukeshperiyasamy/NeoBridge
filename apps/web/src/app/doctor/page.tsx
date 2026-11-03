import type { Metadata } from "next";

import { DoctorView } from "./view";

export const metadata: Metadata = { title: "Doctor" };

export default function DoctorDashboard() {
  return <DoctorView />;
}
