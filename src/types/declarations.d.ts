// CSS module imports (side-effect style)
declare module "*.css" {
  const content: Record<string, string>;
  export default content;
}

// styled-jsx support (Next.js <style jsx global>)
// Augment React's IntrinsicElements to accept jsx and global on <style>
declare namespace React {
  interface StyleHTMLAttributes<T> {
    jsx?: boolean;
    global?: boolean;
  }
}
