import { useEffect, useRef, useState } from "react";

function getCoordinates(latitude, longitude) {
  if (latitude === "" || longitude === "" || latitude === null || longitude === null) {
    return null;
  }

  const lat = Number(latitude);
  const lng = Number(longitude);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) {
    return null;
  }

  return { lat, lng };
}

function createLocationIcon(leaflet) {
  return leaflet.divIcon({
    className: "donor-location-marker",
    html: "<span></span>",
    iconSize: [24, 34],
    iconAnchor: [12, 34],
  });
}

function createHospitalIcon(leaflet, rank, selected) {
  return leaflet.divIcon({
    className: `donor-hospital-map-marker${selected ? " selected" : ""}`,
    html: `<span>${rank}</span>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });
}

function renderHospitalMarkers(leaflet, markerLayer, hospitals, selectedHospitalId, onSelect) {
  markerLayer.clearLayers();
  hospitals.forEach((hospital, index) => {
    if (!Number.isFinite(hospital.latitude) || !Number.isFinite(hospital.longitude)) return;
    const hospitalMarker = leaflet.marker(
      [hospital.latitude, hospital.longitude],
      {
        icon: createHospitalIcon(
          leaflet,
          index + 1,
          hospital.hospitalId === selectedHospitalId
        ),
      }
    );
    hospitalMarker.on("click", () => onSelect?.(hospital));
    hospitalMarker.addTo(markerLayer);
  });
}

export default function OpenStreetMapLocationPicker({
  latitude,
  longitude,
  onLocationSelect,
  hospitals = [],
  selectedHospitalId = null,
  onHospitalSelect,
}) {
  const mapElement = useRef(null);
  const map = useRef(null);
  const leafletRef = useRef(null);
  const marker = useRef(null);
  const hospitalMarkerLayer = useRef(null);
  const onSelect = useRef(onLocationSelect);
  const onHospitalSelectRef = useRef(onHospitalSelect);
  const coordinates = useRef({ latitude, longitude });
  const hospitalsRef = useRef(hospitals);
  const selectedHospitalIdRef = useRef(selectedHospitalId);
  const [mapError, setMapError] = useState("");

  useEffect(() => {
    onSelect.current = onLocationSelect;
  }, [onLocationSelect]);

  useEffect(() => {
    coordinates.current = { latitude, longitude };
  }, [latitude, longitude]);

  useEffect(() => {
    onHospitalSelectRef.current = onHospitalSelect;
  }, [onHospitalSelect]);

  useEffect(() => {
    hospitalsRef.current = hospitals;
    selectedHospitalIdRef.current = selectedHospitalId;
    if (!leafletRef.current || !hospitalMarkerLayer.current) return;
    renderHospitalMarkers(
      leafletRef.current,
      hospitalMarkerLayer.current,
      hospitals,
      selectedHospitalId,
      onHospitalSelectRef.current
    );
  }, [hospitals, selectedHospitalId]);

  useEffect(() => {
    if (!mapElement.current) return undefined;

    let cancelled = false;
    let currentMap = null;

    Promise.all([
      import("leaflet"),
      import("leaflet/dist/leaflet.css"),
    ])
      .then(([leafletModule]) => {
        if (cancelled || !mapElement.current) return;
        const leaflet = leafletModule.default;
        leafletRef.current = leaflet;
        const selectedCoordinates = getCoordinates(
          coordinates.current.latitude,
          coordinates.current.longitude
        );
        const initialPosition = selectedCoordinates || { lat: -1.286389, lng: 36.817223 };
        currentMap = leaflet.map(mapElement.current, {
          center: [initialPosition.lat, initialPosition.lng],
          zoom: selectedCoordinates ? 15 : 11,
          scrollWheelZoom: false,
        });
        map.current = currentMap;
        hospitalMarkerLayer.current = leaflet.layerGroup().addTo(currentMap);

        leaflet.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        })
          .on("tileerror", () => {
            setMapError("Map tiles could not be loaded. Check your internet connection and try again.");
          })
          .on("tileload", () => setMapError(""))
          .addTo(currentMap);

        const currentMarker = leaflet.marker(
          [initialPosition.lat, initialPosition.lng],
          { draggable: true, icon: createLocationIcon(leaflet) }
        );
        if (selectedCoordinates) currentMarker.addTo(currentMap);
        marker.current = currentMarker;

        const selectPosition = (position) => {
          const selectedLocation = {
            latitude: position.lat,
            longitude: position.lng,
          };
          currentMarker.setLatLng([selectedLocation.latitude, selectedLocation.longitude]);
          if (!currentMap.hasLayer(currentMarker)) currentMarker.addTo(currentMap);
          onSelect.current(selectedLocation);
        };

        currentMap.on("click", (event) => selectPosition(event.latlng));
        currentMarker.on("dragend", (event) => selectPosition(event.target.getLatLng()));
        renderHospitalMarkers(
          leaflet,
          hospitalMarkerLayer.current,
          hospitalsRef.current,
          selectedHospitalIdRef.current,
          onHospitalSelectRef.current
        );
      })
      .catch(() => {
        if (!cancelled) setMapError("The map library could not be loaded. Refresh and try again.");
      });

    return () => {
      cancelled = true;
      currentMap?.remove();
      map.current = null;
      leafletRef.current = null;
      marker.current = null;
      hospitalMarkerLayer.current = null;
    };
  }, []);

  useEffect(() => {
    const position = getCoordinates(latitude, longitude);
    if (!map.current || !marker.current || !position) return;

    map.current.setView([position.lat, position.lng]);
    marker.current.setLatLng([position.lat, position.lng]);
    if (!map.current.hasLayer(marker.current)) marker.current.addTo(map.current);
  }, [latitude, longitude]);

  return (
    <div className="donor-location-map-wrap">
      <p className="donor-location-map-help">
        {hospitals.length
          ? "Click the map or drag your pin to set your location, or select a numbered hospital."
          : "Click the map or drag the marker to set your location."}
      </p>
      <div className="donor-location-map" ref={mapElement} aria-label="OpenStreetMap for selecting a location" />
      {mapError && <p className="donor-location-map-error" role="status">{mapError}</p>}
    </div>
  );
}
