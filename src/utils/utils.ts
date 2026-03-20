export const ifDefined = <T, R>(
  value: T | undefined,
  func: (t: T) => R,
  def: R | undefined = undefined,
): R | undefined => {
  if (value !== undefined) {
    return func(value);
  }
  return def;
};

export const ifDefinedOrDefault = <T, R>(
  value: T | undefined,
  func: (t: T) => R,
  def: R,
): R => {
  if (value !== undefined) {
    return func(value);
  }
  return def;
};

export const prettyMs = (ms: number): string => {
  const roundedMs = Math.round(ms);
  if (roundedMs < 1000) {
    return `${roundedMs}ms`;
  }
  const seconds = roundedMs / 1000;
  if (seconds < 60) {
    return `${Math.round(seconds * 10) / 10}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60);
  if (minutes < 60) {
    if (remainingSeconds === 0) {
      return `${minutes}m`;
    }
    return `${minutes}m ${remainingSeconds}s`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
};
