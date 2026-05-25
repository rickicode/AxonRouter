// CSS module imports
declare module "*.css" {}

// styled-jsx support (Next.js)
import "react";

declare module "react" {
  interface StyleHTMLAttributes<T> {
    jsx?: boolean;
    global?: boolean;
  }
}
