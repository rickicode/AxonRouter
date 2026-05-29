import CavemanPageClient from "./CavemanPageClient";

import { pageTitle } from "@/shared/constants/site";

export const metadata = { title: pageTitle("Caveman") };

export default function CavemanPage() {
  return <CavemanPageClient />;
}
