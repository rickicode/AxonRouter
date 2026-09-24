"use client";

import { cn } from "@/shared/utils/cn";

export default function Avatar({
 src,
 alt = "Avatar",
 name,
 size = "md",
 className,
}) {
 const sizes = {
 xs: "size-8 text-xs",
 sm: "size-8 text-sm",
 md: "size-8 text-sm",
 lg: "size-8 text-sm",
 xl: "size-8 text-sm",
 };

 // Get initials from name
 const getInitials = (name) => {
 if (!name) return "?";
 const parts = name.split(" ");
 if (parts.length >= 2) {
 return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
 }
 return name.substring(0, 2).toUpperCase();
 };

 // Generate color from name
 const getColorFromName = (name) => {
 if (!name) return "bg-primary";
 const colors = [
      "bg-primary",
      "bg-info",
      "bg-success",
      "bg-warning",
      "bg-danger",
    ];
 const index = name.charCodeAt(0) % colors.length;
 return colors[index];
 };

 if (src) {
 return (
 <div
 className={cn(
 "rounded-sm bg-cover bg-center bg-no-repeat",
 "ring-2 ring-surface ",
 sizes[size],
 className
 )}
 style={{ backgroundImage: `url(${src})` }}
 role="img"
 aria-label={alt}
 />
 );
 }

 return (
 <div
 className={cn(
 "rounded-sm flex items-center justify-center font-medium text-white",
 "ring-2 ring-surface ",
 sizes[size],
 getColorFromName(name),
 className
 )}
 role="img"
 aria-label={alt}
 >
 {getInitials(name)}
 </div>
 );
}

