import React, { useEffect, useRef, useCallback, useState } from "react";
import { View, Text, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";

interface Props {
  coords: { latitude: number; longitude: number };
  onPress: (lat: number, lng: number) => void;
  onConfirm: () => void;
  onClose: () => void;
}

export default function MapLocationPicker({ coords, onPress, onConfirm, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [pickedLat, setPickedLat] = useState(coords.latitude);
  const [pickedLng, setPickedLng] = useState(coords.longitude);

  const handleMessage = useCallback((event: MessageEvent) => {
    try {
      const data = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
      if (data.type === "locationPick") {
        setPickedLat(data.lat);
        setPickedLng(data.lng);
        onPress(data.lat, data.lng);
      }
    } catch (e) {}
  }, [onPress]);

  useEffect(() => {
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [handleMessage]);

  const html = `<!DOCTYPE html>
<html><head>
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>
*{margin:0;padding:0}
html,body,#map{width:100%;height:100%}
#hint{position:absolute;top:10px;left:50%;transform:translateX(-50%);z-index:1000;background:rgba(0,0,0,0.7);color:#fff;font-family:sans-serif;font-size:13px;padding:8px 14px;border-radius:20px;pointer-events:none;white-space:nowrap}
</style></head>
<body>
<div id="hint">Tap anywhere on the map to move the pin</div>
<div id="map"></div>
<script>
var lat=${coords.latitude},lng=${coords.longitude};
var map=L.map('map',{center:[lat,lng],zoom:16,zoomControl:true});
L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',{maxZoom:19,subdomains:'abc'}).addTo(map);
var marker=L.marker([lat,lng],{draggable:true}).addTo(map);
function sendPick(lt,ln){parent.postMessage(JSON.stringify({type:'locationPick',lat:lt,lng:ln}),'*')}
marker.on('dragend',function(){var p=marker.getLatLng();sendPick(p.lat,p.lng)});
map.on('click',function(e){marker.setLatLng(e.latlng);sendPick(e.latlng.lat,e.latlng.lng)});
setTimeout(function(){document.getElementById('hint').style.display='none'},3000);
</script></body></html>`;

  return (
    <View style={{ flex: 1, backgroundColor: "#FFF" }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingTop: insets.top + 8, paddingBottom: 12, backgroundColor: "#0B1E3D" }}>
        <View>
          <Text style={{ fontFamily: "Poppins_700Bold", fontSize: 16, color: "#FFF" }}>Pick Store Location</Text>
          <Text style={{ fontFamily: "Poppins_400Regular", fontSize: 11, color: "rgba(255,255,255,0.7)", marginTop: 1 }}>
            Tap on the map to place the pin
          </Text>
        </View>
        <Pressable onPress={onClose} style={{ padding: 4 }}>
          <Ionicons name="close" size={24} color="#FFF" />
        </Pressable>
      </View>

      <View style={{ flex: 1 }}>
        <iframe
          ref={iframeRef as any}
          srcDoc={html}
          style={{ width: "100%", height: "100%", border: "none" } as any}
        />
      </View>

      <View style={{ padding: 16, paddingBottom: insets.bottom + 16, backgroundColor: "#FFF", borderTopWidth: 1, borderTopColor: "#F0F0F0" }}>
        <Text style={{ fontFamily: "Poppins_500Medium", fontSize: 12, color: Colors.textSecondary, marginBottom: 10, textAlign: "center" }}>
          📍 {pickedLat.toFixed(5)}, {pickedLng.toFixed(5)}
        </Text>
        <Pressable
          style={{ backgroundColor: Colors.primary, borderRadius: 14, paddingVertical: 14, alignItems: "center" }}
          onPress={onConfirm}
        >
          <Text style={{ fontFamily: "Poppins_700Bold", fontSize: 15, color: "#FFF" }}>Confirm This Location</Text>
        </Pressable>
      </View>
    </View>
  );
}
