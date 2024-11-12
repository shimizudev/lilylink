export const lilyRequest = async <T>(
  url: URL | string,
  options: RequestInit = {}
) => {
  try {
    const res = await fetch(url, options);
    return [(await res.json()) as T, undefined] as const;
  } catch (error) {
    return [undefined, error] as const;
  }
};
