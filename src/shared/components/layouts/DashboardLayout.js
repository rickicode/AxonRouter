"use client";

import { useState, useEffect, useRef } from "react";
import PropTypes from "prop-types";
import { usePathname } from "@/lib/ui/navigation.js";
import { useNotificationStore } from "@/store/notificationStore";
import Sidebar from "../Sidebar";
import Header from "../Header";
import UpdateBanner from "../UpdateBanner";
import Icon from "@/shared/components/Icon";

function getToastStyle(type) {
 if (type === "success") {
 return {
 wrapper: "border-success/30 bg-success/10 text-success",
 icon: "check_circle",
 };
 }
 if (type === "error") {
 return {
 wrapper: "border-danger/30 bg-danger/10 text-danger",
 icon: "error",
 };
 }
 if (type === "warning") {
 return {
 wrapper: "border-warning/30 bg-warning/10 text-warning",
 icon: "warning",
 };
 }
 return {
 wrapper: "border-primary/30 bg-primary/10 text-primary",
 icon: "info",
 };
}

export default function DashboardLayout({ children }) {
 const [sidebarOpen, setSidebarOpen] = useState(false);
 const pathname = usePathname();
 const notifications = useNotificationStore((state) => state.notifications);
 const removeNotification = useNotificationStore((state) => state.removeNotification);

 const mobileDrawerRef = useRef(null);
 const triggerRef = useRef(null);

 // Handle Escape key and focus trap for mobile drawer
 useEffect(() => {
 if (!sidebarOpen) return;

 const handleKeyDown = (e) => {
 if (e.key === "Escape") {
 setSidebarOpen(false);
 return;
 }

 if (e.key === "Tab" && mobileDrawerRef.current) {
 const focusableElements = mobileDrawerRef.current.querySelectorAll(
 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
 );
 if (focusableElements.length === 0) return;

 const firstElement = focusableElements[0];
 const lastElement = focusableElements[focusableElements.length - 1];

 if (e.shiftKey) {
 if (document.activeElement === firstElement) {
 e.preventDefault();
 lastElement.focus();
 }
 } else {
 if (document.activeElement === lastElement) {
 e.preventDefault();
 firstElement.focus();
 }
 }
 }
 };

 window.addEventListener("keydown", handleKeyDown);

 // Focus first focusable element inside drawer on open
 const timer = setTimeout(() => {
 if (mobileDrawerRef.current) {
 const focusable = mobileDrawerRef.current.querySelector(
 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
 );
 if (focusable) focusable.focus();
 }
 }, 50);

 return () => {
 window.removeEventListener("keydown", handleKeyDown);
 clearTimeout(timer);
 if (triggerRef.current) {
 triggerRef.current.focus();
 }
 };
 }, [sidebarOpen]);

 const handleOpenMenu = (e) => {
 triggerRef.current = e?.currentTarget || null;
 setSidebarOpen(true);
 };

 return (
 <div className="flex h-screen w-full overflow-hidden bg-bg">
 {/* Skip Link for keyboard navigation */}
 <a
 href="#main-content"
 className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100] focus:px-3 focus:h-8 focus:bg-primary focus:text-white focus:rounded-sm focus:outline-none font-medium text-sm"
 >
 Skip to main content
 </a>

 // Accessible Toast Notifications container
 <div
   className="fixed top-16 right-4 z-[80] flex w-[min(92vw,380px)] flex-col gap-2"
   role="status"
   aria-live="polite"
   aria-atomic="false"
 >
   {notifications.map((n) => {
     const style = getToastStyle(n.type);
     return (
       <div
         key={n.id}
         className={`rounded-sm border px-3 min-h-8 py-1.5 ${style.wrapper.replace(/bg-.*-10/, 'bg-surface')}`}
       >
            <div className="flex items-start gap-2">
              <Icon name={style.icon} size={18} className="leading-5" />
 <div className="min-w-0 flex-1">
 {n.title ? <p className="text-xs font-medium mb-0.5">{n.title}</p> : null}
 <p className="text-xs whitespace-pre-wrap break-words">{n.message}</p>
 </div>
 {n.dismissible ? (
 <button
 type="button"
 onClick={() => removeNotification(n.id)}
 className="text-current/70 hover:text-current focus-visible:outline-none rounded-sm"
 aria-label="Dismiss notification"
 >
 <Icon name="close" size={18} />
 </button>
 ) : null}
 </div>
 </div>
 );
 })}
 </div>

 {/* Mobile sidebar overlay */}
 {sidebarOpen && (
 <div
 className="fixed inset-0 z-40 bg-surface-3 lg:hidden"
 onClick={() => setSidebarOpen(false)}
 role="button"
 tabIndex={-1}
 aria-label="Close navigation sidebar"
 aria-hidden="true"
 />
 )}

 {/* Sidebar - Desktop */}
 <div className="hidden lg:flex">
 <Sidebar />
 </div>

 {/* Sidebar - Mobile Drawer with Focus Trap */}
 <div
 ref={mobileDrawerRef}
 role="dialog"
 aria-modal={sidebarOpen}
 aria-label="Navigation sidebar"
 className={`fixed inset-y-0 left-0 z-50 transform lg:hidden transition-transform ease-in-out ${
 sidebarOpen ? "translate-x-0" : "-translate-x-full"
 }`}
 >
 <Sidebar onClose={() => setSidebarOpen(false)} />
 </div>

 {/* Main content */}
 <main
 id="main-content"
 tabIndex={-1}
 className="flex flex-col flex-1 h-full min-w-0 relative isolate outline-none"
>
        <UpdateBanner />
        <Header key={pathname} onMenuClick={handleOpenMenu} />
 <div className="flex-1 overflow-y-auto custom-scrollbar p-3 lg:p-3">
 <div className="w-full">{children}</div>
 </div>
 </main>
 </div>
 );
}

DashboardLayout.propTypes = {
 children: PropTypes.node.isRequired,
};
