import { Link as RouterLink } from "react-router-dom";

export default function Link({ href, children, prefetch, scroll, ...rest }) {
  return <RouterLink to={href} {...rest}>{children}</RouterLink>;
}
