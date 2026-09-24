import { createElement } from "react";
import { useNavigate, useLocation, useParams as rrUseParams, useSearchParams as rrUseSearchParams, Navigate } from "react-router-dom";

export function useRouter() {
  const navigate = useNavigate();
  return {
    push: (href) => navigate(href),
    replace: (href) => navigate(href, { replace: true }),
    back: () => navigate(-1),
    forward: () => navigate(1),
    prefetch: () => {},
    refresh: () => window.location.reload(),
  };
}

export function usePathname() {
  return useLocation().pathname;
}

export function useParams() {
  const params = rrUseParams();
  const out = {};
  for (const [key, value] of Object.entries(params)) {
    if (key === "*") {
      out.id = value.split("/").filter(Boolean);
    } else {
      out[key] = value;
    }
  }
  return out;
}

export function useSearchParams() {
  const [params] = rrUseSearchParams();
  return new URLSearchParams(params);
}

export function redirect(href) {
  return createElement(Navigate, { to: href, replace: true });
}

export function notFound() {
  return createElement(Navigate, { to: "/404", replace: true });
}
