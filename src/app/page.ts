// Auto-initialize app when server starts
import "@/lib/initApp";
import { redirect } from "next/navigation";

export default function InitPage() {
  redirect('/dashboard');
}
