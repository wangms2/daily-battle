// Cloudflare Web Analytics: visits, pages, referrers and countries, with no
// cookies. Only on the live site, so local runs and tests stay out of the numbers.

const HOST = 'battle.peanutbuilds.com';
const TOKEN = '3fb2b172668f4cfabda54061e8f31e98';

export function trackVisits(hostname = window.location.hostname) {
  if (hostname !== HOST) return;
  const script = document.createElement('script');
  script.defer = true;
  script.src = 'https://static.cloudflareinsights.com/beacon.min.js';
  script.dataset.cfBeacon = JSON.stringify({ token: TOKEN });
  document.head.append(script);
}
