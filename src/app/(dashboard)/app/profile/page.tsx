"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function ProfilePage(): null {
  const router = useRouter();

  useEffect(() => {
    router.replace("/app/settings");
  }, [router]);

  return null;
}
