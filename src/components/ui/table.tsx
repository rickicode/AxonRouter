import * as React from "react";
import { cn } from "@/lib/utils";

function Table({ className, ...props }: React.ComponentProps<"table">) {
  return <div className="w-full overflow-x-auto"><table className={cn("w-full border-collapse text-sm", className)} {...props} /></div>;
}
function TableHeader({ className, ...props }: React.ComponentProps<"thead">) { return <thead className={className} {...props} />; }
function TableBody({ className, ...props }: React.ComponentProps<"tbody">) { return <tbody className={className} {...props} />; }
function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) { return <tfoot className={className} {...props} />; }
function TableRow({ className, ...props }: React.ComponentProps<"tr">) { return <tr className={cn("border-b border-border transition-colors hover:bg-primary/5", className)} {...props} />; }
function TableHead({ className, ...props }: React.ComponentProps<"th">) { return <th className={cn("px-3 py-2 text-left text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground", className)} {...props} />; }
function TableCell({ className, ...props }: React.ComponentProps<"td">) { return <td className={cn("px-3 py-3 align-top text-foreground", className)} {...props} />; }
function TableCaption({ className, ...props }: React.ComponentProps<"caption">) { return <caption className={cn("mt-3 text-sm text-muted-foreground", className)} {...props} />; }

export { Table, TableHeader, TableBody, TableFooter, TableHead, TableRow, TableCell, TableCaption };
