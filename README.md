# staticmap

[playground](https://staticmap.plantopo.com/playground.html) [reference](https://staticmap.plantopo.com/reference.html)

Staticmap is a server that renders styled features on top of raster map tiles based on commands you specify in the URL. It should be deployed behind a cache.

Originally based on [komoot/staticmap](https://github.com/komoot/staticmap).
The interface is inspired by imgproxy.

## Examples

`/map:osm/size:600:300/padding:16/color:%230000ff/width:8/border:%23ffffff/borderWidth:4/line:miv%7BIrbzUj%40%7DAjAyAfAg%40%5EGRUX%3FN%5BVIf%40y%40n%40WFWjAcAjC_EdE%7BIxC%7DFpAaEZ_CnAiCfBoD%60DyCjC%7BAv%40eBXElCqFzAcD~%40q%40Z%7DBjDsG`

<img width="600" height="300" alt="example-thunderforest" src="https://github.com/user-attachments/assets/23473afa-d423-44de-8299-6b97e465767f" />

Map tiles © Thunderforest © OpenStreetMap

**Using British National Grid tiles**

`/map:os/size:600:300/padding:16/color:%230000ff/width:8/border:%23ffffff/borderWidth:4/line:miv%7BIrbzUj%40%7DAjAyAfAg%40%5EGRUX%3FN%5BVIf%40y%40n%40WFWjAcAjC_EdE%7BIxC%7DFpAaEZ_CnAiCfBoD%60DyCjC%7BAv%40eBXElCqFzAcD~%40q%40Z%7DBjDsG`

<img width="600" height="300" alt="example-os-leisure.png" src="https://github.com/user-attachments/assets/7b34476c-64fc-46b7-8ac9-420b5e684268" />

Contains OS data © Crown copyright and database rights 2026

**Layout fixed size pages (for printing routes)**

`/pages/map:osm/size:500:300/pageOverlap:10/zoom:15/padding:30/color:%230000ff/width:10/border:%23ffffff/borderWidth:6/line:miv%7BIrbzUj%40%7DAjAyAfAg%40%5EGRUX%3FN%5BVIf%40y%40n%40WFWjAcAjC_EdE%7BIxC%7DFpAaEZ_CnAiCfBoD%60DyCjC%7BAv%40eBXElCqFzAcD~%40q%40Z%7DBjDsG`

<img width="504" height="627" alt="Two pages" src="https://github.com/user-attachments/assets/d9194a09-dd32-478d-9f47-5938840e70f5" />

Map tiles © Thunderforest © OpenStreetMap

**Path builder**

Copy [example-client.ts](https://github.com/dzfranklin/staticmap/blob/main/example-client.ts) into your project. Usage:

```typescript
const mapUrl = staticmap("osm")
  .cmd("size", 600, 300)
  .cmd("padding", 16)
  .cmd("color", "#0000ff")
  .cmd("width", 8)
  .cmd("border", "#ffffff")
  .cmd("borderWidth", 4)
  .line(line)
  .url("https://staticmap.example.com");
```

## Configuration

**Environment variables**
- SOURCES_FILE (default ./sources.json)
- PORT (default 3000)
- METRICS_PORT (default 3001)

For SOURCES_FILE see [sources.example.json](https://github.com/dzfranklin/staticmap/blob/main/sources.example.json)
