"use client";

import { use, useEffect } from "react";
import { useRouter } from "next/navigation";

export default function MpProfileRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  useEffect(() => {
    router.replace(`/politicians/${id}`);
  }, [router, id]);
  return null;
}
