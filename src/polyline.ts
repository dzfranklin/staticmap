export type LngLat = readonly [number, number];

export function encodePolyline(
  coordinates: readonly (readonly [number, number])[],
  precision = 5,
): string {
  function encodeValue(value: number): string {
    let v = value < 0 ? ~(value << 1) : value << 1;
    let output = "";
    while (v >= 0x20) {
      output += String.fromCharCode((0x20 | (v & 0x1f)) + 63);
      v >>= 5;
    }
    output += String.fromCharCode(v + 63);
    return output;
  }

  if (precision > 6) throw new Error("precision must be 6 or less");
  const factor = Math.pow(10, precision);
  let output = "";
  let prevLat = 0;
  let prevLng = 0;

  for (const [lng, lat] of coordinates) {
    const latInt = Math.round(lat * factor);
    const lngInt = Math.round(lng * factor);
    output += encodeValue(latInt - prevLat);
    output += encodeValue(lngInt - prevLng);
    prevLat = latInt;
    prevLng = lngInt;
  }

  return output;
}

export function decodePolyline(
  encoded: string,
  precision = 5,
): readonly LngLat[] {
  if (precision > 6) throw new Error("precision must be 6 or less");
  let index = 0;
  let lat = 0;
  let lng = 0;
  const coordinates: LngLat[] = [];
  const factor = Math.pow(10, precision);

  while (index < encoded.length) {
    let result = 0;
    let shift = 0;
    let byte = 0;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    const deltaLat = result & 1 ? ~(result >> 1) : result >> 1;
    lat += deltaLat;

    result = 0;
    shift = 0;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    const deltaLng = result & 1 ? ~(result >> 1) : result >> 1;
    lng += deltaLng;

    coordinates.push([lng / factor, lat / factor]);
  }

  return coordinates;
}
