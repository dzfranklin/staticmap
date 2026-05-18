type ArgValue = string | number;

type LineStringGeometry = {
  type: "LineString";
  coordinates: readonly (readonly [number, number])[];
};

class StaticmapBuilder {
  private segments: string[] = [];
  constructor(options: { source: string; pages?: boolean }) {
    if (options.pages) {
      this.segments.push("pages");
    }
    this.segments.push(`map:${options.source}`);
  }

  cmd(name: string, ...args: ArgValue[]): StaticmapBuilder {
    const parts = [name, ...args.map((arg) => encodeURIComponent(String(arg)))];
    this.segments.push(parts.join(":"));
    return this;
  }

  point(lng: number, lat: number): StaticmapBuilder {
    return this.cmd("point", lng, lat);
  }

  line(geometry: LineStringGeometry): StaticmapBuilder {
    const encoded = encodePolyline(geometry.coordinates, 5);
    this.cmd("line", 5, encoded);
    return this;
  }

  toString(): string {
    return this.path();
  }

  path(): string {
    return "/" + this.segments.join("/");
  }

  url(baseUrl: string): string {
    return baseUrl.replace(/\/$/, "") + this.path();
  }
}

export function staticmap(source: string): StaticmapBuilder {
  return new StaticmapBuilder({ source });
}

export function staticmapPages(source: string): StaticmapBuilder {
  return new StaticmapBuilder({ source, pages: true });
}

function encodePolyline(
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

// Example usage:

// prettier-ignore
const line = {
  type: "LineString",
  coordinates: [[-3.7433, 57.13575], [-3.74283, 57.13553], [-3.74238, 57.13515], [-3.74218, 57.13479], [-3.74214, 57.13463], [-3.74203, 57.13453], [-3.74203, 57.1344], [-3.74189, 57.13432], [-3.74184, 57.1342], [-3.74155, 57.134], [-3.74143, 57.13376], [-3.74131, 57.13372], [-3.74097, 57.13334], [-3.74001, 57.13264], [-3.73827, 57.13165], [-3.737, 57.13088], [-3.73603, 57.13047], [-3.73539, 57.13033], [-3.7347, 57.12993], [-3.73382, 57.12941], [-3.73305, 57.1286], [-3.73259, 57.1279], [-3.73208, 57.12762], [-3.73205, 57.12749], [-3.73084, 57.12678], [-3.73002, 57.12632], [-3.72977, 57.126], [-3.72914, 57.12586], [-3.72776, 57.125]],
} as const;

const mapUrl = staticmap("osm")
  .cmd("size", 600, 300)
  .cmd("padding", 16)
  .cmd("color", "#0000ff")
  .cmd("width", 8)
  .cmd("border", "#ffffff")
  .cmd("borderWidth", 4)
  .line(line)
  .url("https://staticmap.example.com");

console.log(mapUrl);
