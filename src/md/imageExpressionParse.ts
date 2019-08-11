export function sourceExpressions(md) {
  const normalize = md.normalizeLink;
  md.normalizeLink = url => {
    return normalize(url)
      .trim()
      .replace(/^(%7B)([^]+)(%7D)$/, (_, open_curly, src, close_curly) => {
        return '{' + src + '}';
      });
  };
}
