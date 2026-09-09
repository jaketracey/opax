import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// A small raster map works on mobile Safari without a WebGL context.
export function mountGrantMap(container, { onSelect, onTileError = () => {} }) {
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const map = L.map(container, { zoomControl: false, scrollWheelZoom: false,
    dragging: !L.Browser.mobile, tap: false, minZoom: 3, maxZoom: 17,
    attributionControl: true, zoomAnimation: !reduced() });
  map.attributionControl.setPrefix(false);
  L.control.zoom({ position: 'bottomright', zoomInTitle: 'Zoom in', zoomOutTitle: 'Zoom out' }).addTo(map);
  const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',
    maxZoom: 19, keepBuffer: 1, updateWhenIdle: true,
  }).addTo(map);
  tiles.on('tileerror', onTileError);
  const markers = L.layerGroup().addTo(map);
  let pins = [], destroyed = false;
  const nationalBounds = [[-44, 112], [-10, 154]];
  map.fitBounds(nationalBounds, { padding: [20, 20], animate: false });
  const observer = new ResizeObserver(() => {
    if (!destroyed && container.clientWidth && container.clientHeight) map.invalidateSize({ animate: false });
  });
  observer.observe(container);
  function fit(points, animate = true) {
    const bounds = points.length ? points.map(p => [p.site.latitude, p.site.longitude]) : nationalBounds;
    map.stop();
    const options = { padding: [42, 42], maxZoom: points.length === 1 ? 14 : 12, duration: .75 };
    if (animate && !reduced()) map.flyToBounds(bounds, options);
    else map.fitBounds(bounds, { ...options, animate: false });
  }
  return {
    update(records, animate = false, preserveView = false) {
      markers.clearLayers(); pins = [];
      for (const record of records) for (const site of record.sites) {
        const label = `${site.site_name || record.title}, ${record.record_type === 'award' ? 'published grant' : 'invited project'}`;
        const marker = L.marker([site.latitude, site.longitude], {
          icon: L.divIcon({ className: 'allocation-pin', iconSize: [44, 44], iconAnchor: [22, 22],
            html: '<span class="allocation-pin-dot"></span>' }),
          keyboard: true, title: label, riseOnHover: true,
        }).addTo(markers);
        const icon = marker.getElement();
        icon.setAttribute('aria-label', label); icon.setAttribute('aria-pressed', 'false');
        icon.addEventListener('keydown', e => { if (e.key === ' ') { e.preventDefault(); onSelect(record.id); } });
        const tooltip = document.createElement('span'); tooltip.textContent = site.site_name || record.title;
        marker.bindTooltip(tooltip, { direction: 'top', offset: [0, -9] });
        marker.on('click', () => onSelect(record.id));
        pins.push({ record, site, marker });
      }
      if (!preserveView) fit(pins, animate);
    },
    select(id, animate = true, preserveView = false) {
      for (const pin of pins) {
        const selected = pin.record.id === id, icon = pin.marker.getElement();
        icon.classList.toggle('is-selected', selected);
        icon.setAttribute('aria-pressed', String(selected));
        pin.marker.setZIndexOffset(selected ? 1000 : 0);
      }
      const chosen = pins.filter(p => p.record.id === id);
      if (chosen.length && !preserveView) fit(chosen, animate);
    },
    focus(id) { pins.find(p=>p.record.id===id)?.marker.getElement()?.focus({preventScroll:true}); },
    fitAll() { fit(pins); },
    resize() { map.invalidateSize({ animate: false }); },
    setMovable(value) { value ? map.dragging.enable() : map.dragging.disable(); },
    destroy() { destroyed = true; observer.disconnect(); map.stop(); map.remove(); },
  };
}
