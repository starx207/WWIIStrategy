import { compose, removeItem, StateOperator } from "@ngxs/store/operators";

export function removeAll<T>(items: T[]): StateOperator<T[]> {
  const removers = items.map((i) => removeItem<T>((x) => x === i));
  return compose<T[]>(...removers);
}
