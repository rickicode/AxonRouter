import { pageTitle } from "@/shared/constants/site";
import ProviderTopologyClient from "./ProviderTopologyClient";

export const metadata = { title: pageTitle("Home") };

export default function HomePage() {
  return <ProviderTopologyClient />;
}
