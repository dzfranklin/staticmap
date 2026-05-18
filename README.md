# staticmap

[playground](https://staticmap.plantopo.com/playground.html) [reference](https://staticmap.plantopo.com/reference.html)

Static map renderer based on
[komoot/staticmap](https://github.com/komoot/staticmap). The interface is
inspired by imgproxy.

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

sources.json:

```json
{
  "osm": {
    "attribution": "<a href=\"https://www.thunderforest.com/\">&copy; Thunderforest</a> <a href=\"https://www.openstreetmap.org/copyright\">&copy; OpenStreetMap</a>",
    "maxzoom": 22,
    "minzoom": 0,
    "tileSize": 256,
    "tiles": [
      "https://api.thunderforest.com/outdoors/{z}/{x}/{y}@2x.png?apikey=<THUNDERFOREST_KEY>"
    ]
  },
  "os": {
    "attribution": "Contains OS data &copy; Crown copyright and database rights YYYY",
    "crs": "EPSG:27700",
    "maxzoom": 9,
    "minzoom": 0,
    "tileSize": 256,
    "tiles": [
      "https://api.os.uk/maps/raster/v1/zxy/Leisure_27700/{z}/{x}/{y}.png?key=<OS_KEY>"
    ]
  }
}
```
