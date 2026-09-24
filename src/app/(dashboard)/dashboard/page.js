import { getMachineId } from "@/shared/utils/machine";
import AppPageClient from "./app/AppPageClient";

export default async function DashboardPage() {
 const machineId = await getMachineId();
 return <AppPageClient machineId={machineId} />;
}
