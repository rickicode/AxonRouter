declare module "figlet" {
  const figlet: {
    textSync(text: string, options?: Record<string, unknown>): string;
  };
  export default figlet;
}

declare module "gradient-string" {
  type GradientFn = ((text: string) => string) & {
    multiline(text: string): string;
  };

  const gradient: {
    pastel: GradientFn;
    cristal: (text: string) => string;
  };

  export default gradient;
}

declare module "chalk-animation" {
  type AnimationHandle = {
    stop(): void;
  };

  const chalkAnimation: {
    rainbow(text: string): AnimationHandle;
  };

  export default chalkAnimation;
}
