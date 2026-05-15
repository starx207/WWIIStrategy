export const isString = (value: unknown): value is string => {
  return value !== undefined && value !== null && typeof value === 'string';
};

export const isStringArray = (arr: unknown[]): arr is string[] => {
  return arr && arr.length > 0 && isString(arr[0]);
};
