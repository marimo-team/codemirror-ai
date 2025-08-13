import { Facet } from "@codemirror/state";

/**
 * A facet that combines a single value.
 *
 * This is useful for creating a facet that can be used to store a single value.
 *
 * @example
 * ```ts
 * const myFacet = SingleFacet<string>();
 * const myValue = myFacet.of("hello");
 * ```
 */
export function SingleFacet<T>(defaultValue: T) {
  return Facet.define<T, T>({
    combine: (values) => values[0] ?? defaultValue,
  });
}
