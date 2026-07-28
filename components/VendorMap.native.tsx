import React, { useEffect, useMemo, useCallback, useRef } from "react";
import { View, StyleSheet, Platform } from "react-native";
import { WebView } from "react-native-webview";
import Colors from "@/constants/colors";
import { Vendor } from "@/lib/types";

export type MapViewType = "standard" | "satellite" | "hybrid";

const categoryColorMap: Record<string, string> = {
  "1": "#3B82F6",
  "2": "#FF6B00",
  "3": "#8B5CF6",
  "4": "#10B981",
};

interface VendorMapProps {
  vendors: Array<Vendor>;
  initialRegion: {
    latitude: number;
    longitude: number;
    latitudeDelta: number;
    longitudeDelta: number;
  };
  onMarkerPress: (vendor: Vendor) => void;
  onMapPress: () => void;
  mapRef: React.RefObject<any>;
  mapType?: MapViewType;
  is3DStreetView?: boolean;
  showsUserLocation?: boolean;
  onVisibleCountChange?: (count: number) => void;
  userLocationCoords?: { latitude: number; longitude: number } | null;
  isDriveMode?: boolean;
  locationKey?: number;
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function prepareVendorData(vendors: Array<Vendor>) {
  return vendors
    .filter(v => {
      const la = parseFloat(String(v.lat));
      const ln = parseFloat(String(v.lng));
      // Keep only vendors with valid coordinates inside India's geographic bounds
      return !isNaN(la) && !isNaN(ln) && la >= 6 && la <= 37 && ln >= 68 && ln <= 98;
    })
    .map(v => ({
      id: v.id,
      name: escapeHtml(v.name),
      lat: v.lat,
      lng: v.lng,
      catId: v.categoryId,
      isOpen: v.isOpen,
      initial: escapeHtml(v.name.charAt(0).toUpperCase()),
    }));
}

function generate3DHTML(
  vendors: Array<Vendor>,
  initialRegion: { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number },
  userLocationCoords?: { latitude: number; longitude: number } | null,
) {
  const destLat = userLocationCoords?.latitude ?? initialRegion.latitude;
  const destLng = userLocationCoords?.longitude ?? initialRegion.longitude;
  const vendorData = prepareVendorData(vendors);
  const catColors = JSON.stringify(categoryColorMap);
  const CESIUM_VERSION = "1.95";
  const CESIUM_BASE = `https://cesium.com/downloads/cesiumjs/releases/${CESIUM_VERSION}/Build/Cesium`;
  const DARK_BG = "#0B1E3D";

  return `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1.0, minimum-scale=1.0, maximum-scale=1.0, user-scalable=no">
<script src="${CESIUM_BASE}/Cesium.js"></script>
<link href="${CESIUM_BASE}/Widgets/widgets.css" rel="stylesheet"/>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body { width: 100%; height: 100%; overflow: hidden; background: #000; }
#cesiumContainer { width: 100%; height: 100%; }
#loading {
  position: absolute; top: 0; left: 0; right: 0; bottom: 0;
  background: radial-gradient(ellipse at 35% 45%, #0d1f5c 0%, #030c2e 45%, #000000 100%);
  color: #fff; font-family: 'Helvetica Neue', sans-serif;
  display: flex; flex-direction: column; justify-content: center;
  align-items: center; text-align: center; z-index: 9999;
  transition: opacity 0.7s ease-out; overflow: hidden;
}
#loading.fade-out { opacity: 0; pointer-events: none; }
#loading.hide { display: none; }
.star { position: absolute; background: #fff; border-radius: 50%; animation: twinkle linear infinite; }
@keyframes twinkle { 0%,100%{opacity:0.1} 50%{opacity:1} }
.orbit-wrap { position: relative; width: 80px; height: 80px; margin-bottom: 22px; }
.orbit-ring {
  position: absolute; inset: 0;
  border: 2px solid rgba(255,140,0,0.25); border-radius: 50%;
  animation: spin 2.4s linear infinite;
}
.orbit-ring-2 {
  position: absolute; inset: 10px;
  border: 1.5px solid rgba(255,180,0,0.15); border-radius: 50%;
  animation: spin 3.8s linear infinite reverse;
}
.orbit-sat {
  position: absolute; top: -5px; left: calc(50% - 5px);
  width: 10px; height: 10px; border-radius: 50%;
  background: ${Colors.primary};
  box-shadow: 0 0 10px 4px ${Colors.primary}, 0 0 20px 8px rgba(255,140,0,0.3);
}
.orbit-earth {
  position: absolute; top: 50%; left: 50%;
  transform: translate(-50%,-50%);
  font-size: 32px; filter: drop-shadow(0 0 8px #4af);
}
@keyframes spin { 0%{transform:rotate(0deg)} 100%{transform:rotate(360deg)} }
.launch-title {
  font-size: 15px; font-weight: 700; letter-spacing: 2.5px; text-transform: uppercase;
  color: ${Colors.primary}; text-shadow: 0 0 12px rgba(255,140,0,0.6);
  margin-bottom: 6px;
}
.launch-sub {
  font-size: 11px; letter-spacing: 1px; opacity: 0.45; text-transform: uppercase;
}
.launch-bar-wrap {
  margin-top: 18px; width: 120px; height: 2px;
  background: rgba(255,255,255,0.08); border-radius: 2px; overflow: hidden;
}
.launch-bar {
  height: 100%; width: 0%; border-radius: 2px;
  background: linear-gradient(90deg, ${Colors.primary}, #fff);
  box-shadow: 0 0 8px ${Colors.primary};
  animation: launchbar 1s ease-out forwards;
}
@keyframes launchbar { 0%{width:0%} 100%{width:85%} }
.cesium-viewer-bottom, .cesium-viewer-toolbar { display: none !important; }
.cesium-widget-credits { display: none !important; }
</style>
</head>
<body>
<div id="cesiumContainer"></div>
<div id="loading">
  <div class="orbit-wrap">
    <div class="orbit-ring"><div class="orbit-sat"></div></div>
    <div class="orbit-ring-2"></div>
    <div class="orbit-earth">🌍</div>
  </div>
  <div class="launch-title">Star Dive</div>
  <div class="launch-sub">Homing to your location...</div>
  <div class="launch-bar-wrap"><div class="launch-bar"></div></div>
</div>
<script>
(function(){
  var ld=document.getElementById('loading');
  for(var i=0;i<90;i++){
    var s=document.createElement('div');s.className='star';
    var sz=Math.random()*2.2+0.4;
    s.style.cssText='width:'+sz+'px;height:'+sz+'px;top:'+Math.random()*100+'%;left:'+Math.random()*100+'%;animation-duration:'+(Math.random()*3+1.2)+'s;animation-delay:'+(-Math.random()*3)+'s';
    ld.appendChild(s);
  }
})();
</script>
<script>
(function() {
  var catColors = ${catColors};
  var vendors = ${JSON.stringify(vendorData)};
  var PRIMARY = '${Colors.primary}';
  var loadEl = document.getElementById('loading');
  var _driveMode = false;
  var _userEntity = null;
  var centerLat = ${initialRegion.latitude};
  var centerLng = ${initialRegion.longitude};

  window.CESIUM_BASE_URL = '${CESIUM_BASE}/';
  Cesium.Ion.defaultAccessToken = '';

  try {
    var canvas = document.createElement('canvas');
    var gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (!gl) {
      loadEl.innerHTML = '<div style="font-size:18px;margin-bottom:10px">3D View Unavailable</div><div style="font-size:13px;opacity:0.7">Your device does not support WebGL.</div>';
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'visibleCount', count: 0 }));
      return;
    }
  } catch(e) {}

  var viewer = new Cesium.Viewer('cesiumContainer', {
    imageryProvider: new Cesium.ArcGisMapServerImageryProvider({
      url: 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer'
    }),
    baseLayerPicker: false,
    geocoder: false,
    homeButton: false,
    sceneModePicker: false,
    selectionIndicator: false,
    timeline: false,
    animation: false,
    navigationHelpButton: false,
    fullscreenButton: false,
    infoBox: false,
    requestRenderMode: false,
    maximumRenderTimeChange: Infinity
  });

  viewer.scene.globe.enableLighting = true;
  viewer.scene.screenSpaceCameraController.minimumZoomDistance = 100;
  viewer.scene.screenSpaceCameraController.maximumZoomDistance = 30000000;
  viewer.scene.fog.enabled = true;
  viewer.scene.fog.density = 0.0001;
  viewer.scene.skyAtmosphere.show = true;

  // Pinpoint target — user's exact GPS coordinates
  var destLat = ${destLat};
  var destLng = ${destLng};

  // Position camera in deep space DIRECTLY above user's location, looking straight down
  viewer.camera.setView({
    destination: Cesium.Cartesian3.fromDegrees(destLng, destLat, 12000000),
    orientation: {
      heading: 0,
      pitch: Cesium.Math.toRadians(-90),
      roll: 0
    }
  });

  // STAR DIVE — plunge from space into the world, landing at a forward-tilted street view
  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(destLng, destLat, 150),
    orientation: {
      heading: Cesium.Math.toRadians(5),
      pitch: Cesium.Math.toRadians(-35),
      roll: 0
    },
    duration: 7.5,
    complete: function() {
      // Wrap in try-catch so startMarkerDrop ALWAYS fires even if CesiumJS throws
      try {
        // ── Draw teardrop location pin on canvas ──
        var ps = 64, pc = document.createElement('canvas');
        pc.width = ps; pc.height = 98;
        var px = pc.getContext('2d');
        px.shadowColor = 'rgba(0,0,0,0.55)'; px.shadowBlur = 9;
        px.beginPath(); px.arc(ps/2, 34, 26, 0, Math.PI*2);
        px.fillStyle = PRIMARY; px.fill();
        px.lineWidth = 4; px.strokeStyle = '#FFFFFF'; px.stroke();
        px.shadowBlur = 0;
        px.beginPath(); px.arc(ps/2, 34, 9, 0, Math.PI*2);
        px.fillStyle = '#FFFFFF'; px.fill();
        px.beginPath(); px.moveTo(20,55); px.lineTo(44,55); px.lineTo(32,92);
        px.closePath(); px.fillStyle = PRIMARY;
        px.shadowColor = 'rgba(0,0,0,0.35)'; px.shadowBlur = 5; px.fill();
        viewer.entities.add({
          id: '__user_pin__',
          position: Cesium.Cartesian3.fromDegrees(destLng, destLat, 35),
          billboard: {
            image: pc.toDataURL(), width: 46, height: 70,
            verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
            horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
            disableDepthTestDistance: Number.POSITIVE_INFINITY
          }
        });
        // ── Pulsing sonar rings (size-animated, static color for compatibility) ──
        var t0 = Cesium.JulianDate.now();
        var ringColor = Cesium.Color.fromCssColorString(PRIMARY);
        [{ off: 0, alpha: 0.55, rid: '__ring_0__' }, { off: 0.8, alpha: 0.38, rid: '__ring_1__' }, { off: 1.6, alpha: 0.22, rid: '__ring_2__' }].forEach(function(cfg) {
          var off = cfg.off;
          viewer.entities.add({
            id: cfg.rid,
            position: Cesium.Cartesian3.fromDegrees(destLng, destLat, 0),
            ellipse: {
              semiMajorAxis: new Cesium.CallbackProperty(function(t) {
                var s = (Cesium.JulianDate.secondsDifference(t, t0) + off) % 2.4;
                return 8 + (s / 2.4) * 110;
              }, false),
              semiMinorAxis: new Cesium.CallbackProperty(function(t) {
                var s = (Cesium.JulianDate.secondsDifference(t, t0) + off) % 2.4;
                return 8 + (s / 2.4) * 110;
              }, false),
              material: ringColor.withAlpha(cfg.alpha),
              heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
              outline: false
            }
          });
        });
      } catch(e) {}
      // ── Always unlock clustering and show vendor markers ──
      isAnimating = false;
      startMarkerDrop();
    }
  });

  function hideLoading() {
    if (loadEl.classList.contains('fade-out')) return;
    loadEl.classList.add('fade-out');
    setTimeout(function() { loadEl.classList.add('hide'); }, 400);
  }
  // Reveal the Earth view after 1 second — markers appear after the dive completes
  setTimeout(function() { hideLoading(); }, 1000);

  // ── Reposition pin + sonar rings at a new GPS location (called from RN side) ──
  window.mapRepositionPin = function(lat, lng) {
    try {
      var old = viewer.entities.getById('__user_pin__');
      if (old) viewer.entities.remove(old);
      ['__ring_0__','__ring_1__','__ring_2__'].forEach(function(rid) {
        var e = viewer.entities.getById(rid); if (e) viewer.entities.remove(e);
      });
      var ps = 64, pc = document.createElement('canvas');
      pc.width = ps; pc.height = 98;
      var px = pc.getContext('2d');
      px.shadowColor = 'rgba(0,0,0,0.55)'; px.shadowBlur = 9;
      px.beginPath(); px.arc(ps/2, 34, 26, 0, Math.PI*2);
      px.fillStyle = PRIMARY; px.fill();
      px.lineWidth = 4; px.strokeStyle = '#FFFFFF'; px.stroke();
      px.shadowBlur = 0;
      px.beginPath(); px.arc(ps/2, 34, 9, 0, Math.PI*2);
      px.fillStyle = '#FFFFFF'; px.fill();
      px.beginPath(); px.moveTo(20,55); px.lineTo(44,55); px.lineTo(32,92);
      px.closePath(); px.fillStyle = PRIMARY;
      px.shadowColor = 'rgba(0,0,0,0.35)'; px.shadowBlur = 5; px.fill();
      viewer.entities.add({
        id: '__user_pin__',
        position: Cesium.Cartesian3.fromDegrees(lng, lat, 35),
        billboard: {
          image: pc.toDataURL(), width: 46, height: 70,
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
          disableDepthTestDistance: Number.POSITIVE_INFINITY
        }
      });
      var tr = Cesium.JulianDate.now();
      var rc = Cesium.Color.fromCssColorString(PRIMARY);
      [{ off: 0, alpha: 0.55, rid: '__ring_0__' }, { off: 0.8, alpha: 0.38, rid: '__ring_1__' }, { off: 1.6, alpha: 0.22, rid: '__ring_2__' }].forEach(function(cfg) {
        var off = cfg.off;
        viewer.entities.add({
          id: cfg.rid,
          position: Cesium.Cartesian3.fromDegrees(lng, lat, 0),
          ellipse: {
            semiMajorAxis: new Cesium.CallbackProperty(function(t) {
              var s = (Cesium.JulianDate.secondsDifference(t, tr) + off) % 2.4; return 8 + (s/2.4)*110;
            }, false),
            semiMinorAxis: new Cesium.CallbackProperty(function(t) {
              var s = (Cesium.JulianDate.secondsDifference(t, tr) + off) % 2.4; return 8 + (s/2.4)*110;
            }, false),
            material: rc.withAlpha(cfg.alpha),
            heightReference: Cesium.HeightReference.CLAMP_TO_GROUND
          }
        });
      });
      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(lng, lat, 150),
        orientation: { heading: Cesium.Math.toRadians(5), pitch: Cesium.Math.toRadians(-35), roll: 0 },
        duration: 2.0
      });
    } catch(err) {}
  };

  var pinCache = {};
  function getPinImage(catId, isOpen) {
    var key = catId + '_' + (isOpen ? '1' : '0');
    if (pinCache[key]) return pinCache[key];
    var color = catColors[catId] || PRIMARY;
    var size = 40;
    var c = document.createElement('canvas');
    c.width = size; c.height = size;
    var ctx = c.getContext('2d');
    ctx.beginPath();
    ctx.arc(size/2, size/2, size/2 - 2, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#FFFFFF';
    ctx.stroke();
    var dotR = 5;
    ctx.beginPath();
    ctx.arc(size - dotR - 1, size - dotR - 1, dotR, 0, Math.PI * 2);
    ctx.fillStyle = isOpen ? '#22C55E' : '#EF4444';
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#FFFFFF';
    ctx.stroke();
    pinCache[key] = c.toDataURL();
    return pinCache[key];
  }

  var clusterImageCache = {};
  function getClusterImage(count) {
    if (clusterImageCache[count]) return clusterImageCache[count];
    var size = count >= 100 ? 56 : (count >= 10 ? 48 : 42);
    var c = document.createElement('canvas');
    c.width = size; c.height = size;
    var ctx = c.getContext('2d');
    ctx.beginPath();
    ctx.arc(size/2, size/2, size/2 - 1, 0, Math.PI * 2);
    ctx.fillStyle = PRIMARY;
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#FFFFFF';
    ctx.stroke();
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold ' + (count >= 100 ? 15 : 16) + 'px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('' + count, size/2, size/2);
    clusterImageCache[count] = c.toDataURL();
    return clusterImageCache[count];
  }

  var MARKER_HEIGHT = 50;
  var CLUSTER_HEIGHT = 80;
  var UNCLUSTER_ALT = 2500;
  var clusterEntities = [];
  var vendorEntityMap = {};
  var currentMode = 'none';
  var isAnimating = true;

  vendors.forEach(function(v) {
    vendorEntityMap[v.id] = { v: v, entity: null, visible: false };
  });

  function getCameraAltitude() {
    var cart = viewer.camera.positionCartographic;
    return cart ? cart.height : 10000;
  }

  function computeClusters(gridSize) {
    var grid = {};
    vendors.forEach(function(v) {
      var gx = Math.floor(v.lat / gridSize);
      var gy = Math.floor(v.lng / gridSize);
      var key = gx + ',' + gy;
      if (!grid[key]) grid[key] = [];
      grid[key].push(v);
    });
    var result = [];
    var keys = Object.keys(grid);
    for (var i = 0; i < keys.length; i++) {
      var members = grid[keys[i]];
      var cLat = 0, cLng = 0;
      for (var j = 0; j < members.length; j++) {
        cLat += members[j].lat;
        cLng += members[j].lng;
      }
      cLat /= members.length;
      cLng /= members.length;
      result.push({ lat: cLat, lng: cLng, count: members.length, members: members });
    }
    return result;
  }

  function clearClusters() {
    for (var i = 0; i < clusterEntities.length; i++) {
      viewer.entities.remove(clusterEntities[i]);
    }
    clusterEntities = [];
  }

  function clearVendorMarkers() {
    var ids = Object.keys(vendorEntityMap);
    for (var i = 0; i < ids.length; i++) {
      var item = vendorEntityMap[ids[i]];
      if (item.entity) {
        viewer.entities.remove(item.entity);
        item.entity = null;
        item.visible = false;
      }
    }
  }

  function showClusters(alt) {
    clearVendorMarkers();
    clearClusters();
    var gridSize;
    if (alt > 20000) gridSize = 0.04;
    else if (alt > 10000) gridSize = 0.025;
    else if (alt > 5000) gridSize = 0.015;
    else gridSize = 0.008;
    var clusters = computeClusters(gridSize);
    for (var i = 0; i < clusters.length; i++) {
      var cl = clusters[i];
      if (cl.count === 1) {
        var v = cl.members[0];
        var ent = viewer.entities.add({
          id: v.id,
          position: Cesium.Cartesian3.fromDegrees(v.lng, v.lat, MARKER_HEIGHT),
          billboard: {
            image: getPinImage(v.catId, v.isOpen),
            width: 32, height: 32,
            verticalOrigin: Cesium.VerticalOrigin.CENTER,
            horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
            scaleByDistance: new Cesium.NearFarScalar(500, 1.2, 15000, 0.3)
          }
        });
        vendorEntityMap[v.id].entity = ent;
        vendorEntityMap[v.id].visible = true;
      } else {
        var clSize = cl.count >= 100 ? 48 : (cl.count >= 10 ? 42 : 36);
        var ent = viewer.entities.add({
          id: '__cluster_' + i,
          position: Cesium.Cartesian3.fromDegrees(cl.lng, cl.lat, CLUSTER_HEIGHT),
          billboard: {
            image: getClusterImage(cl.count),
            width: clSize, height: clSize,
            verticalOrigin: Cesium.VerticalOrigin.CENTER,
            horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
            scaleByDistance: new Cesium.NearFarScalar(500, 1.0, 30000, 0.5)
          },
          _clusterData: cl
        });
        clusterEntities.push(ent);
      }
    }
    currentMode = 'clustered';
  }

  function showIndividualMarkers() {
    clearClusters();
    var ids = Object.keys(vendorEntityMap);
    for (var i = 0; i < ids.length; i++) {
      var item = vendorEntityMap[ids[i]];
      if (!item.entity) {
        var v = item.v;
        item.entity = viewer.entities.add({
          id: v.id,
          position: Cesium.Cartesian3.fromDegrees(v.lng, v.lat, MARKER_HEIGHT),
          billboard: {
            image: getPinImage(v.catId, v.isOpen),
            width: 32, height: 32,
            verticalOrigin: Cesium.VerticalOrigin.CENTER,
            horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
            scaleByDistance: new Cesium.NearFarScalar(500, 1.2, 15000, 0.3)
          }
        });
        item.visible = true;
      }
    }
    currentMode = 'individual';
  }

  function updateClustering() {
    if (isAnimating) return;
    var alt = getCameraAltitude();
    if (alt <= UNCLUSTER_ALT) {
      if (currentMode !== 'individual') showIndividualMarkers();
    } else {
      showClusters(alt);
    }
  }

  function startMarkerDrop() {
    updateClustering();
  }

  function createUserDot() {
    var s = 36;
    var c = document.createElement('canvas');
    c.width = s; c.height = s;
    var ctx = c.getContext('2d');
    ctx.beginPath();
    ctx.arc(s/2, s/2, s/2 - 2, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(66,133,244,0.2)';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(s/2, s/2, 8, 0, Math.PI * 2);
    ctx.fillStyle = '#4285F4';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#FFFFFF';
    ctx.stroke();
    return c.toDataURL();
  }

  var userDotImage = createUserDot();

  window.mapUpdateUserLocation = function(lat, lng, heading) {
    var pos = Cesium.Cartesian3.fromDegrees(lng, lat, 60);
    if (!_userEntity) {
      _userEntity = viewer.entities.add({
        id: '__user_location__',
        position: pos,
        billboard: {
          image: userDotImage,
          width: 36,
          height: 36,
          verticalOrigin: Cesium.VerticalOrigin.CENTER,
          horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
          disableDepthTestDistance: Number.POSITIVE_INFINITY
        }
      });
    } else {
      _userEntity.position = pos;
    }

    if (_driveMode) {
      var h = (heading !== null && heading !== undefined && !isNaN(heading)) ? heading : 0;
      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(lng, lat, 100),
        orientation: {
          heading: Cesium.Math.toRadians(h),
          pitch: Cesium.Math.toRadians(-20),
          roll: 0
        },
        duration: 0.4
      });
    }
  };

  window.mapSetDriveMode = function(enabled) {
    _driveMode = enabled;
  };

  var handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);

  handler.setInputAction(function(click) {
    var picked = viewer.scene.pick(click.position);
    if (Cesium.defined(picked) && picked.id && picked.id.id) {
      var eid = picked.id.id;
      if (eid === '__user_location__') {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'mapPress' }));
      } else if (eid.indexOf('__cluster_') === 0 && picked.id._clusterData) {
        var cl = picked.id._clusterData;
        var alt = getCameraAltitude();
        var newAlt = Math.max(500, alt * 0.35);
        viewer.camera.flyTo({
          destination: Cesium.Cartesian3.fromDegrees(cl.lng, cl.lat, newAlt),
          orientation: {
            heading: Cesium.Math.toRadians(10),
            pitch: Cesium.Math.toRadians(-45),
            roll: 0
          },
          duration: 0.8
        });
      } else {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'markerPress', vendorId: eid }));
      }
    } else {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'mapPress' }));
    }
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

  function doCount() {
    try {
      var rect = viewer.camera.computeViewRectangle();
      if (!rect) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'visibleCount', count: vendors.length }));
        return;
      }
      var west = Cesium.Math.toDegrees(rect.west);
      var east = Cesium.Math.toDegrees(rect.east);
      var south = Cesium.Math.toDegrees(rect.south);
      var north = Cesium.Math.toDegrees(rect.north);
      var count = vendors.filter(function(v) {
        return v.lng >= west && v.lng <= east && v.lat >= south && v.lat <= north;
      }).length;
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'visibleCount', count: count }));
    } catch(e) {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'visibleCount', count: vendors.length }));
    }
  }

  viewer.camera.moveEnd.addEventListener(function() {
    doCount();
    updateClustering();
  });
  setTimeout(doCount, 2000);

  window.mapSetView = function(lat, lng, zoom) {
    var alt = zoom ? Math.max(800, 100000 / Math.pow(2, zoom - 10)) : 4000;
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(lng, lat, alt),
      orientation: {
        heading: Cesium.Math.toRadians(20),
        pitch: Cesium.Math.toRadians(-45),
        roll: 0
      },
      duration: 1.0
    });
  };

  window.mapSetViewAlt = function(lat, lng, alt) {
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(lng, lat, alt),
      orientation: {
        heading: Cesium.Math.toRadians(20),
        pitch: Cesium.Math.toRadians(-40),
        roll: 0
      },
      duration: 1.0
    });
  };
})();
</script>
</body>
</html>`;
}

function generateLeafletHTML(
  vendors: Array<Vendor>,
  initialRegion: { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number },
  mapType: string,
  showsUserLocation: boolean
) {
  const vendorData = prepareVendorData(vendors);
  const catColors = JSON.stringify(categoryColorMap);
  const zoom = Math.round(14 - Math.log2(initialRegion.latitudeDelta / 0.01));
  const clampedZoom = Math.max(10, Math.min(18, zoom));
  const useSatellite = mapType === "satellite" || mapType === "hybrid";

  const tileUrl = useSatellite
    ? "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
    : "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png";

  const tileAttribution = useSatellite
    ? "&copy; Esri"
    : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>';

  return `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1.0, minimum-scale=1.0, maximum-scale=1.0, user-scalable=no">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<link rel="stylesheet" href="https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css"/>
<link rel="stylesheet" href="https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.Default.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script src="https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js"></script>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body, #map { width: 100%; height: 100%; overflow: hidden; }
.vm {
  width: 30px; height: 30px; border-radius: 50%;
  border: 2.5px solid #FFF; display: flex; align-items: center;
  justify-content: center; font-weight: 700; font-size: 12px;
  color: #FFF; box-shadow: 0 2px 5px rgba(0,0,0,0.3);
  position: relative;
}
.vm .sd {
  position: absolute; bottom: -2px; right: -2px;
  width: 8px; height: 8px; border-radius: 50%;
  border: 1.5px solid #FFF;
}
.marker-cluster-small, .marker-cluster-medium, .marker-cluster-large {
  background: rgba(255,107,0,0.2) !important;
}
.marker-cluster-small div, .marker-cluster-medium div, .marker-cluster-large div {
  background: ${Colors.primary} !important; color: #FFF !important;
  font-weight: 700; font-size: 13px;
  width: 32px; height: 32px; margin-left: 4px; margin-top: 4px;
  border-radius: 50%; display: flex; align-items: center; justify-content: center;
  box-shadow: 0 2px 6px rgba(0,0,0,0.3);
}
.leaflet-control-attribution { font-size: 9px !important; }
.leaflet-control-zoom { display: none !important; }
</style>
</head>
<body>
<div id="map"></div>
<script>
var catColors = ${catColors};
var vendors = ${JSON.stringify(vendorData)};
var _userMarker = null;
var map = L.map('map', {
  center: [${initialRegion.latitude}, ${initialRegion.longitude}],
  zoom: ${clampedZoom},
  zoomControl: false,
  attributionControl: true
});
window._leafletMap = map;
L.tileLayer('${tileUrl}', {
  attribution: '${tileAttribution}',
  maxZoom: 19,
  subdomains: 'abcd',
  crossOrigin: true
}).addTo(map);

${showsUserLocation ? `
if (navigator.geolocation) {
  navigator.geolocation.getCurrentPosition(function(pos) {
    _userMarker = L.circleMarker([pos.coords.latitude, pos.coords.longitude], {
      radius: 8, fillColor: '#4285F4', fillOpacity: 1,
      color: '#FFF', weight: 3, opacity: 1
    }).addTo(map);
  });
}` : ''}

var clusterGroup = L.markerClusterGroup({
  maxClusterRadius: 50,
  spiderfyOnMaxZoom: true,
  showCoverageOnHover: false,
  zoomToBoundsOnClick: true,
  disableClusteringAtZoom: 16,
  chunkedLoading: true,
  chunkInterval: 100,
  chunkDelay: 10
});

vendors.forEach(function(v) {
  var color = catColors[v.catId] || '${Colors.primary}';
  var statusColor = v.isOpen ? '#22C55E' : '#EF4444';
  var icon = L.divIcon({
    className: '',
    html: '<div class="vm" style="background:' + color + '">' + v.initial +
      '<div class="sd" style="background:' + statusColor + '"></div></div>',
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });
  var marker = L.marker([v.lat, v.lng], { icon: icon });
  marker.on('click', function() {
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'markerPress', vendorId: v.id }));
  });
  clusterGroup.addLayer(marker);
});

map.addLayer(clusterGroup);

function reportCount() {
  var bounds = map.getBounds();
  var count = vendors.filter(function(v) { return bounds.contains([v.lat, v.lng]); }).length;
  window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'visibleCount', count: count }));
}

map.on('moveend', reportCount);
map.on('zoomend', reportCount);
map.on('click', function(e) {
  if (!e.originalEvent.target.closest('.vm') && !e.originalEvent.target.closest('.marker-cluster')) {
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'mapPress' }));
  }
});

reportCount();

window.mapSetView = function(lat, lng, zoom) {
  map.setView([lat, lng], zoom || map.getZoom());
};
window.mapSetType = function(type) {
  map.eachLayer(function(l) { if (l instanceof L.TileLayer) map.removeLayer(l); });
  var isSat = type === 'satellite' || type === 'hybrid';
  var url = isSat
    ? 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
    : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
  L.tileLayer(url, { maxZoom: 19, subdomains: 'abc' }).addTo(map);
};
window.mapUpdateUserLocation = function(lat, lng) {
  if (_userMarker) {
    _userMarker.setLatLng([lat, lng]);
  } else {
    _userMarker = L.circleMarker([lat, lng], {
      radius: 8, fillColor: '#4285F4', fillOpacity: 1,
      color: '#FFF', weight: 3, opacity: 1
    }).addTo(map);
  }
};
</script>
</body>
</html>`;
}

export default function VendorMap({
  vendors,
  initialRegion,
  onMarkerPress,
  onMapPress,
  mapRef,
  mapType = "standard",
  is3DStreetView = false,
  showsUserLocation = true,
  onVisibleCountChange,
  userLocationCoords,
  isDriveMode = false,
  locationKey: _locationKey = 0,
}: VendorMapProps) {
  const webViewRef = useRef<WebView>(null);
  const vendorMapRef = useRef<Record<string, Vendor>>({});

  useEffect(() => {
    const m: Record<string, Vendor> = {};
    vendors.forEach(v => { m[v.id] = v; });
    vendorMapRef.current = m;
  }, [vendors]);

  const effectiveMapType = is3DStreetView ? "satellite" : mapType;

  useEffect(() => {
    if (!is3DStreetView) {
      webViewRef.current?.injectJavaScript(`window.mapSetType && window.mapSetType('${effectiveMapType}'); true;`);
    }
  }, [effectiveMapType, is3DStreetView]);

  useEffect(() => {
    if (!userLocationCoords) return;
    webViewRef.current?.injectJavaScript(
      `window.mapUpdateUserLocation && window.mapUpdateUserLocation(${userLocationCoords.latitude}, ${userLocationCoords.longitude}, null); true;`
    );
    if (is3DStreetView) {
      webViewRef.current?.injectJavaScript(
        `window.mapRepositionPin && window.mapRepositionPin(${userLocationCoords.latitude}, ${userLocationCoords.longitude}); true;`
      );
    }
  }, [userLocationCoords, is3DStreetView]);

  useEffect(() => {
    if (is3DStreetView) {
      webViewRef.current?.injectJavaScript(
        `window.mapSetDriveMode && window.mapSetDriveMode(${isDriveMode}); true;`
      );
    }
  }, [isDriveMode, is3DStreetView]);

  const html = useMemo(() => {
    if (is3DStreetView) {
      return generate3DHTML(vendors, initialRegion, userLocationCoords);
    }
    return generateLeafletHTML(vendors, initialRegion, effectiveMapType, showsUserLocation);
  }, [vendors, initialRegion, effectiveMapType, showsUserLocation, is3DStreetView, userLocationCoords]);

  const handleMessage = useCallback((event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === "markerPress") {
        const vendor = vendorMapRef.current[data.vendorId];
        if (vendor) onMarkerPress(vendor);
      } else if (data.type === "mapPress") {
        onMapPress();
      } else if (data.type === "visibleCount") {
        onVisibleCountChange?.(data.count);
      }
    } catch (e) {}
  }, [onMarkerPress, onMapPress, onVisibleCountChange]);

  if (mapRef) {
    (mapRef as any).current = {
      animateCamera: (params: any) => {
        const lat = params?.center?.latitude;
        const lng = params?.center?.longitude;
        const zoom = params?.zoom || 14;
        const altitude = params?.altitude;
        if (lat && lng) {
          if (altitude) {
            webViewRef.current?.injectJavaScript(`window.mapSetViewAlt && window.mapSetViewAlt(${lat}, ${lng}, ${altitude}); true;`);
          } else {
            webViewRef.current?.injectJavaScript(`window.mapSetView && window.mapSetView(${lat}, ${lng}, ${zoom}); true;`);
          }
        }
      },
      animateToRegion: (region: any, duration?: number) => {
        if (region?.latitude && region?.longitude) {
          const z = Math.round(14 - Math.log2((region.latitudeDelta || 0.01) / 0.01));
          webViewRef.current?.injectJavaScript(`window.mapSetView && window.mapSetView(${region.latitude}, ${region.longitude}, ${Math.max(10, Math.min(18, z))}); true;`);
        }
      },
      updateUserLocation: (lat: number, lng: number, heading: number) => {
        webViewRef.current?.injectJavaScript(`window.mapUpdateUserLocation && window.mapUpdateUserLocation(${lat}, ${lng}, ${heading}); true;`);
      },
      zoomIn: () => {
        webViewRef.current?.injectJavaScript(`if(window._leafletMap){window._leafletMap.zoomIn();} true;`);
      },
      zoomOut: () => {
        webViewRef.current?.injectJavaScript(`if(window._leafletMap){window._leafletMap.zoomOut();} true;`);
      },
    };
  }

  return (
    <View style={mapStyles.container}>
      <WebView
        key={is3DStreetView ? "cesium-3d" : "leaflet-2d"}
        ref={webViewRef}
        source={{ html }}
        style={[mapStyles.webview, is3DStreetView && { backgroundColor: "#0B1E3D" }]}
        onMessage={handleMessage}
        javaScriptEnabled
        domStorageEnabled
        geolocationEnabled={showsUserLocation}
        scrollEnabled={false}
        bounces={false}
        overScrollMode="never"
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        originWhitelist={["*"]}
        mixedContentMode="always"
        androidLayerType={is3DStreetView ? "hardware" : "none"}
        allowFileAccess
        startInLoadingState={is3DStreetView}
      />
    </View>
  );
}

const mapStyles = StyleSheet.create({
  container: {
    flex: 1,
  },
  webview: {
    flex: 1,
    backgroundColor: "transparent",
  },
});
