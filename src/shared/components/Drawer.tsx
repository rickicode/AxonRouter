"use client";

import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const widths = {
  sm: "w-[min(100vw,25rem)] sm:max-w-[25rem]",
  md: "w-[min(100vw,32rem)] sm:max-w-[32rem]",
  lg: "w-[min(100vw,37.5rem)] sm:max-w-[37.5rem]",
  xl: "w-[min(100vw,50rem)] sm:max-w-[50rem]",
  full: "w-screen sm:max-w-none",
} as const;

type DrawerProps = {
  isOpen: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  children: React.ReactNode;
  width?: keyof typeof widths;
  className?: string;
};

export default function Drawer({ isOpen, onClose, title, children, width = "md", className }: DrawerProps) {
  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className={cn(widths[width], "overflow-y-auto", className)}>
        <SheetHeader>
          {title ? <SheetTitle>{title}</SheetTitle> : <SheetTitle className="sr-only">Drawer</SheetTitle>}
        </SheetHeader>
        <div className="mt-4 min-h-0">{children}</div>
      </SheetContent>
    </Sheet>
  );
}
