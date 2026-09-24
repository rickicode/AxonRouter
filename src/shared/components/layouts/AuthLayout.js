"use client";

import PropTypes from "prop-types";

export default function AuthLayout({ children }) {
 return (
 <div className="min-h-screen flex flex-col relative bg-bg overflow-x-hidden selection:bg-primary/10 selection:text-primary">
 {/* Background effects */}
 <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-primary/10 rounded-sm blur-[100px] pointer-events-none z-0" />
 <div className="fixed bottom-0 right-0 w-[600px] h-[600px] bg-warning/10 rounded-sm blur-[120px] pointer-events-none z-0 translate-y-1/3 translate-x-1/3" />


 {/* Content */}
 <main className="flex-1 flex flex-col items-center justify-center p-3 sm:p-3 z-10 w-full h-full">
 {children}
 </main>
 </div>
 );
}

AuthLayout.propTypes = {
 children: PropTypes.node.isRequired,
};

