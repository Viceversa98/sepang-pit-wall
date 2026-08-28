import { get, writable, type Readable } from "svelte/store";

type SetState<T> = {
  (partial: Partial<T>): void;
  (updater: (state: T) => Partial<T>): void;
};

type GetState<T> = () => T;

export type StoreApi<T> = Readable<T> & {
  getState: GetState<T>;
  setState: SetState<T>;
};

export const createStore = <T extends object>(
  initializer: (set: SetState<T>, get: GetState<T>) => T,
): StoreApi<T> => {
  const inner = writable<T>();
  let ready = false;

  const getState = (): T => {
    if (!ready) {
      throw new Error("Store accessed before initialization.");
    }
    return get(inner);
  };

  const setState: SetState<T> = (partial) => {
    inner.update((state) => {
      const patch = typeof partial === "function" ? partial(state) : partial;
      return { ...state, ...patch };
    });
  };

  const initial = initializer(setState, getState);
  inner.set(initial);
  ready = true;

  return {
    subscribe: inner.subscribe,
    getState,
    setState,
  };
};
