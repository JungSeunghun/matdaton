"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "하루 시작" },
  { href: "/dashboard", label: "대시보드" },
  { href: "/judge", label: "Judge Mode" },
];

export default function NavTabs() {
  const pathname = usePathname();
  return (
    <nav className="tabs" aria-label="주요 페이지">
      <span className="tabs-brand">First Move</span>
      <div className="tabs-list">
        {TABS.map((tab) => {
          const active = pathname === tab.href;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`tab${active ? " active" : ""}`}
              aria-current={active ? "page" : undefined}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
