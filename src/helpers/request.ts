export const lilyRequest = async <T, E>(
  url: URL | string,
  options: RequestInit = {},
  json = true
) => {
  try {
    const res = await fetch(url, options);
    if (json) {
      return [(await res.json()) as T, undefined] as const;
    }
    return [(await res.text()) as unknown as T, undefined] as const;
  } catch (error) {
    return [undefined, error as E] as const;
  }
};
