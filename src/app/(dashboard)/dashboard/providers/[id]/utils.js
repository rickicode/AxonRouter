export function getPaginationItems(currentPage, totalPages) {
 if (totalPages <= 1) return [];
 if (totalPages <= 7) {
 return Array.from({ length: totalPages }, (_, i) => i + 1);
 }

 const items = [];
 items.push(1);

 if (currentPage > 3) {
 items.push("ellipsis-1");
 }

 const start = Math.max(2, currentPage - 1);
 const end = Math.min(totalPages - 1, currentPage + 1);

 let windowStart = start;
 let windowEnd = end;
 if (currentPage <= 3) {
 windowStart = 2;
 windowEnd = 4;
 } else if (currentPage >= totalPages - 2) {
 windowStart = totalPages - 3;
 windowEnd = totalPages - 1;
 }

 for (let p = windowStart; p <= windowEnd; p++) {
 items.push(p);
 }

 if (currentPage < totalPages - 2) {
 items.push("ellipsis-2");
 }

 items.push(totalPages);
 return items;
}
