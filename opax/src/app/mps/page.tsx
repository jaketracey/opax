"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function MpsRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/politicians");
  }, [router]);
  return null;
}
