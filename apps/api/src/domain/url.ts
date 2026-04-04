export function canonicalizeUrl(input: string): string {
  const url = new URL(input);
  url.hash = "";
  const removableParams = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"];
  for (const param of removableParams) {
    url.searchParams.delete(param);
  }

  if ((url.protocol === "https:" && url.port === "443") || (url.protocol === "http:" && url.port === "80")) {
    url.port = "";
  }

  if (url.pathname.endsWith("/") && url.pathname !== "/") {
    url.pathname = url.pathname.slice(0, -1);
  }

  return url.toString();
}

export function extractDomain(input: string): string {
  return new URL(input).hostname.replace(/^www\./, "");
}
