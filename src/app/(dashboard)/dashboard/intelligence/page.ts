import { redirect } from "next/navigation";

export default function IntelligencePage() {
  redirect("/dashboard/combos?view=intelligent");
}
