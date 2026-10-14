const CONFIG = {
  center: [18.7983, 98.95],
  zoom: 14,
  routingUrl: 'https://router.project-osrm.org/route/v1/driving',
};

const $ = (id) => document.getElementById(id);

let shops = [];
let foodTypes = [];
let selectedFood = '';
let visibleShops = [];
const FOOD_EMOJI = {
  'ข้าวมันไก่': '🍗',
  'ก๋วยเตี๋ยว': '🍜',
  'อาหารตามสั่ง': '🍛',
  'ของกินเล่น': '🍢',
};
let startPoint = {
  lat: CONFIG.center[0],
  lng: CONFIG.center[1],
  source: 'จุดกึ่งกลางร้านอาหาร',
};

let map;
let userMarker;
let routeLayer;
let startMarker;
let endMarker;
const shopMarkers = new Map();
let routeRequest = 0;

document.addEventListener('DOMContentLoaded', initializeApp);

async function initializeApp() {
  initializeMap();
  bindEvents();

  try {
    await loadShops();
    randomFood();
  } catch (error) {
    showNotice(
      `ไม่สามารถโหลดข้อมูลร้านได้: ${error.message} กรุณาเปิดเว็บผ่าน Local Web Server`,
      'error',
    );
    $('shop-list').innerHTML = '<div class="empty-state">โหลดข้อมูลร้านไม่สำเร็จ</div>';
    $('random-shop').disabled = true;
    $('random-shop-result').textContent = 'โหลดข้อมูลร้านไม่สำเร็จ กรุณาลองโหลดหน้าเว็บใหม่';
  }
}

function initializeMap() {
  map = L.map('map').setView(CONFIG.center, CONFIG.zoom);

  const openStreetMap = L.tileLayer(
    'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    },
  ).addTo(map);

  const esriWorldImagery = L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    {
      maxZoom: 19,
      attribution: 'Source: <a href="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer">Esri</a>, Vantor, Earthstar Geographics, and the GIS User Community',
    },
  );

  // เปลี่ยนเฉพาะแผนที่ฐาน Marker และเส้นทางยังอยู่บนแผนที่
  const layerControl = L.control.layers(
    {
      'OpenStreetMap (แผนที่ถนน)': openStreetMap,
      'Esri World Imagery (ภาพถ่ายดาวเทียม)': esriWorldImagery,
    },
    null,
    { position: 'topright', collapsed: true },
  ).addTo(map);

  const toggle = layerControl.getContainer().querySelector('.leaflet-control-layers-toggle');
  if (toggle) {
    toggle.title = 'เลือกแผนที่ฐาน';
    toggle.setAttribute('aria-label', 'เลือกแผนที่ฐาน');
  }

  map.on('click', (event) => {
    setStartPoint(event.latlng.lat, event.latlng.lng, 'จุดที่เลือกบนแผนที่');
  });
}

function bindEvents() {
  $('random-food').addEventListener('click', randomFood);
  $('random-shop').addEventListener('click', randomShop);
  $('radius-select').addEventListener('change', renderResults);
  $('locate-me').addEventListener('click', locateMe);
  $('clear-route').addEventListener('click', () => clearRoute());
}


async function loadShops() {
  const response = await fetch('shops.json');
  if (!response.ok) throw new Error('โหลด shops.json ไม่สำเร็จ');

  const data = await response.json();
  if (!Array.isArray(data)) throw new Error('shops.json ต้องเป็นรายการร้านอาหาร');

  shops = data
    .filter((shop) => (
      shop.id != null &&
      shop.name &&
      shop.food_type &&
      Number.isFinite(Number(shop.lat)) &&
      Number.isFinite(Number(shop.lng)) &&
      Math.abs(Number(shop.lat)) <= 90 &&
      Math.abs(Number(shop.lng)) <= 180
    ))
    .map((shop) => ({
      ...shop,
      lat: Number(shop.lat),
      lng: Number(shop.lng),
    }));

  foodTypes = [...new Set(shops.map((shop) => shop.food_type))];
  if (!foodTypes.length) throw new Error('ไม่พบร้านอาหารที่มีข้อมูลครบ');

  // Leaflet ใช้พิกัด [latitude, longitude]
  const bounds = L.latLngBounds(shops.map((shop) => [shop.lat, shop.lng]));
  map.fitBounds(bounds, { padding: [35, 35], maxZoom: 15, animate: false });

  const center = bounds.getCenter();
  startPoint = {
    lat: center.lat,
    lng: center.lng,
    source: 'จุดกึ่งกลางร้านอาหาร',
  };
  $('location-status').textContent =
    'เริ่มต้นจาก: จุดกึ่งกลางร้านอาหาร (คลิกแผนที่เพื่อเปลี่ยน)';
}


function randomFood() {
  if (!foodTypes.length) return;

  const randomIndex = Math.floor(Math.random() * foodTypes.length);
  selectedFood = foodTypes[randomIndex];

  const result = $('food-result');
  result.textContent = selectedFood;
  result.classList.remove('pop');
  void result.offsetWidth; // เริ่ม animation ใหม่
  result.classList.add('pop');

  clearRoute();
  renderResults();
}

