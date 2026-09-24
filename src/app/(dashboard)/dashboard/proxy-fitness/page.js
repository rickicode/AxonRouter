import { redirect } from "next/navigation";

export default function ProxyFitnessPage() {
  redirect("/dashboard/proxy-pools?tab=fitness");
}
