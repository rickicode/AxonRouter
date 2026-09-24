import { getMachineId } from "@/shared/utils/machine";
import AppPageClient from "./AppPageClient";

export default async function AppPage() {
  const machineId = await getMachineId();
  return <AppPageClient machineId={machineId} />;
}