function haversine(a, b) {
  const earthRadiusKm = 6371;
  const toRadians = (degrees) => degrees * Math.PI / 180;
  const deltaLat = toRadians(b.lat - a.lat);
  const deltaLng = toRadians(b.lng - a.lng);

  const x =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(toRadians(a.lat)) *
    Math.cos(toRadians(b.lat)) *
    Math.sin(deltaLng / 2) ** 2;

  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function randomShop() {
  if (!visibleShops.length) return;

  const { shop } = visibleShops[Math.floor(Math.random() * visibleShops.length)];
  const marker = shopMarkers.get(String(shop.id));
  if (!marker) return;

  $('random-shop-result').textContent = `ร้านที่สุ่มได้: ${shop.name}`;
  // Preview only: routing still starts from the card or popup button.
  map.setView(marker.getLatLng(), Math.max(map.getZoom(), 17), { animate: false });
  marker.openPopup();
}


function renderResults() {
  if (!map || !selectedFood) return;

  shopMarkers.forEach((marker) => map.removeLayer(marker));
  shopMarkers.clear();

  const radiusValue = $('radius-select').value;
  const maxRadius = radiusValue === 'all' ? Infinity : Number(radiusValue);

  const found = shops
    .filter((shop) => shop.food_type === selectedFood)
    .map((shop) => ({ shop, distance: haversine(startPoint, shop) }))
    .filter(({ distance }) => distance <= maxRadius)
    .sort((a, b) => a.distance - b.distance);

  $('result-count').textContent = found.length;
  visibleShops = found;
  $('random-shop').disabled = !found.length;
  $('random-shop-result').textContent = found.length
    ? 'สุ่มร้านจากประเภทอาหารและรัศมีที่เลือก'
    : 'ไม่พบร้านที่ตรงเงื่อนไข ลองเพิ่มรัศมีหรือสุ่มประเภทอาหารใหม่';

  const list = $('shop-list');
  list.replaceChildren();

  if (!found.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'ไม่พบร้านในเงื่อนไขนี้ ลองเพิ่มรัศมีหรือสุ่มเมนูใหม่';
    list.append(empty);
  }

  found.forEach(({ shop, distance }, index) => {
    addShopCard(shop, distance, index);
    addShopMarker(shop);
  });
}

function addShopCard(shop, distance, index) {
  const card = document.createElement('article');
  card.className = 'shop-card';
  card.dataset.id = String(shop.id);
  card.tabIndex = 0;
  card.setAttribute('role', 'button');
  card.setAttribute('aria-label', `นำทางไปร้าน ${shop.name}`);

  const number = document.createElement('span');
  number.className = 'shop-number';
  number.textContent = index + 1;

  const details = document.createElement('div');
  const name = document.createElement('h3');
  name.textContent = shop.name;
  const type = document.createElement('p');
  type.textContent = shop.food_type;
  details.append(name, type);
  if (index === 0) {
    const badge = document.createElement('span');
    badge.className = 'nearest-badge';
    badge.textContent = 'ใกล้ที่สุด';
    details.append(badge);
  }

  const distanceLabel = document.createElement('span');
  distanceLabel.className = 'shop-distance';
  distanceLabel.textContent = `${distance.toFixed(1)} กม.`;

  card.append(number, details, distanceLabel);
  card.addEventListener('click', () => selectShop(shop.id));
  card.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      selectShop(shop.id);
    }
  });

  $('shop-list').append(card);
}

function addShopMarker(shop) {
  const emoji = document.createElement('span');
  emoji.className = 'shop-marker-emoji';
  emoji.textContent = FOOD_EMOJI[shop.food_type] || '🍽️';
  emoji.setAttribute('aria-hidden', 'true');
  const marker = L.marker([shop.lat, shop.lng], {
    icon: L.divIcon({
      className: 'shop-emoji-marker',
      html: emoji,
      iconSize: [38, 38],
      iconAnchor: [19, 19],
      popupAnchor: [0, -22],
    }),
    title: `${shop.name} (${shop.food_type})`,
    alt: `${shop.name} (${shop.food_type})`,
  }).addTo(map);
  const popup = document.createElement('div');

  const title = document.createElement('div');
  title.className = 'popup-title';
  title.textContent = shop.name;

  const type = document.createElement('div');
  type.className = 'popup-type';
  type.textContent = shop.food_type;
  popup.append(title, type);

  const optionalFields = [
    ['เวลาเปิด–ปิด', shop.opening_hours],
    ['ช่วงราคา', shop.price_range ? `${shop.price_range} บาท` : ''],
    ['ที่ตั้ง', shop.address],
  ];

  for (const [label, value] of optionalFields) {
    if (!value) continue;
    const detail = document.createElement('div');
    detail.className = 'popup-address';
    detail.textContent = `${label}: ${value}`;
    popup.append(detail);
  }

  const button = document.createElement('button');
  button.className = 'popup-route';
  button.type = 'button';
  button.textContent = 'นำทางไปร้านนี้';
  button.addEventListener('click', () => selectShop(shop.id));
  popup.append(button);

  marker.bindPopup(popup);
  shopMarkers.set(String(shop.id), marker);
}

