"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/shared/utils/cn";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { translate } from "@/i18n/runtime";

export default function Pagination({
  currentPage,
  pageSize,
  totalItems,
  onPageChange,
  onPageSizeChange,
  className,
}) {
  const totalPages = Math.ceil(totalItems / pageSize);
  const startItem = totalItems > 0 ? (currentPage - 1) * pageSize + 1 : 0;
  const endItem = Math.min(currentPage * pageSize, totalItems);

  const getPageNumbers = () => {
    if (totalPages <= 5) {
      return Array.from({ length: totalPages }, (_, index) => index + 1);
    }

    const windowSize = 4;
    const nearStart = currentPage <= 3;
    const nearEnd = currentPage >= totalPages - 2;

    let start;
    let end;

    if (nearStart) {
      start = 1;
      end = Math.min(totalPages - 1, windowSize);
    } else if (nearEnd) {
      end = totalPages - 1;
      start = Math.max(1, end - windowSize + 1);
    } else {
      start = currentPage;
      end = Math.min(totalPages - 1, start + windowSize - 1);
      if (end - start + 1 < windowSize) {
        start = Math.max(1, end - windowSize + 1);
      }
    }

    const pages = [];
    for (let i = start; i <= end; i += 1) {
      pages.push(i);
    }

    return pages;
  };

  const pageNumbers = getPageNumbers();
  const firstPageVisible = pageNumbers[0] === 1;
  const lastPageVisible = pageNumbers[pageNumbers.length - 1] === totalPages;

  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-md border border-border/80 bg-card/80 px-3 py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between",
        className
      )}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
        {onPageSizeChange && totalPages > 1 && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>{translate("Rows")}</span>
            <Select value={String(pageSize)} onValueChange={(value) => onPageSizeChange(Number(value))}>
              <SelectTrigger className="h-8 w-[76px] rounded-md">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[10, 20, 50].map((size) => (
                  <SelectItem key={size} value={String(size)}>
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {totalItems > 0 ? (
          <div className="text-sm text-muted-foreground">
            {translate("Showing")} <span className="font-medium text-foreground">{startItem}</span> {translate("to")} <span className="font-medium text-foreground">{endItem}</span> {translate("of")} <span className="font-medium text-foreground">{totalItems}</span> {translate("results")}
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">{translate("No results")}</div>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex flex-wrap items-center justify-start gap-1 sm:justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage === 1}
            className="size-8 px-0"
            aria-label={translate("Previous page")}
          >
            <ChevronLeft className="h-[18px] w-[18px]" strokeWidth={2} />
          </Button>

          {!firstPageVisible && (
            <>
              <Button
                variant={currentPage === 1 ? "default" : "ghost"}
                size="sm"
                onClick={() => onPageChange(1)}
                className="size-8 px-0"
              >
                1
              </Button>
              {pageNumbers[0] > 2 && <span className="px-1 text-muted-foreground">...</span>}
            </>
          )}

          {pageNumbers.map((page) => (
            <Button
              key={page}
              variant={currentPage === page ? "default" : "ghost"}
              size="sm"
              onClick={() => onPageChange(page)}
              className="size-8 px-0"
            >
              {page}
            </Button>
          ))}

          {!lastPageVisible && (
            <>
              {pageNumbers[pageNumbers.length - 1] < totalPages - 1 && (
                <span className="px-1 text-muted-foreground">...</span>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onPageChange(totalPages)}
                className="size-8 px-0"
              >
                {totalPages}
              </Button>
            </>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
            className="size-8 px-0"
            aria-label="Next page"
          >
            <ChevronRight className="h-[18px] w-[18px]" strokeWidth={2} />
          </Button>
        </div>
      )}
    </div>
  );
}
