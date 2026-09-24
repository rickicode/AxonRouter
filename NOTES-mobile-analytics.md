# Analytics mobile fix orientation and scope

Repo: /workspaces/axonrouter. Next.js plain JS dashboard. Existing CLAUDE.md documents project. OpenLore unavailable; Basic Memory unavailable. Git clean at start. Production: https://axonrouter-web.hijinetwork.net/dashboard/usage?tab=analytics.

User reports analytics unusable on mobile. Scope: responsive CSS/UI only, preserve analytics logic, API contracts, search/provider work. Inspect usage/page.js, usage/components/AnalyticsTab.js, GlobalAnalyticsChart.js, AnalyticsTrendChart.js, shared Card/SegmentedControl and dashboard parent sizing. Existing fixed minimum input widths and nonwrapping headers may contribute; verify root cause.

Acceptance: 320,360,390,430,768,1440 widths; no document horizontal overflow; controls wrap, readable charts, isolated table horizontal scroll, long model names contained; all filters/tabs usable and desktop intact. Add runnable responsive browser check using explicit synthetic fixtures only if local DB absent; report live vs fixture distinctly. Run relevant tests and production build. Never delete outside /tmp; move instead. No production changes without parent verification. Use branch fix/analytics-mobile-responsive and leave commit for PR; no direct push master.
