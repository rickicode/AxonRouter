declare module "*.svg" {
  const src: string;
  export default src;
}

declare module "*.png" {
  const src: string;
  export default src;
}

declare module "*.json" {
  const value: any;
  export default value;
}

declare module "better-sqlite3" {
  const Database: any;
  export default Database;
}

declare module "node-forge" {
  const forge: any;
  export default forge;
}
