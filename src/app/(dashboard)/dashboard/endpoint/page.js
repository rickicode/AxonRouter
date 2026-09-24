import { redirect } from "next/navigation";

export default function EndpointPage() {
  redirect("/dashboard/app?tab=endpoint");
}
