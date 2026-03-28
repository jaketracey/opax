"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useRef, useEffect } from "react";

const MENU = {
  Investigate: [
    { href: "/gambling", label: "Gambling Reform", emoji: "🎰" },
    { href: "/housing", label: "Housing", emoji: "🏠" },
    { href: "/climate", label: "Climate Action", emoji: "🌏" },
    { href: "/donations", label: "Political Donations", emoji: "💰" },
    { href: "/media", label: "Media Ownership", emoji: "📺" },
    { href: "/indigenous", label: "Indigenous Affairs", emoji: "🤝" },
    { href: "/education", label: "Education", emoji: "🎓" },
    { href: "/defence", label: "Defence", emoji: "🛡️" },
    { href: "/immigration", label: "Immigration", emoji: "✈️" },
    { href: "/foreign-policy", label: "Foreign Policy", emoji: "🌐" },
    { href: "/israel-palestine", label: "Israel-Palestine", emoji: "🕊️" },
    { href: "/pay-to-play", label: "Pay to Play", emoji: "🤝" },
    { href: "/donor-influence", label: "Donor Influence", emoji: "🏦" },
    { href: "/jobs-for-the-boys", label: "Jobs for the Boys", emoji: "🚪" },
    { href: "/timeline", label: "Follow the Money", emoji: "🔎" },
    { href: "/audits", label: "Audit Trail", emoji: "📋" },
  ],
  Explore: [
    { href: "/your-mp", label: "Your MP", emoji: "📌" },
    { href: "/politicians", label: "Politicians", emoji: "👤" },
    { href: "/compare", label: "Compare MPs", emoji: "⚖️" },
    { href: "/who-funds", label: "Who Funds Your MP?", emoji: "🔍" },
    { href: "/electorates", label: "Electorates", emoji: "📍" },
    { href: "/network", label: "Influence Network", emoji: "🕸️" },
    { href: "/bills", label: "Bills Tracker", emoji: "📜" },
    { href: "/topics", label: "All Topics", emoji: "📊" },
    { href: "/disconnect", label: "The Disconnect", emoji: "📉" },
    { href: "/scorecard", label: "Democracy Scorecard", emoji: "📋" },
  ],
  States: [
    { href: "/victoria", label: "Victoria", emoji: "🟢" },
    { href: "#", label: "NSW (coming soon)", emoji: "⏳" },
    { href: "#", label: "Queensland (coming soon)", emoji: "⏳" },
  ],
  About: [
    { href: "/about", label: "Our Mission", emoji: "💡" },
    { href: "/sources", label: "Data Sources", emoji: "📁" },
  ],
};