function selectShop(id) {
  const shop = shops.find((item) => String(item.id) === String(id));
  if (!shop) return;

  shopMarkers.get(String(shop.id))?.openPopup();
  calculateRoute(shop);
}


function markerIcon(className) {
  return L.divIcon({
    className: '',
    html: `<span class="${className}" style="display:block;width:19px;height:19px"></span>`,
    iconSize: [19, 19],
    iconAnchor: [9, 9],
  });
}

function setStartPoint(lat, lng, source) {
  startPoint = { lat, lng, source };

  if (userMarker) map.removeLayer(userMarker);
  userMarker = L.marker([lat, lng], {
    icon: markerIcon('user-marker'),
  }).addTo(map).bindPopup(`จุดเริ่มต้น: ${source}`);

  $('location-status').textContent = `เริ่มต้นจาก: ${source}`;
  clearRoute();
  renderResults();
}

function locateMe() {
  if (!navigator.geolocation) {
    showNotice(
      'เบราว์เซอร์นี้ไม่รองรับการระบุตำแหน่ง — คลิกบนแผนที่เพื่อเลือกจุดเริ่มต้น',
      'error',
    );
    return;
  }

  $('location-status').textContent = 'กำลังขอตำแหน่งของคุณ...';
  navigator.geolocation.getCurrentPosition(
    (position) => {
      const { latitude, longitude } = position.coords;
      setStartPoint(latitude, longitude, 'ตำแหน่งปัจจุบันของฉัน');
      map.setView([latitude, longitude], 15);
    },
    () => {
      $('location-status').textContent = 'ไม่ได้รับอนุญาต GPS';
      showNotice(
        'ไม่สามารถเข้าถึง GPS ได้ คุณสามารถคลิกบนแผนที่เพื่อเลือกจุดเริ่มต้นเอง',
        'error',
      );
    },
    { enableHighAccuracy: true, timeout: 10000 },
  );
}


async function calculateRoute(shop) {
  clearRoute(false);
  const request = routeRequest; // ยกเลิกผลตอบกลับของคำขอเก่า

  $('route-panel').hidden = false;
  $('route-shop-name').textContent = shop.name;
  $('route-distance').textContent = '...';
  $('route-duration').textContent = '...';

  // OSRM รับพิกัดในรูปแบบ longitude,latitude
  const start = `${startPoint.lng},${startPoint.lat}`;
  const end = `${shop.lng},${shop.lat}`;
  $('google-directions').href =
    `https://www.google.com/maps/dir/?api=1&origin=${startPoint.lat},${startPoint.lng}` +
    `&destination=${shop.lat},${shop.lng}`;

  try {
    const url = `${CONFIG.routingUrl}/${start};${end}?overview=full&geometries=geojson`;
    const response = await fetch(url);
    if (!response.ok) throw new Error('Routing service error');

    const data = await response.json();
    if (!data.routes?.length) throw new Error('ไม่พบเส้นทาง');
    if (request !== routeRequest) return;

    const route = data.routes[0];
    routeLayer = L.geoJSON(route.geometry, {
      style: { color: '#f26b38', weight: 6, opacity: 0.85 },
    }).addTo(map);

    startMarker = L.marker([startPoint.lat, startPoint.lng], {
      icon: markerIcon('route-start-marker'),
    }).addTo(map).bindTooltip('จุดเริ่มต้น');

    endMarker = L.marker([shop.lat, shop.lng], {
      icon: markerIcon('route-end-marker'),
    }).addTo(map).bindTooltip(shop.name);

    map.fitBounds(routeLayer.getBounds(), { padding: [35, 35] });
    $('route-distance').textContent = (route.distance / 1000).toFixed(1);
    $('route-duration').textContent = Math.max(1, Math.round(route.duration / 60));
  } catch (error) {
    if (request !== routeRequest) return;
    $('route-distance').textContent = '–';
    $('route-duration').textContent = '–';
    showNotice(
      'บริการคำนวณเส้นทาง OSRM ไม่พร้อมใช้งานในขณะนี้ กรุณาลองใหม่หรือใช้ปุ่มเปิด Google Maps — ระบบจะไม่แสดงเส้นตรงแทนเส้นทางถนน',
      'error',
    );
  }
}

function clearRoute(hide = true) {
  routeRequest += 1;
  if (routeLayer) map.removeLayer(routeLayer);
  if (startMarker) map.removeLayer(startMarker);
  if (endMarker) map.removeLayer(endMarker);
  routeLayer = null;
  startMarker = null;
  endMarker = null;
  if (hide) $('route-panel').hidden = true;
}


function showNotice(message, kind = 'info') {
  const notice = $('notice');
  notice.textContent = message;
  notice.hidden = false;
  notice.dataset.kind = kind;

  if (kind === 'info') {
    setTimeout(() => {
      notice.hidden = true;
    }, 7000);
  }
}
