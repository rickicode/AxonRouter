"use client";

import PropTypes from "prop-types";
import { Badge, SegmentedControl } from "@/shared/components";
import { STATUS_FILTER_OPTIONS } from "../utils";

function ProvidersHeader({ globalSummary, statusFilter, onStatusFilterChange }) {
 return (
 <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-border pb-3 ">
 <div className="flex flex-wrap items-center gap-2">
 <span className="text-xs text-text-muted font-medium mr-1">Network Stats:</span>
 <Badge variant="default" size="sm">
 <span className="font-medium">{globalSummary.total}</span>
 <span className="ml-1 text-text-muted">Total Accounts</span>
 </Badge>
 <Badge variant="success" size="sm" dot>
 <span className="font-medium">{globalSummary.connected}</span>
 <span className="ml-1 text-text-muted">Connected</span>
 </Badge>
 {globalSummary.error > 0 && (
 <Badge variant="error" size="sm" dot>
 <span className="font-medium">{globalSummary.error}</span>
 <span className="ml-1 text-text-muted">Error</span>
 </Badge>
 )}
 </div>
      <div className="flex items-center gap-2 self-start sm:self-auto overflow-x-auto no-scrollbar">
        <SegmentedControl
          options={STATUS_FILTER_OPTIONS}
          value={statusFilter}
          onChange={onStatusFilterChange}
          size="touch"
          aria-label="Filter providers by connection status"
        />
      </div>
 </div>
 );
}

ProvidersHeader.propTypes = {
 globalSummary: PropTypes.shape({
 total: PropTypes.number.isRequired,
 connected: PropTypes.number.isRequired,
 error: PropTypes.number.isRequired,
 }).isRequired,
 statusFilter: PropTypes.string.isRequired,
 onStatusFilterChange: PropTypes.func.isRequired,
};

export default ProvidersHeader;