export function Nav() {
  const pathname = usePathname();
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const navRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent | TouchEvent) {
      if (navRef.current && !navRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
        setMobileOpen(false);
      }
    }
    // Use click instead of mousedown — mousedown fires before the link's
    // click handler on mobile, swallowing taps on nav links
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, []);

  // Track scroll for backdrop effect
  useEffect(() => {
    function handleScroll() {
      setScrolled(window.scrollY > 8);
    }
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Close mobile menu on route change
  useEffect(() => {
    setMobileOpen(false);
    setOpenMenu(null);
  }, [pathname]);

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  const isGroupActive = (items: { href: string }[]) =>
    items.some((i) => i.href !== "#" && isActive(i.href));

  return (
    <nav
      ref={navRef}
      className={`sticky top-0 z-50 transition-all duration-300 ${
        scrolled
          ? "bg-[#0a0a0f]/95 backdrop-blur-xl border-b border-[#FFD700]/[0.06] shadow-[0_1px_12px_rgba(255,215,0,0.03)]"
          : "bg-[#0a0a0f]/90 backdrop-blur-md border-b border-white/5"
      }`}
    >
      <div className="mx-auto max-w-6xl px-6 flex items-center justify-between h-14">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 group shrink-0">
          <span className="font-serif text-2xl tracking-tight text-[#FFD700] transition-colors group-hover:text-[#FFD700]/80">
            OPAX
          </span>
          <span className="hidden md:inline text-xs text-[#8b949e] font-sans border-l border-white/10 pl-2 ml-1">
            Political Accountability
          </span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-1">
          {/* Search - always visible */}
          <Link
            href="/search"
            className={`relative px-3 py-1.5 text-sm rounded-md transition-colors ${
              isActive("/search")
                ? "text-[#FFD700] bg-[#FFD700]/10"
                : "text-[#FFD700]/70 hover:text-[#FFD700] hover:bg-[#FFD700]/10 font-medium"
            }`}
          >
            Ask OPAX
            {isActive("/search") && (
              <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-4 h-[2px] rounded-full bg-[#FFD700]" />
            )}
          </Link>

          {/* Menu groups */}
          {Object.entries(MENU).map(([group, items]) => (
            <div key={group} className="relative">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setOpenMenu(openMenu === group ? null : group);
                }}
                onMouseEnter={() => {
                  // Only use hover on non-touch devices
                  if (window.matchMedia("(hover: hover)").matches) {
                    setOpenMenu(group);
                  }
                }}
                className={`relative px-3 py-1.5 text-sm rounded-md transition-colors flex items-center gap-1 ${
                  isGroupActive(items)
                    ? "text-[#FFD700] bg-[#FFD700]/10"
                    : "text-[#8b949e] hover:text-[#e6edf3] hover:bg-white/5"
                }`}
              >
                {group}
                <svg
                  className={`w-3 h-3 transition-transform duration-200 ${
                    openMenu === group ? "rotate-180" : ""
                  }`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
                {isGroupActive(items) && (
                  <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-4 h-[2px] rounded-full bg-[#FFD700]" />
                )}
              </button>

              {/* Dropdown with enter animation */}
              <div
                className={`absolute left-0 top-full mt-1 rounded-xl border border-white/10 bg-[#12121a]/95 backdrop-blur-lg shadow-2xl shadow-black/40 py-2 z-50 min-w-[220px] transition-all duration-200 origin-top ${
                  openMenu === group
                    ? "opacity-100 scale-100 translate-y-0"
                    : "opacity-0 scale-95 -translate-y-1 pointer-events-none"
                }`}
                onMouseLeave={() => {
                  if (window.matchMedia("(hover: hover)").matches) {
                    setOpenMenu(null);
                  }
                }}
              >
                <p className="px-4 py-1 text-[10px] uppercase tracking-[0.15em] text-[#8b949e]/50 font-medium">
                  {group}
                </p>
                {items.map((item) => (
                  <Link
                    key={item.href + item.label}
                    href={item.href}
                    onClick={() => setOpenMenu(null)}
                    className={`flex items-center gap-3 px-4 py-2 text-sm transition-colors ${
                      item.href === "#"
                        ? "text-[#8b949e]/30 cursor-default"
                        : isActive(item.href)
                          ? "text-[#FFD700] bg-[#FFD700]/5"
                          : "text-[#e6edf3] hover:bg-white/5"
                    }`}
                  >
                    <span className="text-base w-5 text-center">
                      {item.emoji}
                    </span>
                    {item.label}
                    {isActive(item.href) && (
                      <span className="ml-auto w-1.5 h-1.5 rounded-full bg-[#FFD700]" />
                    )}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Mobile hamburger */}
        <button
          className="md:hidden p-2 text-[#8b949e] hover:text-white transition-colors"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
        >
          <svg
            className="w-6 h-6"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            {mobileOpen ? (
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            ) : (
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4 6h16M4 12h16M4 18h16"
              />
            )}
          </svg>
        </button>
      </div>

      {/* Mobile menu with slide transition */}
      <div
        className={`md:hidden border-t border-white/5 bg-[#0a0a0f]/98 backdrop-blur-xl overflow-hidden transition-all duration-300 ease-in-out ${
          mobileOpen
            ? "max-h-[80vh] opacity-100"
            : "max-h-0 opacity-0"
        }`}
      >
        <div className="px-6 py-4 overflow-y-auto max-h-[calc(80vh-2rem)]">
          <Link
            href="/search"
            onClick={() => setMobileOpen(false)}
            className="block mb-4 px-4 py-3 rounded-lg bg-[#FFD700]/10 text-[#FFD700] text-center font-medium transition-colors hover:bg-[#FFD700]/15"
          >
            Ask OPAX
          </Link>
          {Object.entries(MENU).map(([group, items]) => (
            <div key={group} className="mb-4">
              <p className="text-[10px] uppercase tracking-[0.15em] text-[#8b949e]/50 font-medium mb-2">
                {group}
              </p>
              {items.map((item) => (
                <Link
                  key={item.href + item.label}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={`flex items-center gap-3 px-4 py-2.5 rounded-md text-sm transition-colors ${
                    item.href === "#"
                      ? "text-[#8b949e]/30"
                      : isActive(item.href)
                        ? "text-[#FFD700] bg-[#FFD700]/5"
                        : "text-[#e6edf3] active:bg-white/5"
                  }`}
                >
                  <span>{item.emoji}</span>
                  {item.label}
                  {item.href !== "#" && isActive(item.href) && (
                    <span className="ml-auto w-1.5 h-1.5 rounded-full bg-[#FFD700]" />
                  )}
                </Link>
              ))}
            </div>
          ))}
        </div>
      </div>
    </nav>
  );
}
