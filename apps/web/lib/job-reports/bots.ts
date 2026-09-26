/**
 * User agents that open links without a person: SMS/chat link previewers,
 * mail security scanners, crawlers, and scripts. They must never count as a
 * customer opening a report. (They also rarely run page JavaScript, which is
 * the first filter — this is the second.)
 */
const AUTOMATED_UA =
  /bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|telegram|discord|slack|skype|linkedin|pinterest|embedly|quora|outlook|microsoft|safelinks|proofpoint|mimecast|barracuda|headless|phantom|curl|wget|python|node-fetch|axios|go-http|java\/|okhttp|libwww|httpclient/i;

export function isAutomatedUserAgent(ua: string | null | undefined): boolean {
  return !ua || AUTOMATED_UA.test(ua);
}
