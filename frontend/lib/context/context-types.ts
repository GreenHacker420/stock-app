export type ContextValue = string | number | boolean | null | undefined;
export type ContextSnapshot = Readonly<Record<string, ContextValue>>;
export type ContextPatch = Readonly<Record<string, ContextValue>>;
export type ContextPredicate = (context: ContextSnapshot) => boolean;
