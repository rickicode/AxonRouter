"use client";

import PropTypes from "prop-types";
import dynamic from "@/lib/ui/dynamic.jsx";
import { ConfirmModal } from "@/shared/components";
import Icon from "@/shared/components/Icon";
import ProviderTestResultsView from "./ProviderTestResultsView";

const AddCompatibleModal = dynamic(
 () => import("./AddCompatibleModal"),
 { ssr: false },
);

function ProvidersModals({
 showAddCompatibleModal, showAddAnthropicCompatibleModal,
 onCloseAddCompatible, onCloseAddAnthropic, onNodeCreated,
 confirmToggle, onCloseConfirmToggle, onConfirmDisable, togglePending,
 testResults, onCloseTestResults,
}) {
 return (
 <>
 <AddCompatibleModal
 variant="openai"
 isOpen={showAddCompatibleModal}
 onClose={onCloseAddCompatible}
 onCreated={(node) => onNodeCreated(node, onCloseAddCompatible)}
 />
 <AddCompatibleModal
 variant="anthropic"
 isOpen={showAddAnthropicCompatibleModal}
 onClose={onCloseAddAnthropic}
 onCreated={(node) => onNodeCreated(node, onCloseAddAnthropic)}
 />

 <ConfirmModal
 isOpen={!!confirmToggle}
 onClose={onCloseConfirmToggle}
 onConfirm={onConfirmDisable}
 title={`Disable ${confirmToggle?.providerName || "provider"}?`}
 message={`This turns off all connections for ${confirmToggle?.providerName || "this provider"}. New routing skips it until you re-enable it.`}
 confirmText="Disable"
 cancelText="Cancel"
 variant="danger"
 loading={!!togglePending}
 />

 {/* Test Results Modal */}
 {testResults && (
 <div
 className="fixed inset-0 z-50 flex items-start justify-center px-3 pt-[6vh] sm:pt-[10vh]"
 onClick={onCloseTestResults}
 >
 <div className="absolute inset-0 bg-black/80" />
 <div
 className="relative bg-surface border border-border rounded-sm w-full max-w-[600px] max-h-[86vh] sm:max-h-[80vh] overflow-y-auto"
 onClick={(e) => e.stopPropagation()}
 >
 <div className="sticky top-0 z-10 flex items-center justify-between px-3 border-b border-border bg-surface/95 rounded-t-sm h-8">
 <h3 className="font-medium">Test Results</h3>
 <button
 onClick={onCloseTestResults}
 className="size-8 rounded-sm hover:bg-bg text-text-muted hover:text-text-main"
 aria-label="Close test results"
 >
 <Icon name="close" size={18} />
 </button>
 </div>
 <div className="p-3">
 <ProviderTestResultsView results={testResults} />
 </div>
 </div>
 </div>
 )}
 </>
 );
}

ProvidersModals.propTypes = {
 showAddCompatibleModal: PropTypes.bool.isRequired,
 showAddAnthropicCompatibleModal: PropTypes.bool.isRequired,
 onCloseAddCompatible: PropTypes.func.isRequired,
 onCloseAddAnthropic: PropTypes.func.isRequired,
 onNodeCreated: PropTypes.func.isRequired,
 confirmToggle: PropTypes.shape({
 providerId: PropTypes.string.isRequired,
 authType: PropTypes.oneOfType([PropTypes.string, PropTypes.array]),
 providerName: PropTypes.string,
 }),
 onCloseConfirmToggle: PropTypes.func.isRequired,
 onConfirmDisable: PropTypes.func.isRequired,
 togglePending: PropTypes.string,
 testResults: PropTypes.object,
 onCloseTestResults: PropTypes.func.isRequired,
};

export default ProvidersModals;
