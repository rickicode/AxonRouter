// Auto-initialize app when server starts
import { redirect } from "next/navigation";

async function init() {
  const p = ["@/lib", "initApp"].join("/");
  await import(p);
}
void init();

export default function InitPage() {
  redirect('/app');
}
