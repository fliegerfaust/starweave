package com.denvalgames.starweave;

import android.os.Bundle;
import androidx.core.view.WindowCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // До Android 15 окно стоит между системными панелями, а SystemBars всё равно отдаёт
        // их отступы: игра отступала дважды. Рисуем под панелями на всех версиях (APK.2).
        // Строго после super: раньше окно создастся с темой запуска и покажет полосу заголовка.
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        // Системный «Размер шрифта» WebView умножал на весь текст и ломал плашки; крупный текст
        // в игре — своя настройка «Размер текста» (APK.7)
        getBridge().getWebView().getSettings().setTextZoom(100);
    }
}
