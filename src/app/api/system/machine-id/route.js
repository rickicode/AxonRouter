import { getConsistentMachineId } from "@/shared/utils/machineId";

export const dynamic = "force-dynamic";

export async function GET() {
  const machineId = await getConsistentMachineId();
  return Response.json({ machineId }, { headers: { "Cache-Control": "no-store" } });
}
