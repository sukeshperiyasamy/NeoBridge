import type { Metadata } from "next";

import { AshaView } from "./view";

export const metadata: Metadata = { title: "ASHA" };

export default function AshaDashboard() {
  return <AshaView />;
}
