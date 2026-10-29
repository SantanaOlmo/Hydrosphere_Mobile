package com.hydrosphere.mobile;

import android.content.Context;
import android.net.ConnectivityManager;
import android.net.LinkAddress;
import android.net.LinkProperties;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.RouteInfo;
import android.os.Build;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.net.InetAddress;
import java.util.Locale;

/**
 * Android ignora SoftAP sin internet y manda el tráfico por datos/otra red.
 * Este plugin hace bindProcessToNetwork a la Wi‑Fi cuyo gateway/IP es 192.168.4.x
 * para que CapacitorHttp pueda hablar con la esfera (igual que el PC).
 */
@CapacitorPlugin(name = "SoftApNetwork")
public class SoftApNetworkPlugin extends Plugin {

    private static final String DEFAULT_GATEWAY = "192.168.4.1";
    private static final String DEFAULT_PREFIX = "192.168.4.";

    @PluginMethod
    public void bindToSoftAp(PluginCall call) {
        String gateway = call.getString("gateway", DEFAULT_GATEWAY);
        String prefix = call.getString("prefix", DEFAULT_PREFIX);

        ConnectivityManager cm =
                (ConnectivityManager) getContext().getSystemService(Context.CONNECTIVITY_SERVICE);
        if (cm == null) {
            call.reject("ConnectivityManager no disponible");
            return;
        }

        Network softAp = findSoftApNetwork(cm, gateway, prefix);
        JSObject info = networkInfo(cm, softAp, gateway, prefix);

        if (softAp == null) {
            info.put("bound", false);
            info.put("ok", false);
            info.put(
                    "reason",
                    "no_softap_wifi");
            info.put(
                    "hint",
                    "El móvil no tiene una Wi‑Fi 192.168.4.x. Únete a ESP32_C6 y vuelve a probar.");
            call.resolve(info);
            return;
        }

        boolean bound = cm.bindProcessToNetwork(softAp);
        info.put("bound", bound);
        info.put("ok", bound);
        if (!bound) {
            info.put("reason", "bind_failed");
            info.put("hint", "Android rechazó bindProcessToNetwork al SoftAP.");
        } else {
            info.put("reason", "bound");
            info.put("hint", "Proceso enlazado al SoftAP; HTTP debería llegar a la esfera.");
        }
        call.resolve(info);
    }

    @PluginMethod
    public void getInfo(PluginCall call) {
        String gateway = call.getString("gateway", DEFAULT_GATEWAY);
        String prefix = call.getString("prefix", DEFAULT_PREFIX);
        ConnectivityManager cm =
                (ConnectivityManager) getContext().getSystemService(Context.CONNECTIVITY_SERVICE);
        if (cm == null) {
            call.reject("ConnectivityManager no disponible");
            return;
        }
        Network softAp = findSoftApNetwork(cm, gateway, prefix);
        JSObject info = networkInfo(cm, softAp, gateway, prefix);
        Network bound = null;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            bound = cm.getBoundNetworkForProcess();
        }
        info.put("processBound", bound != null);
        info.put("softApFound", softAp != null);
        info.put(
                "processBoundIsSoftAp",
                softAp != null && bound != null && softAp.equals(bound));
        call.resolve(info);
    }

    @PluginMethod
    public void unbind(PluginCall call) {
        ConnectivityManager cm =
                (ConnectivityManager) getContext().getSystemService(Context.CONNECTIVITY_SERVICE);
        if (cm != null) {
            cm.bindProcessToNetwork(null);
        }
        JSObject out = new JSObject();
        out.put("bound", false);
        call.resolve(out);
    }

    private Network findSoftApNetwork(ConnectivityManager cm, String gateway, String prefix) {
        Network[] networks = cm.getAllNetworks();
        if (networks == null) {
            return null;
        }
        for (Network network : networks) {
            NetworkCapabilities caps = cm.getNetworkCapabilities(network);
            if (caps == null || !caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)) {
                continue;
            }
            LinkProperties lp = cm.getLinkProperties(network);
            if (matchesSoftAp(lp, gateway, prefix)) {
                return network;
            }
        }
        // Fallback: única Wi‑Fi activa (algunos OEM ocultan rutas)
        Network wifiOnly = null;
        int wifiCount = 0;
        for (Network network : networks) {
            NetworkCapabilities caps = cm.getNetworkCapabilities(network);
            if (caps != null && caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)) {
                wifiOnly = network;
                wifiCount++;
            }
        }
        return wifiCount == 1 ? wifiOnly : null;
    }

    private boolean matchesSoftAp(LinkProperties lp, String gateway, String prefix) {
        if (lp == null) {
            return false;
        }
        for (LinkAddress la : lp.getLinkAddresses()) {
            InetAddress addr = la.getAddress();
            if (addr == null) {
                continue;
            }
            String host = addr.getHostAddress();
            if (host != null && host.startsWith(prefix)) {
                return true;
            }
        }
        for (RouteInfo route : lp.getRoutes()) {
            InetAddress gw = route.getGateway();
            if (gw == null) {
                continue;
            }
            String host = gw.getHostAddress();
            if (gateway.equals(host)) {
                return true;
            }
        }
        return false;
    }

    private JSObject networkInfo(
            ConnectivityManager cm, Network softAp, String gateway, String prefix) {
        JSObject info = new JSObject();
        info.put("gatewayHint", gateway);
        info.put("prefixHint", prefix);

        StringBuilder wifiIps = new StringBuilder();
        String softApIp = null;
        Network[] networks = cm.getAllNetworks();
        if (networks != null) {
            for (Network network : networks) {
                NetworkCapabilities caps = cm.getNetworkCapabilities(network);
                if (caps == null || !caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)) {
                    continue;
                }
                LinkProperties lp = cm.getLinkProperties(network);
                if (lp == null) {
                    continue;
                }
                for (LinkAddress la : lp.getLinkAddresses()) {
                    InetAddress addr = la.getAddress();
                    if (addr == null || addr.getHostAddress() == null) {
                        continue;
                    }
                    String host = addr.getHostAddress();
                    if (host.contains(":")) {
                        continue; // skip ipv6 noise
                    }
                    if (wifiIps.length() > 0) {
                        wifiIps.append(",");
                    }
                    wifiIps.append(host);
                    if (host.startsWith(prefix)) {
                        softApIp = host;
                    }
                }
            }
        }

        info.put("wifiIpv4", wifiIps.toString());
        info.put("softApClientIp", softApIp);
        info.put("softApNetworkFound", softAp != null);

        Network active = cm.getActiveNetwork();
        String activeTransport = "none";
        if (active != null) {
            NetworkCapabilities caps = cm.getNetworkCapabilities(active);
            if (caps != null) {
                if (caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)) {
                    activeTransport = "wifi";
                } else if (caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR)) {
                    activeTransport = "cellular";
                } else {
                    activeTransport = "other";
                }
            }
        }
        info.put("activeTransport", activeTransport);
        info.put(
                "detail",
                String.format(
                        Locale.US,
                        "active=%s wifiIps=%s softApIp=%s found=%s",
                        activeTransport,
                        wifiIps,
                        softApIp,
                        softAp != null));
        return info;
    }
}
