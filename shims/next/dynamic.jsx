import React, { lazy, Suspense } from "react";

export default function dynamic(loadComponent, options = {}) {
  const LazyComponent = lazy(async () => {
    const mod = await loadComponent();
    return mod.default ? mod : { default: mod };
  });

  return function DynamicWrapper(props) {
    const fallback = options.loading ? <options.loading /> : null;
    return (
      <Suspense fallback={fallback}>
        <LazyComponent {...props} />
      </Suspense>
    );
  };
}
