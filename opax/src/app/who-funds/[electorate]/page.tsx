"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

/**
 * /who-funds/[electorate] — redirect to the main who-funds page
 * and auto-trigger a search for this electorate.
 *
 * We store the electorate in sessionStorage so the main page can pick it up.
 */
export default function WhoFundsElectoratePage() {
  const params = useParams();
  const router = useRouter();
  const electorate =
    typeof params.electorate === "string"
      ? decodeURIComponent(params.electorate)
      : "";

  useEffect(() => {
    if (electorate) {
      // Store the electorate so the parent page can auto-search
      sessionStorage.setItem("who-funds-auto-search", electorate);
    }
    router.replace("/who-funds");
  }, [electorate, router]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="text-center">
        <div className="mb-4 text-4xl animate-pulse">{"\uD83D\uDD0D"}</div>
        <p className="text-[#8b949e]">
          Loading data for <span className="text-[#FFD700] font-medium">{electorate}</span>...
        </p>
      </div>
    </div>
  );
}
