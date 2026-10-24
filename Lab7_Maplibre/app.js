import "bootstrap/dist/css/bootstrap.min.css"
import "bootstrap/dist/js/bootstrap.bundle.min.js"

import { Map, NavigationControl, Marker, Popup } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

import "./style.css"


const map = new Map({
    container: 'map',
    style: {
        version: 8,
        projection: { type: 'globe' },
        sources: {},
        layers: []
    },
    center: [98.81, 18.69],
    zoom: 7
})

const nav = new NavigationControl();
map.addControl(nav, 'top-right');

const basemaps = [{
    name: "osm",
    label: "Open Street Map",
    tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
    attribution: "osm"
}, {
    name: "esri",
    label: "ESRI World Imagery",
    tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
    attribution: "ESRI"
}]

const select = document.getElementById("select");


function setBasemap(active) {
    for (const i in basemaps) {
        console.log(basemaps[i].name, active)
        if (basemaps[i].name == active) {
            map.setLayoutProperty(basemaps[i].name, 'visibility', 'visible');
        } else {
            map.setLayoutProperty(basemaps[i].name, 'visibility', 'none');

        }

    }

    map.setLayoutProperty(active, 'visibility', 'visible');
}

select.addEventListener("change", (e) => { setBasemap(e.target.value) });

map.on('load', () => {
    for (const i in basemaps) {
        console.log(i, basemaps[i].name, basemaps[i].tiles)
        map.addSource(basemaps[i].name, {
            type: 'raster',
            tiles: basemaps[i].tiles,
            tileSize: 256,
            attribution: basemaps[i].attribution
        });
        map.addLayer({
            id: basemaps[i].name,
            type: 'raster',
            source: basemaps[i].name,
            layout: { visibility: 'none' }
        });
    }
    setBasemap(select.value)
});

const popup = new Popup({ closeOnClick: true })
    .setHTML("<h2>hello</h2>")

function addMarker(lngLat) {
    new Marker()
        .setLngLat(lngLat)
        .setPopup(popup)
        .addTo(map)

}

map.on("click", (e) => { addMarker(e.lngLat) })