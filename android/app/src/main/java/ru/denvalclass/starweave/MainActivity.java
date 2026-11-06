package ru.denvalclass.starweave;

import android.os.Bundle;
import androidx.core.view.WindowCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // До Android 15 окно стоит между системными панелями, а SystemBars всё равно отдаёт
        // их отступы: игра отступала дважды. Рисуем под панелями на всех версиях (APK.2).
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        super.onCreate(savedInstanceState);
    }
}
