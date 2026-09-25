import React from "react";
import Icon from "@/shared/components/Icon";

/**
 * Global & Route-level Error Boundary
 * Prevents any runtime JS or rendering error in child components from blanking out the whole page.
 * Displays a clean, localized recovery UI with an action to retry or navigate back to safety.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("[AxonRouter UI Error]", error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-[300px] w-full flex-col items-center justify-center rounded-xl border border-danger/20 bg-danger/5 p-6 text-center shadow-xs">
          <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-danger/10 text-danger">
            <Icon name="warning" size={24} />
          </div>
          <h2 className="mb-1 text-base font-semibold text-text-main">
            Something went wrong displaying this section
          </h2>
          <p className="mb-4 max-w-md font-mono text-xs text-text-muted">
            {this.state.error?.message || "An unexpected rendering error occurred"}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={this.handleRetry}
              className="inline-flex items-center gap-1.5 rounded-lg bg-surface-2 px-3 py-1.5 text-xs font-medium text-text-main hover:bg-surface-3 transition-colors cursor-pointer"
            >
              <Icon name="refresh" size={14} />
              Try again
            </button>
            <button
              type="button"
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.href = "/dashboard";
              }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/20 transition-colors cursor-pointer"
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
