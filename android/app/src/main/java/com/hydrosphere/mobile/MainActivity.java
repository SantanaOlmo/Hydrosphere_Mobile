package com.hydrosphere.mobile;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SoftApNetworkPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
