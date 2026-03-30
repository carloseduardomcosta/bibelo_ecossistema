import geoip from "geoip-lite";

export interface GeoResult {
  ip: string;
  city: string | null;
  region: string | null;
  country: string | null;
  lat: number | null;
  lon: number | null;
}

export function resolveGeo(ip: string | undefined): GeoResult | null {
  if (!ip) return null;
  const cleanIp = ip.replace(/^::ffff:/, "");
  const geo = geoip.lookup(cleanIp);
  if (!geo) return { ip: cleanIp, city: null, region: null, country: null, lat: null, lon: null };
  return {
    ip: cleanIp,
    city: geo.city || null,
    region: geo.region || null,
    country: geo.country || null,
    lat: geo.ll?.[0] ?? null,
    lon: geo.ll?.[1] ?? null,
  };
}
